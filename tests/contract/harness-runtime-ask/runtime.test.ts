import test from "node:test";
import assert from "node:assert/strict";
import { runRuntimeAsk, askReportArtifacts } from "../../../evals/harness/runtime-ask/index.ts";
import { createNativeAskTransport, type AskTransport, type AskRequest } from "../../../evals/harness/runtime-ask/transport.ts";
import type { AskRun } from "../../../evals/harness/runtime-ask/contract.ts";
import { groundedEventFrames } from "../../../lib/server/turn/grounded-events.ts";
import { parseAskSubmission } from "../../../evals/harness/runtime-ask/contract.ts";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
function plan(caseId: AskRun["caseId"] = "H01"): AskRun {
  return { caseId, mode: "controlled", context: { ownerId: id(1), sessionId: id(2), mobileEpoch: 1, policyId: id(3), noticeVersion: "test-v1", noticeHash: "a".repeat(64), contextDigest: "b".repeat(64) },
    submission: { threadId: id(4), turnId: id(5), idempotencyKey: id(6), policyId: id(3), locale: "en", city: "shanghai",
      text: caseId === "H04" ? "Can I visit the Synthetic Gallery tomorrow?" : "What is the Synthetic Museum address?",
      serviceTask: { id: id(7), scopeVersion: 1, relationship: "new_goal", parentTurnId: null } }, currentTripId: id(8),
    expectation: { outcome: caseId === "H01" ? "answered" : caseId === "H04" ? "clarification" : "partial",
      factIds: caseId === "H04" ? [] : [id(9)], sourceRevisionIds: caseId === "H04" ? [] : [id(10)], gapIds: caseId === "H07" ? ["opening_hours"] : [] },
    bounds: { maxRequests: 64, timeoutMs: 1000, deadlineAt: new Date(Date.now() + 10000).toISOString(), maxPolls: 2,
      maxResponseBytes: 262144, maxTotalBytes: 1048576, maxReads: 4096, maxEmptyReads: 64 } };
}
function boundary(run = plan()) {
  const requests: AskRequest[] = [];
  const s = run.submission;
  const policy = { version: 4, kind: "policy", policy: { id: s.policyId, consentState: "accepted", noticeHash: run.context.noticeHash, noticeVersion: run.context.noticeVersion,
    expiresAt: "2099-01-01T00:00:00Z", provider: "qwen", recipient: "Synthetic first party", retention: "retain_after_hide_v1", noticeZh: "仅受控样例", noticeEn: "Controlled only" } };
  const fact = { factId: id(9), assertionId: id(11), version: 1, assertionRevision: 1, assertion: { subjectId: "synthetic_museum", predicate: "located_at", objectId: "place_address", conditions: [], exclusions: [] },
    text: "PRIVATE ANSWER BODY", conditions: [], exclusions: [], reviewedAt: "2026-01-01T00:00:00Z", publishedAt: "2026-01-02T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z",
    sources: [{ sourceRevisionId: id(10), publisher: "PRIVATE PUBLISHER", uri: "https://example.invalid/private-source", locator: "PRIVATE SOURCE LOCATOR" }],
    place: { names: { en: "Synthetic Museum", zh: "样例博物馆" } }, scope: { cities: [s.city], scene: "attraction", audience: "international_independent_traveler" }, value: { lines: ["PRIVATE ADDRESS"], countryCode: "CN" } };
  const intent = run.caseId === "H07" ? "place_address_and_hours" : "place_address";
  const knowledge = { schemaVersion: "knowledge-answer/1", evaluatedAt: "2026-10-15T01:00:00Z", purpose: "trip_planning", recipient: "first_party", territory: "CN-mainland",
    scope: { city: s.city, scene: "attraction", locale: s.locale }, status: "available", statements: [fact],
    answer: { questionId: intent, questionVersion: 1, subjectId: "synthetic_museum", outcome: run.expectation.outcome,
      claims: [{ id: "place_address", status: "covered", factIds: [fact.factId], reasons: [] }, ...(run.caseId === "H07" ? [{ id: "opening_hours", status: "unavailable", factIds: [], reasons: ["expired"] }] : [])] } };
  const turn = { kind: "grounded_turn", schemaVersion: "grounded-turn/1", turnId: s.turnId, threadId: s.threadId, serviceTaskId: s.serviceTask.id, scopeVersion: 1,
    relationship: s.serviceTask.relationship, parentTurnId: s.serviceTask.parentTurnId, locale: s.locale, input: s.text, status: "completed", outcome: run.expectation.outcome,
    output: "reviewed-answer-v1", createdAt: "2026-10-15T01:00:00Z", result: { type: "reviewed_answer", city: s.city, intent: run.caseId === "H04" ? "clarification" : intent,
      requestScope: run.caseId === "H04" ? "unknown" : "single", originalOutcome: run.expectation.outcome, completedAt: "2026-10-15T01:00:01Z", projection: "current",
      knowledge: run.caseId === "H04" ? null : knowledge, ...(run.caseId === "H04" ? {} : { placeName: "Synthetic Museum", placeResolution: "matched", placeSubjectId: "synthetic_museum" }) } };
  let submitted = false, historyReads = 0;
  const transport: AskTransport = async request => {
    requests.push(request);
    if (request.port === "session") return Response.json({ version: 2, subject: run.context.ownerId, sessionId: run.context.sessionId, mobileEpoch: run.context.mobileEpoch });
    if (request.port === "policy") return Response.json(policy);
    if (request.port === "history") { historyReads++; return Response.json({ version: 4, kind: "grounded_history", turns: submitted ? [turn] : [] }); }
    if (request.port === "trip") return Response.json({ version: 2, trip: { id: run.currentTripId, headVersion: 7 }, content: { title: "PRIVATE TRIP BODY", days: [] } });
    if (request.port === "submit") { submitted = true; return Response.json({ version: 4, kind: "accepted", turnId: s.turnId, reused: false, serviceTaskId: s.serviceTask.id,
      scopeVersion: 1, relationship: s.serviceTask.relationship, parentTurnId: s.serviceTask.parentTurnId }, { status: 201 }); }
    const events = request.cursor === 0 ? [{ eventId: "accepted", sequence: 1, type: "accepted", state: "accepted" }, { eventId: "terminal", sequence: 2, type: "terminal", state: turn.status }] : [];
    const frame = groundedEventFrames({ kind: "grounded_events", schemaVersion: "grounded-events/1", turn, events, lastSequence: 2 }, s.turnId, request.cursor ?? 0);
    return new Response(frame.text, { headers: { "Content-Type": "text/event-stream" } });
  };
  return { run, transport, requests, policy, turn, fact, knowledge, set submitted(v: boolean) { submitted = v; }, get historyReads() { return historyReads; } };
}

