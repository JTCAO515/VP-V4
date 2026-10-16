import type { AskRun } from "../../../evals/harness/runtime-ask/contract.ts";
import type { InventoryTransport } from "../../../evals/harness/runtime-trip-inventory/transport.ts";
import { inventoryDigest, type TripInventory } from "../../../lib/server/trip/inventory/contract.ts";
import { groundedEventFrames } from "../../../lib/server/turn/grounded-events.ts";
export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function plan(): AskRun {
  return { caseId: "H04", mode: "controlled", context: { ownerId: id(1), sessionId: id(2), mobileEpoch: 1, policyId: id(3), noticeVersion: "test-v1", noticeHash: "a".repeat(64), contextDigest: "b".repeat(64) },
    submission: { threadId: id(4), turnId: id(5), idempotencyKey: id(6), policyId: id(3), locale: "en", city: "shanghai", text: "PRIVATE REQUEST",
      serviceTask: { id: id(7), scopeVersion: 1, relationship: "new_goal", parentTurnId: null } }, currentTripId: null,
    expectation: { outcome: "clarification", factIds: [], sourceRevisionIds: [], gapIds: [] },
    bounds: { maxRequests: 64, timeoutMs: 1000, deadlineAt: new Date(Date.now() + 10000).toISOString(), maxPolls: 1, maxResponseBytes: 262144, maxTotalBytes: 1048576, maxReads: 4096, maxEmptyReads: 64 } };
}
export function snapshot(version = 0): TripInventory {
  const trips = [{ id: id(8), headVersion: version, title: "PRIVATE TRIP", updatedAt: "2026-10-16T00:00:00Z", content: { days: [] }, confirmationState: version === 0 ? "initial" as const : "unknown" as const }];
  return { schemaVersion: "native-trip-inventory/1", ownerId: id(1), coverage: "owner-visible-canonical-trips", complete: true, count: 1, trips, digest: inventoryDigest(id(1), trips) };
}
export function boundary(run = plan()) {
  const requests: Parameters<InventoryTransport>[0][] = []; let posted = false;
  const s = run.submission;
  const turn = { kind: "grounded_turn", schemaVersion: "grounded-turn/1", turnId: s.turnId, threadId: s.threadId, serviceTaskId: s.serviceTask.id, scopeVersion: 1,
    relationship: s.serviceTask.relationship, parentTurnId: s.serviceTask.parentTurnId, locale: s.locale, input: s.text, status: "completed", outcome: "clarification",
    output: "reviewed-answer-v1", createdAt: "2026-10-15T01:00:00Z", result: { type: "reviewed_answer", city: s.city, intent: "clarification", requestScope: "unknown", originalOutcome: "clarification", completedAt: "2026-10-15T01:00:01Z", projection: "current", knowledge: null } };
  const transport: InventoryTransport = async request => {
    requests.push(request);
    if (request.port === "inventory") return Response.json(snapshot());
    if (request.port === "session") return Response.json({ version: 2, subject: run.context.ownerId, sessionId: run.context.sessionId, mobileEpoch: run.context.mobileEpoch });
    if (request.port === "policy") return Response.json({ version: 4, kind: "policy", policy: { id: s.policyId, consentState: "accepted", noticeHash: run.context.noticeHash, noticeVersion: run.context.noticeVersion, expiresAt: "2099-01-01T00:00:00Z", provider: "qwen", recipient: "PRIVATE NOTICE", retention: "retain_after_hide_v1", noticeZh: "PRIVATE NOTICE", noticeEn: "PRIVATE NOTICE" } });
    if (request.port === "history") return Response.json({ version: 4, kind: "grounded_history", turns: posted ? [turn] : [] });
    if (request.port === "submit") { posted = true; return Response.json({ version: 4, kind: "accepted", turnId: s.turnId, reused: false, serviceTaskId: s.serviceTask.id, scopeVersion: 1, relationship: s.serviceTask.relationship, parentTurnId: null }, { status: 201 }); }
    if (request.port === "trip") throw Error("No unrelated selected Trip read");
    const frame = groundedEventFrames({ kind: "grounded_events", schemaVersion: "grounded-events/1", turn, events: [{ eventId: "accepted", sequence: 1, type: "accepted", state: "accepted" }, { eventId: "terminal", sequence: 2, type: "terminal", state: "completed" }], lastSequence: 2 }, s.turnId, request.cursor ?? 0);
    return new Response(frame.text, { headers: { "Content-Type": "text/event-stream" } });
  };
  return { run, requests, transport };
}
