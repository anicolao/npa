import { createHmac } from "node:crypto";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, afterEach, expect, it } from "vitest";
import { parseArgs } from "../scripts/release";
import { readJSON, run, saveJSON, sha256 } from "../scripts/release/core";
import {
  FirefoxStore,
  type FirefoxRecord,
  amoToken,
  deployFirefox,
  verifyFirefox,
} from "../scripts/release/firefox";
const config = { addonId: 123, guid: "{example}" };
const credentials = { issuer: "user:1:2", secret: "TEST-SECRET" };
let dir: string;
let record: FirefoxRecord;
let calls: Array<{
  endpoint: string;
  method: string;
  body: FormData | undefined;
}>;
let versions: any[];
let valid: boolean;
let processed: boolean;
let loseSubmission: boolean;
let loseUpload: boolean;
let store: FirefoxStore;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "npa-firefox-test-"));
  await saveJSON(path.join(dir, "manifest.json"), {
    version: "2.2.90",
    browser_specific_settings: { gecko: { id: config.guid } },
  });
  run("zip", ["-q", "firefox-2.2.90.zip", "manifest.json"], dir);
  await fs.writeFile(
    path.join(dir, "firefox.source.2.2.90.tar.gz"),
    "test source",
  );
  record = {
    schema: 1,
    version: "2.2.90",
    preview: false,
    config,
    sourceCommit: "web",
    wrapperCommit: "wrapper",
    webSha256: "web-hash",
    extension: {
      file: "firefox-2.2.90.zip",
      sha256: sha256(await fs.readFile(path.join(dir, "firefox-2.2.90.zip"))),
    },
    source: {
      file: "firefox.source.2.2.90.tar.gz",
      sha256: sha256("test source"),
    },
  };
  calls = [];
  versions = [];
  valid = true;
  processed = true;
  loseSubmission = false;
  loseUpload = false;
  store = new FirefoxStore(config, credentials, (async (
    url: string,
    options: any,
  ) => {
    const endpoint = new URL(url).pathname + new URL(url).search;
    const method = options.method;
    calls.push({ endpoint, method, body: options.body });
    const respond = (value: unknown) =>
      new Response(JSON.stringify(value), { status: 200 });
    if (method === "GET" && endpoint === "/api/v5/addons/addon/123/")
      return respond({ guid: config.guid });
    if (
      method === "GET" &&
      endpoint.startsWith(
        "/api/v5/addons/addon/123/versions/?filter=all_with_unlisted",
      )
    )
      return respond({ results: versions, next: null });
    if (method === "POST" && endpoint === "/api/v5/addons/upload/") {
      if (loseUpload) throw new Error("lost upload response");
      return respond({ uuid: "upload-1" });
    }
    if (method === "GET" && endpoint === "/api/v5/addons/upload/upload-1/")
      return respond({
        processed,
        valid,
        version: "2.2.90",
        channel: "listed",
        submitted: false,
        validation: { errors: valid ? 0 : 1 },
      });
    if (
      method === "POST" &&
      endpoint === "/api/v5/addons/addon/123/versions/"
    ) {
      const version = {
        id: 44,
        version: "2.2.90",
        channel: "listed",
        source: "https://addons.mozilla.org/source",
        file: { status: "unreviewed" },
      };
      versions = [version];
      if (loseSubmission) throw new Error("lost submission response");
      return respond(version);
    }
    throw new Error(`Unsupported Mozilla contract: ${method} ${endpoint}`);
  }) as typeof fetch);
});
afterEach(async () => fs.rm(dir, { recursive: true, force: true }));
it("accepts Firefox as an explicit target", () =>
  expect(
    parseArgs(["deploy", "2.2.90", "--target", "firefox"]).options.target,
  ).toBe("firefox"));
it("uses fresh HS256 JWTs with Mozilla issuer and short expiry", () => {
  const [header, payload, signature] = amoToken(credentials).split(".");
  expect(JSON.parse(Buffer.from(header, "base64url").toString()).alg).toBe(
    "HS256",
  );
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  expect(claims.iss).toBe(credentials.issuer);
  expect(claims.exp - claims.iat).toBe(60);
  expect(signature).toBe(
    createHmac("sha256", credentials.secret)
      .update(`${header}.${payload}`)
      .digest("base64url"),
  );
  expect(amoToken(credentials)).not.toBe(amoToken(credentials));
});
it("submits the extension and source together and resumes without another POST", async () => {
  expect((await deployFirefox(dir, record, store)).phase).toBe("submitted");
  const posts = calls.filter((c) => c.method === "POST");
  expect(posts).toHaveLength(2);
  expect(posts[0].body?.get("channel")).toBe("listed");
  expect(posts[1].body?.get("upload")).toBe("upload-1");
  expect(await (posts[1].body?.get("source") as Blob).text()).toBe(
    "test source",
  );
  versions[0].file.status = "public";
  expect((await deployFirefox(dir, record, store)).phase).toBe("published");
  expect(calls.filter((c) => c.method === "POST")).toHaveLength(2);
});
it("waits for validation before attaching source and submitting", async () => {
  processed = false;
  expect((await deployFirefox(dir, record, store)).phase).toBe("validating");
  processed = true;
  expect((await deployFirefox(dir, record, store)).phase).toBe("submitted");
  expect(calls.filter((c) => c.method === "POST")).toHaveLength(2);
});
it("stops on rejected validation", async () => {
  valid = false;
  await expect(deployFirefox(dir, record, store)).rejects.toThrow(
    "validation failed",
  );
  expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
});
it("recovers a lost submission response without submitting twice", async () => {
  loseSubmission = true;
  await expect(deployFirefox(dir, record, store)).rejects.toThrow(
    "lost submission",
  );
  expect((await readJSON(path.join(dir, "firefox-state.json"))).phase).toBe(
    "submitting",
  );
  expect((await deployFirefox(dir, record, store)).phase).toBe("submitted");
  expect(calls.filter((c) => c.method === "POST")).toHaveLength(2);
});
it("does not blindly repeat an ambiguous upload", async () => {
  loseUpload = true;
  await expect(deployFirefox(dir, record, store)).rejects.toThrow(
    "lost upload",
  );
  await expect(deployFirefox(dir, record, store)).rejects.toThrow(
    "refusing a blind retry",
  );
  expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
});
it("refuses a pre-existing version without a matching receipt", async () => {
  versions = [{ version: record.version }];
  await expect(deployFirefox(dir, record, store)).rejects.toThrow(
    "without a matching",
  );
  expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
});
it("verifies both archives and refuses preview publication", async () => {
  await expect(verifyFirefox(dir, record)).resolves.toBeUndefined();
  await expect(
    deployFirefox(dir, { ...record, preview: true }, store),
  ).rejects.toThrow("preview");
  await fs.appendFile(path.join(dir, record.source.file), "tampered");
  await expect(deployFirefox(dir, record, store)).rejects.toThrow("checksum");
  expect(calls).toHaveLength(0);
});
it("refuses a different configured destination", async () => {
  await expect(
    deployFirefox(
      dir,
      { ...record, config: { ...config, addonId: 999 } },
      store,
    ),
  ).rejects.toThrow("destination changed");
  expect(calls).toHaveLength(0);
});
