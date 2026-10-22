import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  type ReleaseRecord,
  compareVersions,
  readJSON,
  run,
  saveJSON,
  validateProductionHosts,
  verifyArtifact,
} from "./core";

export interface Destination {
  publisherId: string;
  extensionId: string;
}
export interface Credentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}
export interface ChromeStatus {
  publishedItemRevisionStatus?: Revision;
  submittedItemRevisionStatus?: Revision;
  lastAsyncUploadState?: string;
}
interface Revision {
  state: string;
  distributionChannels?: { crxVersion: string }[];
}
export interface DeployState {
  destination: Destination;
  artifactHash: string;
  phase:
    | "packaged"
    | "uploading"
    | "processing"
    | "uploaded"
    | "submitting"
    | "submitted"
    | "published";
  remoteState?: string;
}
export async function credentialsFromEnvironment(): Promise<Credentials> {
  const file =
    process.env.NPA_RELEASE_CREDENTIALS ||
    path.join(os.homedir(), ".config/npa/chrome-oauth.json");
  let stored: Partial<Credentials> = {};
  try {
    stored = await readJSON(file);
  } catch (error) {
    if (
      process.env.NPA_RELEASE_CREDENTIALS ||
      (error as NodeJS.ErrnoException).code !== "ENOENT"
    )
      throw error;
  }
  const credentials = {
    clientId: process.env.CWS_CLIENT_ID || stored.clientId,
    clientSecret: process.env.CWS_CLIENT_SECRET || stored.clientSecret,
    refreshToken: process.env.CWS_REFRESH_TOKEN || stored.refreshToken,
  };
  if (Object.values(credentials).some((v) => typeof v !== "string" || !v)) {
    throw new Error(
      "Chrome OAuth credentials missing. Set NPA_RELEASE_CREDENTIALS to your private JSON file (clientId, clientSecret, refreshToken), or set CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN.",
    );
  }
  return credentials;
}
export class ChromeStore {
  readonly name: string;
  private token?: string;
  private expires = 0;
  constructor(
    readonly destination: Destination,
    private credentials: Credentials,
    private request: typeof fetch = fetch,
  ) {
    if (
      !/^[a-zA-Z0-9-]+$/.test(destination.publisherId) ||
      !/^[a-p]{32}$/.test(destination.extensionId)
    )
      throw new Error("Invalid Chrome publisher or extension ID");
    this.name = `publishers/${destination.publisherId}/items/${destination.extensionId}`;
  }
  private async json(url: string, init: RequestInit) {
    const response = await this.request(url, {
      ...init,
      signal: AbortSignal.timeout(120_000),
    });
    // Do not print response bodies: OAuth failures can echo credential values.
    if (!response.ok)
      throw new Error(
        `Chrome API request failed (HTTP ${response.status}); check credentials and developer dashboard.`,
      );
    return response.json();
  }
  private async auth() {
    if (!this.token || Date.now() > this.expires) {
      const data = await this.json("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: this.credentials.clientId,
          client_secret: this.credentials.clientSecret,
          refresh_token: this.credentials.refreshToken,
        }),
      });
      if (!data.access_token)
        throw new Error("OAuth response did not contain an access token");
      this.token = data.access_token;
      this.expires =
        Date.now() + Math.max(0, (data.expires_in || 3600) - 60) * 1000;
    }
    return { Authorization: `Bearer ${this.token}` };
  }
  async status(): Promise<ChromeStatus> {
    return this.json(
      `https://chromewebstore.googleapis.com/v2/${this.name}:fetchStatus`,
      { headers: await this.auth() },
    );
  }
  async upload(zip: Buffer) {
    return this.json(
      `https://chromewebstore.googleapis.com/upload/v2/${this.name}:upload`,
      {
        method: "POST",
        headers: { ...(await this.auth()), "Content-Type": "application/zip" },
        body: zip,
      },
    );
  }
  async publish() {
    return this.json(
      `https://chromewebstore.googleapis.com/v2/${this.name}:publish`,
      {
        method: "POST",
        headers: { ...(await this.auth()), "Content-Type": "application/json" },
        body: JSON.stringify({
          publishType: "DEFAULT_PUBLISH",
          skipReview: false,
          deployInfos: [{ deployPercentage: 100 }],
        }),
      },
    );
  }
}
export const containsVersion = (
  revision: Revision | undefined,
  version: string,
) =>
  revision?.distributionChannels?.some((c) => c.crxVersion === version) ??
  false;
