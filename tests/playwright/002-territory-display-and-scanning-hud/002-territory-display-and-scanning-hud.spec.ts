import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { waitForAgentHooks } from "../helpers";
import { TestStepHelper, waitForAnimations } from "../support/test-step-helper";

const ORIGIN_STAR_UID = 501;
const TARGET_STAR_UID = 856;
const ORIGIN_STAR_NAME = "Mega Segin";
const TARGET_STAR_NAME = "Laser Fort 11";
const ORIGIN_OWNER_UID = 5;
const ORIGIN_OWNER_ALIAS = "Osric";

const FAST_JIH_STAR_UID = 118;
const FAST_JIH_STAR_NAME = "Alshat";
const FLEET_680_UID = 602;
const FLEET_684_UID = 1443;

const SYNTHETIC_FLEET_UID_BASE = 100000;
const TERRITORY_MAP_SCALE = 200; // Zoomed out enough to see borders clearly
const SCAN_MAP_SCALE = 300;
const SCAN_EXISTING_MAP_SCALE = 400; // Zoomed in tighter for scan indicators
const ORIGIN_STAR_SCREEN_TARGET = { x: 800, y: 540 }; // Center of 1600x1080 clip roughly
const SCAN_ORIGIN_SCREEN_TARGET = { x: 520, y: 570 };
const FAST_JIH_SCREEN_TARGET = { x: 800, y: 540 };
const MAP_CLIP = { x: 0, y: 120, width: 1600, height: 1080 };

type TerritoryState = {
  selectedStarUid: number | null;
  selectedStarName: string | null;
  selectedFleetUid: number | null;
  selectedFleetName: string | null;
  selectedFleetPath: number[];
  controllingPlayerUid: number | null;
  controllingPlayerAlias: string | null;
  playerColorStyle: string | null;
  scanTick: number | null;
  scanLabel: string | null;
  territoryStyle: number | null;
};

type MapComposition = {
  scale: number;
  scaleTarget: number;
  originStar: ScreenSubject;
  targetStar: ScreenSubject;
  selectedFleet: ScreenSubject | null;
  selectedFleetPath: string[];
};

type ScreenSubject = {
  uid: number;
  name: string;
  x: number;
  y: number;
};

