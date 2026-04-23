import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

export async function waitForFixtureToBoot(appPage: Page): Promise<void> {
  await expect(appPage.locator("#game-status")).toContainText("Loaded", {
    timeout: 15000,
  });

  await appPage.waitForFunction(() => {
    const np = (window as any).NeptunesPride;
    return !!(np && np.universe && np.universe.galaxy && np.npui && np.npui.map);
  });
}

export async function waitForAgentHooks(appPage: Page): Promise<void> {
  await waitForFixtureToBoot(appPage);

  await appPage.waitForFunction(() => {
    const np = (window as any).NeptunesPride;
    return !!(
      np &&
      np.npui &&
      np.npui.npaMenu &&
      np.npui.status &&
      np.npui.status.npaMenuBtn
    );
  });

  await expect(appPage.locator("#extension-status")).toHaveText("Active", {
    timeout: 15000,
  });
}
