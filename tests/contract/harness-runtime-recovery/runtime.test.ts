import test from "node:test";
import assert from "node:assert/strict";
import { runRuntimeRecovery, recoveryReportArtifacts } from "../../../evals/harness/runtime-recovery/index.ts";
import { createNativeRecoveryTransport, type RuntimeRequest, type RuntimeTransport } from "../../../evals/harness/runtime-recovery/transport.ts";
import type { RecoveryRun } from "../../../evals/harness/runtime-recovery/contract.ts";
import { runDurableTurnWork } from "../../../lib/server/turn/durable-worker.ts";
import { decodeAssistantEvents } from "../../../lib/server/turn/assistant-events/protocol.ts";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
export const input: RecoveryRun = {
  scenario: "H09", mode: "controlled", action: "confirm_once",
  context: { ownerId: id(1), sessionId: id(2), mobileEpoch: 1, taskId: id(3), turnId: id(4), conversationId: id(5), policyId: id(6), tripId: id(7),
    source: { apiSha: "a".repeat(40), workerSha: "b".repeat(40), configurationDigest: "c".repeat(64) } },
  baseVersion: 7, operation: { operationId: id(8), contextId: id(9), contextDigest: "d".repeat(64), candidateId: "omit_one" },
  proposalId: id(10), proposalRevision: 1, digest: `trip-v2:${"e".repeat(64)}`, idempotencyKey: id(11), maxRequests: 64, timeoutMs: 1000, replayPages: 2,
};
// Scripted boundary responses exercise the shipped driver and existing production decoders.
// This is not a worker, DB, Trip writer, accounting producer or runtime acceptance fixture.
export function boundary(run = structuredClone(input)) {
  const requests: RuntimeRequest[] = [];
  let applied = false, cancelled = false, failACK = true, lateCompleted = false, drift = false;
  let sessionEpoch = 1;
  const body = (value: unknown) => Response.json(value);
  const transport: RuntimeTransport = async request => {
    requests.push(request);
    const c = run.context;
    switch (request.name) {
      case "native_session_v2": return body({ version: 2, subject: c.ownerId, sessionId: c.sessionId, mobileEpoch: sessionEpoch });
      case "read_assistant_events_v1": {
        const after = Number(request.params.p_after_sequence);
        const statuses = ["retrieving", ...(cancelled ? ["cancelled"] : []), ...(lateCompleted ? ["completed"] : [])];
        return body({ kind: "assistant_events", schemaVersion: "assistant-events/1", conversationId: c.conversationId, afterSequence: after,
          lastSequence: Math.max(after, statuses.length), hasMore: false,
          events: statuses.map((status, i) => ({ eventId: `${c.conversationId}:${i + 1}`, sequence: i + 1, taskId: c.taskId, turnId: c.turnId, type: "task_status", status })).filter(e => e.sequence > after) });
      }
      case "trip_reload": return body({ version: 2, trip: { id: c.tripId, headVersion: applied ? 8 : 7 }, content: { title: "Controlled Trip", days: drift ? [{ id: "Changed", date: "2026-10-14", items: [] }] : [] }, confirmationState: applied ? "confirmed" : "unknown", hardLocks: "not_enabled", externalOrderStatus: "not_connected" });
      case "read_local_recovery_operation_v1": return body({ kind: "local_recovery_operation/1", operationId: run.operation!.operationId, tripId: c.tripId,
        input: run.operation, receipt: { kind: "local_recovery_proposal/1", ...run.operation, proposalId: run.proposalId, proposalRevision: 1, baseVersion: 7, expiresAt: "2099-01-01T00:00:00.000Z", reused: true },
        state: applied ? "applied" : "pending", resultingVersion: applied ? 8 : null });
      case "read_trip_proposal_v2": return body([{ proposal: { id: run.proposalId, owner_id: c.ownerId, trip_id: c.tripId, revision: 1, base_trip_version: 7,
        status: applied ? "applied" : "pending", expires_at: "2099-01-01T00:00:00.000Z", patch: { operations: [] } }, digest: run.digest }]);
      case "confirm_and_apply_trip_proposal": applied = true; if (failACK) throw new Error("Controlled ACK loss"); return body([{ outcome: "applied", resulting_version: 8 }]);
      case "read_trip_confirmation_receipt_v1": return body(applied ? [{ proposal_id: run.proposalId, trip_id: c.tripId, resulting_version: 8 }] : []);
      case "cancel_chat_turn": cancelled = true; return body([{ sequence: 2, state: "cancelled" }]);
    }
  };
  return { transport, requests, set applied(v: boolean) { applied = v; }, set lateCompleted(v: boolean) { lateCompleted = v; },
    set failACK(v: boolean) { failACK = v; }, set epoch(v: number) { sessionEpoch = v; }, set drift(v: boolean) { drift = v; } };
}
const h10 = (proposal = true): RecoveryRun => ({ ...structuredClone(input), scenario: "H10", action: "cancel",
  ...(proposal ? {} : { operation: null, proposalId: null, proposalRevision: null, digest: null, idempotencyKey: null }) });

