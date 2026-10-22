import * as fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ChromeStore,
  checkRemoteVersion,
  credentialsFromEnvironment,
  deployChrome,
} from "./release/chrome";
import {
  buildChrome,
  nextPatch,
  readJSON,
  requireClean,
  run,
  verifyArtifact,
  versionParts,
  withLock,
} from "./release/core";

import { AppleStore, appleCredentials } from "./release/apple";
import {
  FirefoxStore,
  buildFirefox,
  deployFirefox,
  firefoxCredentials,
  verifyFirefox,
} from "./release/firefox";
import {
  buildIOS,
  deployIOS,
  iosBuildNumber,
  verifyIOS,
  verifyNativeSource,
} from "./release/ios";
import { authorize } from "./release/oauth";

export function parseArgs(args: string[]) {
  const positional: string[] = [];
  const options: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") continue;
    if (["--preview", "--auto-publish", "--help"].includes(arg))
      options[arg.slice(2)] = true;
    else if (
      [
        "--target",
        "--channel",
        "--version",
        "--client-file",
        "--build-number",
      ].includes(arg)
    ) {
      const value = args[++i];
      if (!value || value.startsWith("--"))
        throw new Error(`Missing value for ${arg}`);
      options[arg.slice(2)] = value;
    } else if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    else positional.push(arg);
  }
  const command = positional[0] || "help";
  if (
    ![
      "auth",
      "help",
      "build",
      "patch",
      "postversion",
      "deploy",
      "resume",
      "status",
      "preflight",
    ].includes(command)
  )
    throw new Error(`Unknown release command: ${command}`);
  if (options["client-file"] && command !== "auth")
    throw new Error("--client-file is only valid with auth");
  if (command === "auth" && options.target && options.target !== "chrome")
    throw new Error(
      "auth is for Chrome OAuth; Firefox and iOS use local API credentials",
    );
  if (command === "auth" && !options["client-file"])
    throw new Error("auth requires --client-file PATH");
  if (
    options.target &&
    !["chrome", "ios", "firefox"].includes(String(options.target))
  )
    throw new Error("Supported targets: chrome, firefox, ios.");
  if (options["build-number"] && options.target !== "ios")
    throw new Error("--build-number requires --target ios");
  if (options.channel && options.channel !== "alpha")
    throw new Error("Only the alpha channel is configured");
  if (
    options["auto-publish"] &&
    !["patch", "postversion", "deploy", "resume"].includes(command)
  ) {
    throw new Error(
      "--auto-publish requires patch, postversion, deploy, or resume",
    );
  }
  if (options.preview && command !== "build")
    throw new Error("--preview is only valid with build");
  if (options.version && command !== "build")
    throw new Error("--version is only valid with build");
  if (
    positional.length > 2 ||
    (positional[1] && !["resume", "deploy", "status"].includes(command))
  )
    throw new Error("Unexpected positional argument");
  return { command, version: positional[1], options };
}
const help = `Release commands:
  bun run release -- build --target ios --version 2.2.90 --build-number 1 --preview
  bun run release -- auth --client-file /path/to/downloaded-client.json
  bun run release -- build --preview --version 2.2.90
  bun run release -- build                         # clean, committed current version
  bun run release -- patch --auto-publish          # bump, check, commit, package, push, submit
  bun run release -- resume 2.2.90 --auto-publish   # no bump/rebuild
  bun run release -- status 2.2.90
  bun run release -- preflight                     # check API access/version only
  bun run release -- deploy 2.2.90 --target ios --auto-publish
  bun run release -- resume 2.2.90 --target ios --auto-publish
  bun run release -- preflight --target ios
  bun run release -- build --target firefox --version 2.2.90 --preview
  bun run release -- deploy 2.2.90 --target firefox --auto-publish
  bun run release -- resume 2.2.90 --target firefox --auto-publish
  bun run release -- preflight --target firefox
iOS defaults to build number 1; use --build-number for a replacement build.
All targets use --channel alpha.
Without --auto-publish, patch/postversion package locally; they do not push or upload.
Preview ZIPs are for local testing and cannot be deployed.
See RELEASE.md for one-time OAuth setup and recovery.`;

