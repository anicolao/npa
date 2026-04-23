import { expect, test } from "./fixtures";
import { waitForAgentHooks } from "./helpers";

test("opens the NPA side menu through the injected extension hooks", async ({ appPage }) => {
  await waitForAgentHooks(appPage);

  await appPage.evaluate(() => {
    (window as any).NeptunesPride.npui.trigger("show_npa_menu");
  });

  await expect(appPage.getByText("Tech by Empire")).toBeVisible({
    timeout: 15000,
  });
});
