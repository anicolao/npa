import { generateKeyPairSync, verify } from "node:crypto";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AppleStore, appleJWT } from "../scripts/release/apple";
import {
  hashTree,
  iosBuildNumber,
  prepareIOSDirectory,
} from "../scripts/release/ios";

const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const privateKey = keys.privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();
describe("iOS release", () => {
  it("validates Apple build numbers before using them as paths", () => {
    for (const value of ["1", "9999.99.99", "12.0"])
      expect(iosBuildNumber(value)).toBe(value);
    for (const value of ["0", "01", "1/../../tmp", "10000", "1.100", "1.2.3.4"])
      expect(() => iosBuildNumber(value)).toThrow();
  });
  it("detects artifact additions, modifications, and symlinks", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "ios-release-test-"),
    );
    try {
      await fs.writeFile(path.join(directory, "intel.js"), "original");
      const original = await hashTree(directory);
      await fs.writeFile(path.join(directory, "intel.js"), "changed");
      expect(await hashTree(directory)).not.toEqual(original);
      await fs.symlink("intel.js", path.join(directory, "link"));
      await expect(hashTree(directory)).rejects.toThrow("Unsupported");
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
  it("signs short-lived ES256 JWTs for team and individual keys", () => {
    for (const issuerId of ["issuer", undefined]) {
      const token = appleJWT(
        { keyId: "KEY", issuerId, privateKeyPath: "unused" },
        privateKey,
        100,
      );
      const [header, claims, signature] = token.split(".");
      const payload = JSON.parse(Buffer.from(claims, "base64url").toString());
      expect(payload).toMatchObject({
        iat: 100,
        exp: 400,
        aud: "appstoreconnect-v1",
      });
      expect(payload.iss).toBe(issuerId);
      expect(payload.sub).toBe(issuerId ? undefined : "user");
      expect(
        verify(
          "sha256",
          Buffer.from(`${header}.${claims}`),
          { key: keys.publicKey, dsaEncoding: "ieee-p1363" },
          Buffer.from(signature, "base64url"),
        ),
      ).toBe(true);
    }
  });
  it("rejects pagination outside Apple before transmitting credentials", async () => {
    const store = new AppleStore({
      keyId: "KEY",
      privateKeyPath: "nonexistent",
    });
    await expect(store.json("https://example.com/collect")).rejects.toThrow(
      "Unexpected Apple API URL",
    );
  });
});

import { afterEach, beforeEach, vi } from "vitest";
import { readJSON, saveJSON, sha256 } from "../scripts/release/core";
import { type IOSRecord, deployIOS } from "../scripts/release/ios";

