import * as fs from "node:fs/promises";
import path from "node:path";
import * as esbuild from "esbuild";
import {
  type VersionInfo,
  getVersionInfo,
  writeVersionAndManifest,
} from "./bin/version";

const versionFields = {
  VITE_NPA_COMMIT_HASH: "hash",
  VITE_NPA_VERSION_DATE: "date",
  VITE_NPA_GIT_STATUS: "status",
  VITE_NPA_VERSION: "version",
  VITE_NPA_VERSION_STRING: "display",
} as const;
const versionMarker = "__NPA_USERSCRIPT_VERSION__";

function versionPlugin(root: string, development: boolean): esbuild.Plugin {
  let info: VersionInfo;
  return {
    name: "version",
    setup(build) {
      build.onStart(async () => {
        info = await getVersionInfo(root);
        await writeVersionAndManifest(info, root, development);
      });
      build.onResolve({ filter: /^npa:build-version$/ }, () => ({
        path: "version",
        namespace: "npa-version",
      }));
      // Virtual modules are loaded again on each rebuild; esbuild's initial
      // define/banner options are fixed for the entire watch context.
      build.onLoad({ filter: /.*/, namespace: "npa-version" }, () => ({
        contents: Object.entries(versionFields)
          .map(
            ([name, field]) =>
              `export const __npa_${name} = ${JSON.stringify(info[field])};`,
          )
          .join("\n"),
        loader: "js",
        watchFiles: [path.join(root, "package.json")],
      }));
      build.onEnd(async (result) => {
        if (result.errors.length) return;
        for (const file of result.outputFiles || []) {
          await fs.mkdir(path.dirname(file.path), { recursive: true });
          // Replace only the banner marker. Its line count is unchanged, so
          // sourcemap offsets for the generated code remain valid.
          const contents = file.path.endsWith(".js")
            ? file.text.replace(versionMarker, info.version)
            : file.contents;
          await fs.writeFile(file.path, contents);
        }
      });
    },
  };
}

export async function createContext(
  production?: boolean,
  root = process.cwd(),
) {
  const minify = !!production;
  return await esbuild.context({
    absWorkingDir: root,
    entryPoints: ["src/intel.ts", "src/background.js"],
    bundle: true,
    sourcemap: minify ? true : "inline",
    outdir: "dist",
    write: false,
    logLevel: "info",
    color: false,
    plugins: [versionPlugin(root, !production)],
    minify,
    inject: ["npa:build-version"],
    define: Object.fromEntries(
      Object.keys(versionFields).map((name) => [
        `process.env.${name}`,
        `__npa_${name}`,
      ]),
    ),
    banner: {
      js: `// ==UserScript==
// @name        Neptune's Pride Agent
// @description HUD and reporting for Neptune's Pride.
// @match       https://np.ironhelmet.com/*
// @match       https://np4.ironhelmet.com/*
// @version     ${versionMarker}
// @updateURL   https://bitbucket.org/osrictheknight/iosnpagent/raw/HEAD/intel.js
// ==/UserScript==
    `,
    },
  });
}
