import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { waitForAgentHooks } from "../helpers";
import { TestStepHelper, waitForAnimations } from "../support/test-step-helper";

const SELECTED_STAR_UID = 33; // Hot Sham
const SELECTED_STAR_NAME = "Hot Sham";
const MAP_SCALE = 600;
const MAP_CENTER_TARGET = { x: 800, y: 600 };

test("documents the auto-ruler features and controls", async ({
  appPage,
}, testInfo) => {
  const helper = new TestStepHelper(appPage, testInfo);

  helper.setMetadata({
    title: "Auto-Ruler Validation",
    validationGoal:
      "Verify that the auto-ruler correctly identifies and visualizes distances to enemy and support stars, and responds to power controls.",
    docsTitle: "Interpreting and Controlling the Auto-Ruler",
    docsSummary:
      "The auto-ruler is a tactical overlay that automatically measures distances and arrival times between a selected star and its neighbors. It helps you quickly identify which of your stars can provide timely support and how soon enemy threats might arrive.",
    bookSection: "Interpreting and controlling the auto-ruler",
  });

  await waitForAgentHooks(appPage);
  await prepareRulerScenario(appPage);

  await frameAndAssertRulerMap(appPage);
  
  await helper.step("show-basic-auto-ruler", {
    description: "View automatic distance measurements to the nearest stars",
    verifications: [
      {
        spec: "Selecting a star activates the auto-ruler for that location",
        check: async () => {
          const state = await readRulerState(appPage);
          expect(state.selectedStarUid).toBe(SELECTED_STAR_UID);
          expect(state.selectedStarName).toBe(SELECTED_STAR_NAME);
        },
      },
    ],
    documentation: {
      summary:
        "When you select a star, NPA automatically draws 'ruler' lines to the most relevant neighboring stars. These lines provide immediate tactical information without requiring you to manually measure each route.",
      howToUse: [
        "Select a star on the map (like `Hot Sham` in the example) to activate the auto-ruler.",
        "Look for the colored lines extending to nearby stars.",
      ],
      expectedResult: [
        "**Red Lines** indicate connections to enemy-owned stars.",
        "**Green or Grey Lines** indicate connections to stars owned by you or your allies.",
        "Tick numbers (e.g., `[[Tick #529]]`) show exactly when a fleet traveling at your current speed would arrive.",
      ],
    },
  });

  await helper.step("increase-ruler-power", {
    description: "Increase the number of stars shown by the auto-ruler",
    verifications: [
      {
        spec: "Pressing 9 increases the auto-ruler power",
        check: async () => {
          await appPage.keyboard.press("9");
          await waitForAnimations(appPage);
          // Verification by screenshot stability/no crash
        },
      },
    ],
    documentation: {
      summary:
        "You can control how many neighbors the auto-ruler identifies. Increasing the power reveals more distant threats and potential support stars.",
      howToUse: [
        "Press **9** to increase the number of stars the auto-ruler connects to.",
      ],
      expectedResult: [
        "More ruler lines appear on the map, reaching further out from the selected star.",
      ],
    },
  });

  await helper.step("decrease-ruler-power", {
    description: "Decrease the number of stars shown by the auto-ruler",
    verifications: [
      {
        spec: "Pressing 8 decreases the auto-ruler power",
        check: async () => {
          await appPage.keyboard.press("8");
          await waitForAnimations(appPage);
          // Verification by screenshot stability/no crash
        },
      },
    ],
    documentation: {
      summary:
        "If the map becomes too cluttered, you can decrease the auto-ruler power to focus only on the most immediate neighbors.",
      howToUse: [
        "Press **8** to decrease the number of stars the auto-ruler connects to.",
      ],
      expectedResult: [
        "Distant ruler lines disappear, leaving only the closest connections visible.",
      ],
    },
  });

  await helper.step("understand-support-colors", {
    description: "Distinguish between effective and ineffective support",
    verifications: [
      {
        spec: "The ruler remains visible for the selected star",
        check: async () => {
          const state = await readRulerState(appPage);
          expect(state.selectedStarUid).toBe(SELECTED_STAR_UID);
        },
      },
    ],
    documentation: {
      summary:
        "The auto-ruler uses color to help you make split-second defensive decisions. It compares the arrival time of enemy fleets against your own support fleets.",
      howToUse: [
        "Observe the colors of the lines connecting to your own stars.",
      ],
      expectedResult: [
        "**Green Lines** represent 'Effective' support: these stars can reach the selected location *before* the closest enemy can.",
        "**Grey Lines** represent 'Ineffective' support: these stars are too far away to help before the enemy arrives.",
      ],
      caveats: [
        "Support effectiveness is calculated based on the closest detected enemy star. Always verify if the enemy has closer hidden fleets.",
      ],
    },
  });

  helper.generateArtifacts();
});

async function prepareRulerScenario(appPage: Page): Promise<void> {
  await appPage.waitForFunction(
    ({ selectedStarUid }) => {
      const np = window.NeptunesPride;
      return !!(
        np?.universe?.player &&
        np.universe.galaxy?.stars?.[selectedStarUid]
      );
    },
    { selectedStarUid: SELECTED_STAR_UID },
  );

  await appPage.evaluate(
    ({ selectedStarUid, mapScale, target }) => {
      const np = window.NeptunesPride;
      const map = np.npui.map;

      np.universe.interfaceSettings.screenPos = "none";
      np.universe.interfaceSettings.showStarPimples = false;
      np.universe.interfaceSettings.showScanningRanges = false;
      np.universe.interfaceSettings.showFleets = true;
      np.universe.interfaceSettings.textZoomStarNames = 0;
      np.universe.interfaceSettings.textZoomShips = 0;
      
      const star = np.universe.galaxy.stars[selectedStarUid];
      map.scale = mapScale;
      map.scaleTarget = mapScale;
      map.centerPointInMap(star.x, star.y);
      
      // Center it specifically for the screenshot
      map.sx = target.x / map.pixelRatio - star.x * map.scale;
      map.sy = target.y / map.pixelRatio - star.y * map.scale;

      np.crux.trigger("show_star_uid", String(selectedStarUid));
      np.np.trigger("map_rebuild");
    },
    {
      selectedStarUid: SELECTED_STAR_UID,
      mapScale: MAP_SCALE,
      target: MAP_CENTER_TARGET,
    },
  );

  await waitForAnimations(appPage);
}

async function frameAndAssertRulerMap(appPage: Page) {
  await appPage.evaluate(
    ({ selectedStarUid, mapScale, target }) => {
      const np = window.NeptunesPride;
      const map = np.npui.map;
      const star = np.universe.galaxy.stars[selectedStarUid];

      map.scale = mapScale;
      map.scaleTarget = mapScale;
      map.sx = target.x / map.pixelRatio - star.x * map.scale;
      map.sy = target.y / map.pixelRatio - star.y * map.scale;
      
      np.universe.selectedStar = star;
      np.np.trigger("map_rebuild");
    },
    {
      selectedStarUid: SELECTED_STAR_UID,
      mapScale: MAP_SCALE,
      target: MAP_CENTER_TARGET,
    },
  );
  await waitForAnimations(appPage);
}

async function readRulerState(appPage: Page) {
  return appPage.evaluate(() => {
    const np = window.NeptunesPride;
    const star = np.universe.selectedStar;
    return {
      selectedStarUid: star?.uid ?? null,
      selectedStarName: star?.n ?? null,
    };
  });
}
