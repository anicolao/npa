import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { ChromeStore, type Credentials, type Destination } from "./chrome";
import { readJSON } from "./core";

export const scope = "https://www.googleapis.com/auth/chromewebstore";
export function credentialPath() {
  return (
    process.env.NPA_RELEASE_CREDENTIALS ||
    path.join(os.homedir(), ".config/npa/chrome-oauth.json")
  );
}
export function createAuthorization(clientId: string, redirect: string) {
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(32).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    scope,
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
    login_hint: "alex@boardgamescafe.org",
  }).toString();
  return { verifier, state, url: url.toString() };
}
export function callbackCode(url: URL, state: string) {
  if (url.searchParams.get("state") !== state)
    throw new Error("Invalid OAuth callback state");
  if (url.searchParams.has("error"))
    throw new Error("Google authorization was declined");
  const code = url.searchParams.get("code");
  if (!code) throw new Error("Missing OAuth authorization code");
  return code;
}
export async function exchangeCode(
  client: { client_id: string; client_secret: string },
  code: string,
  verifier: string,
  redirect: string,
  request: typeof fetch = fetch,
): Promise<Credentials> {
  const response = await request("https://oauth2.googleapis.com/token", {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    body: new URLSearchParams({
      ...client,
      code,
      code_verifier: verifier,
      redirect_uri: redirect,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok)
    throw new Error(`OAuth code exchange failed (HTTP ${response.status})`);
  const data = await response.json();
  if (typeof data.refresh_token !== "string" || !data.refresh_token)
    throw new Error(
      "Google did not return a refresh token; repeat authorization with consent",
    );
  return {
    clientId: client.client_id,
    clientSecret: client.client_secret,
    refreshToken: data.refresh_token,
  };
}
export async function authorize(clientFile: string, destination: Destination) {
  const client = (await readJSON(clientFile)).installed;
  if (
    !client ||
    typeof client.client_id !== "string" ||
    typeof client.client_secret !== "string"
  )
    throw new Error(
      "Provide the downloaded Google Desktop app client JSON with --client-file",
    );
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Cannot start OAuth callback listener");
  const redirect = `http://127.0.0.1:${address.port}/`;
  const auth = createAuthorization(client.client_id, redirect);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const code = await new Promise<string>((resolve, reject) => {
      timer = setTimeout(
        () =>
          reject(new Error("OAuth authorization timed out; run auth again")),
        10 * 60_000,
      );
      server.on("request", (req, res) => {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Referrer-Policy", "no-referrer");
        const url = new URL(req.url || "/", redirect);
        if (req.method !== "GET" || url.pathname !== "/") {
          res.writeHead(404).end();
          return;
        }
        if (url.searchParams.get("state") !== auth.state) {
          res.writeHead(400).end("Invalid authorization callback.");
          return;
        }
        try {
          const result = callbackCode(url, auth.state);
          res.end(
            "Authorization received. You can close this tab. Check the terminal for API verification.",
          );
          resolve(result);
        } catch {
          res.writeHead(400).end("Authorization failed. Check the terminal.");
          reject(new Error("Google authorization was declined or incomplete"));
        }
      });
      console.log(
        `Open this URL in your Board Games Cafe Chrome profile:\n${auth.url}\nWaiting for Google authorization (10 minutes)...`,
      );
    });
    const credentials = await exchangeCode(
      client,
      code,
      auth.verifier,
      redirect,
    );
    await new ChromeStore(destination, credentials).status();
    const file = credentialPath();
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${randomBytes(8).toString("hex")}.tmp`;
    try {
      await fs.writeFile(
        temporary,
        `${JSON.stringify(credentials, null, 2)}\n`,
        { mode: 0o600, flag: "wx" },
      );
      await fs.rename(temporary, file);
    } finally {
      await fs.rm(temporary, { force: true });
    }
    console.log(
      `Chrome API access verified. Credentials saved privately to ${file}`,
    );
  } finally {
    clearTimeout(timer);
    server.closeAllConnections();
    server.close();
  }
}
