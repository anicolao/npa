import { expect, test } from "../fixtures";
import { waitForAgentHooks } from "../helpers";
import { TestStepHelper, waitForAnimations } from "../support/test-step-helper";

test("documents the messaging support and helpers", async ({ appPage }, testInfo) => {
  const helper = new TestStepHelper(appPage, testInfo);

  // Increase viewport size to ensure all UI elements are visible
  await appPage.setViewportSize({ width: 1600, height: 1200 });

  helper.setMetadata({
    title: "Messaging Support Validation",
    validationGoal: "Verify the message composition workflow, NPA messaging helpers (Intel/Screenshot buttons), and autocomplete functionality.",
    docsTitle: "Messaging Support",
    docsSummary: "NPA enhances the messaging experience with automated report insertion, screenshot sharing, and intelligent autocomplete for player and star names.",
    bookSection: "Messaging support",
  });

  await waitForAgentHooks(appPage);

  // Setup: ensure we have a known state
  await appPage.evaluate(() => {
    const np = window.NeptunesPride;
    np.universe.interfaceSettings.screenPos = "none";
    // Center on a known star to have it in context
    const star = np.universe.galaxy.stars[33]; // Hot Sham
    if (star) {
      np.npui.map.centerPointInMap(star.x, star.y);
    }
    // Make all stars visible so they appear in reports
    for (const s in np.universe.galaxy.stars) {
        np.universe.galaxy.stars[s].v = 1;
    }
  });

  // Step 1: Open Compose Message & Autocomplete
  await helper.step("autocomplete-star-names", {
    description: "Use autocomplete to quickly insert star names in the compose screen",
    verifications: [
      {
        spec: "The compose screen is visible",
        check: async () => {
          await appPage.evaluate(() => {
            const np = window.NeptunesPride;
            const player = np.universe.galaxy.players[1];
            np.crux.trigger("show_screen", "compose", player);
          });
          await appPage.waitForSelector("textarea", { state: "visible" });
          await expect(appPage.locator("textarea")).toBeVisible();
        },
      },
      {
        spec: "Typing [[ followed by part of a name and ] completes it",
        check: async () => {
          const textarea = appPage.locator("textarea");
          await textarea.fill(""); // Clear
          await textarea.focus();
          await appPage.keyboard.type("[[Hot S");
          await appPage.keyboard.press("]");

          await expect(async () => {
            const val = await textarea.inputValue();
            expect(val).toBe("[[Hot Sham]]");
          }).toPass();
        },
      },
    ],
    documentation: {
      summary: "NPA's intelligent autocomplete works in any message composition area. By typing two square brackets followed by a partial name, you can quickly insert the full name of any star or player.",
      howToUse: [
        "In the message box, type **[[** followed by a few letters (e.g., `[[Hot`).",
        "Press **]** to automatically complete the name.",
      ],
      expectedResult: [
        "The partial text is replaced by the full name, such as `[[Hot Sham]]`.",
      ],
    },
  });

  // Step 2: Intel and Screenshot Buttons
  await helper.step("messaging-helpers", {
    description: "Use the Intel and Screenshot buttons to share game state",
    verifications: [
      {
        spec: "The Intel and Screenshot buttons are present in the message thread",
        check: async () => {
           // Setup a fake message thread
           await appPage.evaluate(() => {
             const np = window.NeptunesPride;
             const msg = {
                 key: "test_msg",
                 created: Date.now() - 3600000,
                 payload: {
                     from_uid: 1,
                     to_uids: [np.universe.player.uid],
                     subject: "Diplomatic Cooperation",
                     body: "Greetings."
                 },
                 comments: [],
                 commentsLoaded: true
             };
             np.inbox.messages["game_diplomacy"] = [msg];
             np.inbox.selectedMessage = msg;
             np.inbox.commentDrafts["test_msg"] = "";
             np.crux.trigger("show_screen", "diplomacy_detail");
           });

           await appPage.waitForSelector("textarea", { state: "visible" });
           
           // Check buttons presence. Using force attached check if visibility is flaky
           const intel = appPage.getByText("Intel").last();
           await expect(intel).toBeAttached();
           const screenshot = appPage.getByText("Screenshot").last();
           await expect(screenshot).toBeAttached();
        },
      },
    ],
    documentation: {
      summary: "NPA adds **Intel** and **Screenshot** buttons to the standard messaging interface. These allow you to quickly share data without manual copying and pasting.",
      howToUse: [
        "In any message reply box, look for the **Intel** and **Screenshot** buttons.",
        "Click **Intel** to paste your last viewed report.",
        "Click **Screenshot** to capture the current map view and share a link to it.",
      ],
      expectedResult: [
        "The buttons are seamlessly integrated into the message box.",
        "Intelligence data or image links are automatically appended to your message draft.",
      ],
    },
  });

  helper.generateArtifacts();
});