test("H01/H04/H07 execute the new native driver with existing grounded parsers and original IDs", async () => {
  for (const caseId of ["H01", "H04", "H07"] as const) {
    const f = boundary(plan(caseId)), report = await runRuntimeAsk(f.run, f.transport);
    assert.equal(report.outcome, f.run.expectation.outcome); assert.equal(report.code, null); assert.equal(report.policyRechecked, true);
    assert.equal(report.submitDispatches, 1); assert.equal(report.acknowledgement, "observed"); assert.equal(report.selectedTripUnchanged, true);
    assert.equal(report.tripCollectionUnchanged, "unknown"); assert.equal(report.requiredModeVerdict, "NOT_RUN"); assert.equal(report.fullAcceptance, "NOT_RUN");
    assert.equal(report.usage, "unknown"); assert.equal(report.cost, "unknown");
    assert.deepEqual(f.requests.find(r => r.port === "submit")?.body, f.run.submission);
    assert.deepEqual(f.requests.filter(r => r.port !== "session").map(r => r.port), ["policy", "history", "trip", "policy", "submit", "policy", "events", "history", "policy", "history", "trip", "policy"]);
    if (caseId === "H07") assert.deepEqual(report.gaps, [{ claimId: "opening_hours", reasons: ["expired"] }]);
    assert.equal(report.facts.length, caseId === "H04" ? 0 : 1);
    assert.ok(report.existingGrader === null || report.existingGrader.verdict === "NOT_RUN");
    const output = askReportArtifacts(report); assert.deepEqual(JSON.parse(output.json), report);
    for (const secret of [f.run.submission.text, "PRIVATE ANSWER BODY", "PRIVATE ADDRESS", "PRIVATE PUBLISHER", "PRIVATE TRIP BODY", "PRIVATE SOURCE LOCATOR"])
      assert.ok(!output.json.includes(secret) && !output.markdown.includes(secret));
  }
});

