import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";
import { nativeFixture, subject, sessionId } from "../../identity/native-fixture.ts";
import { localRecoveryHTTP } from "../../../../lib/server/today/recovery/http.ts";

const id = (n: number) => `${n}14b8576-e9e7-49aa-aa66-94eac6ba6544`;
async function setup(t: Parameters<typeof nativeFixture>[0]) {
  const database = "https://dzqdzetcctkhbrhlxxgn.supabase.co", host = "vp-v4-recoveryfixture-jtcao515s-projects.vercel.app";
  const f = await nativeFixture(t, database);
  const env = { VERCEL_ENV: "preview", VERCEL_URL: host, VISEPANDA_NATIVE_STAGING: "true", VISEPANDA_TRIP_PROTOCOL_V2: "true",
    NEXT_PUBLIC_SUPABASE_URL: database, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: f.config.publishableKey, KNOWLEDGE_STAGING_READ: "1" };
  const old = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]])); Object.assign(process.env, env);
  t.after(() => { for (const [k, v] of Object.entries(old)) v === undefined ? delete process.env[k] : process.env[k] = v; });
  const observedAt = new Date().toISOString();
  const input = { operationId: id(1), expectedHeadVersion: 0, dayId: "Day-1", selectedItemIds: ["Optional"], fixedItemIds: ["Dinner"], reservationBindings: [],
    report: { source: "user_report", kind: "delay", observedAt }, locale: "zh" };
  const days = [{ id: "Day-1", date: observedAt.slice(0, 10), items: [{ id: "Optional", dayId: "Day-1", title: "Optional visit" }, { id: "Dinner", dayId: "Day-1", title: "Fixed dinner" }] }];
  const context = { kind: "local_recovery_context/1", contextId: id(2), contextDigest: "a".repeat(64), tripId: id(3), baseVersion: 0,
    expiresAt: new Date(Date.parse(observedAt) + 300000).toISOString(), profileBasis: { updatedAt: observedAt, travelPace: null }, reservationBasis: [], input };
  const selection = { operationId: id(4), contextId: id(2), contextDigest: "a".repeat(64), candidateId: "omit_one" };
  const expiresAt = new Date(Date.parse(observedAt) + 30000).toISOString();
  const receipt = { kind: "local_recovery_proposal/1", ...selection, proposalId: id(5), proposalRevision: 1, baseVersion: 0, expiresAt, reused: false };
  let epoch = 1, sourceAbsent = false, replaceAfterPrepare = false, prepareCalls = 0, lostACK = false, recovered = false, trafficAvailable = false, trafficDrift = false, trafficReads = 0;
  const previous = globalThis.fetch, calls: { path: string; authorization: string | null; body: unknown }[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init), url = new URL(req.url), path = url.pathname;
    if (!path.startsWith("/rest/v1/")) return previous(input, init);
    calls.push({ path, authorization: req.headers.get("authorization"), body: req.method === "POST" ? await req.clone().json() : null });
    if (path.endsWith("/native_session_v2")) return Response.json({ version: 2, subject, sessionId, mobileEpoch: epoch });
    if (path === "/rest/v1/trips") return Response.json({ id: id(3), title: "Owned Trip", head_version: 0, updated_at: observedAt });
    if (["/rest/v1/trip_events", "/rest/v1/trip_audit_events"].includes(path)) return Response.json([]);
    if (path === "/rest/v1/trip_version_snapshots") {
      const row = { version: 0, title: "Owned Trip", content: { title: "Owned Trip", days } };
      return Response.json(url.searchParams.get("version")?.startsWith("eq.") ? row : [row]);
    }
    if (path === "/rest/v1/trip_archives") return Response.json(null);
    if (path === "/rest/v1/user_profiles") return Response.json({ travel_pace: "relaxed", currency: "CNY", default_departure_time: "09:00", updated_at: observedAt });
    if (path.endsWith("/prepare_local_recovery_v1")) {
      prepareCalls++; if (replaceAfterPrepare && prepareCalls > 1) epoch = 2;
      return Response.json(sourceAbsent ? { kind: "pending", reason: "RESERVATION_READER_UNAVAILABLE" } : context);
    }
    if (path.endsWith("/prepare_transport_recovery_v1")) {
      trafficReads++;
      const body = await req.json() as { p_input: unknown };
      return Response.json(trafficAvailable ? { ...context, input: body.p_input, contextDigest: trafficDrift && trafficReads > 1 ? "c".repeat(64) : context.contextDigest }
        : { kind: "pending", reason: "TRAFFIC_RECOVERY_AUTHORITY_UNAVAILABLE" });
    }
    if (path.endsWith("/submit_local_recovery_v1")) {
      if (lostACK) { recovered = true; return Response.json({ message: "Synthetic lost ACK after accepted submit" }, { status: 503 }); }
      return Response.json(receipt);
    }
    if (path.endsWith("/read_local_recovery_operation_v1")) return Response.json({ kind: "local_recovery_operation/1", operationId: selection.operationId, tripId: id(3), input: selection,
      receipt: { ...receipt, reused: true }, state: "pending", resultingVersion: null });
    if (path.endsWith("/read_trip_proposal_v2")) return Response.json([{ digest: "trip-v2:" + "b".repeat(64), proposal: { id: id(5), trip_id: id(3), revision: 1, base_trip_version: 0,
      status: "pending", patch: { expectedVersion: 0, operations: [{ kind: "delete_item", itemId: "Optional", dayId: "Day-1" }] }, created_at: observedAt, expires_at: expiresAt, rollback_snapshot_version: null } }]);
    return previous(input, init);
  });
  const request = (body: unknown, native = true, extra: Record<string, string> = {}) => new NextRequest(`https://${host}/api/trips/${native ? "native/v2/" : ""}${id(3)}/recovery`,
    { method: "POST", headers: { ...(native ? { authorization: `Bearer ${f.token}` } : { cookie: f.cookie(), origin: `https://${host}` }), ...extra }, body: JSON.stringify(body) });
  const { report: _report, ...optionalScope } = input;
  const transport = { ...optionalScope, receiptId: id(6), scope: { tripId: id(3), expectedHeadVersion: 0, dayId: "Day-1", itemId: "Optional",
    originPlaceReferenceId: id(7), destinationPlaceReferenceId: id(8), mode: "transit", departure: "now" } };
  return { request, input, context, selection, transport, calls, token: f.token, setAbsent: () => { sourceAbsent = true; }, replace: () => { replaceAfterPrepare = true; prepareCalls = 0; }, loseACK: () => { lostACK = true; }, wasRecovered: () => recovered,
    allowTraffic: () => { trafficAvailable = true; }, driftTraffic: () => { trafficDrift = true; trafficReads = 0; } };
}
test("actual native and Web handlers qualify owner context, create local diff only, and no model/provider/Trip write", async t => {
  const f = await setup(t);
  for (const native of [true, false]) {
    const r = await localRecoveryHTTP(f.request({ operation: "preview", input: f.input }, native), id(3), native);
    const body = await r.json(); assert.equal(r.status, 200); assert.equal(body.data.status, "candidates");
    assert.equal(body.data.candidates.length, 1); assert.equal(body.data.tripMutation, "none");
    assert.deepEqual(body.data.candidates[0].patch.operations, [{ kind: "delete_item", dayId: "Day-1", itemId: "Optional" }]);
    assert.equal(body.data.preferenceContext.travelPace, null); // Legacy relaxed string lacks current consent.
    assert.match(r.headers.get("cache-control")!, /no-store/);
  }
  assert.ok(f.calls.some(c => c.path.endsWith("/prepare_local_recovery_v1") && c.authorization === `Bearer ${f.token}`));
  assert.ok(f.calls.every(c => !/confirm_and_apply|create_trip_proposal|maps|model/.test(c.path)));
});
test("missing reservation reader returns real pending and no executable candidates", async t => {
  const f = await setup(t); f.setAbsent();
  const r = await localRecoveryHTTP(f.request({ operation: "preview", input: f.input }), id(3), true); const body = await r.json();
  assert.equal(r.status, 200); assert.equal(body.data.status, "pending"); assert.equal(body.data.reason, "RESERVATION_READER_UNAVAILABLE"); assert.deepEqual(body.data.candidates, []);
});
test("native post-source mobile epoch replacement returns no private candidates", async t => {
  const f = await setup(t); f.replace();
  const r = await localRecoveryHTTP(f.request({ operation: "preview", input: f.input }), id(3), true);
  assert.equal(r.status, 401); assert.equal((await r.json()).error.code, "UNAUTHENTICATED");
});
test("selection returns original Proposal digest/diff; lost ACK preserves exact operation for receipt read", async t => {
  const f = await setup(t);
  const selected = await localRecoveryHTTP(f.request({ operation: "select", input: f.selection }), id(3), true);
  const s = await selected.json(); assert.equal(selected.status, 200); assert.equal(s.data.proposal.digest, "trip-v2:" + "b".repeat(64));
  assert.equal(s.data.nextAction, "review_original_proposal_and_confirm"); assert.equal(s.data.tripMutation, "none");
  f.loseACK();
  const lost = await localRecoveryHTTP(f.request({ operation: "select", input: f.selection }), id(3), true);
  assert.equal(lost.status, 503); const failure = await lost.json(); assert.equal(failure.error.code, "RECOVERY_RECEIPT_UNKNOWN"); assert.equal(failure.operationId, f.selection.operationId);
  assert.ok(f.wasRecovered());
  const recovered = await localRecoveryHTTP(f.request({ operation: "receipt", operationId: f.selection.operationId }), id(3), true);
  assert.equal(recovered.status, 200); assert.equal((await recovered.json()).data.operation.operationId, f.selection.operationId);
});
test("credential ambiguity, cross-Origin and caller provider data are rejected before actual recovery dispatch", async t => {
  const f = await setup(t), body = { operation: "preview", input: f.input };
  assert.equal((await localRecoveryHTTP(f.request(body, true, { cookie: "untrusted" }), id(3), true)).status, 400);
  assert.equal((await localRecoveryHTTP(f.request(body, false, { origin: "https://untrusted.invalid" }), id(3), false)).status, 400);
  assert.equal((await localRecoveryHTTP(f.request({ ...body, sourceVerified: true }), id(3), true)).status, 400);
  assert.ok(f.calls.every(c => !c.path.includes("local_recovery")));
});
test("nested transport consumes only its dedicated authoritative RPC; missing qualification never becomes a user report", async t => {
  const f = await setup(t);
  const r = await localRecoveryHTTP(f.request({ operation: "transport", input: f.transport }), id(3), true);
  assert.equal(r.status, 200); const body = (await r.json()).data;
  assert.equal(body.status, "pending"); assert.equal(body.reason, "TRAFFIC_RECOVERY_AUTHORITY_UNAVAILABLE"); assert.deepEqual(body.candidates, []);
  assert.equal(body.report, null); assert.deepEqual(body.transportReference, { receiptId: f.transport.receiptId, scope: f.transport.scope });
  assert.ok(f.calls.some(c => c.path.endsWith("/prepare_transport_recovery_v1")));
  assert.ok(!f.calls.some(c => c.path.endsWith("/prepare_local_recovery_v1") || /maps|model|create_trip_proposal/.test(c.path)));
});
test("synthetic qualified transport seam emits original local diff with separate source branch and detects reread drift", async t => {
  const f = await setup(t); f.allowTraffic();
  const first = await localRecoveryHTTP(f.request({ operation: "transport", input: f.transport }), id(3), true);
  assert.equal(first.status, 200); const data = (await first.json()).data;
  assert.equal(data.status, "candidates"); assert.equal(data.report, null); assert.equal(data.sourceSemantics, "qualified_foreground_transport");
  assert.equal(data.expiresAt, f.context.expiresAt); assert.equal(data.candidates[0].disposition, "candidate_only");
  assert.deepEqual(data.candidates[0].patch.operations, [{ kind: "delete_item", dayId: "Day-1", itemId: "Optional" }]);
  f.driftTraffic();
  const moved = await localRecoveryHTTP(f.request({ operation: "transport", input: f.transport }), id(3), true);
  assert.equal(moved.status, 409); assert.equal((await moved.json()).error.code, "RECOVERY_STALE");
});
test("transport rejects foreign scope, caller policy and future requests before authoritative preparation", async t => {
  const f = await setup(t);
  for (const input of [
    { ...f.transport, scope: { ...f.transport.scope, tripId: id(9) } },
    { ...f.transport, scope: { ...f.transport.scope, dayId: "OtherDay" } },
    { ...f.transport, scope: { ...f.transport.scope, departure: "tomorrow" } },
    { ...f.transport, policyId: id(9) },
    { ...f.transport, report: f.input.report },
  ]) assert.equal((await localRecoveryHTTP(f.request({ operation: "transport", input }), id(3), true)).status, 400);
  assert.ok(!f.calls.some(c => c.path.includes("prepare_transport")));
});
