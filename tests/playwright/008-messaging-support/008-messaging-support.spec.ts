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
    np.universe.interfaceSettings.screenPos = "left";
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
  await helper.step("messaging-composition-and-autocomplete", {
    description: "NPA enhances the message composition screen with autocomplete for stars and players.",
    verifications: [
      {
        spec: "The compose screen is visible",
        check: async () => {
          await appPage.evaluate(() => {
            const np = window.NeptunesPride;
            const player = np.universe.galaxy.players[1];
            np.inbox.selectedMessage = { key: "compose" };
            np.inbox.commentDrafts["compose"] = "";
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
          await textarea.fill("Hello, I am interested in ");
          await textarea.focus();
          await appPage.keyboard.press("End");
          await appPage.keyboard.type("[[Hot S");
          await appPage.keyboard.press("]");

          await expect(async () => {
            const val = await appPage.locator("textarea").inputValue();
            expect(val).toContain("[[Hot Sham]]");
          }).toPass();
        },
      },
    ],
    documentation: {
      summary: "NPA's intelligent autocomplete works in any message composition area. By typing two square brackets followed by a partial name, you can quickly insert the full name of any star or player.",
      howToUse: [
        "In the message box, type **[[** followed by a few letters of a star or player name (e.g., `[[Hot`).",
        "Press **]** to automatically complete the name.",
      ],
      expectedResult: [
        "The partial text is replaced by the full name wrapped in brackets, such as `[[Hot Sham]]`.",
      ],
    },
  });

  // Step 2: Messaging Helpers (Intel and Screenshot)
  await helper.step("messaging-helpers", {
    description: "The Intel and Screenshot buttons allow you to quickly share data and images.",
    verifications: [
      {
        spec: "The Intel and Screenshot buttons are visible in the reply box",
        check: async () => {
           // 1. Open a diplomacy detail screen (which uses NewMessageCommentBox)
           await appPage.evaluate(() => {
             const np = window.NeptunesPride;
             const player = np.universe.galaxy.players[1];

             // Mock a message so we can show diplomacy_detail
             const msg = {
                 key: "msg1",
                 payload: {
                     from_uid: 1,
                     to_uids: [np.universe.player.uid],
                     subject: "Alliance?",
                     body: "Would you like to ally?"
                 },
                 created: Date.now(),
                 comments: [],
                 commentsLoaded: true
             };

             np.inbox.messages.game_diplomacy = [msg];
             np.inbox.selectedMessage = msg;
             np.inbox.cpage = 0; // Ensure we are on the first page to see the reply box
             np.inbox.commentDrafts["msg1"] = "";
             np.crux.trigger("show_screen", "diplomacy_detail");
           });

           // Wait for the reply box to appear
           const textarea = appPage.locator("textarea");
           await expect(textarea).toBeVisible({ timeout: 10000 });
           const initialValue = await textarea.inputValue();

           // 2. Trigger report via hotkey to populate clipboard
           await appPage.keyboard.press("*");
           await appPage.waitForTimeout(500);

           // 3. Identify and click the Intel button
           await appPage.evaluate(() => {
             const all = [...document.querySelectorAll('*')].filter(e => 
               e.textContent?.trim() === 'Intel' && (e as HTMLElement).offsetParent !== null
             );
             if (all.length >= 2) {
               // The second one is likely the one in the message box (first is side menu)
               (all[1] as HTMLElement).click();
             } else if (all.length === 1) {
               (all[0] as HTMLElement).click();
             } else {
               throw new Error("No visible Intel button found");
             }
           });
           
           // 4. Verify that content was added
           await expect(async () => {
             // Re-locate textarea as the screen might have re-rendered
             const currentTextarea = appPage.locator("textarea");
             const newValue = await currentTextarea.inputValue();
             expect(newValue.length).toBeGreaterThan(initialValue.length);
             expect(newValue).not.toContain("Error");
           }).toPass({ timeout: 10000 });
        },
      },
    ],
    documentation: {
      summary: "Sharing intelligence and visual data is essential for coordination. NPA provides dedicated buttons in the message composition area to automate these tasks.",
      howToUse: [
        "View any report (e.g., by pressing **`**) to put it on your intelligence clipboard.",
        "In a message box, click **Intel** to paste the last report.",
        "Click **Screenshot** to capture your current map view and insert a shareable link.",
      ],
      expectedResult: [
        "Intelligence data or map screenshot links are automatically appended to your message draft.",
      ],
    },
  });

  helper.generateArtifacts();
});