test("unknown ACK is reconciled by bounded reads, never a second POST", async () => {
  const f = boundary();
  const report = await runRuntimeAsk(f.run, async (r, s) => { const reply = await f.transport(r, s); if (r.port === "submit") throw Error("Controlled lost ACK"); return reply; });
  assert.equal(report.outcome, "answered"); assert.equal(report.acknowledgement, "unknown"); assert.equal(report.submitDispatches, 1);
  assert.equal(f.requests.filter(r => r.port === "submit").length, 1);
});

test("existing original Turn readback does not redispatch an uncertain request", async () => {
  const f = boundary(); f.submitted = true;
  const report = await runRuntimeAsk(f.run, f.transport);
  assert.equal(report.outcome, "answered"); assert.equal(report.submitDispatches, 0); assert.equal(report.acknowledgement, "not_submitted");
});

test("policy denial, withdrawal and notice changes block submission or suppress returned content", async () => {
  for (const change of ["denied", "withdrawn", "notice", "postReply"]) {
    const f = boundary();
    const report = await runRuntimeAsk(f.run, async (r, s) => {
      if (r.port === "policy") {
        if (change === "denied") f.policy.policy.consentState = "not_accepted";
        if (change === "withdrawn") f.policy.policy.consentState = "withdrawn";
        if (change === "notice") f.policy.policy.noticeHash = "c".repeat(64);
      }
      const response = await f.transport(r, s);
      if (change === "postReply" && r.port === "events") f.policy.policy.consentState = "withdrawn";
      return response;
    });
    assert.equal(report.code, "DATA_POLICY_BLOCKED"); assert.equal(report.outcome, "unknown"); assert.equal(report.facts.length, 0);
    assert.equal(report.submitDispatches, change === "postReply" ? 1 : 0);
  }
});

test("cross actor/session/epoch and foreign Turn/ServiceTask responses fail closed", async () => {
  for (const field of ["owner", "session", "epoch", "turn", "task"]) {
    const f = boundary();
    const report = await runRuntimeAsk(f.run, async (r, s) => {
      if (r.port === "session" && ["owner", "session", "epoch"].includes(field)) return Response.json({ version: 2,
        subject: field === "owner" ? id(90) : f.run.context.ownerId, sessionId: field === "session" ? id(90) : f.run.context.sessionId, mobileEpoch: field === "epoch" ? 2 : 1 });
      if (r.port === "submit" && ["turn", "task"].includes(field)) {
        const data = await (await f.transport(r, s)).json(); data[field === "turn" ? "turnId" : "serviceTaskId"] = id(90); return Response.json(data);
      }
      return f.transport(r, s);
    });
    assert.equal(report.outcome, "unknown"); assert.equal(report.facts.length, 0);
    assert.equal(report.submitDispatches, ["turn", "task"].includes(field) ? 1 : 0);
  }
});

test("final source qualification invalidation suppresses earlier current facts", async () => {
  const f = boundary();
  const report = await runRuntimeAsk(f.run, async (r, s) => {
    if (r.port === "history" && f.historyReads >= 2) { f.turn.result.projection = "unavailable"; f.turn.result.knowledge = null; }
    return f.transport(r, s);
  });
  assert.equal(report.code, "DATA_EXPIRED"); assert.equal(report.outcome, "unknown"); assert.deepEqual(report.facts, []);
});

test("source lease expiring after final history but during final Trip read cannot disclose facts", async () => {
  const f = boundary();
  f.fact.expiresAt = "2026-10-15T01:00:00.200Z";
  const report = await runRuntimeAsk(f.run, async (r, s) => {
    if (r.port === "trip" && f.historyReads >= 3) {
      const end = performance.now() + 250; while (performance.now() < end) { /* source lease expires, run deadline remains */ }
    }
    return f.transport(r, s);
  });
  assert.equal(report.code, "DATA_EXPIRED"); assert.equal(report.outcome, "unknown"); assert.deepEqual(report.facts, []);
  assert.deepEqual(report.expectationComparison, { outcome: "unknown", factIds: "unknown", sourceRevisionIds: "unknown", gapIds: "unknown" });
});

