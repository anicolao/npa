import { expect, test } from "./fixtures";
import { waitForAgentHooks } from "./helpers";

test("loads the extension service worker and injects agent hooks into the fixture page", async ({
  appPage,
  extensionId,
}) => {
  expect(extensionId).toBeTruthy();
  await waitForAgentHooks(appPage);
});

test("opens the NP Agent report UI inside the real game fixture", async ({ appPage }) => {
  await waitForAgentHooks(appPage);

  await appPage.getByRole("button", { name: "Test Reports" }).click();

  await expect(appPage.getByText("NP Agent")).toBeVisible({
    timeout: 15000,
  });
  await expect(appPage.getByText("Filter:")).toBeVisible({
    timeout: 15000,
  });
});
