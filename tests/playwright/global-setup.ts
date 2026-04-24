import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const downloadScript = path.join(repoRoot, "scripts/download-game-files.sh");
const downloadResourcesScript = path.join(
  repoRoot,
  "scripts/download-external-resources.sh",
);
const fixedScreenshotVersion = "Neptune's Pride Agent v9.9.99 (fake version)";

export default async function globalSetup(): Promise<void> {
  console.log("Building extension bundle for Playwright...");
  execFileSync("npm", ["run", "build"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_NPA_VERSION_STRING:
        process.env.VITE_NPA_VERSION_STRING ?? fixedScreenshotVersion,
      VITE_NPA_COMMIT_HASH: process.env.VITE_NPA_COMMIT_HASH ?? "e2e",
      VITE_NPA_VERSION_DATE: process.env.VITE_NPA_VERSION_DATE ?? "",
      VITE_NPA_GIT_STATUS: process.env.VITE_NPA_GIT_STATUS ?? "",
    },
  });

  console.log(
    "Refreshing live Neptune's Pride client assets for Playwright...",
  );
  execFileSync("bash", [downloadScript, "test-game-files"], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  console.log("Refreshing external Neptune's Pride assets for Playwright...");
  execFileSync("bash", [downloadResourcesScript], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}
