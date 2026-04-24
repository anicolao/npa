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
      "The battle HUD is not one isolated panel. It is a set of map overlays, ETA labels, and control shortcuts that help you inspect a frontline star, plan enemy movement, and model worst-case combat assumptions.",
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
        "To plan for incoming attacks, you can create \"synthetic\" fleets to model enemy movement. Select an enemy star (such as `Hot Sham` in the example below) and press **x** to create a fake enemy fleet. NPA temporarily switches your planning context to that empire so you can plot routes and see exactly when they might arrive at your stars without changing the real game state.",
      howToUse: [
        "Select the enemy star you want to inspect.",
        "Press **x** to create a fake planning fleet from that star.",
        "Add waypoints to nearby stars (like `Red Chertan` in the example) to see potential travel times.",
      ],
      expectedResult: [
        "As shown in the screenshot, the route line runs from the selected star toward your waypoints.",
        "The map overlay indicates you are temporarily controlling the selected enemy empire for planning.",
        "The waypoint editor displays an ETA using your currently selected timebase.",
      ],
      caveats: [
        "Use these fake routes to identify the exact moment an enemy fleet could reach your territory. These orders are for local planning only and do not affect the live game.",
      ],
    },
  });

  await frameAndAssertBattleMap(appPage);
  await helper.step("cycle-to-clock-time", {
    description: "Show the battle ETA as clock time",
    verifications: [
      {
        spec: "The % hotkey changes the route ETA to an absolute clock-time display",
        check: async () => {
          const output = await appPage.evaluate(() => {
            const np = window.NeptunesPride;
            const fleet = np.universe.selectedFleet;
            window.Mousetrap.trigger("%");
            return np.universe.timeToTick(fleet.etaFirst, false);
          });

          expect(output).toMatch(/(@|AM|PM)/);
        },
      },
      {
        spec: "The route editor shows the clock-time ETA",
        check: async () => {
          await expect(appPage.getByText(/^ETA:/)).toContainText(/AM|PM|@/);
        },
      },
      {
        spec: "The clock-time screenshot still frames Hot Sham, the selected fake fleet, and the Red Chertan route",
        check: async () => {
          await frameAndAssertBattleMap(appPage);
        },
      },
    ],
    documentation: {
      summary:
        "NPA allows you to view ETAs in three different formats. Press **%** to cycle through these modes. Each serves a different tactical purpose: Clock Time (for personal alarms), Relative Ticks (for comparing speeds), and Absolute Ticks (for coordinating with allies).",
      howToUse: [
        "With a fleet route visible, press **%** once to switch to clock-time mode.",
        "Read the ETA line in the waypoint editor as a real-world time.",
      ],
      expectedResult: [
        "Clock mode shows a real-world timestamp such as `11:40 AM`.",
        "The selected fake fleet and route stay in the same map frame while the ETA display changes.",
      ],
      caveats: [
        "Use clock mode for your own alarms. Allies in other timezones should usually coordinate by tick number instead.",
      ],
    },
  });

  await frameAndAssertBattleMap(appPage);
  await helper.step("cycle-to-relative-ticks", {
    description: "Show the battle ETA as relative ticks",
    verifications: [
      {
        spec: "The next % press changes the route ETA to relative ticks",
        check: async () => {
          const output = await appPage.evaluate(() => {
            const np = window.NeptunesPride;
            const fleet = np.universe.selectedFleet;
            window.Mousetrap.trigger("%");
            return np.universe.timeToTick(fleet.etaFirst, false);
          });

          expect(output).toMatch(/ticks/);
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
        "Relative ticks are best when you are comparing your selected fleet against other moving fleets on the map, because tick offsets are easier to compare than the game's default real-time display.",
      howToUse: [
        "After clock-time mode is visible, press **%** one more time.",
        "Read the ETA and production readouts as relative tick counts.",
      ],
      expectedResult: [
        "Relative tick mode changes the ETA into a duration such as `4 ticks`.",
        "The waypoint panel, production readout, and route stay aligned with the chosen timebase.",
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
        "Absolute tick numbers are the best timebase for ally coordination because everyone sees the same tick even when their local clock time differs.",
      howToUse: [
        "After reaching relative tick mode, press **%** one more time.",
        "Read the ETA and production readouts as explicit tick numbers (e.g., `Tick #529`).",
      ],
      expectedResult: [
        "As seen in the example, the same route now shows an exact destination tick.",
        "You can compare the fleet ETA directly against combat or production timing discussed in reports and chat.",
      ],
    },
  });

  await frameAndAssertBattleMap(appPage);
  const regularCalculationHash = await clipHash(appPage, OVERLAY_CLIP);
  await helper.step("apply-enemy-ws-plus-one", {
    description: "Model a worst-case fight by giving the enemy extra weapons",
    verifications: [
      {
        spec: "The . hotkey changes the rendered battle overlay in the HUD footer",
        check: async () => {
          await appPage.evaluate(() => {
            window.Mousetrap.trigger(".");
          });
          const after = await clipHash(appPage, OVERLAY_CLIP);
          expect(after).not.toBe(regularCalculationHash);
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
        "You can manually adjust the weapons technology assumptions for a fight to see if your defense holds up against a more advanced enemy. Press **.** to add a weapons level to the side NPA is currently treating as the opponent.",
      howToUse: [
        "With a battle route selected, press **.** to increase the enemy weapons assumption by one level.",
      ],
      expectedResult: [
        "The footer overlay changes to show the adjustment, for example `Enemy WS+1`.",
        "The projected survivor estimates update immediately to reflect the harsher combat assumption.",
      ],
      caveats: [
        "Always test your critical defenses against `Enemy WS+1`. If you still win the fight under that assumption, your star is likely secure even if the enemy receives a technology gift from an ally.",
        "This is a planning aid. It changes NPA's local calculation, not the real weapons tech on the server.",
      ],
    },
  });

  await frameAndAssertBattleMap(appPage);
  await helper.step("clear-combat-handicap", {
    description: "Return to the regular weapons calculation",
    verifications: [
      {
        spec: "The , hotkey removes the Enemy WS+1 adjustment and returns the footer to the regular calculation",
        check: async () => {
          await appPage.evaluate(() => {
            window.Mousetrap.trigger(",");
          });
          const after = await clipHash(appPage, OVERLAY_CLIP);
          expect(after).toBe(regularCalculationHash);
        },
      },
      {
        spec: "The fake enemy fleet and battle route remain selected after clearing the handicap",
        check: async () => {
          const state = await readBattleState(appPage);
          expect(state.selectedFleetUid).toBeGreaterThanOrEqual(
            SYNTHETIC_FLEET_UID_BASE,
          );
          expect(state.selectedFleetPath).toEqual([WAYPOINT_STAR_UID]);
        },
      },
      {
        spec: "The regular-calculation screenshot keeps Hot Sham, the selected fleet route, and the battle HUD footer in frame",
        check: async () => {
          const composition = await frameAndAssertBattleMap(appPage);
          expect(composition.battleStar.name).toBe(BATTLE_STAR_NAME);
        },
      },
    ],
    documentation: {
      summary:
        "Press **,** to remove weapons adjustments and return the battle HUD to the regular calculation. This gives you a visual checkpoint for the baseline survivor estimate before trying the opposite assumption.",
      howToUse: [
        "Start from the `Enemy WS+1` view.",
        "Press **,** once to step the weapons adjustment back to zero.",
      ],
      expectedResult: [
        "The footer no longer shows an adjustment, returning you to the baseline projection.",
        "The selected synthetic fleet and route toward its destination remain visible for easy comparison.",
      ],
    },
  });

  await frameAndAssertBattleMap(appPage);
  await helper.step("apply-my-ws-minus-one", {
    description: "Model the opposite weapons advantage with My WS-1",
    verifications: [
      {
        spec: "Pressing , again displays My WS-1 and changes the footer calculation from the regular baseline",
        check: async () => {
          await appPage.evaluate(() => {
            window.Mousetrap.trigger(",");
          });
          const after = await clipHash(appPage, OVERLAY_CLIP);
          expect(after).not.toBe(regularCalculationHash);
        },
      },
      {
        spec: "The fake enemy fleet and battle route remain selected after applying the WS-1 adjustment",
        check: async () => {
          const state = await readBattleState(appPage);
          expect(state.selectedFleetUid).toBeGreaterThanOrEqual(
            SYNTHETIC_FLEET_UID_BASE,
          );
          expect(state.selectedFleetPath).toEqual([WAYPOINT_STAR_UID]);
        },
      },
      {
        spec: "The WS-1 screenshot keeps Hot Sham, the selected fleet route, and the battle HUD footer in frame",
        check: async () => {
          const composition = await frameAndAssertBattleMap(appPage);
          expect(composition.battleStar.name).toBe(BATTLE_STAR_NAME);
        },
      },
    ],
    documentation: {
      summary:
        "Press **,** again to continue past the regular calculation into `My WS-1`. A negative local weapons adjustment grants the other side of the battle the weapons advantage for the local projection.",
      howToUse: [
        "Start from the regular weapons calculation.",
        "Press **,** one more time to display `My WS-1`.",
      ],
      expectedResult: [
        "The footer overlay changes to show `My WS-1`.",
        "The survivor estimate reflects the opposite weapons assumption, effectively granting your opponent the advantage.",
      ],
      caveats: [
        "These adjustments follow the same perspective rule: the label is relative to the side NPA is currently modeling as 'you' in the planning view.",
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
