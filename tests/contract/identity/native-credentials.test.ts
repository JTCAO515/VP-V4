import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest, NextResponse } from "next/server.js";
import { verifyNativeCredentials } from "../../../lib/server/identity/native-credentials.ts";
import { createNativeUserDataAdapter, createUserDataAdapter } from "../../../lib/server/identity/user-data-adapter.ts";
import { isSameOriginMutation } from "../../../lib/server/identity/request-guards.ts";
import { nativeFixture, subject, sessionId } from "./native-fixture.ts";

const endpoint = "https://app.example/api/trips";

test("SDK verifies the signed ordinary user JWT and binds the identical JWT to from/rpc", async (t) => {
  const f = await nativeFixture(t);
  const request = new NextRequest(endpoint, { headers: { authorization: `Bearer ${f.token}` } });
  const identity = await verifyNativeCredentials(request, f.config);
  assert.ok(identity);
  assert.equal(identity.subject, subject);
  assert.equal(identity.sessionId, sessionId);
  assert.ok(f.seen.some((r) => r.path.endsWith("jwks.json")));
  const first = await identity.client.from("trips").select("id");
  const second = await identity.client.rpc("synthetic_read_only_probe");
  assert.equal(first.error, null);
  assert.equal(second.error, null);
  const dataRequests = f.seen.filter((r) => r.path.startsWith("/rest/v1/"));
  assert.equal(dataRequests.length, 2);
  assert.ok(dataRequests.every((r) => r.authorization === `Bearer ${f.token}` && r.apikey === f.config.publishableKey));
  // Explicit-jwt getClaims did not create, persist or refresh an SDK session.
  const { data } = await identity.client.auth.getSession();
  assert.equal(data.session, null);
  assert.equal(f.seen.some((r) => r.path.includes("/token")), false);
});

test("verified JWT does not open native data operations without mobile epoch authority", async (t) => {
  const f = await nativeFixture(t);
  const request = new NextRequest(endpoint, { headers: { authorization: `Bearer ${f.token}` } });
  const adapter = await createNativeUserDataAdapter(request, f.config);
  assert.ok(adapter);
  const unauthenticated = { error: "UNAUTHENTICATED" };
  assert.deepEqual(await adapter.authenticated(), unauthenticated);
  assert.deepEqual(await adapter.listTrips(20), unauthenticated);
  assert.deepEqual(await adapter.getUserProfile(), unauthenticated);
  assert.deepEqual(await adapter.createTrip({ tripId: subject, title: "Synthetic" }), unauthenticated);
  assert.deepEqual(await adapter.confirm(subject, { proposalId: sessionId, idempotencyKey: "synthetic-key", digest: "synthetic-digest" }), unauthenticated);
  assert.equal(f.seen.some((r) => r.path.startsWith("/rest/v1/")), false);
  const response = NextResponse.json({ error: "UNAUTHENTICATED" });
  assert.equal(adapter.applyCookies(response), response);
  assert.equal(response.headers.has("set-cookie"), false);
});

test("cookie-only Web authentication and existing data adapter behavior remain available", async (t) => {
  const f = await nativeFixture(t);
  const request = new NextRequest(endpoint, { headers: { cookie: f.cookie(), origin: "https://app.example" } });
  const adapter = createUserDataAdapter(request, f.config);
  assert.ok(adapter);
  assert.deepEqual(await adapter.authenticated(), { data: subject });
  assert.deepEqual(await adapter.listTrips(20), { data: [] });
  assert.ok(f.seen.filter((r) => r.path.startsWith("/rest/v1/")).every((r) => r.authorization === `Bearer ${f.token}`));
  assert.equal(isSameOriginMutation(request), true);
  assert.equal(await createNativeUserDataAdapter(request, f.config), null);
});

test("Web mutation guard never exempts Bearer, missing Origin or hostile Origin", () => {
  for (const authorization of [undefined, "Bearer synthetic.jwt.signature"]) {
    for (const origin of [undefined, "https://hostile.example", "https://app.example"]) {
      const request = new NextRequest(endpoint, { headers: { ...(authorization ? { authorization } : {}), ...(origin ? { origin } : {}) } });
      assert.equal(isSameOriginMutation(request), origin === "https://app.example");
    }
  }
});


test("Web cookie refresh still queues writes for applyCookies through the shared adapter", async (t) => {
  const f = await nativeFixture(t);
  f.allowRefresh();
  const expiredAt = Math.floor(Date.now() / 1000) - 60;
  const expired = await f.sign({ exp: expiredAt });
  const adapter = createUserDataAdapter(new NextRequest(endpoint, { headers: { cookie: f.cookie(expired, expiredAt) } }), f.config);
  assert.ok(adapter);
  assert.deepEqual(await adapter.authenticated(), { data: subject });
  assert.ok(f.seen.some((r) => r.path === "/auth/v1/token"));
  const response = NextResponse.json({});
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(adapter.applyCookies(response), response);
  assert.equal(response.headers.has("set-cookie"), true);
});