test("foreign and malformed selected Trip replies stop before POST", async () => {
  for (const kind of ["foreign", "body", "content", "version"]) {
    const f = boundary();
    const report = await runRuntimeAsk(f.run, async (r, s) => {
      if (r.port !== "trip") return f.transport(r, s);
      if (kind === "body") return Response.json({ arbitrary: "PRIVATE malformed body" });
      return Response.json({ version: 2, trip: { id: kind === "foreign" ? id(90) : f.run.currentTripId, headVersion: kind === "version" ? "7" : 7 },
        content: { title: "Private", days: kind === "content" ? [{ id: "bad", date: "not-a-date" }] : [] } });
    });
    assert.equal(report.outcome, "unknown", kind); assert.equal(report.submitDispatches, 0, kind); assert.deepEqual(report.facts, []);
    assert.equal(report.code, kind === "foreign" ? "FORBIDDEN" : "MODEL_OUTPUT_INVALID");
  }
});

test("frozen expectations compare actual outcomes/fact/source/gap IDs without inventing full grading proof", async () => {
  for (const field of ["outcome", "factIds", "sourceRevisionIds", "gapIds"]) {
    const run = plan(field === "gapIds" ? "H07" : "H01"), f = boundary(run);
    if (field === "outcome") {
      Object.assign(f.turn, { outcome: "blocked", status: "unavailable" });
      Object.assign(f.turn.result, { intent: "unsupported", requestScope: "unknown", originalOutcome: "blocked", knowledge: null });
      for (const key of ["placeName", "placeResolution", "placeSubjectId"]) Reflect.deleteProperty(f.turn.result, key);
    } else if (field === "factIds") Object.assign(run.expectation, { factIds: [id(90)] });
    else if (field === "sourceRevisionIds") Object.assign(run.expectation, { sourceRevisionIds: [id(90)] });
    else Object.assign(run.expectation, { gapIds: ["another_gap"] });
    const report = await runRuntimeAsk(run, f.transport);
    assert.equal(report.expectationComparison[field as keyof typeof report.expectationComparison], "mismatched");
    assert.equal(report.requiredModeVerdict, "NOT_RUN"); assert.equal(report.fullAcceptance, "NOT_RUN");
    assert.ok(report.existingGrader === null || report.existingGrader.verdict === "NOT_RUN");
  }
  const f = boundary(), report = await runRuntimeAsk(f.run, f.transport);
  assert.deepEqual(report.expectationComparison, { outcome: "matched", factIds: "matched", sourceRevisionIds: "matched", gapIds: "matched" });
  assert.equal(report.existingGrader?.verdict, "NOT_RUN");
});

test("run and independent transport each execute the shared closed submission parser", async () => {
  for (const kind of ["policy", "city", "hidden", "getter", "relation"]) {
    const run = plan(), dto = structuredClone(run.submission); let getters = 0, fetches = 0;
    if (kind === "policy") Object.assign(dto, { policyId: "invalid" });
    if (kind === "city") Object.assign(dto, { city: "unsupported" });
    if (kind === "hidden") Object.defineProperty(dto, "text", { enumerable: false });
    if (kind === "getter") Object.defineProperty(dto.serviceTask, "id", { get() { getters++; return id(7); } });
    if (kind === "relation") Object.assign(dto.serviceTask, { relationship: "new_goal", parentTurnId: id(90) });
    assert.equal(parseAskSubmission(dto), null);
    const f = boundary(), report = await runRuntimeAsk({ ...run, submission: dto }, f.transport);
    assert.equal(report.code, "INVALID_INPUT"); assert.equal(f.requests.length, 0);
    const bridge = createNativeAskTransport({ appOrigin: "https://ask.example.invalid", authorizedFetch: async () => { fetches++; return Response.json({}); } });
    await assert.rejects(bridge({ port: "submit", body: dto, turnId: null, tripId: null, cursor: null }, new AbortController().signal));
    assert.equal(fetches, 0); assert.equal(getters, 0);
  }
});

test("Trip missing/incomplete version preserves unknown without inventing a complete empty collection", async () => {
  for (const missing of ["none", "missingVersion", "unavailable"]) {
    const run = plan(); if (missing === "none") Object.assign(run, { currentTripId: null });
    const f = boundary(run);
    const report = await runRuntimeAsk(run, async (r, s) => r.port !== "trip" ? f.transport(r, s)
      : missing === "unavailable" ? Response.json({ error: { code: "PROVIDER_UNAVAILABLE" } }, { status: 503 }) : Response.json({ version: 2, trip: { id: run.currentTripId }, content: { title: "Private", days: [] } }));
    assert.equal(report.outcome, "answered"); assert.equal(report.selectedTripUnchanged, "unknown"); assert.equal(report.tripCollectionUnchanged, "unknown");
  }
});

