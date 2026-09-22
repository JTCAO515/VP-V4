import { isDeepStrictEqual } from "node:util";
import { parseGroundedHistory } from "../../../lib/grounded/read-model.ts";
import { recordedUsageTrace } from "./usage-trace.ts";

function invalid(): never { throw new Error("Invalid H04 recording"); }
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || !keys.every(key => Object.hasOwn(row, key))) return invalid();
  return row;
}
function snapshot(value: unknown, ownerId: string) {
  const row = record(value, ["ownerId", "complete", "trips"]);
  if (row.ownerId !== ownerId || ![true, false, null].includes(row.complete as boolean | null) || !Array.isArray(row.trips)) return invalid();
  const ids = new Set<string>();
  const trips = row.trips.map(value => {
    const trip = record(value, ["id", "content"]);
    if (typeof trip.id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(trip.id) || ids.has(trip.id)
      || !trip.content || typeof trip.content !== "object" || Array.isArray(trip.content)) return invalid();
    ids.add(trip.id);
    return { id: trip.id, content: trip.content };
  });
  if (row.complete !== true) return null;
  return trips.sort((a, b) => a.id.localeCompare(b.id));
}

/** Consumes existing recorded RPC projections, never dispatches a task or grants authority.
 * Raw input/Trip content stays in memory; only explicit content-free checks leave this adapter.
 */
export function recordedH04(raw: unknown) {
  try {
    const input = record(raw, ["schemaVersion", "mode", "usage", "policyReply", "historyReply", "elapsedMs", "before", "after"]);
    if (input.schemaVersion !== "vpj67-h04-recording/1" || !["fixture", "recorded-staging"].includes(String(input.mode))
      || typeof input.elapsedMs !== "number") return invalid();
    const usage = recordedUsageTrace(input.usage);
    const history = parseGroundedHistory(usage.binding.ownerId, input.policyReply, input.historyReply, usage.binding.policyId, input.elapsedMs);
    const turn = history.turns.find(row => row.id === usage.binding.turnId);
    const before = snapshot(input.before, usage.binding.ownerId), after = snapshot(input.after, usage.binding.ownerId);
    const checks = {
      taskLinked: !!turn && turn.taskId === usage.binding.serviceTaskId,
      usageLinked: usage.traceValidation === "PASS",
      clarification: !!turn && turn.status === "completed" && turn.outcome === "clarification" && turn.projection === "current",
      noActionableFacts: !!turn && turn.facts.length === 0 && turn.coverage === null,
      tripCountUnchanged: before !== null && after !== null ? before.length === after.length : null,
      tripContentUnchanged: before !== null && after !== null ? isDeepStrictEqual(before, after) : null,
    };
    return {
      schemaVersion: "vpj67-h04-report/1", caseId: "H04", mode: input.mode as "fixture" | "recorded-staging",
      language: turn?.locale ?? null, checks, recordingConsistency: Object.values(checks).includes(false) ? "FAIL" : Object.values(checks).includes(null) ? "EVIDENCE_INSUFFICIENT" : "PASS",
      binding: usage.binding, versions: usage.versions, attempts: usage.attempts,
      tripCounts: { before: before?.length ?? "unknown", after: after?.length ?? "unknown" }, elapsedMs: input.elapsedMs,
      // Supplied records are not authenticated observations; empty snapshots do not prove authorization.
      originAuthentication: "NOT_VERIFIED", snapshotCompleteness: "OPERATOR_DECLARED",
      acceptanceEvidence: "EVIDENCE_INSUFFICIENT",
      attemptSetCompleteness: usage.attemptSetCompleteness, currentAuthorization: "NOT_RECHECKED",
      ambiguityPrerequisite: "NOT_VERIFIED", clarificationTextSemantics: "NOT_RUN",
      nativeConsumer: "NOT_RUN", webConsumer: "RECORDED_RPC_PARSER_ONLY", requiredModeVerdict: "NOT_RUN",
      providerCallsMade: 0, databaseWritesMade: 0, fullAcceptance: "NOT_RUN",
    } as const;
  } catch { return invalid(); }
}