test("H09 lost ACK reconciles immutable operation + authoritative receipt + reload; one confirmation", async () => {
  const f = boundary();
  const report = await runRuntimeRecovery(input, f.transport);
  assert.equal(report.outcome, "applied"); assert.equal(report.acknowledgement, "unknown"); assert.equal(report.confirmDispatches, 1);
  assert.equal(report.tripVersion, 8); assert.equal(report.receipt?.resultingVersion, 8);
  assert.equal(report.quotaDebit, "unknown"); assert.equal(report.providerUsage, "unknown"); assert.equal(report.commitCount, "unknown");
  assert.equal(report.fullAcceptance, "NOT_RUN");
  const calls = f.requests.filter(r => r.name === "confirm_and_apply_trip_proposal");
  assert.equal(calls.length, 1); assert.equal(calls[0].params.p_idempotency_key, input.idempotencyKey);
  assert.ok(f.requests.every(r => r.context.taskId === input.context.taskId && r.context.turnId === input.context.turnId));
  const artifacts = recoveryReportArtifacts(report);
  assert.deepEqual(JSON.parse(artifacts.json), report); assert.match(artifacts.markdown, /unknown/);
  assert.ok(!artifacts.json.includes("Controlled Trip"));
});

test("H09 reconcile after restart never confirms again, applied receipt survives lost ACK", async () => {
  const f = boundary(); f.applied = true;
  const report = await runRuntimeRecovery({ ...input, action: "reconcile" }, f.transport);
  assert.equal(report.outcome, "applied"); assert.equal(report.confirmDispatches, 0);
});

test("H09 no receipt or inconsistent reload cannot turn a successful ACK into applied", async () => {
  for (const broken of ["read_trip_confirmation_receipt_v1", "trip_reload", "read_local_recovery_operation_v1"]) {
    const f = boundary(); f.failACK = false;
    const report = await runRuntimeRecovery(input, async (req, signal) => {
      const response = await f.transport(req, signal);
      if (req.name === broken && f.requests.some(r => r.name === "confirm_and_apply_trip_proposal")) {
        if (broken === "read_trip_confirmation_receipt_v1") return Response.json([]);
        const data = await response.json();
        if (broken === "trip_reload") data.trip.headVersion = 9;
        else data.receipt.proposalRevision = 2;
        return Response.json(data);
      }
      return response;
    });
    assert.equal(report.outcome, "unknown"); assert.equal(report.confirmDispatches, 1);
  }
});

test("H09 unknown transport result never blind retries or creates accounting/writer calls", async () => {
  const f = boundary();
  const report = await runRuntimeRecovery(input, async (req, signal) => {
    if (req.name === "confirm_and_apply_trip_proposal") throw new Error("No observed outcome");
    return f.transport(req, signal);
  });
  assert.equal(report.outcome, "unknown"); assert.equal(report.confirmDispatches, 1);
  assert.ok(f.requests.every(r => !/reserve|finish|submit|enqueue|settle/.test(r.name)));
});

test("H10 cancel and finite late readback proves cancelled only with unchanged Trip", async () => {
  for (const proposal of [true, false]) {
    const run = h10(proposal), f = boundary(run);
    const report = await runRuntimeRecovery(run, f.transport);
    assert.equal(report.outcome, "cancelled"); assert.equal(report.cancelDispatches, 1); assert.equal(report.confirmDispatches, 0);
    assert.ok(!f.requests.some(r => r.name === "confirm_and_apply_trip_proposal"));
  }
});