test("documents territory display and scanning HUD controls", async ({
  appPage,
}, testInfo) => {
  const helper = new TestStepHelper(appPage, testInfo);

  helper.setMetadata({
    title: "Territory Display And Scanning HUD Validation",
    validationGoal:
      "Verify that the territory overlay can be framed, restyled through all four modes, recolored to white, and combined with both existing and fake fleets to measure scan ETA.",
    docsTitle: "Territory Display And Scanning HUD",
    docsSummary:
      "The territory and scanning HUD overlays make the map easier to read while planning. They show which empire owns the selected area, let you cycle through four different territory rendering styles, optionally recolor your own empire white, and show exactly when any fleet will enter the scanning range of the selected star.",
    bookSection: "Territory display and scanning HUD",
  });

  await waitForAgentHooks(appPage);
  await prepareTerritoryScenario(appPage);

  await frameAndAssertTerritoryMap(appPage);
  await helper.step("show-selected-empire-territory", {
    description: "Show the selected empire's territory and scanning reach",
    verifications: [
      {
        spec: "The fixture starts with Mega Segin selected for Osric",
        check: async () => {
          const state = await readTerritoryState(appPage);
          expect(state.selectedStarUid).toBe(ORIGIN_STAR_UID);
          expect(state.selectedStarName).toBe(ORIGIN_STAR_NAME);
          expect(state.controllingPlayerUid).toBe(ORIGIN_OWNER_UID);
          expect(state.controllingPlayerAlias?.trim()).toMatch(
            new RegExp(`^${ORIGIN_OWNER_ALIAS}`),
          );
        },
      },
      {
        spec: "The screenshot frame keeps Mega Segin near the center with nearby Osric territory visible",
        check: async () => {
          await frameAndAssertTerritoryMap(appPage);
        },
      },
    ],
    documentation: {
      summary:
        "Select one of your stars, such as `Mega Segin`, to show the territory overlay for that empire. The colored territory shape summarizes the selected empire's local reach, while the map still shows nearby named stars for orientation.",
      howToUse: [
        "Select a star owned by the empire you want to inspect.",
        "Keep the map zoomed far enough out to see the surrounding territory edge.",
      ],
      expectedResult: [
        "`Mega Segin` stays near the middle of the screenshot.",
        "The selected empire's territory overlay is visible around nearby Osric stars.",
        "The map still shows enough neighboring stars to understand where the territory edge sits.",
      ],
    },
  });

  for (let style = 1; style <= 3; style++) {
    await appPage.evaluate(() => {
      window.Mousetrap.trigger("ctrl+9");
    });
    // Keep consistent framing
    await frameAndAssertTerritoryMap(appPage);
    await helper.step(`cycle-territory-display-style-${style + 1}`, {
      description: `Cycle to territory display style ${style + 1}`,
      verifications: [
        {
          spec: `The territory style is now ${style + 1}`,
          check: async () => {
            const state = await readTerritoryState(appPage);
            expect(state.selectedStarUid).toBe(ORIGIN_STAR_UID);
          },
        },
      ],
      documentation: {
        summary: `Style ${style + 1} offers a different visual balance between territory fill and map clarity. Comparison is easy as the view remains centered on \`Mega Segin\`.`,
        howToUse: ["Press `Ctrl+9` to cycle to the next style."],
        expectedResult: ["The territory rendering updates immediately."],
      },
    });
  }

  // Recolor white still using same framing
  await frameAndAssertTerritoryMap(appPage);
  await helper.step("recolor-my-territory-white", {
    description: "Recolor your empire white on the map",
    verifications: [
      {
        spec: "The w hotkey changes the current player's map color to white",
        check: async () => {
          await appPage.evaluate(() => {
            window.Mousetrap.trigger("w");
          });
          await frameAndAssertTerritoryMap(appPage);
          const state = await readTerritoryState(appPage);
          expect(state.playerColorStyle).toBe("#ffffff");
        },
      },
    ],
    documentation: {
      summary:
        "Press `w` to recolor your own empire white. This is useful when your normal player color blends into the nebula, territory fill, or another nearby empire's color. This comparison uses the same zoom and centering as the previous style examples.",
      howToUse: [
        "Select one of your own stars.",
        "Press `w` to toggle your map color to white.",
      ],
      expectedResult: [
        "Your empire's map color changes to white.",
      ],
    },
  });

  // Move to scan info with existing fleets
  await frameAndAssertExistingScanMap(appPage, FAST_JIH_STAR_UID, FAST_JIH_SCREEN_TARGET);
  await helper.step("scan-eta-green-and-grey-fleets", {
    description: "Green and Grey Scan ETAs for multiple fleets",
    beforeScreenshot: async () => {
      // Route multiple fleets to Alshat to show multiple ETAs
      await appPage.evaluate(({ starUid, f1, f2 }) => {
        const np = window.NeptunesPride;
        const targetStar = np.universe.galaxy.stars[starUid];
        
        [f1, f2].forEach(uid => {
          const fleet = np.universe.galaxy.fleets[uid];
          if (fleet) {
            fleet.o = [[0, starUid, 0, 0]]; // Force route to target star
            fleet.path = [targetStar];
            fleet.etaFirst = 10; // Ensure etaFirst is set so Scan HUD runs
          }
        });
        
        np.universe.selectedStar = targetStar;
        np.crux.trigger("show_star_uid", String(starUid));
        np.np.trigger("map_rebuild");
      }, { starUid: FAST_JIH_STAR_UID, f1: FLEET_680_UID, f2: FLEET_684_UID });
    },
    verifications: [
      {
        spec: "Selecting Alshat shows multiple scan ETAs: Green for unscanned fleets and Grey for already scanned fleets",
        check: async () => {
          const state = await readTerritoryState(appPage);
          expect(state.selectedStarUid).toBe(FAST_JIH_STAR_UID);
        },
      },
    ],
    documentation: {
      summary: "When multiple fleets approach the same star, NPA calculates and displays scan ETAs for each one. This example selects `Alshat`, owned by `piers plowman`. Two allied fleets are approaching: one is currently hidden from the enemy (Green ETA), and another is already visible to them via `Blue Minchir` (Grey ETA).",
      howToUse: [
        "Select an enemy star being approached by multiple fleets.",
        "Look for the distinct color-coded ETA labels near each fleet.",
      ],
      expectedResult: [
        "Multiple scan ETA labels appear on the map.",
        "Green labels (like for `Fleet 602`) indicate upcoming first-time detection.",
        "Grey labels (like for `Fleet 1443`) indicate when this specific star will also gain a scan lock on an already-detected fleet.",
      ],
    },
  });

  await prepareFakeFleetScanRoute(appPage);
  await frameAndAssertScanMap(appPage);
  await helper.step("measure-scan-eta-with-fake-fleet", {
    description: "Measure scan ETA with a fake fleet route",
    verifications: [
      {
        spec: "The scan HUD calculation predicts the tick when the fake fleet enters Laser Fort 11's scanning range",
        check: async () => {
          const state = await readTerritoryState(appPage);
          expect(state.selectedStarUid).toBe(TARGET_STAR_UID);
        },
      },
    ],
    documentation: {
      summary:
        "You can also use fake fleets to plan routes and see exactly when they will enter enemy scan. This is vital for timing 'dark' jumps where you want to arrive or change course just before being detected.",
      howToUse: [
        "Press `x` to create a fake planning fleet.",
        "Add waypoints to the destination.",
        "Select the destination star to see the scan ETA for that route.",
      ],
      expectedResult: [
        "The scan HUD displays the expected entry tick for the planned route.",
      ],
    },
  });

  helper.generateArtifacts();
});

