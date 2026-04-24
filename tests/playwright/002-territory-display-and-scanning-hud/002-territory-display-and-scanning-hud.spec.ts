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
const GREY_VISIBILITY_STAR_UID = 123;
const GREY_VISIBILITY_STAR_NAME = "Tau Keid";
const FLEET_680_UID = 602;
const FLEET_684_UID = 1443;

const SYNTHETIC_FLEET_UID_BASE = 100000;
const TERRITORY_MAP_SCALE = 200; // Zoomed out enough to see borders clearly
const SCAN_MAP_SCALE = 300;
const SCAN_EXISTING_MAP_SCALE = 400; // Zoomed in tighter for scan indicators
const ORIGIN_STAR_SCREEN_TARGET = { x: 800, y: 540 }; // Center of 1600x1080 clip roughly
const SCAN_ORIGIN_SCREEN_TARGET = { x: 520, y: 570 };
const FAST_JIH_SCREEN_TARGET = { x: 800, y: 540 }; // Center on target star

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

type ScanHudIndicator = {
  fleetUid: number;
  color: "green" | "grey";
  hudColor: "#00ff00" | "#888888";
  selectedStarUid: number | null;
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
      "The territory and scanning HUD overlays make the map easier to read while planning. They show which empire owns the selected area, allow you to cycle through different territory rendering styles, and provide precise arrival times for fleets entering a star's scanning range.",
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
        "Selecting a star highlights the territory owned by that empire. This colored shape provides a quick visual summary of an empire's local influence and borders. In the example below, selecting `Mega Segin` reveals the surrounding empire's reach.",
      howToUse: [
        "Select any star on the map.",
        "Zoom out to see the full extent of the territory overlay.",
      ],
      expectedResult: [
        "The territory of the selected star's owner is shaded on the map.",
        "Neighboring stars (such as `Mega Segin` in the example) remain visible to help you orient the borders.",
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
        howToUse: ["Press **Ctrl+9** to cycle to the next style."],
        expectedResult: ["The visual style of the territory rendering updates immediately."],
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
        "If your player color is difficult to see against the background or neighboring empires, you can toggle your own empire's color to white. This only changes your local view and does not affect how other players see you.",
      howToUse: [
        "Select one of your own stars.",
        "Press **w** to toggle your map color to white.",
      ],
      expectedResult: ["Your empire's map color changes to white, as seen in the screenshot."],
    },
  });

  // Move to scan info with existing fleets
  await prepareExistingFleetScanHud(appPage);
  await frameAndAssertExistingScanMap(
    appPage,
    FAST_JIH_STAR_UID,
    FAST_JIH_SCREEN_TARGET,
  );
  await helper.step("scan-eta-green-and-grey-fleets", {
    description: "Green and Grey Scan ETAs for multiple fleets",
    beforeScreenshot: async () => {
      await frameAndAssertExistingScanMap(
        appPage,
        FAST_JIH_STAR_UID,
        FAST_JIH_SCREEN_TARGET,
      );
    },
    verifications: [
      {
        spec: "Selecting Alshat shows multiple scan ETAs: Green for unscanned fleets and Grey for already scanned fleets",
        check: async () => {
          const state = await readTerritoryState(appPage);
          expect(state.selectedStarUid).toBe(FAST_JIH_STAR_UID);
          expect(state.selectedStarName).toBe(FAST_JIH_STAR_NAME);
        },
      },
      {
        spec: "The scan HUD example includes one green indicator and one grey indicator in the screenshot frame",
        check: async () => {
          const indicators = await readScanHudIndicators(appPage, [
            FLEET_680_UID,
            FLEET_684_UID,
          ]);

          expect(indicators).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                fleetUid: FLEET_680_UID,
                color: "green",
              }),
              expect.objectContaining({
                fleetUid: FLEET_684_UID,
                color: "grey",
              }),
            ]),
          );

          for (const indicator of indicators) {
            expect(indicator.selectedStarUid).toBe(FAST_JIH_STAR_UID);
            expect(indicator.x).toBeGreaterThan(0);
            expect(indicator.x).toBeLessThan(1600);
            expect(indicator.y).toBeGreaterThan(120);
            expect(indicator.y).toBeLessThan(1200);
          }
        },
      },
    ],
    documentation: {
      summary: `Knowing exactly when a fleet will be detected is critical for timing your maneuvers. NPA displays color-coded scan ETA labels for fleets approaching a star. In this example, the enemy star \`${FAST_JIH_STAR_NAME}\` is being approached by multiple fleets.`,
      howToUse: [
        "Select an enemy star that fleets are approaching.",
        "Look for the distinct color-coded ETA labels near each fleet icon.",
      ],
      expectedResult: [
        "**Green Labels:** Indicate a \"dark\" fleet's first-time detection by this star.",
        "**Grey Labels:** Indicate when this star will gain a scan lock on a fleet that is already visible via other stars.",
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
        "Press **x** to create a fake planning fleet.",
        "Add waypoints to the destination.",
        "Select the destination star (like \`${TARGET_STAR_NAME}\` in the example) to see the scan ETA for that route.",
      ],
      expectedResult: [
        "As shown in the screenshot, the scan HUD displays the expected entry tick for the planned route.",
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

      np.universe.selectedPlayer = originStar.player;
      np.universe.selectedStar = originStar;
      np.universe.selectedFleet = null;
      np.universe.selectedSpaceObject = originStar;
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

async function prepareExistingFleetScanHud(appPage: Page): Promise<void> {
  await appPage.evaluate(
    ({ targetStarUid, visibilityStarUid, greenFleetUid, greyFleetUid }) => {
      const np = window.NeptunesPride;
      const galaxy = np.universe.galaxy;
      const targetStar = galaxy.stars[targetStarUid];
      const visibilityStar = galaxy.stars[visibilityStarUid];
      const greenFleet = galaxy.fleets[greenFleetUid];
      const greyFleet = galaxy.fleets[greyFleetUid];

      if (!targetStar || !visibilityStar || !greenFleet || !greyFleet) {
        throw new Error("Scan HUD fixture objects are missing.");
      }

      const scanRange = np.universe.calcScanValue(targetStar.player);
      const setFleetRoute = (
        fleet: {
          x: number;
          y: number;
          lx: number;
          ly: number;
          o: unknown[];
          path: unknown[];
          etaFirst: number;
        },
        x: number,
        y: number,
      ) => {
        fleet.x = x;
        fleet.y = y;
        fleet.lx = x;
        fleet.ly = y;
        fleet.o = [[0, targetStarUid, 0, 0]];
        fleet.path = [targetStar];
        fleet.etaFirst = 64;
      };

      setFleetRoute(greenFleet, targetStar.x + scanRange + 0.18, targetStar.y);

      const dx = visibilityStar.x - targetStar.x;
      const dy = visibilityStar.y - targetStar.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const greyVisibilityOffset = 0.45;
      setFleetRoute(
        greyFleet,
        visibilityStar.x + (dx / length) * greyVisibilityOffset,
        visibilityStar.y + (dy / length) * greyVisibilityOffset,
      );

      np.universe.selectedPlayer = targetStar.player;
      np.universe.selectedStar = targetStar;
      np.universe.selectedFleet = null;
      np.universe.selectedSpaceObject = targetStar;
      np.np.trigger("map_rebuild");
    },
    {
      targetStarUid: FAST_JIH_STAR_UID,
      visibilityStarUid: GREY_VISIBILITY_STAR_UID,
      greenFleetUid: FLEET_680_UID,
      greyFleetUid: FLEET_684_UID,
    },
  );

  await expect
    .poll(
      async () =>
        readScanHudIndicators(appPage, [FLEET_680_UID, FLEET_684_UID]),
      { timeout: 10000 },
    )
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fleetUid: FLEET_680_UID, color: "green" }),
        expect.objectContaining({ fleetUid: FLEET_684_UID, color: "grey" }),
      ]),
    );
}

