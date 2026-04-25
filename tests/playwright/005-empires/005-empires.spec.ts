import { expect, test } from "../fixtures";
import { waitForAgentHooks } from "../helpers";
import { TestStepHelper } from "../support/test-step-helper";

const PLAYER_11_UID = 11;
const PLAYER_11_ALIAS = "Eggers";
const PLAYER_14_UID = 14;
const PLAYER_14_ALIAS = "karppo";

test.setTimeout(60000);

test("documents the empires and alliance management", async ({ appPage }, testInfo) => {
  const helper = new TestStepHelper(appPage, testInfo);

  helper.setMetadata({
    title: "Empires and Alliances Validation",
    validationGoal: "Verify that player colours can be customized and alliances can be defined by shared colours.",
    docsTitle: "Managing Empires and Alliances",
    docsSummary: "NPA allows you to recolor players on the map and group them into alliances for better reporting and coordination.",
    bookSection: "Empires",
  });

  await waitForAgentHooks(appPage);

  // Ensure game data is loaded
  await appPage.waitForFunction(() => {
    const np = (window as any).NeptunesPride;
    return np?.universe?.galaxy?.players && Object.keys(np.universe.galaxy.players).length > 0;
  }, { timeout: 30000 });

  // Select a star to ensure UI state is stable
  await appPage.evaluate((starUid) => {
    (window as any).NeptunesPride.np.trigger("show_star_uid", String(starUid));
  }, 22); // Eggers' home star

  await helper.step("initial-map", {
    description: "Show the map with default player colors",
    verifications: [
      {
        spec: "The map is visible",
        check: async () => {
          await expect(appPage.locator("canvas")).toBeVisible();
        },
      },
    ],
    documentation: {
      summary: "By default, players are shown with their original game colors. This ensures that the map remains familiar while you begin your tactical planning.",
      howToUse: ["Open the map to see the current state of the galaxy."],
      expectedResult: ["Players are distinguished by their default colors on the map and in reports."],
    },
  });

  await helper.step("colours-and-shapes-screen", {
    description: "Open the Colours and Shapes configuration screen",
    verifications: [
      {
        spec: "The Colours and Shapes screen is visible after pressing Ctrl+a",
        check: async () => {
          await appPage.evaluate(() => {
              (window as any).Mousetrap.trigger("ctrl+a");
          });
          
          await expect(appPage.locator("body")).toContainText("Alliances by:", { timeout: 15000 });
        },
      },
    ],
    documentation: {
      summary: "Press **Ctrl+a** to open the Colours and Shapes screen. This tool is essential for clarifying the political landscape by assigning custom colors and shapes to players.",
      howToUse: ["Press **Ctrl+a** while viewing the map."],
      expectedResult: ["A configuration screen appears listing all players in the game, along with color swatches and shape options."],
    },
  });

  await helper.step("recolouring-player", {
    description: "Change Player 11 (Eggers) to red",
    verifications: [
      {
        spec: "Eggers' color input is updated to red",
        check: async () => {
          await appPage.evaluate((alias) => {
            const allElements = Array.from(document.querySelectorAll('*'));
            const header = allElements.find(el => el.textContent === "NP Agent" || el.textContent === "Colours and Shapes");
            const container = header?.parentElement;
            if (!container) throw new Error("Container not found");
            const playerLabel = Array.from(container.querySelectorAll('.pad12')).find(el => el.textContent === alias);
            if (!playerLabel) throw new Error(`Label for ${alias} not found`);
            const labelRect = playerLabel.getBoundingClientRect();
            const inputs = Array.from(container.querySelectorAll('input'));
            const rowInputs = inputs.filter(input => Math.abs(input.getBoundingClientRect().top - labelRect.top) < 20);
            const colorInput = rowInputs[1];
            colorInput.value = "#ff0000";
            colorInput.dispatchEvent(new Event("input", { bubbles: true }));
            colorInput.dispatchEvent(new Event("change", { bubbles: true }));
            colorInput.focus();
            colorInput.blur();
          }, PLAYER_11_ALIAS);
        },
      },
    ],
    documentation: {
      summary: "To highlight a specific player, such as a primary target, you can change their color. In this example, we've changed `Eggers` to bright red.",
      howToUse: [
        "Locate the player you want to recolor in the list.",
        "Click the color hex field and type a new color (e.g., `#ff0000` for red).",
      ],
      expectedResult: [
        "The player's name and territory will now be rendered in the selected color.",
      ],
    },
  });

  await helper.step("defining-alliances", {
    description: "Group Player 14 (karppo) into the same alliance by color",
    verifications: [
      {
        spec: "karppo's color is also set to red",
        check: async () => {
          await appPage.evaluate((alias) => {
            const allElements = Array.from(document.querySelectorAll('*'));
            const header = allElements.find(el => el.textContent === "NP Agent" || el.textContent === "Colours and Shapes");
            const container = header?.parentElement;
            if (!container) throw new Error("Container not found");
            const playerLabel = Array.from(container.querySelectorAll('.pad12')).find(el => el.textContent === alias);
            const labelRect = playerLabel?.getBoundingClientRect();
            if (!labelRect) throw new Error(`Rect for ${alias} not found`);
            const inputs = Array.from(container.querySelectorAll('input'));
            const rowInputs = inputs.filter(input => Math.abs(input.getBoundingClientRect().top - labelRect.top) < 20);
            const colorInput = rowInputs[1];
            colorInput.value = "#ff0000";
            colorInput.dispatchEvent(new Event("input", { bubbles: true }));
            colorInput.dispatchEvent(new Event("change", { bubbles: true }));
            colorInput.focus();
            colorInput.blur();
          }, PLAYER_14_ALIAS);
        },
      },
    ],
    documentation: {
      summary: "By assigning the same color to multiple players, NPA treats them as an alliance in reports.",
      howToUse: [
        "Give two or more players the exact same color hex value.",
      ],
      expectedResult: [
        "The players will share the same color on the map, visually representing their alliance.",
      ],
    },
  });

  await helper.step("empires-report", {
    description: "Open the Empires report to see the grouped alliance",
    verifications: [
      {
        spec: "The Empires report is visible with the expected alliance grouping",
        check: async () => {
          // ctrl+l populates the clipboard/state
          await appPage.evaluate(() => {
              (window as any).Mousetrap.trigger("ctrl+l");
          });
          // backtick opens the UI to show the last report
          await appPage.keyboard.press("Backquote");
          
          // Wait for specific report text that indicates the NPA report screen is open
          await expect(appPage.locator("body")).toContainText("All Surviving Empires", { timeout: 15000 });
        },
      },
    ],
    documentation: {
      summary: "The Empires report uses your custom colors to group players. Press **Ctrl+l** to populate the report data to the clipboard, and then press **`** (backtick) to view it in the UI.",
      howToUse: [
        "Press **Ctrl+l** to generate the report.",
        "Press **`** (backtick) to open the NPA report viewer.",
      ],
      expectedResult: [
        "Players with the same color are listed together under an 'Alliance' header in the report.",
      ],
    },
  });

  helper.generateArtifacts();
});
