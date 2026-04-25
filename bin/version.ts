import { execa } from "execa";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import p from "../package.json";

export type VersionInfo = {
  hash: string;
  date: string;
  status: string;
  version: string;
  display: string;
};

export async function getVersionInfo(): Promise<VersionInfo> {
  const d = new Date();
  const date = `${d.getDate()} ${d.toLocaleString("default", { month: "short" })} ${d.getFullYear()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  return {
    hash:
      process.env.VITE_NPA_COMMIT_HASH ??
      (await execa("git", ["rev-parse", "--short", "HEAD"])).stdout.trim(),
    date: process.env.VITE_NPA_VERSION_DATE ?? date,
    status:
      process.env.VITE_NPA_GIT_STATUS ??
      (await execa("git", ["status", "-s"])).stdout.replace(/\n$/, ""),
    version: process.env.VITE_NPA_VERSION ?? p.version,
    display: process.env.VITE_NPA_VERSION_STRING ?? "",
  };
}

export async function writeVersionAndManifest(versionInfo?: VersionInfo) {
  const version_info = versionInfo ?? (await getVersionInfo());
  const version = version_info.version;
  const alphaEdition = version.endsWith(".0") ? "" : " άλφα Edition";
  const manifest = {
    name: `Neptune's Pride Agent${alphaEdition}`,
    description: "Enhance NP Triton UI with intel.",
    version,
    manifest_version: 3,
    permissions: ["scripting"],
    host_permissions: [
      "https://np.ironhelmet.com/*",
      "https://np4.ironhelmet.com/*",
      "http://localhost:8080/*",
    ],
    action: {},
    web_accessible_resources: [
      {
        resources: ["intel.js"],
        matches: ["<all_urls>"],
      },
    ],
    content_scripts: [
      {
        matches: [
          "https://np.ironhelmet.com/*",
          "https://np4.ironhelmet.com/*",
          "http://localhost:8080/*",
        ],
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

  await fs.mkdir("dist", { recursive: true });
  await fs.cp("static", "dist", { recursive: true });
  await fs.writeFile(
    path.join("dist", "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}