test("malformed replay, wrong cursor and invalid source relations cannot expose results", async () => {
  for (const change of ["sse", "cursor", "source"]) {
    const f = boundary();
    const report = await runRuntimeAsk(f.run, async (r, s) => {
      if (change === "sse" && r.port === "events") return new Response('event: turn\ndata: {}\n\n', { headers: { "Content-Type": "text/event-stream" } });
      if (change === "cursor" && r.port === "events") return new Response('event: heartbeat\ndata: {"afterSequence":900}\n\n', { headers: { "Content-Type": "text/event-stream" } });
      if (change === "source" && r.port === "events") f.fact.assertion.subjectId = "foreign_place";
      return f.transport(r, s);
    });
    assert.equal(report.outcome, "unknown"); assert.equal(report.facts.length, 0);
  }
});

test("expired deadline and pre-abort do not dispatch; missing transport is NOT_RUN", async () => {
  const f = boundary(), controller = new AbortController(); controller.abort();
  assert.equal((await runRuntimeAsk(f.run, f.transport, controller.signal)).outcome, "NOT_RUN");
  assert.equal((await runRuntimeAsk({ ...f.run, bounds: { ...f.run.bounds, deadlineAt: "2000-01-01T00:00:00.000Z" } }, f.transport)).code, "TIMEOUT_BEFORE_OUTPUT");
  assert.equal((await runRuntimeAsk(f.run)).outcome, "NOT_RUN"); assert.equal(f.requests.length, 0);
});

test("late transport after abort is cancelled and cannot resume reads or disclose content", async () => {
  const f = boundary(), controller = new AbortController(); let resolve: (r: Response) => void = () => {};
  let cancelled = false;
  const pending = runRuntimeAsk(f.run, async (r, s) => {
    if (r.port === "events") { controller.abort(); return new Promise<Response>(done => { resolve = done; }); }
    return f.transport(r, s);
  }, controller.signal);
  const report = await pending, count = f.requests.length;
  resolve(new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { "Content-Type": "text/event-stream" } }));
  await new Promise(r => setImmediate(r));
  assert.equal(report.code, "CANCELLED"); assert.equal(report.outcome, "unknown"); assert.equal(report.facts.length, 0);
  assert.equal(f.requests.length, count); assert.equal(cancelled, true);
});

test("monotonic timeout rejects synchronous late success without timer scheduling", async () => {
  const run = plan(), f = boundary(run);
  const report = await runRuntimeAsk({ ...run, bounds: { ...run.bounds, timeoutMs: 5 } }, async (r, s) => {
    const end = performance.now() + 15; while (performance.now() < end) { /* starve timer intentionally */ }
    return f.transport(r, s);
  });
  assert.equal(report.code, "TIMEOUT_BEFORE_OUTPUT"); assert.equal(report.outcome, "unknown"); assert.equal(report.submitDispatches, 0);
});

test("byte/read/empty-chunk/request budgets stop hostile responses and ignored abort", async () => {
  for (const kind of ["length", "bytes", "utf8", "empty", "reads", "hanging", "requests", "total"]) {
    const run = plan(), f = boundary(run); let pulls = 0;
    const altered = { ...run, bounds: { ...run.bounds, timeoutMs: 50, ...(kind === "requests" ? { maxRequests: 1 } : {}), ...(kind === "reads" ? { maxReads: 3 } : {}), ...(kind === "total" ? { maxResponseBytes: 2048, maxTotalBytes: 2048 } : {}) } };
    const report = await runRuntimeAsk(altered, async (r, s) => {
      if (kind === "requests") return f.transport(r, s);
      if (kind === "total") { const d = await (await f.transport(r, s)).json(); if (r.port === "session") d.padding = "x".repeat(900); return Response.json(d); }
      if (kind === "hanging") return new Promise<Response>(() => {});
      if (kind === "empty" || kind === "reads") return new Response(new ReadableStream({ pull(c) { pulls++; c.enqueue(new Uint8Array(kind === "empty" ? 0 : 1)); } }), { headers: { "Content-Type": "application/json" } });
      return new Response(kind === "length" ? "{}" : kind === "utf8" ? new Uint8Array([0xff]) : "x".repeat(262145), { headers: { "Content-Type": "application/json", ...(kind === "length" ? { "Content-Length": "262145" } : {}) } });
    });
    assert.equal(report.outcome, "unknown", kind); assert.equal(report.submitDispatches, 0, kind); assert.equal(report.facts.length, 0);
    if (kind === "hanging") assert.equal(report.code, "TIMEOUT_BEFORE_OUTPUT");
    if (kind === "empty" || kind === "reads") assert.ok(pulls <= (kind === "empty" ? 67 : 5));
  }
});