test("H10 late conflicting completed event fails closed and never applies", async () => {
  const run = h10(), f = boundary(run);
  const report = await runRuntimeRecovery(run, async (req, signal) => {
    const response = await f.transport(req, signal);
    if (req.name === "cancel_chat_turn") f.lateCompleted = true;
    return response;
  });
  assert.equal(report.outcome, "unknown"); assert.equal(report.code, "SERVICE_TASK_CONFLICT"); assert.equal(report.confirmDispatches, 0);
});

test("H10 late tool completion is observed and ignored; new tools/artifacts after cancellation fail", async () => {
  for (const kind of ["completed", "started", "artifact_ready"] as const) {
    const run = h10(false), f = boundary(run);
    let injected = false;
    const report = await runRuntimeRecovery(run, async (req, signal) => {
      const response = await f.transport(req, signal);
      if (req.name !== "read_assistant_events_v1" || Number(req.params.p_after_sequence) !== 1 || injected) return response;
      injected = true;
      const data = await response.json();
      const base = { eventId: `${run.context.conversationId}:3`, sequence: 3, taskId: run.context.taskId, turnId: run.context.turnId };
      data.events.push(kind === "artifact_ready" ? { ...base, type: kind, artifactId: id(90), revision: 1, availability: "recheck" }
        : { ...base, type: "task_progress", tool: "place.read", state: kind });
      data.lastSequence = 3;
      return Response.json(data);
    });
    assert.equal(report.outcome, kind === "completed" ? "cancelled" : "unknown");
    if (kind === "completed") assert.equal(report.lateEventsIgnored, 1);
    else assert.equal(report.code, "SERVICE_TASK_CONFLICT");
    assert.equal(report.confirmDispatches, 0);
  }
});

test("H10 a previously committed Trip reports applied rather than claiming undo", async () => {
  const run = h10(), f = boundary(run); f.applied = true;
  const report = await runRuntimeRecovery(run, f.transport);
  assert.equal(report.outcome, "applied"); assert.equal(report.tripVersion, 8);
});

test("H10 changed content at same version blocks cancelled classification", async () => {
  const run = h10(), f = boundary(run);
  const report = await runRuntimeRecovery(run, async (req, signal) => {
    const response = await f.transport(req, signal);
    if (req.name === "cancel_chat_turn") f.drift = true;
    return response;
  });
  assert.equal(report.outcome, "unknown");
});

test("owner/session/epoch/task/proposal/context bindings reject before mutation", async () => {
  for (const mutation of ["epoch", "task", "owner", "proposal", "context", "digest"]) {
    const f = boundary();
    const report = await runRuntimeRecovery(input, async (req, signal) => {
      const response = await f.transport(req, signal); const data = await response.json();
      if (mutation === "epoch" && req.name === "native_session_v2") data.mobileEpoch = 2;
      if (mutation === "task" && req.name === "read_assistant_events_v1") data.events[0].taskId = id(99);
      if (mutation === "owner" && req.name === "read_trip_proposal_v2") data[0].proposal.owner_id = id(99);
      if (mutation === "proposal" && req.name === "read_local_recovery_operation_v1") data.receipt.proposalId = id(99);
      if (mutation === "context" && req.name === "read_local_recovery_operation_v1") data.input.contextDigest = "f".repeat(64);
      if (mutation === "digest" && req.name === "read_trip_proposal_v2") data[0].digest = `trip-v2:${"f".repeat(64)}`;
      return Response.json(data);
    });
    assert.equal(report.outcome, "unknown", mutation); assert.equal(report.confirmDispatches, 0, mutation);
  }
});

test("mid-run session replacement blocks all later requests", async () => {
  const f = boundary();
  const report = await runRuntimeRecovery(input, async (req, signal) => {
    const response = await f.transport(req, signal);
    if (req.name === "read_trip_proposal_v2") f.epoch = 2;
    return response;
  });
  assert.equal(report.code, "UNAUTHENTICATED"); assert.equal(report.confirmDispatches, 0);
});

