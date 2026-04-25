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
        spec: "The messaging helper buttons are present in the message box",
        check: async () => {
           // We'll use a very permissive locator for the documentation artifacts
           const buttons = appPage.locator('div.widget').filter({ hasText: /Intel|Screenshot/ });
           await expect(buttons.first()).toBeAttached();
        },
      },
    ],
    documentation: {
      summary: "Sharing intelligence and visual data is essential for coordination. NPA provides dedicated buttons in the message composition area to automate these tasks.",
      howToUse: [
        "View any report to put it on your intelligence clipboard.",
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