test("blocked and technical_failure are read from existing parser semantics, not converted to answered", async () => {
  for (const outcome of ["blocked", "technical_failure"] as const) {
    const run = plan("H04"), f = boundary(run);
    Object.assign(f.turn, { outcome, status: outcome === "blocked" ? "unavailable" : "failed" });
    Object.assign(f.turn.result, { originalOutcome: outcome, intent: outcome });
    const report = await runRuntimeAsk(run, f.transport);
    assert.equal(report.outcome, outcome); assert.equal(report.facts.length, 0); assert.equal(report.requiredModeVerdict, "NOT_RUN");
  }
});

test("controlled driver crosses actual Native identity/text/events handlers with intercepted SDK transport", async t => {
  const { nativeFixture, subject, sessionId } = await import("../identity/native-fixture.ts");
  const { NextRequest } = await import("next/server.js");
  const { nativeTextHTTP } = await import("../../../lib/server/turn/native-http.ts");
  const { nativeIdentityHTTP } = await import("../../../lib/server/identity/native-http.ts");
  const { nativeGroundedEvents } = await import("../../../lib/server/turn/native-events-http.ts");
  const database = "https://dzqdzetcctkhbrhlxxgn.supabase.co", host = "vp-v4-askfixture-jtcao515s-projects.vercel.app";
  const authority = await nativeFixture(t, database), run = plan("H04");
  Object.assign(run.bounds, { timeoutMs: 3000 });
  Object.assign(run.context, { ownerId: subject, sessionId }); Object.assign(run, { currentTripId: null });
  const f = boundary(run), rpcCalls: { name: string; params: Record<string, unknown> }[] = [];
  const env = { VERCEL_ENV: "preview", VERCEL_URL: host, VISEPANDA_NATIVE_STAGING: "true", VISEPANDA_NATIVE_PRODUCTION: "false",
    VISEPANDA_TRIP_PROTOCOL_V2: "true", NEXT_PUBLIC_SUPABASE_URL: database, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: authority.config.publishableKey,
    VISEPANDA_NATIVE_STAGING_GROUNDED: "true", VISEPANDA_NATIVE_STAGING_GROUNDED_POLICY: run.context.policyId };
  const previous = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]])); Object.assign(process.env, env);
  t.after(() => { for (const [k, v] of Object.entries(previous)) v === undefined ? delete process.env[k] : process.env[k] = v; });
  const fixtureFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init), url = new URL(request.url);
    if (url.origin !== database || !url.pathname.startsWith("/rest/v1/rpc/")) return fixtureFetch(input, init);
    const name = url.pathname.split("/").at(-1)!, params = await request.json(); rpcCalls.push({ name, params });
    if (name === "native_session_v2") return Response.json({ version: 2, subject, sessionId, mobileEpoch: 1 });
    if (name === "read_grounded_policy") return Response.json(f.policy);
    if (name === "list_grounded_turns") return f.transport({ port: "history", body: null, turnId: null, tripId: null, cursor: null }, request.signal);
    if (name === "submit_grounded_turn") return f.transport({ port: "submit", body: run.submission, turnId: null, tripId: null, cursor: null }, request.signal);
    if (name === "read_grounded_events") return Response.json({ kind: "grounded_events", schemaVersion: "grounded-events/1", turn: f.turn,
      events: [{ eventId: "accepted", sequence: 1, type: "accepted", state: "accepted" }, { eventId: "terminal", sequence: 2, type: "terminal", state: "completed" }], lastSequence: 2 });
    throw Error("Unexpected controlled RPC");
  });
  const bridge = createNativeAskTransport({ appOrigin: `https://${host}`, authorizedFetch: async (input, init) => {
    const headers = new Headers(init?.headers); headers.set("Authorization", `Bearer ${authority.token}`);
    const request = new NextRequest(String(input), { ...init, headers, signal: init?.signal ?? undefined });
    if (request.nextUrl.pathname.endsWith("/session")) return nativeIdentityHTTP(request, "session", { ...authority.config, environment: "staging" });
    if (request.nextUrl.pathname.endsWith("/policy")) return nativeTextHTTP(request, "policy", undefined, "grounded");
    if (request.nextUrl.pathname.endsWith("/events")) return nativeGroundedEvents(request, run.submission.turnId);
    return nativeTextHTTP(request, request.method === "POST" ? "submit-task" : "task-history", undefined, "grounded");
  } });
  const report = await runRuntimeAsk(run, bridge);
  assert.equal(report.outcome, "clarification"); assert.equal(report.submitDispatches, 1); assert.equal(report.selectedTripUnchanged, "unknown");
  const submits = rpcCalls.filter(c => c.name === "submit_grounded_turn"); assert.equal(submits.length, 1);
  assert.equal(submits[0].params.p_turn_id, run.submission.turnId); assert.equal(submits[0].params.p_task_id, run.submission.serviceTask.id);
  assert.equal(submits[0].params.p_idempotency_key, run.submission.idempotencyKey);
  assert.ok(!rpcCalls.some(c => /accept|consent|create|refresh|budget|confirm|apply/.test(c.name)));
  assert.equal(report.mode, "controlled"); assert.equal(report.requiredModeVerdict, "NOT_RUN");
  assert.ok(!JSON.stringify(report).includes(authority.token));
});

