import { expect, test } from "../fixtures";
import { waitForAgentHooks } from "../helpers";
import { TestStepHelper } from "../support/test-step-helper";

test("documents the autocomplete behavior", async ({ appPage }, testInfo) => {
  const helper = new TestStepHelper(appPage, testInfo);

  helper.setMetadata({
    title: "Autocomplete Scenarios",
    validationGoal: "Verify and document NPA's autocomplete triggers and cycling behavior in the game's messaging UI.",
    docsTitle: "Autocomplete",
    docsSummary: "Autocomplete is a powerful feature when composing messages to other players. NPA provides several triggers to help you quickly insert player names and star names into text fields.",
    bookSection: "012-autocomplete",
  });

  await helper.step("player-id-autocomplete", {
    description: "Autocompleting a player name by their ID",
    verifications: [
      {
        spec: "Typing `[[1` and pressing `]` inserts the name of the player with ID 1.",
        check: async () => {
          await waitForAgentHooks(appPage);
          
          // Open the game's "Compose" screen
          await appPage.evaluate(() => (window as any).NeptunesPride.crux.trigger("show_screen", "compose"));
          
          const textarea = appPage.locator('textarea');
          await expect(textarea).toBeVisible();
          await textarea.focus();

          await textarea.pressSequentially("Hello [[1");
          
          // Pressing ] should autocomplete player 1
          await textarea.press("]");
          
          // In our test data, player 1 is Gorn (who is AFK)
          await expect(textarea).toHaveValue(/Hello \[\[Gorn.*\]\]/);
        }
      }
    ],
    documentation: {
      summary: "You can quickly insert a player's name by their numeric ID when writing messages.",
      howToUse: [
        "Open the **Compose** message screen.",
        "Type `[[` followed by the player's ID number.",
        "Press **]** to complete the name."
      ],
      expectedResult: [
        "The `[[ID]]` sequence is replaced by the player's full alias enclosed in double brackets."
      ]
    }
  });

  await helper.step("player-name-cycling", {
    description: "Cycling through multiple players matching a prefix",
    verifications: [
      {
        spec: "Repeatedly pressing `]` cycles through all matching player names.",
        check: async () => {
          const textarea = appPage.locator('textarea');
          // Clear and reset state
          await textarea.fill("");
          await textarea.click(); // ensure focus and state reset
          
          await textarea.pressSequentially("Hello [[G");
          
          // Pressing ] should cycle through players starting with G
          // Order: Gameling, Gorn (AFK), GrapeMaster, GrugGarKon, godchat
          await textarea.press("]");
          await expect(textarea).toHaveValue(/Hello \[\[Gameling.*\]\]/);
          
          await textarea.press("]");
          await expect(textarea).toHaveValue(/Hello \[\[Gorn.*\]\]/);
          
          await textarea.press("]");
          await expect(textarea).toHaveValue(/Hello \[\[GrapeMaster.*\]\]/);

          await textarea.press("]");
          await expect(textarea).toHaveValue(/Hello \[\[GrugGarKon.*\]\]/);

          await textarea.press("]");
          await expect(textarea).toHaveValue(/Hello \[\[godchat.*\]\]/);
        }
      }
    ],
    documentation: {
      summary: "When multiple players match your search, you can cycle through them using the completion key.",
      howToUse: [
        "Type `[[` followed by the start of a player's name.",
        "Press **]** repeatedly to cycle through all matching players."
      ],
      expectedResult: [
        "NPA cycles through all players whose names contain the text you typed."
      ]
    }
  });

  await helper.step("star-name-cycling", {
    description: "Autocompleting star names",
    verifications: [
      {
        spec: "Star names are also included in the autocomplete suggestions.",
        check: async () => {
          const textarea = appPage.locator('textarea');
          // Clear and reset state
          await textarea.fill("");
          await textarea.click();

          await textarea.pressSequentially("Meet me at [[Ald");
          
          // Should match Aldebaran (it comes before Alderamin)
          await textarea.press("]");
          await expect(textarea).toHaveValue("Meet me at [[Aldebaran]]");
        }
      }
    ],
    documentation: {
      summary: "Star names can also be autocompleted, making it easy to coordinate with allies.",
      howToUse: [
        "Type `[[` followed by part of a star's name.",
        "Press **]** to complete the name."
      ],
      expectedResult: [
        "The star name is inserted, correctly formatted for game links."
      ]
    }
  });

  helper.generateArtifacts();
});
