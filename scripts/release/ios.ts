import * as fs from "node:fs/promises";
import path from "node:path";
import {
  readJSON,
  requireClean,
  run,
  saveJSON,
  sha256,
  verifyArtifact,
  versionParts,
} from "./core";

export interface IOSConfig {
  bundleId: string;
  teamId: string;
  scheme: string;
  developerDir: string;
  betaGroups: string[];
}
export interface IOSRecord {
  schema: 1;
  version: string;
  buildNumber: string;
  preview: boolean;
  sourceCommit: string;
  webSourceCommit: string;
  webArchiveHash: string;
  config: IOSConfig;
  assets: Record<string, string>;
  app: string;
  archive?: string;
  files: Record<string, string>;
}
export function iosBuildNumber(value: string) {
  if (!/^[1-9]\d{0,3}(\.(0|[1-9]\d?)){0,2}$/.test(value))
    throw new Error(
      "iOS build number must have up to three numeric components (4, 2, 2 digits)",
    );
  return value;
}
export async function hashTree(
  directory: string,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function visit(relative: string) {
    for (const entry of (
      await fs.readdir(path.join(directory, relative), { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile())
        result[name] = sha256(await fs.readFile(path.join(directory, name)));
      else throw new Error(`Unsupported file in iOS artifact: ${name}`);
    }
  }
  await visit("");
  return result;
}
function plist(file: string) {
  return JSON.parse(
    run("plutil", ["-convert", "json", "-o", "-", file], path.dirname(file)),
  );
}
export async function verifyIOS(dir: string, record: IOSRecord) {
  if (record.schema !== 1) throw new Error("Unsupported iOS release record");
  versionParts(record.version);
  iosBuildNumber(record.buildNumber);
  const expectedApp = record.preview
    ? "simulator/Build/Products/Release-iphonesimulator/NPAiOS.app"
    : "NPAiOS.xcarchive/Products/Applications/NPAiOS.app";
  if (
    record.app !== expectedApp ||
    (!record.preview && record.archive !== "NPAiOS.xcarchive")
  )
    throw new Error("Unexpected iOS artifact path");
  const artifact = path.join(dir, record.archive || record.app);
  if (JSON.stringify(await hashTree(artifact)) !== JSON.stringify(record.files))
    throw new Error("iOS artifact checksum mismatch");
  const app = path.join(dir, record.app);
  const info = plist(path.join(app, "Info.plist"));
  if (
    info.CFBundleIdentifier !== record.config.bundleId ||
    info.CFBundleShortVersionString !== record.version ||
    info.CFBundleVersion !== record.buildNumber
  )
    throw new Error("iOS app identity/version mismatch");
  for (const [name, hash] of Object.entries(record.assets)) {
    if (!["intel.js", "intel.css"].includes(name))
      throw new Error("Unexpected iOS web asset");
    if (sha256(await fs.readFile(path.join(app, "Dist", name))) !== hash)
      throw new Error(`Bundled iOS payload mismatch: ${name}`);
  }
  if (Object.keys(record.assets).sort().join(",") !== "intel.css,intel.js")
    throw new Error("Missing iOS payload hashes");
  return app;
}
export async function buildIOS(
  root: string,
  version: string,
  buildNumber: string,
  preview: boolean,
  config: IOSConfig,
) {
  versionParts(version);
  iosBuildNumber(buildNumber);
  if (!preview) requireClean(root);
  const webDir = path.join(root, "releases", version);
  const web = await readJSON(path.join(webDir, "release.json"));
  if (web.version !== version || web.preview)
    throw new Error(
      "iOS requires a verified, non-preview web release of the same version",
    );
  const zip = await verifyArtifact(webDir, web);
  const dir = path.join(
    webDir,
    `${preview ? "ios-preview" : "ios"}-${buildNumber}`,
  );
  await fs.mkdir(dir); // Never overwrite an archive or an upload receipt.
  const source = path.join(dir, "source");
  const sourceCommit = run("git", ["rev-parse", "HEAD"], root);
  const env = {
    ...process.env,
    DEVELOPER_DIR: process.env.DEVELOPER_DIR || config.developerDir,
  };
  try {
    await fs.mkdir(source);
    const inputs = run("git", ["ls-files", "--", "ios"], root)
      .split("\n")
      .filter((name) => name && !name.includes("/Resources/Dist/"));
    for (const name of inputs) {
      const target = path.join(source, name);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(path.join(root, name), target);
    }
    const dist = path.join(source, "ios/NPAiOS/Resources/Dist");
    await fs.mkdir(dist, { recursive: true });
    // Extract from the checked ZIP, never from the mutable unpacked Chrome folder.
    run("unzip", ["-q", zip, "intel.js", "intel.css", "-d", dist], root);
    const assets = await hashTree(dist);
    const args = [
      "-project",
      path.join(source, "ios/NPAiOS.xcodeproj"),
      "-scheme",
      config.scheme,
      "-configuration",
      "Release",
      "-destination",
      preview ? "generic/platform=iOS Simulator" : "generic/platform=iOS",
      "-derivedDataPath",
      path.join(dir, preview ? "simulator" : "derived-data"),
      `MARKETING_VERSION=${version}`,
      `CURRENT_PROJECT_VERSION=${buildNumber}`,
      `PRODUCT_BUNDLE_IDENTIFIER=${config.bundleId}`,
      `DEVELOPMENT_TEAM=${config.teamId}`,
    ];
    if (preview) args.push("CODE_SIGNING_ALLOWED=NO", "build");
    else
      args.push("-archivePath", path.join(dir, "NPAiOS.xcarchive"), "archive");
    console.log(
      `Building iOS ${version} (${buildNumber})${preview ? " for simulator" : " archive"}...`,
    );
    run("xcodebuild", args, root, env);
    const app = preview
      ? "simulator/Build/Products/Release-iphonesimulator/NPAiOS.app"
      : "NPAiOS.xcarchive/Products/Applications/NPAiOS.app";
    const record: IOSRecord = {
      schema: 1,
      version,
      buildNumber,
      preview,
      sourceCommit,
      webSourceCommit: web.sourceCommit,
      webArchiveHash: web.chrome.sha256,
      config,
      assets,
      app,
      ...(preview ? {} : { archive: "NPAiOS.xcarchive" }),
      files: await hashTree(path.join(dir, preview ? app : "NPAiOS.xcarchive")),
    };
    await verifyIOS(dir, record);
    if (!preview) {
      requireClean(root);
      if (run("git", ["rev-parse", "HEAD"], root) !== sourceCommit)
        throw new Error("Source changed during iOS build");
    }
    await saveJSON(path.join(dir, "ios-release.json"), record);
    console.log(
      `Verified iOS ${preview ? "simulator app" : "archive"}: ${path.join(dir, app)}`,
    );
    return { dir, record };
  } catch (error) {
    console.error(`Incomplete iOS build retained for diagnosis: ${dir}`);
    throw error;
  }
}

// Export locally first, so the IPA remains available if upload is interrupted.
export async function exportIOS(
  dir: string,
  record: IOSRecord,
  credentials: import("./apple").AppleCredentials,
) {
  if (record.preview || !record.archive)
    throw new Error("Simulator previews cannot be exported or uploaded");
  await verifyIOS(dir, record);
  const env = {
    ...process.env,
    DEVELOPER_DIR: process.env.DEVELOPER_DIR || record.config.developerDir,
  };
  const options = path.join(dir, "export-options.plist");
  const sourceOptions = path.join(
    dir,
    "source/ios/Config/TestFlightExportOptions.plist",
  );
  const settings = plist(sourceOptions);
  if (
    settings.destination !== "export" ||
    settings.method !== "app-store-connect" ||
    settings.manageAppVersionAndBuildNumber !== false
  )
    throw new Error("Unexpected iOS export settings");
  await fs.copyFile(sourceOptions, options);
  const auth = credentials.issuerId
    ? [
        "-authenticationKeyPath",
        credentials.privateKeyPath,
        "-authenticationKeyID",
        credentials.keyId,
        "-authenticationKeyIssuerID",
        credentials.issuerId,
      ]
    : [];
  run(
    "xcodebuild",
    [
      "-exportArchive",
      "-archivePath",
      path.join(dir, record.archive),
      "-exportPath",
      path.join(dir, "export"),
      "-exportOptionsPlist",
      options,
      "-allowProvisioningUpdates",
      ...auth,
    ],
    dir,
    env,
  );
  const ipas = (await fs.readdir(path.join(dir, "export"))).filter((name) =>
    name.endsWith(".ipa"),
  );
  if (ipas.length !== 1) throw new Error("Expected one exported iOS IPA");
  const file = path.join("export", ipas[0]);
  const ipa = path.join(dir, file);
  const unpacked = await fs.mkdtemp(path.join(dir, "verify-ipa-"));
  try {
    run("unzip", ["-q", ipa, "-d", unpacked], dir);
    const app = path.join(unpacked, "Payload/NPAiOS.app");
    const info = plist(path.join(app, "Info.plist"));
    if (
      info.CFBundleIdentifier !== record.config.bundleId ||
      info.CFBundleShortVersionString !== record.version ||
      info.CFBundleVersion !== record.buildNumber
    )
      throw new Error("Export changed iOS identity/version");
    for (const [name, hash] of Object.entries(record.assets))
      if (sha256(await fs.readFile(path.join(app, "Dist", name))) !== hash)
        throw new Error("Export changed iOS web payload");
    run("codesign", ["--verify", "--deep", "--strict", app], dir);
  } finally {
    await fs.rm(unpacked, { recursive: true, force: true });
  }
  const result = { file, sha256: sha256(await fs.readFile(ipa)) };
  await saveJSON(path.join(dir, "ios-export.json"), result);
  return result;
}

export interface IOSDeployState {
  phase: "uploading" | "processing" | "ready" | "submitted" | "distributed";
  appId: string;
  ipaHash: string;
  buildId?: string;
  reviewIntent?: boolean;
}
export async function deployIOS(
  dir: string,
  record: IOSRecord,
  store: import("./apple").AppleStore,
  upload: (ipa: string) => void = (ipa) => {
    const c = store.credentials;
    if (!c.issuerId)
      throw new Error("This uploader requires a team API key with issuerId");
    run(
      "xcrun",
      [
        "altool",
        "--upload-package",
        ipa,
        "--api-key",
        c.keyId,
        "--api-issuer",
        c.issuerId,
        "--p8-file-path",
        c.privateKeyPath,
      ],
      dir,
      {
        ...process.env,
        DEVELOPER_DIR: process.env.DEVELOPER_DIR || record.config.developerDir,
      },
    );
  },
) {
  if (record.preview) throw new Error("Cannot upload an iOS preview");
  await verifyIOS(dir, record);
  const app = await store.app(record.config.bundleId);
  const stateFile = path.join(dir, "ios-state.json");
  let state: IOSDeployState | undefined;
  try {
    state = await readJSON(stateFile);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let exported: { file: string; sha256: string };
  try {
    exported = await readJSON(path.join(dir, "ios-export.json"));
  } catch (error) {
    if (error.code !== "ENOENT" || state) throw error;
    exported = await exportIOS(dir, record, store.credentials);
  }
  if (!/^export\/[^/]+\.ipa$/.test(exported.file))
    throw new Error("Unexpected IPA path");
  const ipa = path.join(dir, exported.file);
  if (sha256(await fs.readFile(ipa)) !== exported.sha256)
    throw new Error("IPA checksum mismatch");
  if (state && (state.appId !== app.id || state.ipaHash !== exported.sha256))
    throw new Error("iOS deployment destination or IPA changed");
  const builds = await store.builds(app.id, record.version);
  const build = builds.find((b) => b.attributes.version === record.buildNumber);
  if (!state) {
    if (build)
      throw new Error(
        "Build already exists without a local upload receipt; choose another build number",
      );
    state = { phase: "uploading", appId: app.id, ipaHash: exported.sha256 };
    await saveJSON(stateFile, state);
    upload(ipa);
    state.phase = "processing";
    await saveJSON(stateFile, state);
    console.log(
      "Upload accepted. Apple is processing it; run resume later to finish TestFlight distribution.",
    );
    return state;
  }
  if (!build) {
    if (state.phase === "uploading")
      throw new Error(
        "Upload outcome is uncertain. Check App Store Connect before retrying; no duplicate upload was sent.",
      );
    if (state.phase !== "processing")
      throw new Error(
        "Previously recorded build is no longer visible in App Store Connect",
      );
    console.log("Uploaded build is not visible yet; resume later.");
    return state;
  }
  state.buildId = build.id;
  if (build.attributes.processingState === "PROCESSING") {
    state.phase = "processing";
    await saveJSON(stateFile, state);
    return state;
  }
  if (build.attributes.processingState !== "VALID" || build.attributes.expired)
    throw new Error(
      `Apple build is not usable (${build.attributes.processingState})`,
    );
  state.phase = "ready";
  await saveJSON(stateFile, state);
  const localizations = await store.list(
    `/v1/builds/${build.id}/betaBuildLocalizations`,
  );
  if (!localizations.length)
    await store.json("/v1/betaBuildLocalizations", {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "betaBuildLocalizations",
          attributes: {
            locale: app.attributes.primaryLocale || "en-US",
            whatsNew: `NPA ${record.version}. Updated bundled game enhancements.`,
          },
          relationships: { build: { data: { type: "builds", id: build.id } } },
        },
      }),
    });
  const groups = await store.list(`/v1/apps/${app.id}/betaGroups`);
  const selected = record.config.betaGroups.map((name) => {
    const matches = groups.filter((g) => g.attributes.name === name);
    if (matches.length !== 1)
      throw new Error(`Expected one TestFlight group named ${name}`);
    return matches[0];
  });
  // Associations are reconciled before retrying, including after a lost response.
  const existing = await store.list(`/v1/builds/${build.id}/betaGroups`);
  for (const group of selected) {
    if (!existing.some((g) => g.id === group.id))
      await store.json(`/v1/betaGroups/${group.id}/relationships/builds`, {
        method: "POST",
        body: JSON.stringify({ data: [{ type: "builds", id: build.id }] }),
      });
  }
  const detail = (await store.json(`/v1/builds/${build.id}/buildBetaDetail`))
    .data;
  if (selected.some((g) => !g.attributes.isInternalGroup)) {
    const external = detail.attributes.externalBuildState;
    if (["REJECTED", "BETA_REJECTED"].includes(external))
      throw new Error(
        "Apple rejected the beta build; inspect TestFlight before retrying",
      );
    if (!detail.attributes.autoNotifyEnabled)
      await store.json(`/v1/buildBetaDetails/${detail.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          data: {
            type: "buildBetaDetails",
            id: detail.id,
            attributes: { autoNotifyEnabled: true },
          },
        }),
      });
    if (external === "READY_FOR_BETA_SUBMISSION") {
      if (state.reviewIntent)
        throw new Error(
          "Beta review submission outcome is uncertain; check TestFlight before retrying",
        );
      state.reviewIntent = true;
      await saveJSON(stateFile, state);
      await store.json("/v1/betaAppReviewSubmissions", {
        method: "POST",
        body: JSON.stringify({
          data: {
            type: "betaAppReviewSubmissions",
            relationships: {
              build: { data: { type: "builds", id: build.id } },
            },
          },
        }),
      });
      state.phase = "submitted";
    } else if (["WAITING_FOR_BETA_REVIEW", "IN_BETA_REVIEW"].includes(external))
      state.phase = "submitted";
    else if (external === "IN_BETA_TESTING") state.phase = "distributed";
    else
      throw new Error(`TestFlight external state needs attention: ${external}`);
  } else state.phase = "distributed";
  await saveJSON(stateFile, state);
  return state;
}