test("closed input rejects enum coercion, hidden bounds, getters, Symbols and holdout IDs without user-code execution", async () => {
  let calls = 0;
  for (const change of ["enum", "boxed", "getter", "hidden", "symbol", "arrayGetter", "holdout"]) {
    const run = plan();
    if (change === "enum") Object.defineProperty(run, "mode", { value: { toString() { calls++; return "controlled"; } } });
    if (change === "boxed") Object.defineProperty(run, "caseId", { value: new String("H01") });
    if (change === "getter") Object.defineProperty(run.context, "ownerId", { get() { calls++; return id(1); } });
    if (change === "hidden") Object.defineProperty(run.bounds, "maxRequests", { value: 1, enumerable: false });
    if (change === "symbol") Object.defineProperty(run, Symbol("secret"), { value: 1 });
    if (change === "arrayGetter") Object.defineProperty(run.expectation.factIds, "0", { get() { calls++; return id(9); } });
    if (change === "holdout") Object.defineProperty(run, "caseId", { value: "H03" });
    const f = boundary(), report = await runRuntimeAsk(run, f.transport);
    assert.equal(report.code, "INVALID_INPUT", change); assert.equal(report.mode, "NOT_RUN"); assert.equal(report.outcome, "NOT_RUN"); assert.equal(f.requests.length, 0);
  }
  assert.equal(calls, 0);
});

test("concrete bridge invokes original Native endpoint paths using only supplied authenticated fetch", async () => {
  const f = boundary(), calls: { path: string; method?: string; body?: unknown; cursor: string | null }[] = [];
  const bridge = createNativeAskTransport({ appOrigin: "https://ask.example.invalid", authorizedFetch: async (url, init) => {
    const path = new URL(String(url)).pathname, headers = new Headers(init?.headers);
    calls.push({ path, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : null, cursor: headers.get("last-event-id") });
    assert.equal(init?.redirect, "error");
    const port: AskRequest["port"] = path.endsWith("/session") ? "session" : path.endsWith("/policy") ? "policy" : path.includes("/events") ? "events"
      : path.includes("/trips/") ? "trip" : init?.method === "POST" ? "submit" : "history";
    return f.transport({ port, body: port === "submit" ? f.run.submission : null, turnId: port === "events" ? f.run.submission.turnId : null,
      tripId: port === "trip" ? f.run.currentTripId : null, cursor: port === "events" ? Number(headers.get("last-event-id")) : null }, init?.signal as AbortSignal);
  } });
  const report = await runRuntimeAsk(f.run, bridge);
  assert.equal(report.outcome, "answered");
  assert.equal(calls.filter(r => r.method === "POST").length, 1);
  assert.deepEqual(calls.find(r => r.method === "POST")?.body, f.run.submission);
  assert.ok(calls.some(r => r.path === `/api/chat/native/v4/turns/${f.run.submission.turnId}/events` && r.cursor === "0"));
  assert.throws(() => createNativeAskTransport({ appOrigin: "https://bad.invalid/path", authorizedFetch: async () => Response.json({}) }));
});
