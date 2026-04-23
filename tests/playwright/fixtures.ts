import { test as base, chromium, expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const extensionPath = path.join(repoRoot, "dist");

type ExtensionFixtures = {
  extensionContext: BrowserContext;
  extensionId: string;
  appPage: Page;
};

export const test = base.extend<ExtensionFixtures>({
  extensionContext: async ({}, use) => {
    const manifestPath = path.join(extensionPath, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Extension manifest not found at ${manifestPath}.`);
    }

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "npa-playwright-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      viewport: { width: 1600, height: 1200 },
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
    });

    try {
      await use(context);
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  },

  extensionId: async ({ extensionContext }, use) => {
    let [serviceWorker] = extensionContext.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await extensionContext.waitForEvent("serviceworker");
    }

    await use(new URL(serviceWorker.url()).host);
  },

  appPage: async ({ extensionContext, extensionId, baseURL }, use) => {
    if (!baseURL) {
      throw new Error("Playwright baseURL must be configured for the test server.");
    }

    const page = await extensionContext.newPage();
    if (!extensionId) {
      throw new Error("Extension service worker did not expose an ID.");
    }

    await page.waitForTimeout(1000);
    await page.goto(baseURL);
    await page.reload();
    await use(page);
    await page.close();
  },
});

export { expect };