function checks(root: string) {
  console.log("Checking dependencies, lint, and tests...");
  run("bun", ["install", "--frozen-lockfile"], root);
  run("bun", ["run", "lint"], root);
  run("bun", ["run", "test:unit"], root);
}
async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const {
    command,
    version: argumentVersion,
    options,
  } = parseArgs(process.argv.slice(2));
  if (command === "help" || options.help) {
    console.log(help);
    return;
  }
  const config = await readJSON(path.join(root, "release.config.json"));
  if (config.schema !== 1 || config.channel !== "alpha")
    throw new Error("Unsupported release configuration");
  if (command === "auth") {
    await authorize(String(options["client-file"]), config.chrome);
    return;
  }
  const pkgFile = path.join(root, "package.json");
  const pkg = await readJSON(pkgFile);
  const version = argumentVersion || String(options.version || pkg.version);
  versionParts(version);
  if (options.target === "firefox") {
    if (!config.firefox)
      throw new Error("Firefox destination is not configured");
    const store = async () =>
      new FirefoxStore(config.firefox, await firefoxCredentials());
    if (["preflight", "status"].includes(command)) {
      const client = await store();
      const addon = await client.preflight();
      console.log(
        JSON.stringify(
          {
            id: addon.id,
            guid: addon.guid,
            versions: (await client.versions())
              .filter((v) => command === "preflight" || v.version === version)
              .slice(0, command === "preflight" ? 1 : undefined)
              .map((v) => ({
                id: v.id,
                version: v.version,
                channel: v.channel,
                status: v.file.status,
              })),
          },
          null,
          2,
        ),
      );
      return;
    }
    if (!["build", "deploy", "resume"].includes(command))
      throw new Error(
        "Firefox supports build, deploy, resume, preflight and status. Use the existing web release version; do not bump again.",
      );
    await withLock(root, async () => {
      if (command === "build") {
        await buildFirefox(root, version, !!options.preview, config.firefox);
        return;
      }
      if (!options["auto-publish"])
        throw new Error("Firefox deploy/resume requires --auto-publish");
      requireClean(root);
      const client = await store();
      await client.preflight();
      const dir = path.join(root, "releases", version, "firefox");
      let record: import("./release/firefox").FirefoxRecord;
      try {
        record = await readJSON(path.join(dir, "firefox-release.json"));
      } catch (error) {
        if (error.code !== "ENOENT" || command === "resume") throw error;
        if ((await client.versions()).some((v) => v.version === version))
          throw new Error("Firefox version already exists");
        record = (await buildFirefox(root, version, false, config.firefox))
          .record;
      }
      if (record.version !== version)
        throw new Error("Firefox release version mismatch");
      await verifyFirefox(dir, record);
      if (run("git", ["branch", "--show-current"], root) !== config.git.branch)
        throw new Error(`Release from ${config.git.branch}`);
      run(
        "git",
        ["merge-base", "--is-ancestor", record.sourceCommit, "HEAD"],
        root,
      );
      run(
        "git",
        ["merge-base", "--is-ancestor", record.wrapperCommit, "HEAD"],
        root,
      );
      run(
        "git",
        ["push", config.git.remote, `HEAD:refs/heads/${config.git.branch}`],
        root,
      );
      let result = await deployFirefox(dir, record, client);
      for (
        let attempt = 0;
        result.phase === "validating" && attempt < 120;
        attempt++
      ) {
        console.log(
          "Waiting 15 seconds for Mozilla validation; interrupt safely and resume later.",
        );
        await new Promise((resolve) => setTimeout(resolve, 15_000));
        result = await deployFirefox(dir, record, client);
      }
      console.log(JSON.stringify(result, null, 2));
      console.log(
        "Mozilla reviews the listed alpha update and publishes it after approval. Use status to check availability.",
      );
    });
    return;
  }
  if (options.target === "ios") {
    if (["preflight", "status"].includes(command)) {
      const store = new AppleStore(await appleCredentials());
      const app = await store.app(config.ios.bundleId);
      console.log(
        JSON.stringify(
          {
            app: { id: app.id, bundleId: app.attributes.bundleId },
            builds: await store.builds(app.id, version),
          },
          null,
          2,
        ),
      );
      return;
    }
    if (!["build", "deploy", "resume"].includes(command))
      throw new Error(
        "iOS supports build, deploy, resume, preflight and status. Use the existing web release version; do not bump again.",
      );
    const buildNumber = iosBuildNumber(String(options["build-number"] || "1"));
    await withLock(root, async () => {
      if (command === "build") {
        await buildIOS(
          root,
          version,
          buildNumber,
          !!options.preview,
          config.ios,
        );
        return;
      }
      if (!options["auto-publish"])
        throw new Error("iOS deploy/resume requires --auto-publish");
      requireClean(root);
      const store = new AppleStore(await appleCredentials());
      const app = await store.app(config.ios.bundleId);
      const dir = path.join(root, "releases", version, `ios-${buildNumber}`);
      let record: import("./release/ios").IOSRecord;
      try {
        record = await readJSON(path.join(dir, "ios-release.json"));
      } catch (error) {
        if (error.code !== "ENOENT" || command === "resume") throw error;
        if (
          (await store.builds(app.id, version)).some(
            (b) => b.attributes.version === buildNumber,
          )
        )
          throw new Error(
            "iOS build number already uploaded; choose --build-number",
          );
        record = (await buildIOS(root, version, buildNumber, false, config.ios))
          .record;
      }
      if (
        record.version !== version ||
        record.buildNumber !== buildNumber ||
        JSON.stringify(record.config) !== JSON.stringify(config.ios)
      )
        throw new Error("iOS release configuration changed");
      await verifyIOS(dir, record);
      verifyNativeSource(root, record.sourceCommit);
      if (run("git", ["branch", "--show-current"], root) !== config.git.branch)
        throw new Error(`Release from ${config.git.branch}`);
      run(
        "git",
        ["push", config.git.remote, `HEAD:refs/heads/${config.git.branch}`],
        root,
      );
      let result = await deployIOS(dir, record, store);
      for (
        let attempt = 0;
        result.phase === "processing" && attempt < 120;
        attempt++
      ) {
        console.log(
          "Waiting 15 seconds for Apple processing; interrupt safely and resume this version later.",
        );
        await new Promise((resolve) => setTimeout(resolve, 15_000));
        result = await deployIOS(dir, record, store);
      }
      console.log(JSON.stringify(result, null, 2));
    });
    return;
  }
  const store = async () =>
    new ChromeStore(config.chrome, await credentialsFromEnvironment());
  if (command === "status") {
    console.log(JSON.stringify(await (await store()).status(), null, 2));
    return;
  }
  if (command === "preflight") {
    checkRemoteVersion(await (await store()).status(), nextPatch(pkg.version));
    console.log(`Chrome API preflight passed for ${nextPatch(pkg.version)}`);
    return;
  }
  await withLock(root, async () => {
    if (command === "build") {
      checks(root);
      await buildChrome(root, version, !!options.preview);
      return;
    }
    let releaseVersion = version;
    let client: ChromeStore | undefined;
    if (command === "patch") {
      requireClean(root);
      if (run("git", ["branch", "--show-current"], root) !== config.git.branch)
        throw new Error(`Release from ${config.git.branch}`);
      releaseVersion = nextPatch(pkg.version);
      if (options["auto-publish"]) {
        client = await store();
        checkRemoteVersion(await client.status(), releaseVersion);
      }
      checks(root);
      requireClean(root);
      // No npm version invocation: this owns the bump and avoids hook recursion.
      pkg.version = releaseVersion;
      await fs.writeFile(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
      run("git", ["add", "package.json"], root);
      run("git", ["commit", "-m", `release: ${releaseVersion} alpha`], root);
      console.log(
        `Version committed. If interrupted, run postversion or resume ${releaseVersion}; do not run patch again.`,
      );
    }
    let release: Awaited<ReturnType<typeof buildChrome>>;
    const dir = path.join(root, "releases", releaseVersion);
    if (command === "patch" || command === "postversion") {
      if (command === "postversion") {
        requireClean(root);
        checks(root);
        requireClean(root);
      }
      try {
        const record = await readJSON(path.join(dir, "release.json"));
        if (record.sourceCommit !== run("git", ["rev-parse", "HEAD"], root))
          throw new Error("Existing release was built from another commit");
        await verifyArtifact(dir, record);
        release = { dir, record };
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        release = await buildChrome(root, releaseVersion);
      }
    } else {
      release = { dir, record: await readJSON(path.join(dir, "release.json")) };
      if (release.record.version !== releaseVersion)
        throw new Error("Release record version mismatch");
      await verifyArtifact(dir, release.record);
    }
    if (!options["auto-publish"]) {
      console.log(
        `Packaged locally. To push and submit: bun run release -- resume ${releaseVersion} --auto-publish`,
      );
      return;
    }
    if (release.record.preview) throw new Error("Cannot deploy a preview");
    client ||= await store();
    // Verify authentication before creating/pushing a release tag, including resumes.
    await client.status();
    // Keep source reachable before submitting to the store. Never force push or push unrelated tags.
    requireClean(root);
    const commit = release.record.sourceCommit;
    if (run("git", ["rev-parse", "HEAD"], root) !== commit)
      throw new Error("Check out the release commit before deploying");
    if (run("git", ["branch", "--show-current"], root) !== config.git.branch)
      throw new Error(`Release from ${config.git.branch}`);
    const tag = `${config.git.tagPrefix}${releaseVersion}`;
    const tags = run("git", ["tag", "--list", tag], root);
    if (tags) {
      if (run("git", ["rev-parse", `${tag}^{commit}`], root) !== commit)
        throw new Error(`Tag ${tag} points to another commit`);
    } else
      run(
        "git",
        ["tag", "-a", tag, "-m", `NPA ${releaseVersion} alpha`, commit],
        root,
      );
    run(
      "git",
      [
        "push",
        "--atomic",
        config.git.remote,
        `HEAD:refs/heads/${config.git.branch}`,
        `refs/tags/${tag}`,
      ],
      root,
    );
    console.log(
      JSON.stringify(
        await deployChrome(release.dir, release.record, client),
        null,
        2,
      ),
    );
    console.log(
      "Submission recorded. Pending review is not yet published; use release status to check availability.",
    );
  });
}
if (import.meta.main)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
