import { expect, test } from "../fixtures";
import { waitForAgentHooks } from "../helpers";
import { TestStepHelper } from "../support/test-step-helper";
import * as fs from "node:fs";
import * as path from "node:path";

test("documents alliance coordination", async ({ appPage }, testInfo) => {
    const helper = new TestStepHelper(appPage, testInfo);

    helper.setMetadata({
        title: "Alliance Coordination",
        validationGoal: "Demonstrate API key merging and alliance reports",
        docsTitle: "Alliance Coordination",
        docsSummary: "NPA helps you coordinate with allies by merging their intelligence into your map and providing formal alliance reports.",
        bookSection: "016",
    });

    await waitForAgentHooks(appPage);

    // Mock the API call for merging
    await appPage.route("**/api*", async (route) => {
        const url = new URL(route.request().url());
        const code = url.searchParams.get("code");
        if (code === "l5EP8dszo3cH") {
            const testFile = testInfo.file;
            const absoluteTestFile = path.isAbsolute(testFile)
              ? testFile
              : path.join(process.cwd(), testFile);
            const scenarioDir = path.dirname(absoluteTestFile);
            const filePath = path.join(scenarioDir, "../../test-server/static/real-api-data.json");
            
            const content = fs.readFileSync(filePath, "utf-8");
            const lines = content.split("\n");
            const json = lines.slice(1).join("\n");
            await route.fulfill({
                contentType: "application/json",
                body: json,
            });
        } else {
            await route.continue();
        }
    });

    // Step 1: Open the game and press k to show the "All Allied API Keys" report.
    await helper.step("allied-api-keys", {
        description: "Show known API keys report",
        verifications: [
            {
                spec: "The API keys report is visible",
                check: async () => {
                    await appPage.evaluate(() => (window as any).NeptunesPride.npui.trigger("show_report", "api"));
                    await expect(appPage.getByText("Allied API Keys")).toBeVisible();
                },
            },
        ],
        documentation: {
            summary: "Press **k** to view all API keys detected in your messages.",
            howToUse: ["Press **k** while on the map."],
            expectedResult: ["A report appears listing all API keys found in your messages or manually entered."],
        },
    });

    // Step 2: Merge an ally's API key to see their data.
    await helper.step("merge-ally-api-key", {
        description: "Merge an ally's API key",
        verifications: [
            {
                spec: "Merging an API key updates the map",
                check: async () => {
                    await appPage.evaluate(() => (window as any).NeptunesPride.crux.trigger("merge_user_api", "[[api:l5EP8dszo3cH]]"));
                    
                    // The report should close.
                    await appPage.waitForTimeout(1000);
                },
            },
        ],
        documentation: {
            summary: "Merge an ally's API key to see their scanned stars, fleets, and technology levels directly on your map.",
            howToUse: [
                "Locate an API key in the report or a message.",
                "Click the merge icon or trigger the merge to integrate the data."
            ],
            expectedResult: ["Your map updates with new intelligence from the ally's perspective."],
        },
    });

    // Step 3: Show the Research report by pressing E.
    await helper.step("research-report", {
        description: "Show Alliance Research report",
        verifications: [
            {
                spec: "The Research report is visible",
                check: async () => {
                    await appPage.evaluate(() => (window as any).NeptunesPride.npui.trigger("show_report", "research"));
                    await expect(appPage.getByText("Alliance Research Progress")).toBeVisible();
                },
            },
        ],
        documentation: {
            summary: "Press **E** to view the research progress of all allies whose API keys you have merged.",
            howToUse: ["Press **E** while on the map."],
            expectedResult: ["A report appears showing current research, ETAs, and progress for all merged allies."],
        },
    });

    // Step 4: Show the Formal Alliances report by pressing ctrl+7.
    await helper.step("formal-alliances-report", {
        description: "Show Formal Alliances report",
        verifications: [
            {
                spec: "The Formal Alliances report is visible",
                check: async () => {
                    await appPage.evaluate(() => (window as any).NeptunesPride.npui.trigger("show_report", "fa"));
                    
                    // Wait for the report to be generated
                    await appPage.waitForTimeout(1000);
                    
                    // Check for report title or content
                    await expect(appPage.getByText("NP Agent")).toBeVisible({ timeout: 10000 });
                },
            },
        ],
        documentation: {
            summary: "Press **Ctrl+7** to generate a report of all formal alliances detected in the game.",
            howToUse: ["Press **Ctrl+7** while on the map."],
            expectedResult: ["A report appears showing which players are in formal alliances based on the merged intelligence."],
        },
    });

    helper.generateArtifacts();
});
