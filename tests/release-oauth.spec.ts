import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { parseArgs } from "../scripts/release";
import {
  callbackCode,
  createAuthorization,
  exchangeCode,
  scope,
} from "../scripts/release/oauth";

describe("release OAuth", () => {
  it("uses a fresh state and S256 proof for offline Web Store authorization", () => {
    const auth = createAuthorization("client", "http://127.0.0.1:1234/");
    const params = new URL(auth.url).searchParams;
    expect(params.get("scope")).toBe(scope);
    expect(params.get("access_type")).toBe("offline");
    expect(params.get("code_challenge_method")).toBe("S256");
    expect(params.get("code_challenge")).toBe(
      createHash("sha256").update(auth.verifier).digest("base64url"),
    );
    expect(
      createAuthorization("client", "http://127.0.0.1:1234/").state,
    ).not.toBe(auth.state);
    expect(params.has("client_secret")).toBe(false);
  });
  it("rejects unsolicited callbacks and declined authorization", () => {
    expect(() =>
      callbackCode(
        new URL("http://localhost/?state=bad&code=code"),
        "expected",
      ),
    ).toThrow("state");
    expect(() =>
      callbackCode(
        new URL("http://localhost/?state=ok&error=access_denied"),
        "ok",
      ),
    ).toThrow("declined");
    expect(
      callbackCode(new URL("http://localhost/?state=ok&code=code"), "ok"),
    ).toBe("code");
  });
  it("exchanges the code with its verifier and keeps token responses out of errors", async () => {
    const client = { client_id: "id", client_secret: "secret" };
    const request = vi.fn(async (_url, init) => {
      expect(init.body.get("code_verifier")).toBe("verifier");
      expect(init.body.get("redirect_uri")).toBe("http://127.0.0.1:1234/");
      return Response.json({ refresh_token: "refresh" });
    });
    expect(
      await exchangeCode(
        client,
        "code",
        "verifier",
        "http://127.0.0.1:1234/",
        request as unknown as typeof fetch,
      ),
    ).toEqual({
      clientId: "id",
      clientSecret: "secret",
      refreshToken: "refresh",
    });
    await expect(
      exchangeCode(
        client,
        "code",
        "verifier",
        "redirect",
        (async () => new Response("secret", { status: 400 })) as typeof fetch,
      ),
    ).rejects.toThrow("HTTP 400");
    await expect(
      exchangeCode(client, "code", "verifier", "redirect", (async () =>
        Response.json({ access_token: "access" })) as typeof fetch),
    ).rejects.toThrow("refresh token");
  });
  it("requires the client file only for auth", () => {
    expect(
      parseArgs(["auth", "--client-file", "/private/client.json"]).command,
    ).toBe("auth");
    expect(() => parseArgs(["auth"])).toThrow("--client-file");
    expect(() => parseArgs(["patch", "--client-file", "file"])).toThrow(
      "only valid",
    );
  });
});