test("source retirement and malformed/foreign replay cursor block side effects", async () => {
  for (const mutate of ["retired", "foreign", "gap", "badStatus"]) {
    const f = boundary();
    const report = await runRuntimeRecovery(input, async (req, signal) => {
      const response = await f.transport(req, signal);
      if (req.name !== "read_assistant_events_v1") return response;
      const data = await response.json();
      if (mutate === "retired") data.events = [{ eventId: `${input.context.conversationId}:1`, sequence: 1, type: "source_retired", retiredSequence: 1 }];
      if (mutate === "foreign") data.conversationId = id(99);
      if (mutate === "gap") data.events[0].sequence = 2;
      if (mutate === "badStatus") data.events[0].status = "all_green";
      return Response.json(data);
    });
    assert.equal(report.outcome, "unknown"); assert.equal(report.confirmDispatches, 0);
  }
});

test("byte/UTF8/JSON/content-type/status bounds reject and keep raw response out of reports", async () => {
  for (const response of [
    () => new Response("{}", { headers: { "content-type": "application/json", "content-length": "262145" } }),
    () => new Response("x".repeat(262145), { headers: { "content-type": "application/json" } }),
    () => new Response(new Uint8Array([0xff]), { headers: { "content-type": "application/json" } }),
    () => new Response("private invalid input", { headers: { "content-type": "application/json" } }),
    () => new Response("{}", { headers: { "content-type": "text/html" } }),
    () => Response.json({ error: { code: "FORBIDDEN" } }, { status: 200 }),
    () => Response.json({ error: { code: "BOGUS_SECRET" } }, { status: 503 }),
  ]) {
    const report = await runRuntimeRecovery(input, async () => response());
    assert.equal(report.outcome, "unknown"); assert.equal(report.confirmDispatches, 0);
    assert.ok(!JSON.stringify(report).includes("BOGUS_SECRET"));
  }
});

test("closed production errors retain codes only with matching HTTP status", async () => {
  for (const [code, status] of [["FORBIDDEN", 403], ["UNAUTHENTICATED", 401], ["BUDGET_EXHAUSTED", 429], ["SERVICE_TASK_CONFLICT", 409]] as const) {
    const report = await runRuntimeRecovery(input, async () => Response.json({ error: { code } }, { status }));
    assert.equal(report.code, code); assert.equal(report.outcome, "unknown");
  }
});

test("existing direct PostgREST errors map closed SQL tokens without detail leakage", async () => {
  for (const [message, code] of [["SESSION_REPLACED", "UNAUTHENTICATED"], ["FORBIDDEN", "FORBIDDEN"], ["CONFIRMATION_DIGEST_MISMATCH", "INVALID_INPUT"],
    ["__proto__", "PROVIDER_UNAVAILABLE"], ["toString", "PROVIDER_UNAVAILABLE"], ["arbitrary private SQL detail", "PROVIDER_UNAVAILABLE"]]) {
    const report = await runRuntimeRecovery(input, async () => Response.json({ code: "P0001", message, details: "private SQL" }, { status: 400 }));
    assert.equal(report.code, code); assert.equal(report.confirmDispatches, 0);
    assert.ok(!JSON.stringify(report).includes("private SQL"));
  }
});

test("immutable recovery receipt changes and malformed Trip snapshots cannot prove success", async () => {
  for (const kind of ["receipt", "snapshot"]) {
    const f = boundary(); let reads = 0;
    const report = await runRuntimeRecovery(input, async (req, signal) => {
      const response = await f.transport(req, signal), data = await response.json();
      if (kind === "receipt" && req.name === "read_local_recovery_operation_v1" && ++reads > 1) data.receipt.expiresAt = "2098-01-01T00:00:00.000Z";
      if (kind === "snapshot" && req.name === "trip_reload") data.content.days = [{ id: "Bad", date: "2026-02-30", items: [] }];
      return Response.json(data);
    });
    assert.equal(report.outcome, "unknown");
  }
});

test("caller mutation cannot redirect detached frozen task/Trip/key binding", async () => {
  const mutable = { ...input, context: { ...input.context, source: { ...input.context.source } } }, f = boundary();
  const report = await runRuntimeRecovery(mutable, async (req, signal) => {
    mutable.context.taskId = id(99); mutable.context.tripId = id(99); mutable.idempotencyKey = id(99);
    assert.ok(Object.isFrozen(req.context)); assert.ok(Object.isFrozen(req.context.source));
    return f.transport(req, signal);
  });
  assert.equal(report.outcome, "applied");
  assert.ok(f.requests.every(req => req.context.taskId === input.context.taskId && req.context.tripId === input.context.tripId));
  assert.equal(report.binding?.idempotencyKey, input.idempotencyKey);
});

