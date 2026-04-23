import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const downloadScript = path.join(repoRoot, "scripts/download-game-files.sh");

export default async function globalSetup(): Promise<void> {
  console.log("Building extension bundle for Playwright...");
  execFileSync("npm", ["run", "build"], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  console.log("Refreshing live Neptune's Pride client assets for Playwright...");
  execFileSync("bash", [downloadScript, "test-game-files"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}
