import { expect, test } from "../fixtures";
import { waitForAgentHooks } from "../helpers";
import { TestStepHelper } from "../support/test-step-helper";

test("documents the autocomplete behavior", async ({ appPage }, testInfo) => {
  const helper = new TestStepHelper(appPage, testInfo);

  helper.setMetadata({
    title: "Autocomplete Validation",
    validationGoal: "Verify that autocomplete correctly identifies player IDs, player names, star names, and API keys.",
    docsTitle: "How to use Autocomplete",
    docsSummary: "Autocomplete helps you quickly insert player names, star names, and your API key into messages or reports by using simple triggers.",
    bookSection: "Autocomplete",
  });

  await waitForAgentHooks(appPage);

  // Inject a textarea for testing
  await appPage.evaluate(() => {
    const area = document.createElement("textarea");
    area.id = "test-autocomplete";
    area.style.position = "fixed";
    area.style.top = "100px";
    area.style.left = "100px";
    area.style.width = "400px";
    area.style.height = "200px";
    area.style.zIndex = "10000";
    area.style.backgroundColor = "#1a1d44";
    area.style.color = "white";
    area.style.border = "2px solid #2c3273";
    area.style.padding = "10px";
    area.style.fontFamily = "monospace";
    document.body.appendChild(area);
    area.focus();
  });

  const textarea = appPage.locator("#test-autocomplete");

  await helper.step("player-id-autocomplete", {
    description: "Autocomplete a player name using their ID",
    verifications: [
      {
        spec: "Typing [[1:] results in the player name 'Gorn'",
        check: async () => {
          await textarea.fill("[[1");
          await textarea.press(":");
          await expect(textarea).toHaveValue("[[Gorn]]");
        },
      },
    ],
    documentation: {
      summary: "You can quickly insert a player's name by typing their ID between double brackets followed by a colon or a closing bracket.",
      howToUse: [
        "Type `[[` followed by the player's ID (e.g., `1`).",
        "Type `:` or `]` to complete the name.",
      ],
      expectedResult: [
        "The ID is replaced by the player's full alias, wrapped in brackets.",
      ],
    },
  });

  await helper.step("player-name-cycling", {
    description: "Cycle through matching player names",
    verifications: [
      {
        spec: "Typing [[G] and pressing ] cycles through players starting with G",
        check: async () => {
          await textarea.fill("Hello [[G");
          await textarea.press("]");
          // Gorn is player 1, GrugGarKon is player 4.
          // The code sorts by matchPriority (0 for players) then matchText.
          // Gorn comes before GrugGarKon.
          await expect(textarea).toHaveValue("Hello [[Gorn]]");
          await textarea.press("]");
          await expect(textarea).toHaveValue("Hello [[GrugGarKon]]");
        },
      },
    ],
    documentation: {
      summary: "If you don't know the ID, you can type the start of a name and cycle through matches.",
      howToUse: [
        "Type `[[` followed by the first few letters of a player's name.",
        "Press `]` to see the first match.",
        "Press `]` again to cycle to the next match if there are multiple players with similar names.",
      ],
      expectedResult: [
        "NPA replaces your search string with the full name of the matching player.",
      ],
    },
  });

  await helper.step("star-name-cycling", {
    description: "Cycle through matching star names",
    verifications: [
      {
        spec: "Typing [[Upsilon] and pressing ] completions to 'Upsilon Minkar'",
        check: async () => {
          await textarea.fill("Meet at [[Upsilon");
          await textarea.press("]");
          await expect(textarea).toHaveValue("Meet at [[Upsilon Minkar]]");
        },
      },
    ],
    documentation: {
      summary: "Autocomplete also works for star names, making it easy to coordinate coordinates with allies.",
      howToUse: [
        "Type `[[` followed by the start of a star name.",
        "Press `]` to complete or cycle through matching stars.",
      ],
      expectedResult: [
        "The star name is completed and wrapped in double brackets.",
      ],
    },
  });

  await helper.step("api-key-completion", {
    description: "Insert your API key for coordination",
    verifications: [
      {
        spec: "Typing [[api:] inserts the player's API key",
        check: async () => {
          await textarea.fill("My key is [[api");
          await textarea.press(":");
          // The mock API key in the fixture might be empty or a specific value.
          // Based on src/intel.ts, it calls getApiKey() which for the test environment
          // might return a dummy value if we set it up.
          await expect(textarea).toHaveValue(/My key is \[\[api:[a-zA-Z0-9]+\]\]/);
        },
      },
    ],
    documentation: {
      summary: "When coordinating with tools or allies who need your map data, you can quickly insert your API key.",
      howToUse: [
        "Type `[[api:` or `[[api]`.",
      ],
      expectedResult: [
        "NPA inserts your current game's API key into the text.",
      ],
      caveats: [
        "Only share your API key with trusted allies or verified external tools.",
      ],
    },
  });

  helper.generateArtifacts();
});
