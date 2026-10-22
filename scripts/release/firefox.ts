import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  type ReleaseRecord,
  compareVersions,
  readJSON,
  requireClean,
  run,
  saveJSON,
  sha256,
  verifyArtifact,
  versionParts,
} from "./core";

export interface FirefoxConfig {
  addonId: number;
  guid: string;
}
export interface FirefoxRecord {
  schema: 1;
  version: string;
  preview: boolean;
  config: FirefoxConfig;
  sourceCommit: string;
  wrapperCommit: string;
  webSha256: string;
  extension: { file: string; sha256: string };
  source: { file: string; sha256: string };
}
export async function firefoxCredentials() {
  if (process.env.AMO_JWT_ISSUER && process.env.AMO_JWT_SECRET)
    return {
      issuer: process.env.AMO_JWT_ISSUER,
      secret: process.env.AMO_JWT_SECRET,
    };
  const file =
    process.env.NPA_FIREFOX_CREDENTIALS ||
    path.join(os.homedir(), ".config/npa/firefox-api.json");
  const value = await readJSON(file);
  if (!value.issuer || !value.secret)
    throw new Error("Firefox credentials require issuer and secret");
  return value as { issuer: string; secret: string };
}
export function amoToken(credentials: { issuer: string; secret: string }) {
  const iat = Math.floor(Date.now() / 1000);
  const encode = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const data = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ iss: credentials.issuer, jti: randomUUID(), iat, exp: iat + 60 })}`;
  return `${data}.${createHmac("sha256", credentials.secret).update(data).digest("base64url")}`;
}
export class FirefoxStore {
  constructor(
    public config: FirefoxConfig,
    private credentials: { issuer: string; secret: string },
    private fetcher = fetch,
  ) {}
  async request(endpoint: string, method = "GET", body?: FormData) {
    const response = await this.fetcher(
      `https://addons.mozilla.org/api/v5/${endpoint}`,
      {
        method,
        headers: { Authorization: `JWT ${amoToken(this.credentials)}` },
        body,
      },
    );
    if (!response.ok)
      throw new Error(
        `Mozilla API ${method} ${endpoint} failed (HTTP ${response.status}): ${(await response.text()).slice(0, 2000)}`,
      );
    return response.json();
  }
  async preflight() {
    const addon = await this.request(`addons/addon/${this.config.addonId}/`);
    if (addon.guid !== this.config.guid)
      throw new Error("Firefox destination GUID mismatch");
    // This filter requires author access, unlike the public detail endpoint.
    await this.request(
      `addons/addon/${this.config.addonId}/versions/?filter=all_with_unlisted&page_size=1`,
    );
    return addon;
  }
  async versions() {
    const results: any[] = [];
    let endpoint: string | null =
      `addons/addon/${this.config.addonId}/versions/?filter=all_with_unlisted&page_size=50`;
    while (endpoint) {
      const page = await this.request(endpoint);
      results.push(...page.results);
      if (
        page.next &&
        !page.next.startsWith("https://addons.mozilla.org/api/v5/")
      )
        throw new Error("Unexpected Mozilla pagination URL");
      endpoint = page.next
        ? page.next.slice("https://addons.mozilla.org/api/v5/".length)
        : null;
    }
    return results;
  }
  async upload(file: string) {
    const form = new FormData();
    form.set(
      "upload",
      new Blob([await fs.readFile(file)]),
      path.basename(file),
    );
    form.set("channel", "listed");
    return this.request("addons/upload/", "POST", form);
  }
  async submit(upload: string, source: string) {
    const form = new FormData();
    form.set("upload", upload);
    form.set(
      "source",
      new Blob([await fs.readFile(source)]),
      path.basename(source),
    );
    return this.request(
      `addons/addon/${this.config.addonId}/versions/`,
      "POST",
      form,
    );
  }
}
export async function verifyFirefox(dir: string, record: FirefoxRecord) {
  versionParts(record.version);
  if (record.schema !== 1)
    throw new Error("Unsupported Firefox release record");
  for (const [asset, expected] of [
    [record.extension, `firefox-${record.version}.zip`],
    [record.source, `firefox.source.${record.version}.tar.gz`],
  ] as const) {
    if (
      asset.file !== expected ||
      sha256(await fs.readFile(path.join(dir, asset.file))) !== asset.sha256
    )
      throw new Error("Firefox artifact checksum or filename mismatch");
  }
  const zip = path.join(dir, record.extension.file);
  run("unzip", ["-t", zip], dir);
  const manifest = JSON.parse(run("unzip", ["-p", zip, "manifest.json"], dir));
  if (
    manifest.version !== record.version ||
    manifest.browser_specific_settings?.gecko?.id !== record.config.guid
  )
    throw new Error("Firefox manifest identity mismatch");
}
export async function buildFirefox(
  root: string,
  version: string,
  preview: boolean,
  config: FirefoxConfig,
) {
  versionParts(version);
  if (!preview) requireClean(root);
  const webDir = path.join(root, "releases", version);
  const web: ReleaseRecord = await readJSON(path.join(webDir, "release.json"));
  if (web.version !== version || web.preview)
    throw new Error("Firefox requires an existing production web release");
  await verifyArtifact(webDir, web);
  const dir = path.join(webDir, preview ? "firefox-preview" : "firefox");
  // Stage away from the final directory; interruptions cannot leave a half release there.
  const temp = await fs.mkdtemp(path.join(webDir, ".firefox-"));
  try {
    try {
      await fs.access(dir);
      throw new Error(
        `Firefox directory already exists: ${dir}; use resume or move the preview aside`,
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const source = path.join(temp, "source");
    await fs.mkdir(source);
    const archive = path.join(temp, "inputs.tar");
    execFileSync(
      "git",
      [
        "archive",
        "--format=tar",
        `--output=${archive}`,
        web.sourceCommit,
        "src",
        "static",
        "bin/version.ts",
        "esbuild.baseconfig.ts",
        "esbuild.npa.ts",
        "package.json",
        "bun.lock",
        "tsconfig.json",
        "LICENSE",
      ],
      { cwd: root },
    );
    run("tar", ["-xf", archive, "-C", source], root);
    for (const name of [
      "manifest.json",
      "background.js",
      "loadnpa.js",
      "icons",
    ]) {
      await fs.cp(
        path.join(root, "firefox", name),
        path.join(source, "firefox", name),
        { recursive: true },
      );
    }
    await fs.copyFile(
      path.join(root, "bin/cleanff/build.ts"),
      path.join(source, "rebuild.ts"),
    );
    await fs.writeFile(
      path.join(source, "README"),
      (
        await fs.readFile(path.join(root, "bin/cleanff/README"), "utf8")
      ).replaceAll("INJECT_BUN", web.tools.bun),
    );
    await saveJSON(path.join(source, "build.json"), {
      version,
      sourceCommit: web.sourceCommit,
      guid: config.guid,
      date: run("git", ["show", "-s", "--format=%cI", web.sourceCommit], root),
      hashes: web.chrome.files,
    });
    const sourceFile = `firefox.source.${version}.tar.gz`;
    run("tar", ["-czf", path.join(temp, sourceFile), "."], source);
    // Exercise the exact reviewer recipe, including a fresh locked dependency installation.
    console.log(
      `Rebuilding Firefox source submission with Bun ${web.tools.bun}...`,
    );
    const installedBun = run("bun", ["--version"], root);
    if (installedBun !== web.tools.bun)
      throw new Error(
        `Use Bun ${web.tools.bun} to reproduce this web release (current: ${installedBun}); enter nix develop`,
      );
    run("bun", ["rebuild.ts"], source);
    const extensionFile = `firefox-${version}.zip`;
    run(
      "zip",
      ["-X", "-q", "-r", path.join(temp, extensionFile), "."],
      path.join(source, "output"),
    );
    const lint = JSON.parse(
      run(
        "bunx",
        [
          "addons-linter@10.14.0",
          path.join(temp, extensionFile),
          "--output",
          "json",
        ],
        root,
      ),
    );
    if (lint.summary.errors)
      throw new Error(`Firefox lint failed: ${JSON.stringify(lint.errors)}`);
    console.log(
      `Mozilla lint: ${lint.summary.errors} errors, ${lint.summary.warnings} warnings`,
    );
    for (const warning of lint.warnings)
      console.log(`  ${warning.code}: ${warning.message}`);
    await saveJSON(path.join(temp, "lint.json"), lint);
    const record: FirefoxRecord = {
      schema: 1,
      version,
      preview,
      config,
      sourceCommit: web.sourceCommit,
      wrapperCommit: run("git", ["rev-parse", "HEAD"], root),
      webSha256: web.chrome.sha256,
      extension: {
        file: extensionFile,
        sha256: sha256(await fs.readFile(path.join(temp, extensionFile))),
      },
      source: {
        file: sourceFile,
        sha256: sha256(await fs.readFile(path.join(temp, sourceFile))),
      },
    };
    await verifyFirefox(temp, record);
    await saveJSON(path.join(temp, "firefox-release.json"), record);
    await fs.rm(source, { recursive: true });
    await fs.unlink(archive);
    if (!preview) requireClean(root);
    await fs.rename(temp, dir);
    console.log(
      `Built Firefox extension and reproducible source archive in ${dir}`,
    );
    return { dir, record };
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
export interface FirefoxState {
  phase:
    | "packaged"
    | "uploading"
    | "validating"
    | "submitting"
    | "submitted"
    | "published";
  sha256: string;
  sourceSha256: string;
  addonId: number;
  uploadId?: string;
  versionId?: number;
}
export async function deployFirefox(
  dir: string,
  record: FirefoxRecord,
  store: FirefoxStore,
) {
  if (record.preview) throw new Error("Cannot deploy a Firefox preview");
  if (JSON.stringify(record.config) !== JSON.stringify(store.config))
    throw new Error("Firefox destination changed");
  await verifyFirefox(dir, record);
  await store.preflight();
  const stateFile = path.join(dir, "firefox-state.json");
  let state: FirefoxState;
  try {
    state = await readJSON(stateFile);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    state = {
      phase: "packaged",
      sha256: record.extension.sha256,
      sourceSha256: record.source.sha256,
      addonId: record.config.addonId,
    };
  }
  if (
    state.sha256 !== record.extension.sha256 ||
    state.sourceSha256 !== record.source.sha256 ||
    state.addonId !== record.config.addonId
  )
    throw new Error("Firefox deployment receipt mismatch");
  const versions = await store.versions();
  const existing = versions.find((v) => v.version === record.version);
  if (existing) {
    if (
      !state.uploadId ||
      !["submitting", "submitted", "published"].includes(state.phase)
    )
      throw new Error(
        "Firefox version already exists without a matching submission receipt; inspect it before proceeding",
      );
    if (
      existing.channel !== "listed" ||
      !existing.source ||
      (state.versionId && state.versionId !== existing.id)
    )
      throw new Error(
        "Firefox remote version/source does not match the submission",
      );
    state.versionId = existing.id;
    state.phase = existing.file.status === "public" ? "published" : "submitted";
    await saveJSON(stateFile, state);
    return { ...state, status: existing.file.status };
  }
  if (["submitting", "submitted", "published"].includes(state.phase))
    throw new Error(
      "Mozilla submission is not visible; resume later without re-uploading",
    );
  if (versions.some((v) => compareVersions(v.version, record.version) > 0))
    throw new Error(
      "A newer Firefox version already exists; refusing an older release",
    );
  if (state.phase === "uploading")
    throw new Error(
      "Upload response was lost. Inspect Mozilla uploads before resetting this receipt; refusing a blind retry",
    );
  if (!state.uploadId) {
    state.phase = "uploading";
    await saveJSON(stateFile, state);
    const uploaded = await store.upload(path.join(dir, record.extension.file));
    state.uploadId = uploaded.uuid;
    state.phase = "validating";
    await saveJSON(stateFile, state);
  }
  const upload = await store.request(`addons/upload/${state.uploadId}/`);
  if (!upload.processed) return state;
  if (!upload.valid)
    throw new Error(
      `Mozilla validation failed: ${JSON.stringify(upload.validation)}`,
    );
  if (
    upload.version !== record.version ||
    upload.channel !== "listed" ||
    upload.submitted
  )
    throw new Error("Unexpected Mozilla upload identity or submission state");
  state.phase = "submitting";
  await saveJSON(stateFile, state);
  const submitted = await store.submit(
    state.uploadId,
    path.join(dir, record.source.file),
  );
  state.versionId = submitted.id;
  state.phase = submitted.file.status === "public" ? "published" : "submitted";
  await saveJSON(stateFile, state);
  return state;
}
