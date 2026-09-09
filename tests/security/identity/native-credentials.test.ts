import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { NextRequest, NextResponse } from "next/server.js";
import { verifyNativeCredentials } from "../../../lib/server/identity/native-credentials.ts";
import { createNativeUserDataAdapter, createUserDataAdapter } from "../../../lib/server/identity/user-data-adapter.ts";
import { nativeFixture } from "../../contract/identity/native-fixture.ts";

const endpoint = "https://app.example/api/trips";
function request(authorization?: string, cookie?: string) { return new NextRequest(endpoint, { headers: { ...(authorization !== undefined ? { authorization } : {}), ...(cookie !== undefined ? { cookie } : {}) } }); }

test("missing, malformed, oversized and duplicate Authorization fail before SDK HTTP", async (t) => {
  const f = await nativeFixture(t);
  for (const value of [undefined, "", "Basic x", "Bearer", "Bearer x", "Bearer a.b", "Bearer a.b.c.d", `Bearer  ${f.token}`, `Bearer ${f.token}, Bearer ${f.token}`, `Bearer ${"a".repeat(16384)}.b.c`]) {
    assert.equal(await verifyNativeCredentials(request(value), f.config), null);
  }
  const duplicated = request(); duplicated.headers.append("authorization", `Bearer ${f.token}`); duplicated.headers.append("authorization", `Bearer ${f.token}`);
  assert.equal(await verifyNativeCredentials(duplicated, f.config), null);
  assert.equal(f.seen.length, 0);
});

test("expired and forged JWTs are rejected by the actual Auth SDK", async (t) => {
  const f = await nativeFixture(t);
  const expired = await f.sign({ exp: Math.floor(Date.now() / 1000) - 1 });
  assert.equal(await verifyNativeCredentials(request(`Bearer ${expired}`), f.config), null);
  assert.equal(f.seen.length, 0);
  const attackerKeys = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const forged = await f.sign({}, attackerKeys.privateKey);
  assert.equal(await verifyNativeCredentials(request(`Bearer ${forged}`), f.config), null);
  assert.ok(f.seen.some((r) => r.path.endsWith("jwks.json")));
  assert.equal(f.seen.some((r) => r.path === "/auth/v1/user"), false);
  assert.equal(f.seen.some((r) => r.path.startsWith("/rest/v1/")), false);
});

test("valid signatures cannot turn service, anonymous, wrong-project or incomplete claims into a user", async (t) => {
  const f = await nativeFixture(t);
  for (const claims of [{ role: "service_role" }, { role: "anon" }, { is_anonymous: true }, { is_anonymous: undefined }, { aud: "other" }, { iss: "https://wrong-project.invalid/auth/v1" }, { sub: "not-a-user-id" }, { session_id: undefined }, { session_id: "not-a-session-id" }, { nbf: Math.floor(Date.now() / 1000) + 3600 }]) {
    const token = await f.sign(claims);
    assert.equal(await verifyNativeCredentials(request(`Bearer ${token}`), f.config), null);
  }
  assert.equal(f.seen.some((r) => r.path.startsWith("/rest/v1/")), false);
});

test("mixed credentials never read/refresh Web cookies or fall back after invalid Bearer", async (t) => {
  const f = await nativeFixture(t);
  for (const bearer of [`Bearer ${f.token}`, "Bearer invalid", "Basic invalid", ""]) {
    const mixed = request(bearer, f.cookie());
    let cookieReads = 0;
    t.mock.method(mixed.cookies, "getAll", () => { cookieReads++; throw new Error("Cookie fallback attempted"); });
    assert.equal(await verifyNativeCredentials(mixed, f.config), null);
    assert.equal(await createNativeUserDataAdapter(mixed, f.config), null);
    const web = createUserDataAdapter(mixed, f.config);
    assert.ok(web);
    assert.deepEqual(await web.authenticated(), { error: "UNAUTHENTICATED" });
    assert.deepEqual(await web.listTrips(20), { error: "UNAUTHENTICATED" });
    const response = web.applyCookies(NextResponse.json({}));
    assert.equal(response.headers.has("set-cookie"), false);
    assert.equal(cookieReads, 0);
  }
  for (const cookie of ["", "locale=en"]) assert.equal(await verifyNativeCredentials(request(`Bearer ${f.token}`, cookie), f.config), null);
  assert.equal(f.seen.length, 0);
});

test("verification transport failure is closed and returns no token/body/error detail", async (t) => {
  const f = await nativeFixture(t);
  f.setUnavailable();
  const result = await verifyNativeCredentials(request(`Bearer ${f.token}`), f.config);
  assert.equal(result, null);
  assert.equal(f.seen.some((r) => r.path.startsWith("/rest/v1/")), false);
});

test("separate verified users retain separate JWTs without a shared session or cookie", async (t) => {
  const f = await nativeFixture(t);
  const otherToken = await f.sign({ sub: "f741cb27-f3ed-40c7-a0f8-e1c1ab5598b5", session_id: "a7f5498c-f030-42f6-91ee-aae2a6070bf6" });
  const [first, second] = await Promise.all([verifyNativeCredentials(request(`Bearer ${f.token}`), f.config), verifyNativeCredentials(request(`Bearer ${otherToken}`), f.config)]);
  assert.ok(first); assert.ok(second);
  assert.notEqual(first.subject, second.subject);
  await first.client.from("trips").select("id");
  await second.client.from("trips").select("id");
  const queries = f.seen.filter((r) => r.path.startsWith("/rest/v1/"));
  assert.equal(queries.length, 2);
  assert.ok(queries[0].authorization === `Bearer ${f.token}`);
  assert.ok(queries[1].authorization === `Bearer ${otherToken}`);
  assert.equal((await first.client.auth.getSession()).data.session, null);
  assert.equal((await second.client.auth.getSession()).data.session, null);
});


test("SDK remote-verification fallback rejects a token without a matching asymmetric key", async (t) => {
  const f = await nativeFixture(t);
  const parts = f.token.split(".");
  parts[0] = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const invalid = parts.join(".");
  assert.equal(await verifyNativeCredentials(request(`Bearer ${invalid}`), f.config), null);
  assert.ok(f.seen.some((r) => r.path === "/auth/v1/user" && r.authorization === `Bearer ${invalid}`));
  assert.equal(f.seen.some((r) => r.path.startsWith("/rest/v1/")), false);
});
