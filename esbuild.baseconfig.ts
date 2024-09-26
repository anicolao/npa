import * as esbuild from "esbuild";
import * as p from "./package.json";
import { writeVersionAndManifest } from "./bin/version";

const version = {
  name: "version",
  setup(build) {
    build.onStart(async () => {
      await writeVersionAndManifest();
    });
  },
};

export async function createContext(production?: boolean) {
  const plugins = [version];
  const minify = !!production;
  return await esbuild.context({
    entryPoints: ["src/intel.ts", "src/background.js"],
    bundle: true,
    sourcemap: true,
    outdir: "dist",
    logLevel: "info",
    color: false,
    plugins,
    minify,
    banner: {
      js: `// ==UserScript==
// @name        Neptune's Pride Agent
// @description HUD and reporting for Neptune's Pride.
// @match       https://np.ironhelmet.com/*
// @match       https://np4.ironhelmet.com/*
// @version     ${p.version}
// @updateURL   https://bitbucket.org/osrictheknight/iosnpagent/raw/HEAD/intel.js
// ==/UserScript==
    `,
    },
  });
}
