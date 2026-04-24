import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { waitForAgentHooks } from "../helpers";
import { TestStepHelper, waitForAnimations } from "../support/test-step-helper";

const BATTLE_STAR_UID = 33;
const WAYPOINT_STAR_UID = 547;
const BATTLE_STAR_NAME = "Hot Sham";
const WAYPOINT_STAR_NAME = "Red Chertan";
const BATTLE_STAR_OWNER_UID = 39;
const BATTLE_STAR_OWNER_ALIAS = "Macomber";
const SYNTHETIC_FLEET_UID_BASE = 100000;
const OVERLAY_CLIP = { x: 1260, y: 1140, width: 340, height: 60 };
const MAP_SCALE = 700;
const BATTLE_STAR_SCREEN_TARGET = { x: 650, y: 480 };

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

type MapComposition = {
  scale: number;
  scaleTarget: number;
  battleStar: ScreenSubject;
  waypointStar: ScreenSubject;
  selectedFleet: ScreenSubject | null;
  selectedFleetUid: number | null;
  selectedFleetName: string | null;
  selectedFleetPath: string[];
};

type ScreenSubject = {
  uid: number;
  name: string;
  x: number;
  y: number;
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

  await frameAndAssertBattleMap(appPage);
  await helper.step("route-enemy-fleet-relative-eta", {
    description: "Create a fake enemy fleet from the selected frontline star",
    verifications: [
      {
        spec: "The chosen frontline fixture star includes allied defenders, making it a battle-relevant target",
        check: async () => {
          const battleStar = await appPage.evaluate((battleStarUid) => {
            return window.NeptunesPride.universe.galaxy.stars[battleStarUid];
          }, BATTLE_STAR_UID);
          expect(battleStar.n).toBe(BATTLE_STAR_NAME);
          expect(battleStar.puid).toBe(BATTLE_STAR_OWNER_UID);
          expect(battleStar.alliedDefenders).toContain(11);
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
          expect(state.controllingPlayerUid).toBe(BATTLE_STAR_OWNER_UID);
          expect(state.controllingPlayerAlias?.trim()).toBe(
            BATTLE_STAR_OWNER_ALIAS,
          );
        },
      },
      {
        spec: "The route editor shows a relative ETA for the fake enemy fleet",
        check: async () => {
          await expect(appPage.getByText(/^Waypoints:/)).toContainText(
            WAYPOINT_STAR_NAME,
          );
          await expect(appPage.getByText(/^ETA:/)).toContainText("h");
        },
      },
      {
        spec: "The screenshot frame keeps Hot Sham near the center with the selected fleet, route, and Red Chertan waypoint visible",
        check: async () => {
          await frameAndAssertBattleMap(appPage);
        },
      },
    ],
    documentation: {
      summary:
        "Start by selecting `Hot Sham`, the hostile frontline star shown near the center of the map, then press `x` to make a fake enemy fleet. NPA temporarily switches control context to Macomber so you can plan the short route from `Hot Sham` to nearby `Red Chertan` without changing the real game state.",
      howToUse: [
        "Select the enemy star you want to inspect.",
        "Press `x` to create a fake enemy fleet from that star.",
        "Add nearby `Red Chertan` as a waypoint to see where that fleet could go and how long it would take.",
      ],
      expectedResult: [
        "`Hot Sham` stays near the middle of the map with the newly created synthetic fleet selected on top of it.",
        "The route line runs clearly from `Hot Sham` toward the visible `Red Chertan` waypoint.",
        "The lower-right map overlay shows that you are temporarily controlling the selected enemy empire.",
        "The waypoint editor displays an ETA using the current timebase.",
      ],
      caveats: [
        "These orders are only for planning. They do not send any real orders to the server.",
      ],
    },
  });

  await frameAndAssertBattleMap(appPage);
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

          expect(outputs.clock).toMatch(/(@|AM|PM)/);
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
      {
        spec: "The relative-ticks screenshot still frames Hot Sham, the selected fake fleet, and the Red Chertan route",
        check: async () => {
          await frameAndAssertBattleMap(appPage);
        },
      },
    ],
    documentation: {
      summary:
        "With the `Hot Sham` route still centered, press `%` to cycle how the battle HUD explains travel time. NPA moves from wall-clock planning to tick-count planning without changing the route to `Red Chertan`.",
      howToUse: [
        "With the battle route visible, press `%` once for clock time.",
        "Press `%` again to switch to relative tick counts.",
      ],
      expectedResult: [
        "Clock mode shows a real-world timestamp such as `11:40 AM`.",
        "Relative tick mode changes the same ETA into a tick count such as `4 ticks`.",
        "The waypoint panel, production readout, selected fleet, and visible route stay aligned with the chosen timebase.",
      ],
    },
  });

  await frameAndAssertBattleMap(appPage);
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
      {
        spec: "The absolute-tick screenshot keeps Hot Sham centered and the selected fleet route visible",
        check: async () => {
          await frameAndAssertBattleMap(appPage);
        },
      },
    ],
    documentation: {
      summary:
        "Press `%` again when you want a precise game tick for the `Hot Sham` to `Red Chertan` route instead of a relative duration. This is the most explicit way to coordinate combat windows with allies.",
      howToUse: [
        "After reaching relative tick mode, press `%` one more time.",
        "Read the ETA and production readouts as explicit tick numbers.",
      ],
      expectedResult: [
        "The same route now shows an exact destination tick such as `Tick #529`.",
        "Because `Hot Sham`, the selected fleet, and the route remain in frame, you can compare the fleet ETA directly against combat or production timing discussed in reports and chat.",
      ],
    },
  });

  await frameAndAssertBattleMap(appPage);
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
      {
        spec: "The handicap screenshot keeps the battle HUD footer visible while Hot Sham and its selected fleet route remain in frame",
        check: async () => {
          const composition = await frameAndAssertBattleMap(appPage);
          expect(composition.battleStar.name).toBe(BATTLE_STAR_NAME);
        },
      },
    ],
    documentation: {
      summary:
        "Use `.` while the `Hot Sham` battle route is visible to add one weapons level to the side NPA is currently treating as the enemy in the battle HUD calculation. The footer shows `Enemy WS+1` so you can see that the current numbers are a pessimistic model rather than the default estimate.",
      howToUse: [
        "Keep the battle route selected.",
        "Press `.` to increase the enemy weapons assumption by one level.",
      ],
      expectedResult: [
        "The footer overlay changes to show the enemy handicap, for example `Enemy WS+1`.",
        "`Hot Sham`, the selected synthetic fleet, and the route toward `Red Chertan` remain visible while the battle HUD describes the harsher combat assumption.",
        "Because this example is controlling Macomber, `Enemy WS+1` is applied to Macomber's attacking fake fleet rather than the Red Chertan defenders. That is why the projected survivors are lower in the final screenshot.",
      ],
      caveats: [
        "`Enemy WS+1` follows the current planning perspective. When you are controlling another player, the bonus can affect either side of the fight depending on which side NPA is modeling as the enemy.",
        "This is a planning aid. It changes NPA's local calculation, not the real weapons tech on the server.",
      ],
    },
  });

  helper.generateArtifacts();
});