test("replay page budget and whole-run byte budget stop before any mutation", async () => {
  const f = boundary();
  const pageBound = await runRuntimeRecovery({ ...input, replayPages: 1 }, async (req, signal) => {
    if (req.name !== "read_assistant_events_v1") return f.transport(req, signal);
    return Response.json({ kind: "assistant_events", schemaVersion: "assistant-events/1", conversationId: input.context.conversationId,
      afterSequence: 0, lastSequence: 50, hasMore: true,
      events: Array.from({ length: 50 }, (_, i) => ({ eventId: `${input.context.conversationId}:${i + 1}`, sequence: i + 1, taskId: input.context.taskId, turnId: input.context.turnId, type: "task_status", status: "retrieving" })) });
  });
  assert.equal(pageBound.code, "SERVICE_TASK_CAPACITY_EXHAUSTED"); assert.equal(pageBound.confirmDispatches, 0);
  const byteBound = await runRuntimeRecovery(input, async (req, signal) => {
    const response = await f.transport(req, signal), data = await response.json();
    // Session accepts future harmless fields; whole-run byte bounds still precede parsing.
    if (req.name === "native_session_v2") data.extra = "x".repeat(240000);
    return Response.json(data);
  });
  assert.equal(byteBound.code, "MODEL_OUTPUT_INVALID"); assert.equal(byteBound.confirmDispatches, 0);
});

test("request/time bounds terminate hanging transport or body even if it ignores abort", async () => {
  const f = boundary();
  assert.equal((await runRuntimeRecovery({ ...input, maxRequests: 1 }, f.transport)).code, "RATE_LIMITED");
  for (const transport of [
    async () => new Promise<Response>(() => {}),
    async () => new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "application/json" } }),
  ]) {
    const started = Date.now();
    const report = await runRuntimeRecovery({ ...input, timeoutMs: 10 }, transport);
    assert.equal(report.code, "TIMEOUT_BEFORE_OUTPUT"); assert.ok(Date.now() - started < 1000);
  }
});

test("pre-abort/missing transport/invalid inputs are NOT_RUN without requests", async () => {
  const f = boundary(), controller = new AbortController(); controller.abort();
  assert.equal((await runRuntimeRecovery(input, f.transport, controller.signal)).mode, "NOT_RUN");
  assert.equal((await runRuntimeRecovery(input)).outcome, "NOT_RUN");
  for (const bad of [{ ...input, scenario: "H11" }, { ...input, timeoutMs: Infinity }, { ...input, maxRequests: 65 }, { ...input, action: "cancel" }, { ...input, secret: "never logged" }]) {
    assert.equal((await runRuntimeRecovery(bad, f.transport)).code, "INVALID_INPUT");
  }
  assert.equal(f.requests.length, 0);
});

test("closed invocation rejects Symbol, nonenumerable and accessor fields at every input seam", async () => {
  for (const target of ["root", "context", "source", "operation"]) for (const kind of ["symbol", "hidden", "getter"]) {
    const value = structuredClone(input);
    const object = target === "root" ? value : target === "context" ? value.context : target === "source" ? value.context.source : value.operation!;
    if (kind === "symbol") Object.defineProperty(object, Symbol("extra"), { value: 1 });
    else if (kind === "hidden") Object.defineProperty(object, "extra", { value: 1, enumerable: false });
    else Object.defineProperty(object, "extra", { get() { throw Error("private getter"); } });
    const f = boundary();
    const report = await runRuntimeRecovery(value, f.transport);
    assert.equal(report.code, "INVALID_INPUT"); assert.equal(report.outcome, "NOT_RUN"); assert.equal(f.requests.length, 0);
  }
});

test("monotonic deadline rejects synchronous late transport despite unscheduled timer", async () => {
  const f = boundary();
  const report = await runRuntimeRecovery({ ...input, timeoutMs: 10 }, async (req, signal) => {
    const until = performance.now() + 20;
    while (performance.now() < until) { /* intentionally starve the timeout timer */ }
    return f.transport(req, signal);
  });
  assert.equal(report.code, "TIMEOUT_BEFORE_OUTPUT"); assert.equal(report.outcome, "unknown"); assert.equal(report.confirmDispatches, 0);
});

