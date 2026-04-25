import { type Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { waitForAgentHooks } from "../helpers";
import { TestStepHelper, waitForAnimations } from "../support/test-step-helper";

const TARGET_STAR_UID = 33;
const TARGET_STAR_NAME = "Hot Sham";
const MAP_SCALE = 600;
const MAP_CENTER_TARGET = { x: 800, y: 600 };

test("documents the time machine and future projections", async ({
  appPage,
}, testInfo) => {
  const helper = new TestStepHelper(appPage, testInfo);

  helper.setMetadata({
    title: "Time Machine Validation",
    validationGoal:
      "Verify that the time machine can project the game state forward into the future and snap back to the present.",
    docsTitle: "Navigating Time with the Time Machine",
    docsSummary:
      "NPA's Time Machine allows you to project the game state forward to see future ship production and fleet arrivals, or look back at historical snapshots to analyze past events.",
    bookSection: "Time machine",
  });

  await waitForAgentHooks(appPage);
  await prepareTimeMachineScenario(appPage);

  // 1. Present View
  await helper.step("present-view", {
    description: "View the current game state at the present tick",
    verifications: [
      {
        spec: "The map is centered on the target star and shows the current tick",
        check: async () => {
          const state = await readTimeMachineState(appPage);
          expect(state.tick).toBe(525);
          expect(state.isFuture).toBe(false);
        },
      },
    ],
    documentation: {
      summary:
        "The Time Machine starts at the 'Present'—the most recent data received from the server. In this baseline view, all ship counts and fleet positions reflect the current state of the galaxy.",
      howToUse: [
        "Open the map to see your current game state.",
        "Notice the absence of any 'Future Time' overlay in the bottom right, indicating you are viewing the present.",
      ],
      expectedResult: [
        "The map displays the current tick (e.g., `Tick #525`).",
        "Fleets and stars show their current ship counts.",
      ],
    },
  });

  // 2. Forward 1 Tick
  await helper.step("future-one-tick", {
    description: "Project the game state forward by one tick",
    verifications: [
      {
        spec: "Pressing ctrl+. advances the time machine to the next tick",
        check: async () => {
          await appPage.evaluate(() => {
            window.Mousetrap.trigger("ctrl+.");
          });
          const state = await readTimeMachineState(appPage);
          expect(state.tick).toBe(526);
          expect(state.isFuture).toBe(true);
        },
      },
    ],
    documentation: {
      summary:
        "You can project the galaxy forward by one tick to see immediate changes. Press **ctrl+.** to advance time. NPA calculates expected ship production and moves fleets along their plotted routes based on their current speed.",
      howToUse: [
        "Press **ctrl+.** to move forward by a single tick.",
      ],
      expectedResult: [
        "A `Future Time @ Tick #NNN` overlay appears in the bottom right of the map.",
        "Ship counts on stars with industry may increase, and fleets in transit will move slightly closer to their destinations.",
      ],
      caveats: [
        "Future projections are estimates based on known data. They cannot account for new orders issued by other players or random events that haven't happened yet.",
      ],
    },
  });

  // 3. Forward 1 Cycle
  await helper.step("future-one-cycle", {
    description: "Project the game state forward by a full production cycle",
    verifications: [
      {
        spec: "Pressing ctrl+/ advances the time machine by one full production cycle (20 ticks in this game)",
        check: async () => {
          await appPage.evaluate(() => {
            window.Mousetrap.trigger("ctrl+/");
          });
          const state = await readTimeMachineState(appPage);
          // 526 + 20 = 546
          expect(state.tick).toBe(546);
          expect(state.isFuture).toBe(true);
        },
      },
    ],
    documentation: {
      summary:
        "To see the impact of the next production jump, press **ctrl+/**. This advances time by one full cycle (20 ticks in this example), allowing you to visualize where fleets will be and how many ships will be produced after the next economic pulse.",
      howToUse: [
        "Press **ctrl+/** to jump forward by one full production cycle.",
      ],
      expectedResult: [
        "The overlay updates to reflect the new future tick.",
        "Significant ship production is visible on industrialized stars.",
        "Fleets advance significantly along their paths, potentially reaching their destinations.",
      ],
    },
  });

  // 4. Snap Back to Present
  await helper.step("back-to-present", {
    description: "Return to the present game state",
    verifications: [
      {
        spec: "Pressing ctrl+, from a future state snaps the time machine back to the present",
        check: async () => {
          await appPage.evaluate(() => {
            window.Mousetrap.trigger("ctrl+,");
          });
          const state = await readTimeMachineState(appPage);
          expect(state.tick).toBe(525);
          expect(state.isFuture).toBe(false);
        },
      },
    ],
    documentation: {
      summary:
        "At any time, you can instantly return to the real-time game state by pressing **ctrl+,**. This clears all future projections and historical views, ensuring you are looking at the most current data available.",
      howToUse: [
        "Press **ctrl+,** to snap back to the present.",
      ],
      expectedResult: [
        "The `Future Time` overlay disappears.",
        "The map returns to showing the current tick and real ship counts.",
      ],
    },
  });

  helper.generateArtifacts();
});

async function prepareTimeMachineScenario(appPage: Page): Promise<void> {
  await appPage.evaluate(
    ({ targetStarUid, mapScale, centerTarget }) => {
      const np = window.NeptunesPride;
      const map = np.npui.map;

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

      const star = np.universe.galaxy.stars[targetStarUid];
      if (star) {
        map.sx = centerTarget.x / map.pixelRatio - star.x * map.scale;
        map.sy = centerTarget.y / map.pixelRatio - star.y * map.scale;
        np.universe.selectedStar = star;
      }

      np.np.trigger("map_rebuild");
      if (typeof map.draw === "function") {
        map.draw();
      }
    },
    {
      targetStarUid: TARGET_STAR_UID,
      mapScale: MAP_SCALE,
      centerTarget: MAP_CENTER_TARGET,
    },
  );

  await waitForAnimations(appPage);
}

async function readTimeMachineState(appPage: Page) {
  return await appPage.evaluate(() => {
    const np = window.NeptunesPride;
    return {
      tick: np.universe.galaxy.tick,
      isFuture: !!np.universe.galaxy.futureTime,
      timeTravelTick: (window as any).timeTravelTick,
    };
  });
}