export function checkRemoteVersion(status: ChromeStatus, version: string) {
  for (const revision of [
    status.publishedItemRevisionStatus,
    status.submittedItemRevisionStatus,
  ]) {
    for (const channel of revision?.distributionChannels || []) {
      if (compareVersions(channel.crxVersion, version) >= 0)
        throw new Error(
          `Chrome already has version ${channel.crxVersion}; use resume for an existing release.`,
        );
    }
  }
  if (
    ["PENDING_REVIEW", "STAGED"].includes(
      status.submittedItemRevisionStatus?.state || "",
    )
  )
    throw new Error(
      "Another Chrome submission is pending; resolve it before releasing.",
    );
  if (
    ["IN_PROGRESS", "UPLOAD_IN_PROGRESS"].includes(
      status.lastAsyncUploadState || "",
    )
  )
    throw new Error("Another Chrome upload is in progress.");
}
// Save intent before each mutation. If a response is lost, resume reconciles with
// the store instead of silently publishing an unrelated draft or uploading twice.
export async function deployChrome(
  dir: string,
  record: ReleaseRecord,
  store: ChromeStore,
  pause: () => Promise<void> = () => new Promise((r) => setTimeout(r, 5000)),
) {
  if (record.preview)
    throw new Error(
      "Preview builds cannot be deployed. Make a clean release build first.",
    );
  const zip = await verifyArtifact(dir, record);
  validateProductionHosts(
    JSON.parse(run("unzip", ["-p", zip, "manifest.json"], dir)),
  );
  const stateFile = path.join(dir, "chrome-state.json");
  let state: DeployState;
  try {
    state = await readJSON(stateFile);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    state = {
      destination: store.destination,
      artifactHash: record.chrome.sha256,
      phase: "packaged",
    };
  }
  if (
    state.artifactHash !== record.chrome.sha256 ||
    state.destination.publisherId !== store.destination.publisherId ||
    state.destination.extensionId !== store.destination.extensionId
  )
    throw new Error(
      "Deployment destination or artifact changed since the first attempt",
    );
  const save = () => saveJSON(stateFile, state);
  let status = await store.status();
  if (containsVersion(status.publishedItemRevisionStatus, record.version)) {
    if (state.phase === "packaged")
      throw new Error(
        "This version is already published without a matching local deployment receipt",
      );
    state.phase = "published";
    await save();
    return state;
  }
  if (containsVersion(status.submittedItemRevisionStatus, record.version)) {
    const remote = status.submittedItemRevisionStatus.state;
    state.remoteState = remote;
    if (remote === "REJECTED" || remote === "CANCELLED") {
      await save();
      throw new Error(
        `Chrome submission ${remote}; inspect the dashboard before retrying.`,
      );
    }
    if (state.phase === "packaged")
      throw new Error(
        "This version was submitted outside this release; inspect the dashboard",
      );
    if (remote === "PENDING_REVIEW" || remote.startsWith("PUBLISHED")) {
      state.phase = remote.startsWith("PUBLISHED") ? "published" : "submitted";
      await save();
      return state;
    }
    // A previously staged revision is deliberately not auto-published by resume.
    throw new Error(`Unexpected existing Chrome submission state: ${remote}`);
  }
  if (
    state.phase === "submitting" ||
    state.phase === "submitted" ||
    state.phase === "published"
  )
    throw new Error(
      "Submission outcome is not visible yet. Run status/resume later; no duplicate submission was sent.",
    );
  if (state.phase === "uploading")
    throw new Error(
      "Upload outcome is uncertain. Check the dashboard; do not overwrite a draft automatically. See RELEASE.md recovery instructions.",
    );
  checkRemoteVersion(
    {
      ...status,
      lastAsyncUploadState:
        state.phase === "processing" ? undefined : status.lastAsyncUploadState,
    },
    record.version,
  );
  if (state.phase === "packaged") {
    state.phase = "uploading";
    await save();
    const uploaded = await store.upload(await fs.readFile(zip));
    if (uploaded.crxVersion && uploaded.crxVersion !== record.version)
      throw new Error("Chrome upload returned a different version");
    if (uploaded.uploadState === "SUCCEEDED") {
      state.phase = "uploaded";
    } else if (
      ["IN_PROGRESS", "UPLOAD_IN_PROGRESS"].includes(uploaded.uploadState)
    ) {
      state.phase = "processing";
    } else {
      throw new Error(
        `Chrome upload did not succeed (${uploaded.uploadState || "unknown"}); inspect the dashboard.`,
      );
    }
    await save();
  }
  if (state.phase === "processing") {
    let uploadState: string | undefined;
    for (let attempt = 0; attempt < 24; attempt++) {
      status = await store.status();
      uploadState = status.lastAsyncUploadState;
      if (uploadState === "SUCCEEDED") break;
      if (!["IN_PROGRESS", "UPLOAD_IN_PROGRESS"].includes(uploadState || "")) {
        throw new Error(
          `Chrome upload state is ${uploadState || "unknown"}; inspect the dashboard.`,
        );
      }
      await pause();
    }
    if (uploadState !== "SUCCEEDED")
      throw new Error(
        "Chrome is still processing the upload. Resume this version later.",
      );
    state.phase = "uploaded";
    await save();
  }
  state.phase = "submitting";
  await save();
  const published = await store.publish();
  state.remoteState = published.state;
  if (
    published.state !== "PENDING_REVIEW" &&
    !published.state?.startsWith("PUBLISHED")
  ) {
    await save();
    throw new Error(`Unexpected Chrome publish state: ${published.state}`);
  }
  state.phase = published.state.startsWith("PUBLISHED")
    ? "published"
    : "submitted";
  await save();
  return state;
}