async function prepareBattleHudScenario(appPage: Page): Promise<void> {
  await appPage.waitForFunction(
    ({ battleStarUid, waypointStarUid, battleStarOwnerUid }) => {
      const np = window.NeptunesPride;
      return !!(
        np?.universe?.player &&
        np.universe.player.uid === 5 &&
        np.originalPlayer !== undefined &&
        np.universe.galaxy?.stars?.[battleStarUid]?.puid ===
          battleStarOwnerUid &&
        np.universe.galaxy?.stars?.[waypointStarUid]
      );
    },
    {
      battleStarUid: BATTLE_STAR_UID,
      waypointStarUid: WAYPOINT_STAR_UID,
      battleStarOwnerUid: BATTLE_STAR_OWNER_UID,
    },
  );

  await appPage.evaluate(
    ({ battleStarUid, waypointStarUid, syntheticFleetUidBase, mapScale }) => {
      const np = window.NeptunesPride;

      np.universe.interfaceSettings.screenPos = "none";
      np.universe.interfaceSettings.showStarPimples = false;
      np.universe.interfaceSettings.showScanningRanges = false;
      np.universe.interfaceSettings.showFleets = true;
      np.universe.interfaceSettings.textZoomStarNames = 0;
      np.universe.interfaceSettings.textZoomShips = 0;
      np.npui.map.scale = mapScale;
      np.npui.map.scaleTarget = mapScale;
      np.npui.map.miniMapEnabled = false;

      const s1 = np.universe.galaxy.stars[battleStarUid];
      if (s1) {
        np.npui.map.centerPointInMap(s1.x, s1.y);
      }

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
      mapScale: MAP_SCALE,
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

  await expect(appPage.getByText(/^Waypoints:/)).toContainText(
    WAYPOINT_STAR_NAME,
  );
  await expect(appPage.getByText(/^ETA:/)).toBeVisible();
}

async function frameAndAssertBattleMap(
  appPage: Page,
): Promise<MapComposition> {
  const composition = await frameBattleMap(appPage);

  expect(composition.scale).toBe(MAP_SCALE);
  expect(composition.scaleTarget).toBe(MAP_SCALE);
  expect(composition.battleStar.name).toBe(BATTLE_STAR_NAME);
  expect(composition.waypointStar.name).toBe(WAYPOINT_STAR_NAME);
  expect(composition.selectedFleetUid).toBeGreaterThanOrEqual(
    SYNTHETIC_FLEET_UID_BASE,
  );
  expect(composition.selectedFleetName).toMatch(/^Fleet \d+/);
  expect(composition.selectedFleetPath).toEqual([WAYPOINT_STAR_NAME]);
  expect(composition.selectedFleet).not.toBeNull();

  expect(composition.battleStar.x).toBeGreaterThanOrEqual(570);
  expect(composition.battleStar.x).toBeLessThanOrEqual(730);
  expect(composition.battleStar.y).toBeGreaterThanOrEqual(410);
  expect(composition.battleStar.y).toBeLessThanOrEqual(550);

  expect(composition.selectedFleet?.x).toBeGreaterThanOrEqual(570);
  expect(composition.selectedFleet?.x).toBeLessThanOrEqual(730);
  expect(composition.selectedFleet?.y).toBeGreaterThanOrEqual(410);
  expect(composition.selectedFleet?.y).toBeLessThanOrEqual(550);

  expect(composition.waypointStar.x).toBeGreaterThanOrEqual(760);
  expect(composition.waypointStar.x).toBeLessThanOrEqual(940);
  expect(composition.waypointStar.y).toBeGreaterThanOrEqual(720);
  expect(composition.waypointStar.y).toBeLessThanOrEqual(900);

  return composition;
}

async function frameBattleMap(appPage: Page): Promise<MapComposition> {
  const composition = await appPage.evaluate(
    ({
      battleStarUid,
      waypointStarUid,
      syntheticFleetUidBase,
      mapScale,
      target,
    }) => {
      const np = window.NeptunesPride;
      const map = np.npui.map;
      const battleStar = np.universe.galaxy.stars[battleStarUid];
      const waypointStar = np.universe.galaxy.stars[waypointStarUid];
      const fleet = Object.values(np.universe.galaxy.fleets)
        .filter((candidate) => candidate.uid >= syntheticFleetUidBase)
        .sort((left, right) => right.uid - left.uid)[0];

      if (!battleStar || !waypointStar || !fleet) {
        throw new Error("Battle HUD fixture objects are missing.");
      }

      np.universe.interfaceSettings.screenPos = "none";
      np.universe.interfaceSettings.showStarPimples = false;
      np.universe.interfaceSettings.showScanningRanges = false;
      np.universe.interfaceSettings.showFleets = true;
      np.universe.interfaceSettings.textZoomStarNames = 0;
      np.universe.interfaceSettings.textZoomShips = 0;

      map.zooming = false;
      map.scale = mapScale;
      map.scaleTarget = mapScale;
      map.miniMapEnabled = false;
      map.sx = target.x / map.pixelRatio - battleStar.x * map.scale;
      map.sy = target.y / map.pixelRatio - battleStar.y * map.scale;

      np.universe.selectedStar = battleStar;
      np.universe.selectedFleet = fleet;
      np.universe.selectedSpaceObject = fleet;
      np.np.trigger("map_rebuild");

      if (typeof map.draw === "function") {
        map.draw();
      }

      const screenSubject = (subject) => ({
        uid: subject.uid,
        name: subject.n,
        x: map.worldToScreenX(subject.x),
        y: map.worldToScreenY(subject.y),
      });

      return {
        scale: map.scale,
        scaleTarget: map.scaleTarget,
        battleStar: screenSubject(battleStar),
        waypointStar: screenSubject(waypointStar),
        selectedFleet: fleet
          ? {
              uid: fleet.uid,
              name: fleet.n,
              x: map.worldToScreenX(fleet.x),
              y: map.worldToScreenY(fleet.y),
            }
          : null,
        selectedFleetUid: fleet?.uid ?? null,
        selectedFleetName: fleet?.n ?? null,
        selectedFleetPath:
          fleet?.path?.map((point: { n: string }) => point.n) ?? [],
      };
    },
    {
      battleStarUid: BATTLE_STAR_UID,
      waypointStarUid: WAYPOINT_STAR_UID,
      syntheticFleetUidBase: SYNTHETIC_FLEET_UID_BASE,
      mapScale: MAP_SCALE,
      target: BATTLE_STAR_SCREEN_TARGET,
    },
  );

  await appPage.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      }),
  );
  await waitForAnimations(appPage);

  return composition;
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
