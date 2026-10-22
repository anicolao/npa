// Runs inside the source archive supplied to Mozilla reviewers.
import * as fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const metadata = JSON.parse(await fs.readFile("build.json", "utf8"));
const command = (args: string[]) =>
  execFileSync("bun", args, {
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_NPA_VERSION: metadata.version,
      VITE_NPA_COMMIT_HASH: metadata.sourceCommit,
      VITE_NPA_VERSION_DATE: metadata.date,
      VITE_NPA_GIT_STATUS: "",
      VITE_NPA_VERSION_STRING: "",
    },
  });
command(["install", "--frozen-lockfile", "--ignore-scripts"]);
command(["run", "build"]);
for (const name of ["intel.js", "intel.css"]) {
  const bytes = await fs.readFile(`dist/${name}`);
  if (
    createHash("sha256").update(bytes).digest("hex") !== metadata.hashes[name]
  )
    throw new Error(`Rebuilt ${name} differs from the recorded web release`);
}
await fs.mkdir("output", { recursive: true });
const manifest = JSON.parse(await fs.readFile("firefox/manifest.json", "utf8"));
manifest.version = metadata.version;
manifest.name = "Neptune's Pride Agent άλφα Edition";
manifest.browser_specific_settings = {
  gecko: { id: metadata.guid, strict_min_version: "68.0" },
};
manifest.content_scripts = [
  { matches: manifest.permissions, css: ["intel.css"] },
];
await fs.writeFile(
  "output/manifest.json",
  `${JSON.stringify(manifest, null, 2)}\n`,
);
const js = await fs.readFile("dist/intel.js");
await fs.writeFile(
  "output/background.js",
  `${await fs.readFile("firefox/background.js", "utf8")}\ndataurl = 'data:text/javascript;base64,${js.toString("base64")}';\nloadNPA();\n`,
);
await fs.copyFile("dist/intel.css", "output/intel.css");
await fs.copyFile("firefox/loadnpa.js", "output/loadnpa.js");
await fs.cp("firefox/icons", "output/icons", { recursive: true });
console.log("Verified Firefox package files are in output/.");
