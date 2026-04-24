import { expect, test } from "../fixtures";
import { waitForAgentHooks } from "../helpers";
import { TestStepHelper } from "../support/test-step-helper";

test("documents accounting and trading reports", async ({ appPage }, testInfo) => {
  const helper = new TestStepHelper(appPage, testInfo);

  helper.setMetadata({
    title: "Accounting and Trading Validation",
    validationGoal:
      "Verify that the trading, accounting, and trade activity reports display correct information and can be accessed via menu items.",
    docsTitle: "Accounting and Trading",
    docsSummary:
      "NPA provides specialized reports to help you manage your economy, coordinate technology trades with allies, and track the flow of credits and tech across the galaxy.",
    bookSection: "Accounting and Trading",
  });

  await waitForAgentHooks(appPage);

  // Mock the message fetch request
  await appPage.route(/fetch_game_messages/, async (route) => {
    const postData = route.request().postData() || "";
    if (postData.includes("group=game_event")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          report: [
            {
              key: "msg1",
              date: -500,
              payload: {
                template: "money_sent",
                tick: 500,
                from_puid: 1, // Gorn
                to_puid: 5,   // Me
                amount: 500
              }
            },
            {
              key: "msg2",
              date: -510,
              payload: {
                template: "shared_technology",
                tick: 510,
                from_puid: 5, // Me
                to_puid: 1,   // Gorn
                tech: "weapons",
                level: 5,
                price: 0
              }
            }
          ]
        })
      });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ report: [] }) });
    }
  });

  // Mock API keys in indexedDB for trading report
  const gameId = await appPage.evaluate(() => (window as any).NeptunesPride.gameNumber || (window as any).NeptunesPride.gameId);
  await appPage.evaluate(async (gid) => {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(gid.toString(), 1);
      request.onupgradeneeded = (event) => {
        const db = (event.target as any).result;
        if (!db.objectStoreNames.contains(gid.toString())) {
          db.createObjectStore(gid.toString());
        }
      };
      request.onsuccess = (event) => {
        const db = (event.target as any).result;
        const transaction = db.transaction([gid.toString()], "readwrite");
        const store = transaction.objectStore(gid.toString());
        store.put("dummy", "API:1");
        store.put("dummy", "API:13");
        store.put("dummy", "API:21");
        transaction.oncomplete = () => {
          resolve();
        };
        transaction.onerror = () => reject(new Error("Transaction failed"));
      };
      request.onerror = () => reject(new Error("Failed to open DB"));
    });
  }, gameId);

  // 1. Trading Report
  await helper.step("trading-report", {
    description: "Open the trading report to see technology levels across the alliance",
    verifications: [
      {
        spec: "The trading report can be opened from the menu",
        check: async () => {
          await appPage.evaluate(() => {
            (window as any).NeptunesPride.npui.npaMenu.onPopUp();
          });
          await expect(appPage.getByText("Trading", { exact: true }).first()).toBeVisible();
          await appPage.getByText("Trading", { exact: true }).first().click({ force: true });
          await expect(appPage.locator("body")).toContainText("Allied Technology", { timeout: 10000 });
        },
      },
      {
        spec: "The trading report shows technology levels",
        check: async () => {
          await expect(appPage.locator("body")).toContainText("Banking", { timeout: 5000 });
          await expect(appPage.locator("body")).toContainText("Weapons");
          await expect(appPage.locator("body")).toContainText("Technology");
        },
      },
    ],
    documentation: {
      summary:
        "The Trading Report gives you a bird's-eye view of technology levels across the galaxy. Press **e** to open it. It specifically highlights where you stand relative to your allies and identifying potential trading partners who can help fill your technology gaps.",
      howToUse: [
        "Press **e** to open the Trading Report.",
        "Use the table to compare technology levels (Weapons, Banking, etc.) between yourself and other players.",
        "Look for the shortcut links to quickly initiate trades or send technology.",
      ],
      expectedResult: [
        "A table appears showing players and their current technology levels.",
        "The report is automatically copied to your clipboard for easy sharing in alliance messages.",
      ],
    },
  });

  // 2. Accounting Report (Ledger)
  await helper.step("accounting-report", {
    description: "Open the accounting report to see cash and tech transaction history",
    verifications: [
      {
        spec: "The accounting report can be opened from the menu and shows headers",
        check: async () => {
          await appPage.evaluate(() => {
            const np = (window as any).NeptunesPride;
            if (np.messageCacheLastUpdate) {
              np.messageCacheLastUpdate.game_event = 0;
            }
          });

          await appPage.evaluate(() => {
            (window as any).NeptunesPride.npui.npaMenu.onPopUp();
          });
          await appPage.getByText("Accounting", { exact: true }).first().click({ force: true });
          await expect(appPage.locator("body")).toContainText("Ledger", { timeout: 10000 });
          await expect(appPage.locator("body")).toContainText("Cash transaction history");
          await expect(appPage.locator("body")).toContainText("Tech transaction history");
        },
      },
    ],
    documentation: {
      summary:
        "The Accounting Report (or Ledger) tracks the flow of credits and technology. Press **a** to view your transaction history. This is essential for verifying that allies have paid for technology or for balancing the books in a complex alliance economy.",
      howToUse: [
        "Press **a** to open the Ledger.",
        "Review the 'Cash transaction history' to see who sent you credits and when.",
        "Review the 'Tech transaction history' to track technology transfers.",
        "Check the 'Ledger' summary at the top for an aggregate balance of tech levels and credits exchanged with each ally.",
      ],
      expectedResult: [
        "A detailed history of all cash and tech transactions is displayed.",
        "The summary section shows net balances, helping you identify who owes technology or credits.",
      ],
    },
  });

  // 3. Trade Activity Report
  await helper.step("trade-activity-report", {
    description: "Open the trade activity report to see definite trades between other empires",
    verifications: [
      {
        spec: "The trade activity report can be opened from the menu",
        check: async () => {
          await appPage.evaluate(() => {
            (window as any).NeptunesPride.npui.npaMenu.onPopUp();
          });
          await appPage.getByText("Trade Activity", { exact: true }).first().click({ force: true });
          await expect(appPage.locator("body")).toContainText("Trading Activity:", { timeout: 10000 });
        },
      },
    ],
    documentation: {
      summary:
        "The Trade Activity Report uses scanning data to identify technology trades happening between other players, even those outside your alliance. Press **Ctrl+;** to generate it. This intelligence can help you identify secret pacts or emerging power blocks in the galaxy.",
      howToUse: [
        "Press **Ctrl+;** to generate the Trading Activity report.",
        "Read the list of detected trades to see which empires are cooperating.",
      ],
      expectedResult: [
        "A report listing detected technology transfers between players is displayed.",
      ],
      caveats: [
        "This report relies on changes in technology levels detected through scanning. It may not capture all trades if scanning coverage is incomplete.",
      ],
    },
  });

  helper.generateArtifacts();
});
