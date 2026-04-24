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
const SYNTHETIC_FLEET_UID_BASE = 100000;
const TERRITORY_MAP_SCALE = 460;
const SCAN_MAP_SCALE = 300;
const ORIGIN_STAR_SCREEN_TARGET = { x: 690, y: 470 };
const SCAN_ORIGIN_SCREEN_TARGET = { x: 520, y: 570 };
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
      "Verify that the territory overlay can be framed, restyled, recolored to white, and combined with a fake fleet route to measure when the fleet enters enemy scanning range.",
    docsTitle: "Territory Display And Scanning HUD",
    docsSummary:
      "The territory and scanning HUD overlays make the map easier to read while planning. They show which empire owns the selected area, let you change the territory rendering style, optionally recolor your own empire white, and show when a routed fleet will enter an enemy's scanning range.",
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

  await frameAndAssertTerritoryMap(appPage);
  const initialTerritoryHash = await clipHash(appPage, MAP_CLIP);
  await helper.step("cycle-territory-display-style", {
    description: "Cycle the territory display style",
    verifications: [
      {
        spec: "The ctrl+9 hotkey changes the rendered territory style",
        check: async () => {
          await appPage.evaluate(() => {
            window.Mousetrap.trigger("ctrl+9");
          });
          await frameAndAssertTerritoryMap(appPage);
          const updatedTerritoryHash = await clipHash(appPage, MAP_CLIP);
          expect(updatedTerritoryHash).not.toBe(initialTerritoryHash);
        },
      },
      {
        spec: "The selected star remains Mega Segin after cycling the territory style",
        check: async () => {
          const state = await readTerritoryState(appPage);
          expect(state.selectedStarUid).toBe(ORIGIN_STAR_UID);
          expect(state.selectedStarName).toBe(ORIGIN_STAR_NAME);
        },
      },
      {
        spec: "The territory-style screenshot keeps Mega Segin and its surrounding territory in frame",
        check: async () => {
          await frameAndAssertTerritoryMap(appPage);
        },
      },
    ],
    documentation: {
      summary:
        "Press `Ctrl+9` to cycle the territory display style. This changes how strongly NPA draws the selected empire's territory, which helps when the default fill is either too subtle or too dominant for the current map background.",
      howToUse: [
        "Select the empire or star whose territory you are inspecting.",
        "Press `Ctrl+9` to advance to the next territory style.",
        "Use `Ctrl+8` if you want to cycle backward instead.",
      ],
      expectedResult: [
        "The territory overlay changes style without changing the selected star.",
        "`Mega Segin` remains centered so you can compare the new rendering against the previous view.",
      ],
    },
  });

  await frameAndAssertTerritoryMap(appPage);
  const styledTerritoryHash = await clipHash(appPage, MAP_CLIP);
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
      {
        spec: "The white recolor changes the rendered map while keeping the same selected star",
        check: async () => {
          const recoloredHash = await clipHash(appPage, MAP_CLIP);
          expect(recoloredHash).not.toBe(styledTerritoryHash);

          const state = await readTerritoryState(appPage);
          expect(state.selectedStarUid).toBe(ORIGIN_STAR_UID);
          expect(state.selectedStarName).toBe(ORIGIN_STAR_NAME);
        },
      },
      {
        spec: "The white-territory screenshot keeps Mega Segin centered with the recolored territory visible",
        check: async () => {
          await frameAndAssertTerritoryMap(appPage);
        },
      },
    ],
    documentation: {
      summary:
        "Press `w` to recolor your own empire white. This is useful when your normal player color blends into the nebula, territory fill, or another nearby empire's color.",
      howToUse: [
        "Select one of your own stars.",
        "Press `w` to toggle your map color to white.",
        "Press `w` again later if you want to return to your normal color.",
      ],
      expectedResult: [
        "Your empire's map color changes to white.",
        "`Mega Segin` and the surrounding territory remain in the same frame so the color change is easy to compare.",
      ],
      caveats: [
        "This is a local display preference. It does not change your real player color for anyone else.",
      ],
    },
  });

  await prepareFakeFleetScanRoute(appPage);
  await frameAndAssertScanMap(appPage);
  await helper.step("measure-scan-eta-with-fake-fleet", {
    description: "Measure scan ETA with a fake fleet route",
    beforeScreenshot: async () => {
      await frameAndAssertScanMap(appPage);
    },
    verifications: [
      {
        spec: "The fake fleet route starts from Mega Segin and targets Laser Fort 11",
        check: async () => {
          const state = await readTerritoryState(appPage);
          expect(state.selectedFleetUid).toBeGreaterThanOrEqual(
            SYNTHETIC_FLEET_UID_BASE,
          );
          expect(state.selectedFleetName).toMatch(/^Fleet \d+/);
          expect(state.selectedFleetPath).toEqual([TARGET_STAR_UID]);
          expect(state.selectedStarUid).toBe(TARGET_STAR_UID);
          expect(state.selectedStarName).toBe(TARGET_STAR_NAME);
        },
      },
      {
        spec: "The scan HUD calculation predicts the tick when the fake fleet enters Laser Fort 11's scanning range",
        check: async () => {
          const state = await readTerritoryState(appPage);
          expect(state.scanTick).toBeGreaterThan(
            await appPage.evaluate(() => window.NeptunesPride.universe.galaxy.tick),
          );
          expect(state.scanLabel).toMatch(/^Scan Tick #\d+$/);
        },
      },
      {
        spec: "The scan ETA screenshot keeps Mega Segin, Laser Fort 11, the selected fake fleet, and route visible",
        check: async () => {
          await frameAndAssertScanMap(appPage);
        },
      },
    ],
    documentation: {
      summary:
        "Create a fake fleet from `Mega Segin`, route it to enemy-held `Laser Fort 11`, then select `Laser Fort 11` while the fake route remains visible. NPA shows a scan ETA near the moving fleet so you can tell when that fleet should enter the enemy's scanning range.",
      howToUse: [
        "Select your origin star, here `Mega Segin`.",
        "Press `x` to create a fake planning fleet.",
        "Add the enemy star, here `Laser Fort 11`, as the waypoint.",
        "Select the enemy star while keeping the fake fleet route visible.",
      ],
      expectedResult: [
        "`Mega Segin`, the synthetic fleet, and the scan ETA label stay near the middle of the screenshot.",
        "`Laser Fort 11` remains visible at the right end of the route.",
        "The scan HUD displays a label such as `Scan Tick #531`, showing when the routed fleet should become visible to the selected enemy star's owner.",
      ],
      caveats: [
        "The fake fleet is a local planning object. It does not submit orders to Neptune's Pride.",
        "The scan ETA depends on the selected star's owner and the current route. If you select a different enemy star, the displayed scan tick can change.",
      ],
    },
  });

  helper.generateArtifacts();
});

