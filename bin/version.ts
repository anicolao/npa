import { $ } from "bun";
import * as p from "../package.json";

export async function writeVersionAndManifest() {
  const version = p.version;
  const version_info = {
    hash: (await $`git rev-parse --short HEAD`.text()).replace(/\n$/, ""),
    date: (await $`date "+%d %b %Y %H:%M"`.text()).replace(/\n$/, ""),
    status: (await $`git status -s`.text()).replace(/\n$/, ""),
    version,
  };

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
  await $`echo ${JSON.stringify(manifest, null, 2)} > dist/manifest.json`;

  const getVersion = `
export function getVersion() {
  const caution = version_info.status.length > 0 ? "⚠" : "";
  const date = version_info.status.length > 0 ? \`\${version_info.date} \` : "";
  return \`Neptune's Pride Agent v\${version_info.version} (\${date}\${caution}\${version_info.hash})\`;
}`;
  await $`echo export const version_info = ${JSON.stringify(version_info, null, 2)} > src/version.js`;
  for (const line of getVersion.split("\n")) {
    await $`echo ${line} >> src/version.js`;
  }
  await $`bunx biome format --write src/version.js`;
}
