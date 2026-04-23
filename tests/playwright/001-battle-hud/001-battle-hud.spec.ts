import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { waitForAgentHooks } from "../helpers";
import { TestStepHelper } from "../support/test-step-helper";

const BATTLE_STAR_UID = 407;
const WAYPOINT_STAR_UID = 361;
const SYNTHETIC_FLEET_UID_BASE = 100000;
const OVERLAY_CLIP = { x: 1260, y: 1140, width: 340, height: 60 };

type BattleState = {
  selectedStarUid: number | null;
  selectedStarName: string | null;
  alliedDefenders: number[];
  selectedFleetUid: number | null;
  selectedFleetName: string | null;
  selectedFleetPath: number[];
  controllingPlayerUid: number | null;
  controllingPlayerAlias: string | null;
  etaSample: string | null;
};

test("documents the battle HUD controls and timebases", async ({
  appPage,
}, testInfo) => {
  const helper = new TestStepHelper(appPage, testInfo);

  helper.setMetadata({
    title: "Battle HUD Validation",
    validationGoal:
      "Verify that the battle HUD workflow can select a frontline star, route a fake enemy fleet, cycle ETA timebases, and render combat handicap text.",
    docsTitle: "How To Read The Battle HUD",
    docsSummary:
      "The battle HUD is not one isolated panel. It is a set of map overlays, ETA labels, and control shortcuts that help you inspect a frontline star, plan enemy movement, and model worse-case combat assumptions.",
    bookSection: "How to read the battle HUD",
  });

  await waitForAgentHooks(appPage);
  await prepareBattleHudScenario(appPage);

  const centerOnBattle = async () => {
    await appPage.evaluate(
      ({ battleStarUid, waypointStarUid }) => {
        const np = window.NeptunesPride;
        const s1 = np.universe.galaxy.stars[battleStarUid];
        const s2 = np.universe.galaxy.stars[waypointStarUid];
        if (s1 && s2) {
          // Center on the midpoint between the two stars
          np.npui.map.x = (s1.x + s2.x) / 2;
          np.npui.map.y = (s1.y + s2.y) / 2;
          np.npui.map.scale = 180; // slightly zoomed out to fit both
          np.np.trigger("map_rebuild");
        }
      },
      { battleStarUid: BATTLE_STAR_UID, waypointStarUid: WAYPOINT_STAR_UID },
    );
    // Give the map a moment to settle
    await appPage.waitForTimeout(500);
  };

  await centerOnBattle();
  await helper.step("route-enemy-fleet-relative-eta", {
    description: "Create a fake enemy fleet from the selected frontline star",
    verifications: [
      {
        spec: "The chosen frontline fixture star includes allied defenders, making it a battle-relevant target",
        check: async () => {
          const battleStar = await appPage.evaluate((battleStarUid) => {
            return window.NeptunesPride.universe.galaxy.stars[battleStarUid];
          }, BATTLE_STAR_UID);
          expect(battleStar.n).toBe("Elm");
          expect(battleStar.alliedDefenders).toContain(14);
        },
      },
      {
        spec: "The x hotkey creates and selects a synthetic enemy fleet for planning",
        check: async () => {
          const state = await readBattleState(appPage);
          expect(state.selectedFleetUid).toBeTruthy();
          expect(state.selectedFleetUid).toBeGreaterThanOrEqual(
            SYNTHETIC_FLEET_UID_BASE,
          );
          expect(state.selectedFleetName).toMatch(/^Fleet \d+/);
          expect(state.selectedFleetPath).toEqual([WAYPOINT_STAR_UID]);
          expect(state.controllingPlayerUid).toBe(43);
          expect(state.controllingPlayerAlias).toContain("Pungastyle");
        },
      },
      {
        spec: "The route editor shows a relative ETA for the fake enemy fleet",
        check: async () => {
          await expect(appPage.getByText(/^Waypoints:/)).toContainText(
            "Theta Chi",
          );
          await expect(appPage.getByText(/^ETA:/)).toContainText("h");
          const state = await readBattleState(appPage);
          expect(state.etaSample).toContain("17h");
        },
      },
    ],
    documentation: {
      summary:
        "Start by selecting the hostile frontline star, then press `x` to make a fake enemy fleet. NPA temporarily switches control context to that enemy empire so you can plan the route they could fly without changing the real game state.",
      howToUse: [
        "Select the enemy star you want to inspect.",
        "Press `x` to create a fake enemy fleet from that star.",
        "Add a waypoint to see where that fleet could go and how long it would take.",
      ],
      expectedResult: [
        "A waypoint editor appears for a newly created synthetic fleet.",
        "The lower-right map overlay shows that you are temporarily controlling the selected enemy empire.",
        "The waypoint editor displays an ETA using the current timebase.",
      ],
      caveats: [
        "These orders are only for planning. They do not send any real orders to the server.",
      ],
    },
  });

  await centerOnBattle();
  await helper.step("cycle-to-clock-and-relative-ticks", {
    description: "Cycle the battle ETA through clock time and relative ticks",
    verifications: [
      {
        spec: "The % hotkey produces an absolute clock-time ETA before moving to relative ticks",
        check: async () => {
          const outputs = await appPage.evaluate(() => {
            const np = window.NeptunesPride;
            const fleet = np.universe.selectedFleet;
            window.Mousetrap.trigger("%");
            const clock = np.universe.timeToTick(fleet.etaFirst, false);
            window.Mousetrap.trigger("%");
            const tickRelative = np.universe.timeToTick(fleet.etaFirst, false);
            return { clock, tickRelative };
          });

          expect(outputs.clock).toMatch(/@/);
          expect(outputs.tickRelative).toMatch(/ticks/);
        },
      },
      {
        spec: "The route editor updates to the relative-ticks view",
        check: async () => {
          await expect(appPage.getByText(/^ETA:/)).toContainText("ticks");
          await expect(appPage.getByText(/^Production:/)).toContainText(
            "ticks",
          );
        },
      },
    ],
    documentation: {
      summary:
        "Press `%` to cycle how the battle HUD explains travel time. NPA moves from wall-clock planning to tick-count planning without changing the route itself.",
      howToUse: [
        "With the battle route visible, press `%` once for clock time.",
        "Press `%` again to switch to relative tick counts.",
      ],
      expectedResult: [
        "Clock mode shows a real-world timestamp such as `Sun @ 1:40 AM`.",
        "Relative tick mode changes the same ETA into a tick count such as `18 ticks`.",
        "The waypoint panel and production readout stay aligned with the chosen timebase.",
      ],
    },
  });

  await centerOnBattle();
  await helper.step("cycle-to-absolute-tick-numbers", {
    description: "Show the same battle ETA as absolute tick numbers",
    verifications: [
      {
        spec: "A further % press changes the ETA sample to an absolute tick number",
        check: async () => {
          const output = await appPage.evaluate(() => {
            const np = window.NeptunesPride;
            const fleet = np.universe.selectedFleet;
            window.Mousetrap.trigger("%");
            return np.universe.timeToTick(fleet.etaFirst, false);
          });

          expect(output).toMatch(/Tick #\d+/);
        },
      },
      {
        spec: "The route editor reflects absolute tick-number mode",
        check: async () => {
          await expect(appPage.getByText(/^ETA:/)).toContainText("Tick #");
          await expect(appPage.getByText(/^Production:/)).toContainText(
            "Tick #",
          );
        },
      },
    ],
    documentation: {
      summary:
        "Press `%` again when you want a precise game tick instead of a relative duration. This is the most explicit way to coordinate combat windows with allies.",
      howToUse: [
        "After reaching relative tick mode, press `%` one more time.",
        "Read the ETA and production readouts as explicit tick numbers.",
      ],
      expectedResult: [
        "The same route now shows an exact destination tick such as `Tick #543`.",
        "You can compare the fleet ETA directly against combat or production timing discussed in reports and chat.",
      ],
    },
  });

  await centerOnBattle();
  await helper.step("apply-combat-handicap", {
    description: "Model a worse-case fight by giving the enemy extra weapons",
    verifications: [
      {
        spec: "The . hotkey changes the rendered battle overlay in the HUD footer",
        check: async () => {
          const before = await clipHash(appPage, OVERLAY_CLIP);
          await appPage.evaluate(() => {
            window.Mousetrap.trigger(".");
          });
          const after = await clipHash(appPage, OVERLAY_CLIP);
          expect(after).not.toBe(before);
        },
      },
      {
        spec: "The fake enemy fleet and battle route remain selected after applying the handicap",
        check: async () => {
          const state = await readBattleState(appPage);
          expect(state.selectedFleetUid).toBeGreaterThanOrEqual(
            SYNTHETIC_FLEET_UID_BASE,
          );
          expect(state.selectedFleetPath).toEqual([WAYPOINT_STAR_UID]);
        },
      },
    ],
    documentation: {
      summary:
        "Use `.` to give the enemy one more weapons level in the battle HUD calculations. NPA marks the footer with `Enemy WS+1` so you can see that the current numbers are a pessimistic model rather than the default estimate.",
      howToUse: [
        "Keep the battle route selected.",
        "Press `.` to increase the enemy weapons assumption by one level.",
      ],
      expectedResult: [
        "The footer overlay changes to show the enemy handicap, for example `Enemy WS+1`.",
        "The battle HUD continues to describe the same route, but now under a harsher combat assumption.",
      ],
      caveats: [
        "This is a planning aid. It changes NPA's local calculation, not the real weapons tech on the server.",
      ],
    },
  });

  helper.generateArtifacts();
});

async function prepareBattleHudScenario(appPage: Page): Promise<void> {
  await appPage.waitForFunction((battleStarUid) => {
    const np = window.NeptunesPride;
    return !!(
      np?.universe?.player &&
      np.universe.player.uid === 5 &&
      np.originalPlayer !== undefined &&
      np.universe.galaxy?.stars?.[battleStarUid]?.alliedDefenders?.length
    );
  }, BATTLE_STAR_UID);

  await appPage.evaluate(
    ({ battleStarUid, waypointStarUid, syntheticFleetUidBase }) => {
      const np = window.NeptunesPride;
      const s1 = np.universe.galaxy.stars[battleStarUid];
      const s2 = np.universe.galaxy.stars[waypointStarUid];

      if (s1 && s2) {
        np.npui.map.x = (s1.x + s2.x) / 2;
        np.npui.map.y = (s1.y + s2.y) / 2;
      }
      np.npui.map.scale = 180;
      np.crux.trigger("show_star_uid", String(battleStarUid));
      window.Mousetrap.trigger("x");

      let fleet = np.universe.selectedFleet;
      if (!fleet || fleet.uid < syntheticFleetUidBase) {
        fleet = Object.values(np.universe.galaxy.fleets)
          .filter((candidate) => candidate.uid >= syntheticFleetUidBase)
          .sort((left, right) => right.uid - left.uid)[0];
      }

      if (fleet) {
        np.universe.selectFleet(fleet);
        np.crux.trigger(
          "add_waypoint",
          np.universe.galaxy.stars[waypointStarUid],
        );
        np.np.trigger("map_rebuild");
      }
    },
    {
      battleStarUid: BATTLE_STAR_UID,
      waypointStarUid: WAYPOINT_STAR_UID,
      syntheticFleetUidBase: SYNTHETIC_FLEET_UID_BASE,
    },
  );

  await expect
    .poll(async () => readBattleState(appPage), { timeout: 10000 })
    .toMatchObject({
      selectedFleetPath: [WAYPOINT_STAR_UID],
    });

  const setupState = await readBattleState(appPage);
  expect(setupState.selectedFleetUid).toBeGreaterThanOrEqual(
    SYNTHETIC_FLEET_UID_BASE,
  );
  expect(setupState.selectedFleetName).toMatch(/^Fleet \d+/);

  await expect(appPage.getByText(/^Waypoints:/)).toContainText("Theta Chi");
  await expect(appPage.getByText(/^ETA:/)).toBeVisible();
}

async function readBattleState(appPage: Page): Promise<BattleState> {
  return appPage.evaluate((syntheticFleetUidBase) => {
    const np = window.NeptunesPride;
    const star = np.universe.selectedStar;
    const fallbackFleet = Object.values(np.universe.galaxy.fleets)
      .filter((candidate) => candidate.uid >= syntheticFleetUidBase)
      .sort((left, right) => right.uid - left.uid)[0];
    const fleet = np.universe.selectedFleet ?? fallbackFleet;
    return {
      selectedStarUid: star?.uid ?? null,
      selectedStarName: star?.n ?? null,
      alliedDefenders: star?.alliedDefenders ?? [],
      selectedFleetUid: fleet?.uid ?? null,
      selectedFleetName: fleet?.n ?? null,
      selectedFleetPath:
        fleet?.path?.map((point: { uid: number }) => point.uid) ?? [],
      controllingPlayerUid: np.universe.player?.uid ?? null,
      controllingPlayerAlias: np.universe.player?.alias ?? null,
      etaSample: fleet ? np.universe.timeToTick(fleet.etaFirst, false) : null,
    };
  }, SYNTHETIC_FLEET_UID_BASE);
}

async function clipHash(
  appPage: Page,
  clip: { x: number; y: number; width: number; height: number },
): Promise<string> {
  const png = await appPage.screenshot({ clip });
  return createHash("sha256").update(png).digest("hex");
}