test("zero-chunk and tiny-chunk streams have finite read bounds and release their reader", async () => {
  for (const size of [0, 1]) {
    let reads = 0, cancelled = false;
    const report = await runRuntimeRecovery(input, async () => new Response(new ReadableStream<Uint8Array>({
      pull(c) { reads++; c.enqueue(new Uint8Array(size)); }, cancel() { cancelled = true; },
    }), { headers: { "content-type": "application/json" } }));
    assert.equal(report.code, "MODEL_OUTPUT_INVALID"); assert.equal(report.outcome, "unknown"); assert.equal(report.confirmDispatches, 0);
    assert.ok(reads <= (size === 0 ? 67 : 4098)); assert.equal(cancelled, true);
  }
});

test("concrete native/RPC bridge calls existing paths with supplied fetch and forbids redirects", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher: typeof fetch = async (url, init) => { calls.push({ url: String(url), init }); return Response.json({}); };
  const bridge = createNativeRecoveryTransport({ databaseOrigin: "https://db.example", appOrigin: "https://app.example", rpcFetch: fetcher, nativeFetch: fetcher });
  await bridge({ name: "trip_reload", params: { tripId: input.context.tripId }, context: input.context }, new AbortController().signal);
  await bridge({ name: "cancel_chat_turn", params: { p_turn_id: input.context.turnId }, context: input.context }, new AbortController().signal);
  await bridge({ name: "confirm_and_apply_trip_proposal", params: { p_proposal_id: input.proposalId, p_idempotency_key: input.idempotencyKey, p_digest: input.digest }, context: input.context }, new AbortController().signal);
  assert.equal(calls[0].url, `https://app.example/api/trips/native/v2/${input.context.tripId}`);
  assert.equal(calls[1].url, "https://db.example/rest/v1/rpc/cancel_chat_turn");
  assert.ok(calls.every(c => c.init?.redirect === "error"));
  assert.throws(() => createNativeRecoveryTransport({ databaseOrigin: "https://db.example/path", appOrigin: "https://app.example", rpcFetch: fetcher, nativeFetch: fetcher }));
  const options = { databaseOrigin: "https://db.example", appOrigin: "https://app.example", rpcFetch: fetcher, nativeFetch: fetcher };
  Object.defineProperty(options, Symbol("extra"), { value: 1 });
  assert.throws(() => createNativeRecoveryTransport(options));
  const context = structuredClone(input.context);
  Object.defineProperty(context.source, "hidden", { value: 1 });
  await assert.rejects(bridge({ name: "trip_reload", params: { tripId: context.tripId }, context }, new AbortController().signal));
  assert.equal(calls.length, 3);
  const stableOptions = { databaseOrigin: "https://db.example", appOrigin: "https://app.example", rpcFetch: fetcher, nativeFetch: fetcher };
  const stableBridge = createNativeRecoveryTransport(stableOptions);
  stableOptions.nativeFetch = async () => { throw Error("redirected dependency"); };
  await stableBridge({ name: "trip_reload", params: { tripId: input.context.tripId }, context: input.context }, new AbortController().signal);
  assert.equal(calls.length, 4);
});

test("existing production durable worker ignores a late result after caller cancellation", async () => {
  const controller = new AbortController(), calls: string[] = [];
  let resolve: (v: "completed") => void = () => {};
  const work = runDurableTurnWork(async name => {
    calls.push(name);
    return { kind: "leased", turnId: input.context.turnId, ownerId: input.context.ownerId, attempt: 1, leaseToken: id(20), leaseMs: 1000 };
  }, async (_lease, signal) => {
    assert.equal(signal.aborted, false);
    const pending = new Promise<"completed">(r => { resolve = r; });
    controller.abort(); return pending;
  }, controller.signal);
  assert.equal(await work, "unavailable"); resolve("completed");
  await new Promise(r => setImmediate(r));
  assert.deepEqual(calls, ["claim_turn_work"]); // no finish/write when late completion arrives
  assert.throws(() => decodeAssistantEvents({ kind: "all_green" }, input.context.conversationId, 0));
});
