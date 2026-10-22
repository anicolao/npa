import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseArgs } from "../scripts/release";
import {
  ChromeStore,
  checkRemoteVersion,
  deployChrome,
} from "../scripts/release/chrome";
import {
  type ReleaseRecord,
  compareVersions,
  nextPatch,
  readJSON,
  run,
  saveJSON,
  sha256,
  validateManifest,
  verifyArtifact,
  versionParts,
  withLock,
} from "../scripts/release/core";

const destination = { publisherId: "publisher-1", extensionId: "a".repeat(32) };
const credentials = {
  clientId: "client",
  clientSecret: "SECRET",
  refreshToken: "REFRESH",
};
const manifest = {
  version: "2.2.90",
  manifest_version: 3,
  background: { service_worker: "background.js" },
  icons: { 16: "icon.png" },
};
let dir: string;
let record: ReleaseRecord;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "npa-release-test-"));
  const files = {
    "manifest.json": JSON.stringify(manifest),
    "intel.js": "// NPA",
    "intel.css": "body {}",
    "background.js": "// background",
    "icon.png": "icon",
  };
  for (const [name, value] of Object.entries(files))
    await fs.writeFile(path.join(dir, name), value);
  run("zip", ["-q", "chrome-2.2.90.zip", ...Object.keys(files)], dir);
  record = {
    schema: 1,
    version: "2.2.90",
    channel: "alpha",
    preview: false,
    sourceCommit: "abc",
    sourceDigest: "def",
    createdAt: "now",
    tools: { bun: "1" },
    chrome: {
      file: "chrome-2.2.90.zip",
      sha256: sha256(await fs.readFile(path.join(dir, "chrome-2.2.90.zip"))),
      files: {},
    },
  };
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});
const oldStatus = {
  publishedItemRevisionStatus: {
    state: "PUBLISHED",
    distributionChannels: [{ crxVersion: "2.2.89" }],
  },
};
function mockStore() {
  return {
    destination,
    status: vi.fn().mockResolvedValue(oldStatus),
    upload: vi
      .fn()
      .mockResolvedValue({ uploadState: "SUCCEEDED", crxVersion: "2.2.90" }),
    publish: vi.fn().mockResolvedValue({ state: "PENDING_REVIEW" }),
  };
}

describe("release inputs and artifacts", () => {
  it("bumps numeric patch versions and rejects invalid or overflowing versions", () => {
    expect(nextPatch("2.2.89")).toBe("2.2.90");
    expect(compareVersions("2.2.90", "2.2.9")).toBeGreaterThan(0);
    for (const version of [
      "../other",
      "2.2.90-alpha",
      "02.2.90",
      "2.2.65536",
      "0.0.0",
    ])
      expect(() => versionParts(version)).toThrow();
    expect(() => nextPatch("2.2.65535")).toThrow();
  });
  it("rejects unsupported targets/options instead of deploying the wrong platform", () => {
    expect(
      parseArgs(["--", "build", "--preview", "--version", "2.2.90"]).options
        .preview,
    ).toBe(true);
    expect(() => parseArgs(["patch", "--target", "safari"])).toThrow(
      "Supported targets",
    );
    expect(() => parseArgs(["patch", "--auto-approve"])).toThrow(
      "Unknown option",
    );
    expect(() => parseArgs(["deploy", "--preview"])).toThrow();
  });
  it("validates ZIP integrity and refuses artifact replacement", async () => {
    await expect(verifyArtifact(dir, record)).resolves.toContain(
      "chrome-2.2.90.zip",
    );
    await fs.appendFile(path.join(dir, record.chrome.file), "tamper");
    await expect(verifyArtifact(dir, record)).rejects.toThrow("checksum");
  });
  it("rejects missing runtime assets and source maps in the upload package", () => {
    expect(() => validateManifest(manifest, "2.2.90", ["intel.js"])).toThrow(
      "Missing",
    );
    expect(() =>
      validateManifest(manifest, "2.2.90", [
        "intel.js",
        "intel.css",
        "background.js",
        "icon.png",
        "intel.js.map",
      ]),
    ).toThrow("Unexpected");
  });
  it("locks concurrent releases and releases the lock after failures", async () => {
    await withLock(dir, async () => {
      await expect(withLock(dir, async () => {})).rejects.toThrow(
        "lock exists",
      );
    });
    await expect(
      withLock(dir, async () => {
        throw Error("failure");
      }),
    ).rejects.toThrow("failure");
    await expect(withLock(dir, async () => 42)).resolves.toBe(42);
  });
});