describe.skipIf(process.platform !== "darwin")(
  "iOS deployment recovery",
  () => {
    let directory: string;
    let record: IOSRecord;
    let store: AppleStore;
    let builds: ReturnType<typeof vi.spyOn>;
    beforeEach(async () => {
      directory = await fs.mkdtemp(path.join(os.tmpdir(), "ios-deploy-test-"));
      const app = "NPAiOS.xcarchive/Products/Applications/NPAiOS.app";
      await fs.mkdir(path.join(directory, app, "Dist"), { recursive: true });
      await fs.writeFile(
        path.join(directory, app, "Info.plist"),
        JSON.stringify({
          CFBundleIdentifier: "com.spnss.npa",
          CFBundleShortVersionString: "2.2.90",
          CFBundleVersion: "1",
        }),
      );
      await fs.writeFile(path.join(directory, app, "Dist/intel.js"), "js");
      await fs.writeFile(path.join(directory, app, "Dist/intel.css"), "css");
      record = {
        schema: 1,
        version: "2.2.90",
        buildNumber: "1",
        preview: false,
        sourceCommit: "native",
        webSourceCommit: "web",
        webArchiveHash: "zip",
        config: {
          bundleId: "com.spnss.npa",
          teamId: "TEAM",
          scheme: "NPAiOS",
          developerDir: "/Applications/Xcode.app/Contents/Developer",
          betaGroups: ["Internal", "Discord Public Beta"],
        },
        assets: { "intel.css": sha256("css"), "intel.js": sha256("js") },
        app,
        archive: "NPAiOS.xcarchive",
        files: await hashTree(path.join(directory, "NPAiOS.xcarchive")),
      };
      await fs.mkdir(path.join(directory, "export"));
      await fs.writeFile(path.join(directory, "export/NPAiOS.ipa"), "fixture");
      await saveJSON(path.join(directory, "ios-export.json"), {
        file: "export/NPAiOS.ipa",
        sha256: sha256("fixture"),
      });
      store = new AppleStore({
        keyId: "KEY",
        issuerId: "issuer",
        privateKeyPath: "unused",
      });
      vi.spyOn(store, "app").mockResolvedValue({
        id: "app",
        attributes: { bundleId: "com.spnss.npa", primaryLocale: "en-US" },
      });
      builds = vi.spyOn(store, "builds").mockResolvedValue([]);
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await fs.rm(directory, { recursive: true, force: true });
    });
    it("records intent before upload and refuses blind retries after a lost response", async () => {
      const upload = vi.fn(() => {
        throw new Error("lost response");
      });
      await expect(deployIOS(directory, record, store, upload)).rejects.toThrow(
        "lost response",
      );
      expect(
        (await readJSON(path.join(directory, "ios-state.json"))).phase,
      ).toBe("uploading");
      await expect(deployIOS(directory, record, store, upload)).rejects.toThrow(
        "uncertain",
      );
      expect(upload).toHaveBeenCalledTimes(1);
    });
    it("waits for processing without duplicating an acknowledged upload", async () => {
      const upload = vi.fn();
      expect((await deployIOS(directory, record, store, upload)).phase).toBe(
        "processing",
      );
      expect((await deployIOS(directory, record, store, upload)).phase).toBe(
        "processing",
      );
      expect(upload).toHaveBeenCalledTimes(1);
    });
    it("rejects an existing build with no local receipt and modified IPAs", async () => {
      builds.mockResolvedValue([
        { id: "build", attributes: { version: "1", processingState: "VALID" } },
      ]);
      await expect(
        deployIOS(directory, record, store, vi.fn()),
      ).rejects.toThrow("already exists");
      await fs.appendFile(path.join(directory, "export/NPAiOS.ipa"), "changed");
      await expect(
        deployIOS(directory, record, store, vi.fn()),
      ).rejects.toThrow("checksum");
    });
    it("reconciles group membership and beta review after upload", async () => {
      const upload = vi.fn();
      await deployIOS(directory, record, store, upload);
      builds.mockResolvedValue([
        { id: "build", attributes: { version: "1", processingState: "VALID" } },
      ]);
      const groups = [
        {
          id: "internal",
          attributes: { name: "Internal", isInternalGroup: true },
        },
        {
          id: "external",
          attributes: { name: "Discord Public Beta", isInternalGroup: false },
        },
      ];
      vi.spyOn(store, "list").mockImplementation(async (resource) =>
        resource.includes("betaBuildLocalizations")
          ? [{ id: "localization" }]
          : groups,
      );
      let externalState = "READY_FOR_BETA_SUBMISSION";
      const json = vi
        .spyOn(store, "json")
        .mockImplementation(async (resource) =>
          resource.endsWith("/buildBetaDetail")
            ? {
                data: {
                  id: "detail",
                  attributes: {
                    externalBuildState: externalState,
                    autoNotifyEnabled: true,
                  },
                },
              }
            : {},
        );
      expect((await deployIOS(directory, record, store, upload)).phase).toBe(
        "submitted",
      );
      externalState = "WAITING_FOR_BETA_REVIEW";
      expect((await deployIOS(directory, record, store, upload)).phase).toBe(
        "submitted",
      );
      expect(
        json.mock.calls.filter(
          ([url]) => url === "/v1/betaAppReviewSubmissions",
        ),
      ).toHaveLength(1);
      expect(upload).toHaveBeenCalledTimes(1);
    });
  },
);

describe("interrupted iOS build recovery", () => {
  it("preserves interrupted staging and opens a fresh build directory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ios-retry-"));
    const dir = path.join(root, "ios-1");
    try {
      await fs.mkdir(dir);
      await fs.writeFile(path.join(dir, "staged-source"), "keep");
      await prepareIOSDirectory(dir);
      expect(await fs.readdir(dir)).toEqual([]);
      const retained = (await fs.readdir(root)).find((name) =>
        name.startsWith("ios-1.incomplete-"),
      );
      expect(
        await fs.readFile(
          path.join(root, retained || "missing", "staged-source"),
          "utf8",
        ),
      ).toBe("keep");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
  it.each(["ios-release.json", "ios-export.json", "ios-state.json"])(
    "never replaces a directory with %s",
    async (receipt) => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "ios-retry-"));
      const dir = path.join(root, "ios-1");
      try {
        await fs.mkdir(dir);
        await fs.writeFile(path.join(dir, receipt), "{}");
        await expect(prepareIOSDirectory(dir)).rejects.toThrow("use resume");
        expect(await fs.readdir(root)).toEqual(["ios-1"]);
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    },
  );
});
