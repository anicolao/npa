import { expect, test } from "../fixtures";
import { waitForAgentHooks } from "../helpers";
import { TestStepHelper, waitForAnimations } from "../support/test-step-helper";

test("documents API key embedding and reports", async ({
  appPage,
}, testInfo) => {
  const helper = new TestStepHelper(appPage, testInfo);

  helper.setMetadata({
    title: "Embedding API Keys",
    validationGoal:
      "Verify that API keys can be autocompleted in text inputs, detected in messages, and viewed in the API Keys report.",
    docsTitle: "How to Embed and Manage API Keys",
    docsSummary:
      "NPA allows you to share your API key with allies by embedding it in messages. It also automatically detects keys shared by others and provides a report to manage them.",
    bookSection: "API Keys",
  });

  await waitForAgentHooks(appPage);

  const MY_API_KEY = "ABCDEF123456";
  const OTHER_API_KEY = "XYZ789654321";

  // Mock API response for getUserScanData
  await appPage.route("**/api**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        scanning_data: {
          playerUid: 5,
          players: {
             "5": { alias: "Test Player", uid: 5, tech: [] }
          },
          stars: {},
          fleets: {},
          tick: 525,
          now: Date.now()
        }
      }),
    });
  });

  // Step 1: Autocomplete
  await helper.step("autocomplete-api-key", {
    description: "Autocomplete your own API key in a text input",
    verifications: [
      {
        spec: "The API key is set in the agent's memory",
        check: async () => {
          await appPage.evaluate((code) => {
            (window as any).NeptunesPride.crux.ui.trigger("order:api_code", code);
          }, MY_API_KEY);
          
          await appPage.waitForTimeout(1000); 
        },
      },
      {
        spec: "Typing [[api: in a textarea autocompletes the key",
        check: async () => {
          // Open Compose screen directly
          await appPage.evaluate(() => {
            (window as any).NeptunesPride.crux.trigger("show_screen", "compose");
          });
          await waitForAnimations(appPage);

          const textarea = appPage.locator("textarea");
          await expect(textarea).toBeVisible();
          
          await textarea.focus();
          // Type '[[api' then ':' to trigger autocomplete
          await textarea.fill("[[api");
          await appPage.keyboard.press(":");

          // Wait for the autocomplete to apply
          await expect(textarea).toHaveValue(`[[api:${MY_API_KEY}]]`, { timeout: 10000 });
        },
      },
    ],
    documentation: {
      summary:
        "When writing a message, you can easily share your own API key with an ally. NPA provides an autocomplete shortcut to avoid manual copy-pasting.",
      howToUse: [
        "Open a message composition window.",
        "Type `[[api:` (double left bracket followed by 'api' and a colon).",
        "NPA will automatically fill in your current API key and close the brackets.",
      ],
      expectedResult: [
        "The text `[[api:` is replaced with `[[api:YOUR_KEY_HERE]]`.",
      ],
    },
  });

  // Step 2: Detection
  await helper.step("detect-api-key", {
    description: "Detect an API key in a message",
    verifications: [
      {
        spec: "A message containing an API key tag is detected by NPA",
        check: async () => {
          // Close the compose window first
          await appPage.keyboard.press("Escape");
          await waitForAnimations(appPage);

          // Inject into IndexedDB directly
          await appPage.evaluate(async (otherKey) => {
             const gameId = (window as any).game || "4982";
             const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const req = indexedDB.open(gameId, 1);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
             });
             const tx = db.transaction(gameId, "readwrite");
             const store = tx.objectStore(gameId);
             store.put(otherKey, "API:1"); // Player 1
             await new Promise((resolve) => tx.oncomplete = resolve);
             
             // Trigger report directly to show it for the screenshot
             (window as any).NeptunesPride.npui.trigger("show_report", "api");
          }, OTHER_API_KEY);
          
          await waitForAnimations(appPage);

          // Check if the report is showing
          await expect(appPage.getByText(OTHER_API_KEY).first()).toBeVisible({ timeout: 10000 });
        },
      },
    ],
    documentation: {
      summary:
        "NPA scans your incoming messages for `[[api:CODE]]` tags. Any keys found are automatically added to the agent's 'Seen Keys' list, allowing you to easily view data from your allies.",
      howToUse: [
        "Ask an ally to send you their API key using the `[[api:CODE]]` format.",
        "Once the message is received, NPA will detect it automatically.",
      ],
      expectedResult: [
        "The detected key appears in the API Keys report.",
      ],
    },
  });

  // Step 3: API Keys Report
  await helper.step("api-keys-report", {
    description: "Show the API Keys report",
    verifications: [
      {
        spec: "The hotkey 'k' opens the API Keys report",
        check: async () => {
          // Close previous report
          await appPage.keyboard.press("Escape");
          await waitForAnimations(appPage);
          
          // Open the UI first!
          await appPage.keyboard.press("Backquote");
          await waitForAnimations(appPage);
          
          // Press k to open the report
          await appPage.keyboard.press("k");
          await waitForAnimations(appPage);
          
          // Verify it's visible
          await expect(appPage.getByText(OTHER_API_KEY).first()).toBeVisible({ timeout: 10000 });
        },
      },
      {
        spec: "The report lists all seen keys with options to View or Merge",
        check: async () => {
          await expect(appPage.getByText(MY_API_KEY).first()).toBeVisible();
          await expect(appPage.getByText(OTHER_API_KEY).first()).toBeVisible();
          // Also check for some report-specific text
          await expect(appPage.getByText("All Seen Keys")).toBeVisible();
        },
      },
    ],
    documentation: {
      summary:
        "The API Keys report (hotkey **k**) provides a central location to manage all API keys you have encountered in the current game.",
      howToUse: [
        "Press **k** at any time to open the API Keys report.",
        "View the list of keys, their associated players, and the time range of data available.",
        "Use 'View' to switch your game view to that key's perspective.",
        "Use 'Merge' to combine data from multiple keys into your current view.",
      ],
      expectedResult: [
        "A table showing all known keys and their status.",
      ],
    },
  });

  helper.generateArtifacts();
});
