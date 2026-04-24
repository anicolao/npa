import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { waitForAgentHooks } from "../helpers";
import { TestStepHelper, waitForAnimations } from "../support/test-step-helper";

test("documents star and fleet reports", async ({
  appPage,
}, testInfo) => {
  const helper = new TestStepHelper(appPage, testInfo);

  helper.setMetadata({
    title: "Star and Fleet Reports Validation",
    validationGoal:
      "Verify that NPA can generate and display various star and fleet reports within the Agent UI.",
    docsTitle: "Star and Fleet Reports",
    docsSummary:
      "NPA provides a variety of detailed reports to help you track your empire's status and monitor enemy movements. These reports can be viewed directly in the Agent UI or copied to the clipboard for sharing in diplomatic messages.",
    bookSection: "Star and Fleet reports",
  });

  await waitForAgentHooks(appPage);

  // Step 1: Open NPA UI
  await helper.step("open-npa-ui", {
    description: "Open the NP Agent UI",
    verifications: [
      {
        spec: "Pressing ` opens the NPA report screen",
        check: async () => {
          await appPage.keyboard.press("Backquote");
          await expect(appPage.getByText("NP Agent")).toBeVisible();
        },
      },
    ],
    documentation: {
      summary:
        "Access the central intelligence hub by pressing **`** (backtick). This opens the NPA report screen where you can select from a wide range of automated analysis tools.",
      howToUse: ["Press **`** to open the Agent UI."],
      expectedResult: [
        "The NP Agent overlay appears, showing a report selector and a filter input.",
      ],
    },
  });

  // Step 2: Star Report
  await helper.step("star-report", {
    description: "View the Stars report",
    verifications: [
      {
        spec: "The Stars report lists all stars in scanning range",
        check: async () => {
          await runReport(appPage, "stars");
          await expect(appPage.locator(".txt_selectable")).toContainText("ships");
        },
      },
    ],
    documentation: {
      summary:
        "The **Stars** report provides a comprehensive breakdown of every star currently within your scanning range, grouped by owner. It includes infrastructure levels (Economy/Industry/Science) and total defensive ship counts.",
      howToUse: [
        "Open the Agent UI (**`**).",
        "Select **Stars** from the dropdown menu.",
      ],
      expectedResult: [
        "A detailed list of stars appears, showing production and ship totals for each player.",
      ],
    },
  });

  // Step 3: Fleets (short)
  await helper.step("fleets-short", {
    description: "View the Fleets (short) report",
    verifications: [
      {
        spec: "The Fleets (short) report summarizes flights and total ships in flight",
        check: async () => {
          await runReport(appPage, "fleets");
          await expect(appPage.locator(".txt_selectable")).toContainText("ships in flight");
        },
      },
    ],
    documentation: {
      summary:
        "The **Fleets (short)** report is a high-level summary of active fleet movements. It lists upcoming arrivals and provides a total count of ships in flight for every visible empire.",
      howToUse: ["Select **Fleets (short)** from the report dropdown."],
      expectedResult: [
        "The report displays a chronological list of fleet arrivals followed by per-player totals.",
      ],
    },
  });

  // Step 4: Fleets (long)
  await helper.step("fleets-long", {
    description: "View the Fleets (long) report",
    verifications: [
      {
        spec: "The Fleets (long) report provides detailed combat outcomes for all visible flights",
        check: async () => {
          await runReport(appPage, "combats");
          // Expect some combat or flight detail
          await expect(appPage.locator(".txt_selectable")).toContainText("Combat!");
        },
      },
    ],
    documentation: {
      summary:
        "For a deeper analysis, the **Fleets (long)** report calculates the projected outcome of every visible fleet movement. It accounts for weapons technology and defensive bonuses to show you exactly how many ships are expected to survive each encounter.",
      howToUse: ["Select **Fleets (long)** from the report dropdown."],
      expectedResult: [
        "A detailed breakdown of every flight appears, including projected survivors for defenders or attackers.",
      ],
    },
  });

  // Step 5: Home Planets
  await helper.step("home-planets", {
    description: "View the Home Planets report",
    verifications: [
      {
        spec: "The Home Planets report identifies the starting star for each player",
        check: async () => {
          await runReport(appPage, "planets");
          await expect(appPage.locator(".txt_selectable")).toContainText("home is");
        },
      },
    ],
    documentation: {
      summary:
        "The **Home Planets** report cross-references every player with their starting star. This is invaluable for identifying player numbers (e.g., `Player #5`) and tracking whether an empire still controls its original capital.",
      howToUse: ["Select **Home Planets** from the report dropdown."],
      expectedResult: [
        "The report lists each player number, their current alias, and their home star status.",
      ],
    },
  });

  helper.generateArtifacts();
});

async function runReport(appPage: Page, reportKey: string): Promise<void> {
  await appPage.evaluate((key) => {
    const np = window.NeptunesPride;
    // @ts-ignore
    np.npui.trigger("show_report", key);
  }, reportKey);
  await waitForAnimations(appPage);
}