async function prepareFakeFleetScanRoute(appPage: Page): Promise<void> {
  await appPage.evaluate(
    ({ originStarUid, targetStarUid, syntheticFleetUidBase }) => {
      const np = window.NeptunesPride;
      const originStar = np.universe.galaxy.stars[originStarUid];
      const targetStar = np.universe.galaxy.stars[targetStarUid];

      np.universe.selectedPlayer = originStar.player;
      np.universe.selectedStar = originStar;
      np.universe.selectedFleet = null;
      np.universe.selectedSpaceObject = originStar;
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
  target: { x: number; y: number },
): Promise<MapComposition> {
  const composition = await frameMap(appPage, {
    selectedStarUid: starUid,
    targetStarUid: starUid,
    focusStarUid: starUid,
    selectedFleet: false,
    mapScale: SCAN_EXISTING_MAP_SCALE,
    target,
  });

  expect(composition.scale).toBe(SCAN_EXISTING_MAP_SCALE);
  expect(composition.targetStar.x).toBeCloseTo(target.x, 0);
  expect(composition.targetStar.y).toBeCloseTo(target.y, 0);
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
    targetStarUid?: number;
    focusStarUid?: number;
    selectedFleet: boolean;
    mapScale: number;
    target: { x: number; y: number };
  },
): Promise<MapComposition> {
  const composition = await appPage.evaluate(
    ({
      originStarUid,
      defaultTargetStarUid,
      syntheticFleetUidBase,
      selectedStarUid,
      targetStarUid,
      focusStarUid,
      selectedFleet,
      mapScale,
      target,
    }) => {
      const np = window.NeptunesPride;
      const map = np.npui.map;
      const originStar = np.universe.galaxy.stars[originStarUid];
      const targetStar =
        np.universe.galaxy.stars[targetStarUid ?? defaultTargetStarUid];
      const selectedStar = np.universe.galaxy.stars[selectedStarUid];
      const focusStar =
        np.universe.galaxy.stars[focusStarUid ?? selectedStarUid];

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

      if (selectedFleet) {
        if (!fleet) {
          throw new Error("Expected fake fleet to exist for scan map framing.");
        }
        np.universe.selectedPlayer = fleet.player;
        np.universe.selectedFleet = fleet;
        np.universe.selectedSpaceObject = fleet;
        np.universe.selectedStar = selectedStar;
      } else {
        np.universe.selectedPlayer = selectedStar.player;
        np.universe.selectedStar = selectedStar;
        np.universe.selectedFleet = null;
        np.universe.selectedSpaceObject = selectedStar;
      }

      map.zooming = false;
      map.scale = mapScale;
      map.scaleTarget = mapScale;
      map.miniMapEnabled = false;
      map.sx = target.x / map.pixelRatio - focusStar.x * map.scale;
      map.sy = target.y / map.pixelRatio - focusStar.y * map.scale;

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
      defaultTargetStarUid: TARGET_STAR_UID,
      syntheticFleetUidBase: SYNTHETIC_FLEET_UID_BASE,
      selectedStarUid: options.selectedStarUid,
      targetStarUid: options.targetStarUid,
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
  await appPage.evaluate(
    async ({ selectedStarUid, focusStarUid, mapScale, target }) => {
      const np = window.NeptunesPride;
      const map = np.npui.map;
      const focusStar =
        np.universe.galaxy.stars[focusStarUid ?? selectedStarUid];

      const applyFrame = () => {
        map.zooming = false;
        map.scale = mapScale;
        map.scaleTarget = mapScale;
        map.miniMapEnabled = false;
        map.sx = target.x / map.pixelRatio - focusStar.x * map.scale;
        map.sy = target.y / map.pixelRatio - focusStar.y * map.scale;
        np.np.trigger("map_rebuild");

        if (typeof map.draw === "function") {
          map.draw();
        }
      };

      applyFrame();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      applyFrame();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      applyFrame();
    },
    {
      selectedStarUid: options.selectedStarUid,
      focusStarUid: options.focusStarUid,
      mapScale: options.mapScale,
      target: options.target,
    },
  );

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

async function readScanHudIndicators(
  appPage: Page,
  fleetUids: number[],
): Promise<ScanHudIndicator[]> {
  return appPage.evaluate((targetFleetUids) => {
    const np = window.NeptunesPride;
    const universe = np.universe;
    const map = np.npui.map;
    const selectedStar = universe.selectedStar;

    if (
      !selectedStar ||
      selectedStar.puid === universe.player.uid ||
      selectedStar.puid === -1 ||
      map.scale < 200
    ) {
      return [];
    }

    const selectedStarOwner = universe.galaxy.players[selectedStar.puid];
    const scanRange = universe.calcScanValue(selectedStarOwner);
    const canOwnerSeeFleet = (fleet: { x: number; y: number }) =>
      Object.values(universe.galaxy.stars).some(
        (star) =>
          star.puid === selectedStar.puid &&
          universe.distance(star.x, star.y, fleet.x, fleet.y) <= scanRange,
      );

    return targetFleetUids.flatMap((fleetUid) => {
      const fleet = universe.galaxy.fleets[fleetUid];
      if (!fleet || !fleet.path?.length) {
        return [];
      }

      const fleetDistance = universe.distance(
        selectedStar.x,
        selectedStar.y,
        fleet.x,
        fleet.y,
      );
      const destinationDistance = universe.distance(
        selectedStar.x,
        selectedStar.y,
        fleet.path[0].x,
        fleet.path[0].y,
      );

      if (fleetDistance <= scanRange || destinationDistance >= scanRange) {
        return [];
      }

      const isGrey = canOwnerSeeFleet(fleet);
      const x = map.worldToScreenX(fleet.x) + 26 * map.pixelRatio;
      const y = map.worldToScreenY(fleet.y);
      return [
        {
          fleetUid,
          color: isGrey ? "grey" : "green",
          hudColor: isGrey ? "#888888" : "#00ff00",
          selectedStarUid: selectedStar.uid,
          x: x / map.pixelRatio,
          y: y / map.pixelRatio,
        },
      ];
    });
  }, fleetUids);
}
