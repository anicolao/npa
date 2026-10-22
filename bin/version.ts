import { execSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export type VersionInfo = {
  hash: string;
  date: string;
  status: string;
  version: string;
  display: string;
};

export async function getVersionInfo(
  root = process.cwd(),
): Promise<VersionInfo> {
  const d = new Date();
  const date = `${d.getDate()} ${d.toLocaleString("default", { month: "short" })} ${d.getFullYear()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  return {
    hash:
      process.env.VITE_NPA_COMMIT_HASH ??
      execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim(),
    date: process.env.VITE_NPA_VERSION_DATE ?? date,
    status:
      process.env.VITE_NPA_GIT_STATUS ??
      execSync("git status -s", { cwd: root }).toString().replace(/\n$/, ""),
    version:
      process.env.VITE_NPA_VERSION ??
      JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"))
        .version,
    display: process.env.VITE_NPA_VERSION_STRING ?? "",
  };
}

export async function writeVersionAndManifest(
  versionInfo?: VersionInfo,
  root = process.cwd(),
  development = false,
) {
  const version_info = versionInfo ?? (await getVersionInfo(root));
  const version = version_info.version;
  const alphaEdition = version.endsWith(".0") ? "" : " άλφα Edition";
  const hosts = ["https://np.ironhelmet.com/*", "https://np4.ironhelmet.com/*"];
  if (development) hosts.push("http://localhost:8080/*");
  const manifest = {
    name: `Neptune's Pride Agent${alphaEdition}`,
    description: "Enhance NP Triton UI with intel.",
    version,
    manifest_version: 3,
    permissions: ["scripting"],
    host_permissions: hosts,
    action: {},
    web_accessible_resources: [
      {
        resources: ["intel.js"],
        matches: ["<all_urls>"],
      },
    ],
    content_scripts: [
      {
        matches: hosts,
        css: ["intel.css"],
      },
    ],
    background: {
      service_worker: "background.js",
    },

    icons: {
      "16": "icon_16.png",
      "48": "icon_48.png",
      "128": "icon_128.png",
    },
  };

  await fs.mkdir(path.join(root, "dist"), { recursive: true });
  await fs.cp(path.join(root, "static"), path.join(root, "dist"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(root, "dist", "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}
