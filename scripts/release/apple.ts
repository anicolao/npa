import { sign } from "node:crypto";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readJSON } from "./core";

export interface AppleCredentials {
  keyId: string;
  issuerId?: string;
  privateKeyPath: string;
}
export async function appleCredentials(): Promise<AppleCredentials> {
  const file =
    process.env.NPA_APPLE_CREDENTIALS ||
    path.join(os.homedir(), ".config/npa/apple-api.json");
  const stored = await readJSON(file).catch((error) => {
    if (error.code !== "ENOENT") throw error;
    return {};
  });
  const credentials = {
    keyId: process.env.ASC_KEY_ID || stored.keyId,
    issuerId: process.env.ASC_ISSUER_ID || stored.issuerId,
    privateKeyPath: process.env.ASC_PRIVATE_KEY_PATH || stored.privateKeyPath,
  };
  if (
    [credentials.keyId, credentials.privateKeyPath].some(
      (value) => typeof value !== "string" || !value,
    )
  )
    throw new Error(
      "Apple credentials missing: set NPA_APPLE_CREDENTIALS to a JSON file containing keyId, privateKeyPath, and issuerId for team keys, or set ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_PATH",
    );
  await fs.access(credentials.privateKeyPath);
  return credentials;
}
export function appleJWT(
  credentials: AppleCredentials,
  privateKey: string,
  now = Math.floor(Date.now() / 1000),
) {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const payload = `${encode({ alg: "ES256", kid: credentials.keyId, typ: "JWT" })}.${encode({ ...(credentials.issuerId ? { iss: credentials.issuerId } : { sub: "user" }), iat: now, exp: now + 300, aud: "appstoreconnect-v1" })}`;
  return `${payload}.${sign("sha256", Buffer.from(payload), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}
export class AppleStore {
  constructor(
    readonly credentials: AppleCredentials,
    private request: typeof fetch = fetch,
  ) {}
  async json(resource: string, init: RequestInit = {}) {
    const url = new URL(resource, "https://api.appstoreconnect.apple.com");
    if (url.origin !== "https://api.appstoreconnect.apple.com")
      throw new Error("Unexpected Apple API URL");
    const token = appleJWT(
      this.credentials,
      await fs.readFile(this.credentials.privateKeyPath, "utf8"),
    );
    const response = await this.request(url.toString(), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok)
      throw new Error(`App Store Connect API failed (HTTP ${response.status})`);
    if (response.status === 204) return {};
    return response.json();
  }
  async list(resource: string) {
    const items: any[] = [];
    let next: string | undefined = resource;
    const visited = new Set<string>();
    while (next) {
      if (visited.has(next))
        throw new Error("Repeated Apple API pagination URL");
      visited.add(next);
      const page = await this.json(next);
      items.push(...page.data);
      next = page.links?.next;
    }
    return items;
  }
  async app(bundleId: string) {
    const apps = await this.list(
      `/v1/apps?${new URLSearchParams({ "filter[bundleId]": bundleId })}`,
    );
    if (apps.length !== 1 || apps[0].attributes.bundleId !== bundleId)
      throw new Error("Expected exactly one matching App Store Connect app");
    return apps[0];
  }
  async builds(appId: string, version: string) {
    return this.list(
      `/v1/builds?${new URLSearchParams({ "filter[app]": appId, "filter[preReleaseVersion.version]": version, "filter[preReleaseVersion.platform]": "IOS", limit: "200" })}`,
    );
  }
}
