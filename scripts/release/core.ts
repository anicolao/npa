import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function run(
  command: string,
  args: string[],
  cwd: string,
  env = process.env,
) {
  return execFileSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}
export const sha256 = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
export function versionParts(version: string) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
    throw new Error("Expected a numeric three-part release version");
  const parts = version.split(".").map(Number);
  if (parts.some((p) => p > 65535) || parts.every((p) => p === 0))
    throw new Error("Version is outside Chrome's supported range");
  return parts;
}
export function nextPatch(version: string) {
  const [major, minor, patch] = versionParts(version);
  const next = `${major}.${minor}.${patch + 1}`;
  versionParts(next);
  return next;
}
export function compareVersions(a: string, b: string) {
  const aa = a.split(".").map(Number);
  const bb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    if ((aa[i] || 0) !== (bb[i] || 0)) return (aa[i] || 0) - (bb[i] || 0);
  }
  return 0;
}
export async function readJSON(file: string) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}
export async function saveJSON(file: string, data: unknown) {
  await fs.writeFile(`${file}.tmp`, `${JSON.stringify(data, null, 2)}\n`, {
    mode: 0o600,
  });
  await fs.rename(`${file}.tmp`, file);
}
export async function withLock<T>(root: string, task: () => Promise<T>) {
  const file = path.join(root, ".release.lock");
  let handle: Awaited<ReturnType<typeof fs.open>>;
  try {
    handle = await fs.open(file, "wx");
  } catch {
    throw new Error(
      "A release lock exists. Check for a running release before removing .release.lock.",
    );
  }
  try {
    await handle.writeFile(String(process.pid));
    return await task();
  } finally {
    await handle.close();
    await fs.unlink(file);
  }
}
export function requireClean(root: string) {
  if (run("git", ["status", "--porcelain"], root))
    throw new Error(
      "Commit changes before releasing, or use build --preview for a local test package.",
    );
}
export function validateManifest(
  manifest: any,
  version: string,
  files: string[],
) {
  if (manifest.version !== version || manifest.manifest_version !== 3)
    throw new Error("Chrome manifest/version mismatch");
  const required = [
    "intel.js",
    "intel.css",
    manifest.background?.service_worker,
    ...Object.values(manifest.icons || {}),
    ...(manifest.content_scripts || []).flatMap((s: any) => [
      ...(s.js || []),
      ...(s.css || []),
    ]),
    ...(manifest.web_accessible_resources || []).flatMap(
      (s: any) => s.resources || [],
    ),
  ];
  for (const file of required) {
    if (typeof file !== "string" || !files.includes(file))
      throw new Error(`Missing manifest asset: ${file}`);
  }
  if (
    files.some(
      (f) => f.endsWith(".map") || f.includes("..") || f.startsWith("/"),
    )
  )
    throw new Error("Unexpected file in Chrome package");
}
// Keep historical artifact verification independent of today's publishing policy.
export function validateProductionHosts(manifest: any) {
  const allowed = new Set([
    "https://np.ironhelmet.com/*",
    "https://np4.ironhelmet.com/*",
  ]);
  const hosts = [
    ...(manifest.host_permissions || []),
    ...(manifest.optional_host_permissions || []),
    ...(manifest.content_scripts || []).flatMap(
      (script: any) => script.matches || [],
    ),
    ...[
      ...(manifest.permissions || []),
      ...(manifest.optional_permissions || []),
    ].filter(
      (permission: string) =>
        permission.includes("://") || permission === "<all_urls>",
    ),
  ];
  for (const host of hosts)
    if (!allowed.has(host))
      throw new Error(`Unexpected production host permission: ${host}`);
}
export interface ReleaseRecord {
  schema: 1;
  version: string;
  channel: "alpha";
  preview: boolean;
  sourceCommit: string;
  sourceDigest: string;
  createdAt: string;
  tools: { bun: string };
  chrome: { file: string; sha256: string; files: Record<string, string> };
}
export async function verifyArtifact(dir: string, record: ReleaseRecord) {
  if (record.schema !== 1 || record.channel !== "alpha")
    throw new Error("Unsupported release record");
  versionParts(record.version);
  if (record.chrome.file !== `chrome-${record.version}.zip`)
    throw new Error("Unexpected artifact filename");
  const file = path.join(dir, record.chrome.file);
  if (sha256(await fs.readFile(file)) !== record.chrome.sha256)
    throw new Error("Chrome ZIP checksum mismatch; refusing deployment");
  run("unzip", ["-t", file], dir);
  const files = run("unzip", ["-Z1", file], dir).split("\n");
  const manifest = JSON.parse(run("unzip", ["-p", file, "manifest.json"], dir));
  validateManifest(manifest, record.version, files);
  return file;
}
export async function buildChrome(
  root: string,
  version: string,
  preview = false,
) {
  versionParts(version);
  if (version.endsWith(".0"))
    throw new Error("This first release target supports alpha versions only");
  if (!preview) {
    requireClean(root);
    if ((await readJSON(path.join(root, "package.json"))).version !== version)
      throw new Error("Release version must match committed package.json");
  }
  const output = path.join(
    root,
    "releases",
    `${preview ? "preview-" : ""}${version}`,
  );
  await fs.mkdir(path.dirname(output), { recursive: true });
  try {
    await fs.mkdir(output);
  } catch {
    throw new Error(
      `Release directory already exists: ${output}. Use resume, or move the old preview aside.`,
    );
  }
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "npa-release-"));
  try {
    const sourceCommit = run("git", ["rev-parse", "HEAD"], root);
    // Copy only build inputs, never credentials or unrelated working files.
    const inputs = run(
      "git",
      [
        "ls-files",
        "--cached",
        "--others",
        "--exclude-standard",
        "--",
        "src",
        "static",
        "bin/version.ts",
        "esbuild.baseconfig.ts",
        "esbuild.npa.ts",
        "package.json",
        "bun.lock",
        "tsconfig.json",
      ],
      root,
    )
      .split("\n")
      .filter(Boolean)
      .sort();
    const inputHashes: Record<string, string> = {};
    for (const name of inputs) {
      const source = path.join(root, name);
      const stat = await fs.lstat(source);
      if (!stat.isFile())
        throw new Error(`Build input is not a regular file: ${name}`);
      const bytes = await fs.readFile(source);
      inputHashes[name] = sha256(bytes);
      await fs.mkdir(path.dirname(path.join(temp, name)), { recursive: true });
      await fs.writeFile(path.join(temp, name), bytes);
    }
    await fs.symlink(
      path.join(root, "node_modules"),
      path.join(temp, "node_modules"),
      "dir",
    );
    const date = run("git", ["show", "-s", "--format=%cI", "HEAD"], root);
    run("bun", ["run", "build"], temp, {
      ...process.env,
      VITE_NPA_VERSION: version,
      VITE_NPA_COMMIT_HASH: sourceCommit,
      VITE_NPA_VERSION_DATE: date,
      VITE_NPA_GIT_STATUS: preview ? "preview" : "",
      VITE_NPA_VERSION_STRING: "",
    });
    const bundle = path.join(temp, "dist");
    const chromeDir = path.join(output, "chrome");
    const mapsDir = path.join(output, "source-maps");
    await fs.mkdir(chromeDir);
    await fs.mkdir(mapsDir);
    const hashes: Record<string, string> = {};
    for (const name of (await fs.readdir(bundle)).sort()) {
      const bytes = await fs.readFile(path.join(bundle, name));
      const dest = path.join(name.endsWith(".map") ? mapsDir : chromeDir, name);
      await fs.writeFile(dest, bytes);
      await fs.utimes(
        dest,
        new Date("2000-01-01T00:00:00Z"),
        new Date("2000-01-01T00:00:00Z"),
      );
      if (!name.endsWith(".map")) hashes[name] = sha256(bytes);
    }
    validateProductionHosts(
      await readJSON(path.join(chromeDir, "manifest.json")),
    );
    validateManifest(
      await readJSON(path.join(chromeDir, "manifest.json")),
      version,
      Object.keys(hashes),
    );
    const zip = `chrome-${version}.zip`;
    run(
      "zip",
      ["-X", "-q", path.join(output, zip), ...Object.keys(hashes)],
      chromeDir,
      { ...process.env, TZ: "UTC" },
    );
    if (!preview) {
      requireClean(root);
      if (run("git", ["rev-parse", "HEAD"], root) !== sourceCommit) {
        throw new Error("Source commit changed during packaging");
      }
    }
    const record: ReleaseRecord = {
      schema: 1,
      version,
      channel: "alpha",
      preview,
      sourceCommit,
      sourceDigest: sha256(JSON.stringify(inputHashes)),
      createdAt: new Date().toISOString(),
      tools: { bun: run("bun", ["--version"], root) },
      chrome: {
        file: zip,
        sha256: sha256(await fs.readFile(path.join(output, zip))),
        files: hashes,
      },
    };
    await verifyArtifact(output, record);
    await saveJSON(path.join(output, "release.json"), record);
    console.log(
      `Built ${output}/${zip}${preview ? " (preview: not deployable)" : ""}`,
    );
    return { dir: output, record };
  } catch (error) {
    await fs.rm(output, { recursive: true, force: true });
    throw error;
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
