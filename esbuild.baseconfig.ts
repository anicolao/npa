import * as esbuild from "esbuild";
import {
  type VersionInfo,
  getVersionInfo,
  writeVersionAndManifest,
} from "./bin/version";

const version = (versionInfo: VersionInfo) => ({
  name: "version",
  setup(build: esbuild.PluginBuild) {
    build.onStart(async () => {
      await writeVersionAndManifest(versionInfo);
    });
  },
});

export async function createContext(production?: boolean) {
  const versionInfo = await getVersionInfo();
  const plugins = [version(versionInfo)];
  const minify = !!production;
  return await esbuild.context({
    entryPoints: ["src/intel.ts", "src/background.js"],
    bundle: true,
    sourcemap: minify ? true : "inline",
    outdir: "dist",
    logLevel: "info",
    color: false,
    plugins,
    minify,
    define: {
      "process.env.VITE_NPA_COMMIT_HASH": JSON.stringify(versionInfo.hash),
      "process.env.VITE_NPA_VERSION_DATE": JSON.stringify(versionInfo.date),
      "process.env.VITE_NPA_GIT_STATUS": JSON.stringify(versionInfo.status),
      "process.env.VITE_NPA_VERSION": JSON.stringify(versionInfo.version),
      "process.env.VITE_NPA_VERSION_STRING": JSON.stringify(
        versionInfo.display,
      ),
    },
    banner: {
      js: `// ==UserScript==
// @name        Neptune's Pride Agent
// @description HUD and reporting for Neptune's Pride.
// @match       https://np.ironhelmet.com/*
// @match       https://np4.ironhelmet.com/*
// @version     ${versionInfo.version}
// @updateURL   https://bitbucket.org/osrictheknight/iosnpagent/raw/HEAD/intel.js
// ==/UserScript==
    `,
    },
  });
}