async function prepareTerritoryScenario(appPage: Page): Promise<void> {
  await appPage.waitForFunction(
    ({ originStarUid, targetStarUid, originOwnerUid }) => {
      const np = window.NeptunesPride;
      return !!(
        np?.universe?.player &&
        np.universe.player.uid === originOwnerUid &&
        np.originalPlayer !== undefined &&
        np.universe.galaxy?.stars?.[originStarUid]?.puid === originOwnerUid &&
        np.universe.galaxy?.stars?.[targetStarUid]
      );
    },
    {
      originStarUid: ORIGIN_STAR_UID,
      targetStarUid: TARGET_STAR_UID,
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
  expect(composition.scaleTarget).toBe(TERRITORY_MAP_SCALE);
  expect(composition.originStar.name).toBe(ORIGIN_STAR_NAME);
  expect(composition.targetStar.name).toBe(TARGET_STAR_NAME);
  expect(composition.originStar.x).toBeGreaterThanOrEqual(610);
  expect(composition.originStar.x).toBeLessThanOrEqual(770);
  expect(composition.originStar.y).toBeGreaterThanOrEqual(390);
  expect(composition.originStar.y).toBeLessThanOrEqual(550);

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
  expect(composition.scaleTarget).toBe(SCAN_MAP_SCALE);
  expect(composition.originStar.name).toBe(ORIGIN_STAR_NAME);
  expect(composition.targetStar.name).toBe(TARGET_STAR_NAME);
  expect(composition.selectedFleet).not.toBeNull();
  expect(composition.selectedFleet?.uid).toBeGreaterThanOrEqual(
    SYNTHETIC_FLEET_UID_BASE,
  );
  expect(composition.selectedFleetPath).toEqual([TARGET_STAR_NAME]);

  expect(composition.originStar.x).toBeGreaterThanOrEqual(460);
  expect(composition.originStar.x).toBeLessThanOrEqual(600);
  expect(composition.originStar.y).toBeGreaterThanOrEqual(510);
  expect(composition.originStar.y).toBeLessThanOrEqual(650);

  expect(composition.targetStar.x).toBeGreaterThanOrEqual(1340);
  expect(composition.targetStar.x).toBeLessThanOrEqual(1480);
  expect(composition.targetStar.y).toBeGreaterThanOrEqual(500);
  expect(composition.targetStar.y).toBeLessThanOrEqual(640);

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
      const fleet = Object.values(np.universe.galaxy.fleets)
        .filter((candidate) => candidate.uid >= syntheticFleetUidBase)
        .sort((left, right) => right.uid - left.uid)[0];

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
      const fallbackFleet = Object.values(np.universe.galaxy.fleets)
        .filter((candidate) => candidate.uid >= syntheticFleetUidBase)
        .sort((left, right) => right.uid - left.uid)[0];
      const fleet = np.universe.selectedFleet ?? fallbackFleet;

      const scanTick = (() => {
        if (!star || !fleet?.path?.length) return null;
        const targetOwner = np.universe.galaxy.players[star.puid];
        if (!targetOwner) return null;

        const scanRange = np.universe.calcScanValue(targetOwner);
        let distance = Math.hypot(
          Number(fleet.x) - star.x,
          Number(fleet.y) - star.y,
        );
        if (distance <= scanRange) return null;

        const next = fleet.path[0];
        distance = Math.hypot(next.x - star.x, next.y - star.y);
        if (distance >= scanRange) return null;

        let stepRadius = np.universe.galaxy.fleet_speed;
        if (fleet.warpSpeed) stepRadius *= 3;

        let dx = Number(fleet.x) - next.x;
        let dy = Number(fleet.y) - next.y;
        const angle = Math.atan(dy / dx);
        let stepx = stepRadius * Math.cos(angle);
        let stepy = stepRadius * Math.sin(angle);
        if (stepx > 0 && dx > 0) stepx *= -1;
        if (stepy > 0 && dy > 0) stepy *= -1;
        if (stepx < 0 && dx < 0) stepx *= -1;
        if (stepy < 0 && dy < 0) stepy *= -1;

        let ticks = 0;
        do {
          const x = ticks * stepx + Number(fleet.x);
          const y = ticks * stepy + Number(fleet.y);
          dx = x - star.x;
          dy = y - star.y;
          distance = Math.hypot(dx, dy);
          ticks += 1;
        } while (distance > scanRange && ticks <= fleet.etaFirst + 1);

        return np.universe.galaxy.tick + ticks - 1;
      })();

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
        scanTick,
        scanLabel: scanTick ? `Scan Tick #${scanTick}` : null,
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
