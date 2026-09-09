import type { TestContext } from "node:test";
import { randomUUID, webcrypto } from "node:crypto";

export const subject = "314b8576-e9e7-49aa-aa66-94eac6ba6544";
export const sessionId = "fb2c981e-7e5f-4b07-9f79-af7b907e4f4a";
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** Synthetic in-memory keys and intercepted SDK HTTP; no environment or real Auth/DB access. */
export async function nativeFixture(t: TestContext) {
  const config = { url: `https://vpj04-${randomUUID()}.invalid`, publishableKey: "synthetic-publishable-key" };
  const keys = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = { ...await webcrypto.subtle.exportKey("jwk", keys.publicKey), kid: "synthetic-signing-key", alg: "ES256", use: "sig" };
  const baseClaims = { sub: subject, session_id: sessionId, role: "authenticated", is_anonymous: false, aud: "authenticated", iss: `${config.url}/auth/v1`, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 };
  async function sign(overrides: Record<string, unknown> = {}, signingKey = keys.privateKey) {
    const input = `${encode({ alg: "ES256", typ: "JWT", kid: jwk.kid })}.${encode({ ...baseClaims, ...overrides })}`;
    const signature = await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signingKey, Buffer.from(input));
    return `${input}.${Buffer.from(signature).toString("base64url")}`;
  }
  const token = await sign();
  const seen: Array<{ path: string; authorization: string | null; apikey: string | null }> = [];
  let unavailable = false;
  let refreshResponse: Record<string, unknown> | null = null;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== config.url) throw new Error("Unexpected synthetic transport target");
    seen.push({ path: url.pathname, authorization: request.headers.get("authorization"), apikey: request.headers.get("apikey") });
    if (unavailable) throw new Error("Synthetic verification transport unavailable");
    if (url.pathname === "/auth/v1/.well-known/jwks.json") return Response.json({ keys: [jwk] });
    if (url.pathname === "/auth/v1/token" && refreshResponse) return Response.json(refreshResponse);
    if (url.pathname === "/auth/v1/user") return Response.json({ message: "Synthetic token rejected" }, { status: 401 });
    if (url.pathname.startsWith("/rest/v1/")) return Response.json([]);
    throw new Error("Unexpected synthetic transport operation");
  });
  // node:test files are process-isolated; top-level tests here are sequential. Cleanup also runs on failure.
  t.after(() => t.mock.restoreAll());
  function session(accessToken = token, expiresAt = baseClaims.exp) {
    return { access_token: accessToken, refresh_token: "synthetic-refresh-token", expires_in: 3600, expires_at: expiresAt, token_type: "bearer", user: { id: subject, aud: "authenticated", role: "authenticated" } };
  }
  function cookie(accessToken = token, expiresAt = baseClaims.exp) {
    return `sb-${new URL(config.url).hostname.split(".")[0]}-auth-token=base64-${encode(session(accessToken, expiresAt))}`;
  }
  return { config, token, sign, seen, cookie, setUnavailable: () => { unavailable = true; }, allowRefresh: () => { refreshResponse = session(); } };
}