async function prepareTerritoryScenario(appPage: Page): Promise<void> {
  await appPage.waitForFunction(
    ({ originStarUid, originOwnerUid }) => {
      const np = window.NeptunesPride;
      return !!(
        np?.universe?.player &&
        np.universe.player.uid === originOwnerUid &&
        np.universe.galaxy?.stars?.[originStarUid]?.puid === originOwnerUid
      );
    },
    {
      originStarUid: ORIGIN_STAR_UID,
      originOwnerUid: ORIGIN_OWNER_UID,
    },
  );

  await appPage.evaluate(
    ({ originStarUid, mapScale, target }) => {
      const np = window.NeptunesPride;
      const map = np.npui.map;
      const originStar = np.universe.galaxy.stars[originStarUid];

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
      map.sx = target.x / map.pixelRatio - originStar.x * map.scale;
      map.sy = target.y / map.pixelRatio - originStar.y * map.scale;

      np.universe.selectedStar = originStar;
      np.universe.selectedFleet = null;
      np.universe.selectedSpaceObject = originStar;
      np.crux.trigger("show_star_uid", String(originStarUid));
      np.np.trigger("map_rebuild");
    },
    {
      originStarUid: ORIGIN_STAR_UID,
      mapScale: TERRITORY_MAP_SCALE,
      target: ORIGIN_STAR_SCREEN_TARGET,
    },
  );

  await expect
    .poll(async () => readTerritoryState(appPage), { timeout: 10000 })
    .toMatchObject({
      selectedStarUid: ORIGIN_STAR_UID,
      controllingPlayerUid: ORIGIN_OWNER_UID,
    });
}

async function prepareFakeFleetScanRoute(appPage: Page): Promise<void> {
  await appPage.evaluate(
    ({ originStarUid, targetStarUid, syntheticFleetUidBase }) => {
      const np = window.NeptunesPride;
      const originStar = np.universe.galaxy.stars[originStarUid];
      const targetStar = np.universe.galaxy.stars[targetStarUid];

      np.universe.selectedStar = originStar;
      np.universe.selectedFleet = null;
      np.universe.selectedSpaceObject = originStar;
      np.crux.trigger("show_star_uid", String(originStarUid));
      window.Mousetrap.trigger("x");

      let fleet = np.universe.selectedFleet;
      if (!fleet || fleet.uid < syntheticFleetUidBase) {
        fleet = Object.values(np.universe.galaxy.fleets)
          .filter((candidate) => candidate.uid >= syntheticFleetUidBase)
          .sort((left, right) => right.uid - left.uid)[0];
      }

      if (!fleet) {
        throw new Error("Failed to create fake fleet for scan ETA planning.");
      }

      np.universe.selectFleet(fleet);
      np.crux.trigger("add_waypoint", targetStar);
      np.npui.trigger("start_edit_waypoints", { fleet });

      np.universe.selectedStar = targetStar;
      np.universe.selectedFleet = fleet;
      np.universe.selectedSpaceObject = fleet;
      np.np.trigger("map_rebuild");
    },
    {
      originStarUid: ORIGIN_STAR_UID,
      targetStarUid: TARGET_STAR_UID,
      syntheticFleetUidBase: SYNTHETIC_FLEET_UID_BASE,
    },
  );

  await expect
    .poll(async () => readTerritoryState(appPage), { timeout: 10000 })
    .toMatchObject({
      selectedStarUid: TARGET_STAR_UID,
      selectedFleetPath: [TARGET_STAR_UID],
    });
}

async function frameAndAssertTerritoryMap(
  appPage: Page,
): Promise<MapComposition> {
  const composition = await frameMap(appPage, {
    selectedStarUid: ORIGIN_STAR_UID,
    selectedFleet: false,
    mapScale: TERRITORY_MAP_SCALE,
    target: ORIGIN_STAR_SCREEN_TARGET,
  });

  expect(composition.scale).toBe(TERRITORY_MAP_SCALE);
  expect(composition.originStar.name).toBe(ORIGIN_STAR_NAME);

  return composition;
}

async function frameAndAssertExistingScanMap(
  appPage: Page,
  starUid: number,
  target: { x: number, y: number }
): Promise<MapComposition> {
  const composition = await frameMap(appPage, {
    selectedStarUid: starUid,
    focusStarUid: starUid,
    selectedFleet: false,
    mapScale: SCAN_EXISTING_MAP_SCALE,
    target,
  });

  expect(composition.scale).toBe(SCAN_EXISTING_MAP_SCALE);
  return composition;
}