describe("Chrome API", () => {
  it("uses v2 endpoints and publishes after review with a refreshed OAuth token", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ access_token: "TOKEN", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(Response.json(oldStatus))
      .mockResolvedValueOnce(Response.json({ uploadState: "SUCCEEDED" }))
      .mockResolvedValueOnce(Response.json({ state: "PENDING_REVIEW" }));
    const store = new ChromeStore(destination, credentials, request);
    await store.status();
    await store.upload(Buffer.from("zip"));
    await store.publish();
    expect(request.mock.calls[0][1].body.get("refresh_token")).toBe("REFRESH");
    expect(request.mock.calls[1][0]).toContain(
      "/v2/publishers/publisher-1/items/",
    );
    expect(request.mock.calls[2][0]).toContain("/upload/v2/");
    expect(request.mock.calls[2][1].headers.Authorization).toBe("Bearer TOKEN");
    expect(JSON.parse(request.mock.calls[3][1].body)).toEqual({
      publishType: "DEFAULT_PUBLISH",
      skipReview: false,
      deployInfos: [{ deployPercentage: 100 }],
    });
    expect(request).toHaveBeenCalledTimes(4);
  });
  it("does not expose credential-bearing error responses", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(new Response("SECRET REFRESH", { status: 401 }));
    const error = await new ChromeStore(destination, credentials, request)
      .status()
      .catch((e) => e);
    expect(error.message).toContain("401");
    expect(error.message).not.toMatch(/SECRET|REFRESH/);
  });
  it("rejects same/older versions and other pending submissions", () => {
    expect(() => checkRemoteVersion(oldStatus, "2.2.89")).toThrow(
      "already has",
    );
    expect(() =>
      checkRemoteVersion(
        {
          submittedItemRevisionStatus: {
            state: "PENDING_REVIEW",
            distributionChannels: [{ crxVersion: "2.2.88" }],
          },
        },
        "2.2.90",
      ),
    ).toThrow("pending");
  });
});

describe("resumable Chrome submission", () => {
  it("uploads once and reconciles review/publication on subsequent runs", async () => {
    const store = mockStore();
    expect((await deployChrome(dir, record, store as any)).phase).toBe(
      "submitted",
    );
    store.status.mockResolvedValue({
      submittedItemRevisionStatus: {
        state: "PENDING_REVIEW",
        distributionChannels: [{ crxVersion: "2.2.90" }],
      },
    } as any);
    expect((await deployChrome(dir, record, store as any)).phase).toBe(
      "submitted",
    );
    store.status.mockResolvedValue({
      publishedItemRevisionStatus: {
        state: "PUBLISHED",
        distributionChannels: [{ crxVersion: "2.2.90" }],
      },
    });
    expect((await deployChrome(dir, record, store as any)).phase).toBe(
      "published",
    );
    expect(store.upload).toHaveBeenCalledOnce();
    expect(store.publish).toHaveBeenCalledOnce();
  });
  it("blocks preview uploads and destination changes", async () => {
    const store = mockStore();
    await expect(
      deployChrome(dir, { ...record, preview: true }, store as any),
    ).rejects.toThrow("Preview");
    expect(store.status).not.toHaveBeenCalled();
    await saveJSON(path.join(dir, "chrome-state.json"), {
      phase: "uploaded",
      artifactHash: record.chrome.sha256,
      destination: { ...destination, publisherId: "other" },
    });
    await expect(deployChrome(dir, record, store as any)).rejects.toThrow(
      "destination",
    );
    expect(store.upload).not.toHaveBeenCalled();
  });
  it("never publishes after an ambiguous upload failure or reuploads automatically", async () => {
    const store = mockStore();
    store.upload.mockRejectedValue(new Error("lost connection"));
    await expect(deployChrome(dir, record, store as any)).rejects.toThrow(
      "lost connection",
    );
    expect((await readJSON(path.join(dir, "chrome-state.json"))).phase).toBe(
      "uploading",
    );
    await expect(deployChrome(dir, record, store as any)).rejects.toThrow(
      "uncertain",
    );
    expect(store.upload).toHaveBeenCalledOnce();
    expect(store.publish).not.toHaveBeenCalled();
  });
  it("resumes acknowledged asynchronous uploads without sending another ZIP", async () => {
    const store = mockStore();
    store.upload.mockResolvedValue({ uploadState: "IN_PROGRESS" } as any);
    store.status.mockResolvedValue({
      ...oldStatus,
      lastAsyncUploadState: "IN_PROGRESS",
    } as any);
    // First preflight must not see our upload before we have sent it.
    store.status.mockResolvedValueOnce(oldStatus);
    await expect(
      deployChrome(dir, record, store as any, async () => {}),
    ).rejects.toThrow("still processing");
    expect((await readJSON(path.join(dir, "chrome-state.json"))).phase).toBe(
      "processing",
    );
    store.status.mockResolvedValue({
      ...oldStatus,
      lastAsyncUploadState: "SUCCEEDED",
    } as any);
    expect((await deployChrome(dir, record, store as any)).phase).toBe(
      "submitted",
    );
    expect(store.upload).toHaveBeenCalledOnce();
  });
  it("reconciles a lost publish response and does not duplicate the submission", async () => {
    const store = mockStore();
    store.publish.mockRejectedValue(new Error("lost publish response"));
    await expect(deployChrome(dir, record, store as any)).rejects.toThrow(
      "lost publish",
    );
    await expect(deployChrome(dir, record, store as any)).rejects.toThrow(
      "not visible yet",
    );
    store.status.mockResolvedValue({
      submittedItemRevisionStatus: {
        state: "PENDING_REVIEW",
        distributionChannels: [{ crxVersion: "2.2.90" }],
      },
    } as any);
    expect((await deployChrome(dir, record, store as any)).phase).toBe(
      "submitted",
    );
    expect(store.publish).toHaveBeenCalledOnce();
  });
  it("does not retry a rejected submission", async () => {
    const store = mockStore();
    await deployChrome(dir, record, store as any);
    store.status.mockResolvedValue({
      submittedItemRevisionStatus: {
        state: "REJECTED",
        distributionChannels: [{ crxVersion: "2.2.90" }],
      },
    } as any);
    await expect(deployChrome(dir, record, store as any)).rejects.toThrow(
      "REJECTED",
    );
    expect(store.publish).toHaveBeenCalledOnce();
  });
});
