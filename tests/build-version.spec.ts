import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createContext } from "../esbuild.baseconfig";
import { run } from "../scripts/release/core";

let root: string;
let context: Awaited<ReturnType<typeof createContext>> | undefined;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "npa-build-version-"));
  await fs.mkdir(path.join(root, "src"));
  await fs.mkdir(path.join(root, "static"));
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ version: "2.2.89" }),
  );
  await fs.writeFile(path.join(root, ".gitignore"), "dist/\n");
  await fs.copyFile(
    path.resolve("src/version.ts"),
    path.join(root, "src/version.ts"),
  );
  await fs.writeFile(
    path.join(root, "src/intel.ts"),
    'import {version_info,getVersion} from "./version"; globalThis.versionInfo=version_info; globalThis.display=getVersion();',
  );
  await fs.writeFile(
    path.join(root, "src/background.js"),
    "console.log('background');",
  );
  run("git", ["init", "-q"], root);
  run("git", ["config", "user.name", "Build Test"], root);
  run("git", ["config", "user.email", "build@example.invalid"], root);
  run("git", ["config", "commit.gpgsign", "false"], root);
  run("git", ["config", "core.hooksPath", "/dev/null"], root);
  run("git", ["add", "."], root);
  run("git", ["commit", "-qm", "initial"], root);
});
afterEach(async () => {
  await context?.dispose();
  context = undefined;
  vi.unstubAllEnvs();
  await fs.rm(root, { recursive: true, force: true });
});
async function output() {
  const code = await fs.readFile(path.join(root, "dist/intel.js"), "utf8");
  const sandbox = { versionInfo: undefined as any, display: "" };
  vm.runInNewContext(code, sandbox);
  const manifest = JSON.parse(
    await fs.readFile(path.join(root, "dist/manifest.json"), "utf8"),
  );
  return {
    code,
    info: sandbox.versionInfo,
    display: sandbox.display,
    manifest,
  };
}
describe("version metadata during rebuilds", () => {
  it("refreshes git and package metadata using the same esbuild context", async () => {
    context = await createContext(false, root);
    await context.rebuild();
    const initial = await output();
    expect(initial.info.status).toBe("");
    expect(initial.info.version).toBe("2.2.89");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ version: "2.2.90" }),
    );
    run("git", ["add", "."], root);
    run("git", ["commit", "-qm", "bump version"], root);
    await fs.appendFile(path.join(root, "src/intel.ts"), "\n// local edit\n");
    await context.rebuild();
    const next = await output();
    expect(next.info.hash).toBe(
      run("git", ["rev-parse", "--short", "HEAD"], root),
    );
    expect(next.info.hash).not.toBe(initial.info.hash);
    expect(next.info.status).toContain("src/intel.ts");
    expect(next.info.version).toBe("2.2.90");
    expect(next.manifest.version).toBe("2.2.90");
    expect(next.code).toContain("// @version     2.2.90");
    expect(next.code).not.toContain("__NPA_USERSCRIPT_VERSION__");
    expect(next.display).toContain("⚠");
  });
  it("preserves every explicit screenshot/release override in production rebuilds", async () => {
    for (const [name, value] of Object.entries({
      VITE_NPA_COMMIT_HASH: "fixed-hash",
      VITE_NPA_VERSION_DATE: "fixed-date",
      VITE_NPA_GIT_STATUS: "",
      VITE_NPA_VERSION: "9.9.99",
      VITE_NPA_VERSION_STRING: "fixed screenshot label",
    }))
      vi.stubEnv(name, value);
    context = await createContext(true, root);
    await context.rebuild();
    const initial = await output();
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ version: "2.2.90" }),
    );
    await context.rebuild();
    const next = await output();
    expect(next.info).toEqual(initial.info);
    expect(next.info).toEqual({
      hash: "fixed-hash",
      date: "fixed-date",
      status: "",
      version: "9.9.99",
      display: "fixed screenshot label",
    });
    expect(next.display).toBe("fixed screenshot label");
    expect(next.manifest.version).toBe("9.9.99");
    expect(next.code).toContain("// @version     9.9.99");
    expect(
      JSON.parse(
        await fs.readFile(path.join(root, "dist/intel.js.map"), "utf8"),
      ).version,
    ).toBe(3);
  });
});