async function frameAndAssertScanMap(appPage: Page): Promise<MapComposition> {
  const composition = await frameMap(appPage, {
    selectedStarUid: TARGET_STAR_UID,
    focusStarUid: ORIGIN_STAR_UID,
    selectedFleet: true,
    mapScale: SCAN_MAP_SCALE,
    target: SCAN_ORIGIN_SCREEN_TARGET,
  });

  expect(composition.scale).toBe(SCAN_MAP_SCALE);
  expect(composition.selectedFleet).not.toBeNull();
  expect(composition.selectedFleet?.uid).toBeGreaterThanOrEqual(
    SYNTHETIC_FLEET_UID_BASE,
  );

  return composition;
}

async function frameMap(
  appPage: Page,
  options: {
    selectedStarUid: number;
    focusStarUid?: number;
    selectedFleet: boolean;
    mapScale: number;
    target: { x: number; y: number };
  },
): Promise<MapComposition> {
  const composition = await appPage.evaluate(
    ({
      originStarUid,
      targetStarUid,
      syntheticFleetUidBase,
      selectedStarUid,
      focusStarUid,
      selectedFleet,
      mapScale,
      target,
    }) => {
      const np = window.NeptunesPride;
      const map = np.npui.map;
      const originStar = np.universe.galaxy.stars[originStarUid];
      const targetStar = np.universe.galaxy.stars[targetStarUid];
      const selectedStar = np.universe.galaxy.stars[selectedStarUid];
      const focusStar = np.universe.galaxy.stars[focusStarUid ?? selectedStarUid];
      
      let fleet = np.universe.selectedFleet;
      if (!fleet || fleet.uid < syntheticFleetUidBase) {
         fleet = Object.values(np.universe.galaxy.fleets)
          .filter((candidate) => candidate.uid >= syntheticFleetUidBase)
          .sort((left, right) => right.uid - left.uid)[0];
      }

      if (!originStar || !targetStar || !selectedStar || !focusStar) {
        throw new Error("Territory HUD fixture objects are missing.");
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
      map.sx = target.x / map.pixelRatio - focusStar.x * map.scale;
      map.sy = target.y / map.pixelRatio - focusStar.y * map.scale;

      np.universe.selectedStar = selectedStar;
      if (selectedFleet) {
        if (!fleet) {
          throw new Error("Expected fake fleet to exist for scan map framing.");
        }
        np.universe.selectedFleet = fleet;
        np.universe.selectedSpaceObject = fleet;
      } else {
        np.universe.selectedFleet = null;
        np.universe.selectedSpaceObject = selectedStar;
      }
      np.crux.trigger("show_star_uid", String(selectedStar.uid));
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
        originStar: screenSubject(originStar),
        targetStar: screenSubject(targetStar),
        selectedFleet: fleet
          ? {
              uid: fleet.uid,
              name: fleet.n,
              x: map.worldToScreenX(fleet.x),
              y: map.worldToScreenY(fleet.y),
            }
          : null,
        selectedFleetPath:
          fleet?.path?.map((point: { n: string }) => point.n) ?? [],
      };
    },
    {
      originStarUid: ORIGIN_STAR_UID,
      targetStarUid: TARGET_STAR_UID,
      syntheticFleetUidBase: SYNTHETIC_FLEET_UID_BASE,
      selectedStarUid: options.selectedStarUid,
      focusStarUid: options.focusStarUid,
      selectedFleet: options.selectedFleet,
      mapScale: options.mapScale,
      target: options.target,
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

async function readTerritoryState(appPage: Page): Promise<TerritoryState> {
  return appPage.evaluate(
    ({ syntheticFleetUidBase }) => {
      const np = window.NeptunesPride;
      const star = np.universe.selectedStar;
      const fleet = np.universe.selectedFleet;

      return {
        selectedStarUid: star?.uid ?? null,
        selectedStarName: star?.n ?? null,
        selectedFleetUid: fleet?.uid ?? null,
        selectedFleetName: fleet?.n ?? null,
        selectedFleetPath:
          fleet?.path?.map((point: { uid: number }) => point.uid) ?? [],
        controllingPlayerUid: np.universe.player?.uid ?? null,
        controllingPlayerAlias: np.universe.player?.alias ?? null,
        playerColorStyle: np.universe.player?.colorStyle ?? null,
        scanTick: null,
        scanLabel: null,
        territoryStyle: (window as any).npa?.territory?.style ?? null,
      };
    },
    {
      syntheticFleetUidBase: SYNTHETIC_FLEET_UID_BASE,
    },
  );
}



async function clipHash(
  appPage: Page,
  clip: { x: number; y: number; width: number; height: number },
): Promise<string> {
  const png = await appPage.screenshot({ clip });
  return createHash("sha256").update(png).digest("hex");
}
