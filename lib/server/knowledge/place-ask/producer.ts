import { createHash } from "node:crypto";
import { CANONICAL_PLACE_ASK_VERSION, parseCanonicalPlaceAsk, validExpectation, parseRecoveryKey, recoveryKey, record, exact, uuid, digest, sameId, type CanonicalPlaceAskRequest, type PlaceAskExpectation, type PlaceAskRecoveryKey } from "./contract.ts";

export const PLACE_ASK_REASONS = ["invalid_input", "unauthorized", "policy_denied", "incompatible_goal", "incompatible_task", "selection_changed", "selection_ambiguous", "source_unavailable", "original_submission_unsupported", "operation_conflict"] as const;
export type PlaceAskUnavailableReason = typeof PLACE_ASK_REASONS[number];
export type OriginalTaskReceipt = Readonly<{ version: 2 | 3; kind: "accepted"; turnId: string; reused: boolean; serviceTaskId: string; scopeVersion: 1; relationship: "new_goal" | "clarification" | "repair"; parentTurnId: string | null }>;
export type OriginalAssistantReceipt = Readonly<{ version: 5; kind: "accepted"; conversationId: string; messageId: string; sequence: number; goalId: string | null; scopeVersion: number | null; turnId: string | null; reused: boolean }>;
export type PlaceAskAccepted = Readonly<{
  schemaVersion: typeof CANONICAL_PLACE_ASK_VERSION; kind: "accepted";
  operation: PlaceAskRecoveryKey; originalReceipt: OriginalTaskReceipt | OriginalAssistantReceipt;
  binding: Readonly<{ turnId: string; serviceTaskId: string | null; goalId: string | null; goalVersion: number | null; requestDigest: string; expectation: PlaceAskExpectation }>;
  readyForProvider: false; currentEligibilityRequiresRead: true;
}>;
export type PlaceAskUnavailable = Readonly<{ schemaVersion: typeof CANONICAL_PLACE_ASK_VERSION; kind: "unavailable"; reason: PlaceAskUnavailableReason; readyForProvider: false }>;
export type PlaceAskUnknown = Readonly<{ schemaVersion: typeof CANONICAL_PLACE_ASK_VERSION; kind: "unknown"; operation: PlaceAskRecoveryKey; readyForProvider: false }>;
export type PlaceAskOutcome = PlaceAskAccepted | PlaceAskUnavailable | PlaceAskUnknown;
export type PlaceAskReadOutcome = PlaceAskUnavailable | PlaceAskUnknown
  | Readonly<{ schemaVersion: typeof CANONICAL_PLACE_ASK_VERSION; kind: "not_submitted"; operation: PlaceAskRecoveryKey; readyForProvider: false }>
  | Readonly<{ schemaVersion: typeof CANONICAL_PLACE_ASK_VERSION; kind: "recovered"; operation: PlaceAskRecoveryKey; receipt: PlaceAskAccepted; current: Readonly<{ kind: "pending" }> | Readonly<{ kind: "unavailable"; reason: PlaceAskUnavailableReason }> | Readonly<{ kind: "grounded"; turn: Record<string, unknown> }>; readyForProvider: false }>;
export type PlaceAskRpc = (name: "grounded_ai_assist_work_v1", params: Readonly<{ p_input: Readonly<{ action: "selected_submit"; requestBytes: string }> | Readonly<{ action: "selected_read"; operation: PlaceAskRecoveryKey }> }>) => Promise<Readonly<{ data: unknown; error: { message: string } | null }>>;
export const unavailable = (reason: PlaceAskUnavailableReason): PlaceAskUnavailable => ({ schemaVersion: CANONICAL_PLACE_ASK_VERSION, kind: "unavailable", reason, readyForProvider: false });
const unknown = (operation: PlaceAskRecoveryKey): PlaceAskUnknown => ({ schemaVersion: CANONICAL_PLACE_ASK_VERSION, kind: "unknown", operation, readyForProvider: false });
function sameExpectation(v: unknown, e: PlaceAskExpectation): boolean {
  return record(v) && exact(v, Object.keys(e)) && sameId(v.tripId, e.tripId) && v.headVersion === e.headVersion && sameId(v.referenceId, e.referenceId)
    && v.locale === e.locale && v.mappingDigest === e.mappingDigest && v.contextDigest === e.contextDigest
    && sameId(v.canonicalPoiId, e.canonicalPoiId) && v.provider === e.provider && v.providerPoiId === e.providerPoiId;
}
function sameOperation(value: unknown, key: PlaceAskRecoveryKey): boolean {
  const v = parseRecoveryKey(value);
  return !!v && sameId(v.operationId, key.operationId) && v.scopeKind === key.scopeKind && sameId(v.scopeId, key.scopeId)
    && sameId(v.messageId, key.messageId) && sameId(v.turnId, key.turnId);
}
function accepted(v: unknown, request?: CanonicalPlaceAskRequest): v is PlaceAskAccepted {
  if (!record(v) || !exact(v, ["schemaVersion", "kind", "operation", "originalReceipt", "binding", "readyForProvider", "currentEligibilityRequiresRead"])
    || v.schemaVersion !== CANONICAL_PLACE_ASK_VERSION || v.kind !== "accepted" || v.readyForProvider !== false || v.currentEligibilityRequiresRead !== true
    || !parseRecoveryKey(v.operation) || !record(v.originalReceipt) || !record(v.binding)) return false;
  const r = v.originalReceipt, b = v.binding, op = parseRecoveryKey(v.operation)!;
  if (!exact(b, ["turnId", "serviceTaskId", "goalId", "goalVersion", "requestDigest", "expectation"]) || !uuid(b.turnId) || !(b.serviceTaskId === null || uuid(b.serviceTaskId))
    || !(b.goalId === null || uuid(b.goalId)) || !(b.goalVersion === null || Number.isSafeInteger(b.goalVersion) && Number(b.goalVersion) > 0)
    || !digest(b.requestDigest) || !validExpectation(b.expectation) || r.kind !== "accepted" || typeof r.reused !== "boolean") return false;
  if (r.version === 2 || r.version === 3) {
    if (!exact(r, ["version", "kind", "turnId", "reused", "serviceTaskId", "scopeVersion", "relationship", "parentTurnId"])
      || !uuid(r.turnId) || !uuid(r.serviceTaskId) || !sameId(r.turnId, b.turnId) || !sameId(r.serviceTaskId, b.serviceTaskId) || r.scopeVersion !== 1
      || !["new_goal", "clarification", "repair"].includes(String(r.relationship)) || !(r.parentTurnId === null || uuid(r.parentTurnId))
      || (r.relationship === "new_goal") !== (r.parentTurnId === null) || b.goalId !== null || b.goalVersion !== null
      || op.scopeKind !== "thread" || !sameId(op.turnId, r.turnId)) return false;
  } else if (r.version === 5) {
    if (!exact(r, ["version", "kind", "conversationId", "messageId", "sequence", "goalId", "scopeVersion", "turnId", "reused"])
      || !uuid(r.conversationId) || !uuid(r.messageId) || !Number.isSafeInteger(r.sequence) || Number(r.sequence) < 1
      || !sameId(r.goalId, b.goalId) || r.scopeVersion !== b.goalVersion || !(r.turnId === null || sameId(r.turnId, b.turnId))
      || (r.goalId === null) !== (r.scopeVersion === null) || (r.turnId !== null) !== (r.goalId === null)
      || op.scopeKind !== "conversation" || !sameId(op.scopeId, r.conversationId) || !sameId(op.messageId, r.messageId) || !sameId(op.turnId, r.turnId)) return false;
  } else return false;
  if (!request) return true;
  if (!sameOperation(v.operation, recoveryKey(request))) return false;
  if (!sameExpectation(b.expectation, request.expectation)) return false;
  const s = request.submission;
  if ("serviceTask" in s) return (r.version === 2 || r.version === 3) && sameId(r.turnId, s.turnId) && sameId(r.serviceTaskId, s.serviceTask.id)
    && r.relationship === s.serviceTask.relationship && sameId(r.parentTurnId, s.serviceTask.parentTurnId);
  const version = s.relationship === "goal_start" ? 1 : s.relationship === "amendment" ? Number(s.expectedGoalVersion) + 1 : s.expectedGoalVersion;
  return r.version === 5 && sameId(r.conversationId, s.conversationId) && sameId(r.messageId, s.messageId) && sameId(r.goalId, s.goalId) && r.scopeVersion === version
    && sameId(r.turnId, s.turnId) && (s.taskId === null || sameId(b.serviceTaskId, s.taskId));
}
function deniedReply(v: unknown): v is PlaceAskUnavailable {
  return record(v) && exact(v, ["schemaVersion", "kind", "reason", "readyForProvider"]) && v.schemaVersion === CANONICAL_PLACE_ASK_VERSION
    && v.kind === "unavailable" && v.readyForProvider === false && PLACE_ASK_REASONS.includes(v.reason as PlaceAskUnavailableReason);
}
const denied: Readonly<Record<string, PlaceAskUnavailableReason>> = {
  INVALID_INPUT: "invalid_input", UNAUTHENTICATED: "unauthorized", SESSION_REPLACED: "unauthorized", FORBIDDEN: "unauthorized", DATA_POLICY_BLOCKED: "policy_denied",
  SERVICE_TASK_CONFLICT: "incompatible_task", GOAL_SCOPE_CONFLICT: "incompatible_goal", IDEMPOTENCY_KEY_REUSE: "operation_conflict", MAPPING_CHANGED: "selection_changed", STALE_TRIP_VERSION: "selection_changed",
};
const knownError = (message: string) => Object.keys(denied).find(code => new RegExp(`(?:^|\\W)${code}(?:$|\\W)`).test(message));
/** Exactly one owner transaction. No TS commit-then-bind, model or retry. */
export async function submitCanonicalPlaceAsk(value: unknown, ports: Readonly<{ rpc: PlaceAskRpc; current: () => Promise<boolean> }>, submittedBytes?: string): Promise<PlaceAskOutcome> {
  const request = parseCanonicalPlaceAsk(value);
  if (!request) return unavailable("invalid_input");
  const operation = recoveryKey(request);
  const requestBytes = submittedBytes ?? JSON.stringify(request);
  let raw: unknown;
  try { raw = JSON.parse(requestBytes); } catch { return unavailable("invalid_input"); }
  if (JSON.stringify(raw) !== JSON.stringify(request) || Buffer.byteLength(requestBytes, "utf8") > 24000) return unavailable("invalid_input");
  const requestDigest = createHash("sha256").update(requestBytes, "utf8").digest("hex");
  try {
    if (!await ports.current()) return unavailable("unauthorized");
    // The original assistant-message admission has no compatible grounded Task
    // in this version. Do not translate it into a second Task or new_goal.
    if ("conversationId" in request.submission) return unavailable("original_submission_unsupported");
    const reply = await ports.rpc("grounded_ai_assist_work_v1", { p_input: { action: "selected_submit", requestBytes } });
    if (!await ports.current()) return unknown(operation);
    if (reply.error) { const code = knownError(reply.error.message); return code ? unavailable(denied[code]) : unknown(operation); }
    return deniedReply(reply.data) ? reply.data : accepted(reply.data, request) && reply.data.binding.requestDigest === requestDigest ? structuredClone(reply.data) : unknown(operation);
  } catch { return unknown(operation); }
}
/** Recovery never admits, claims, retries a write, or runs a model. */
export async function readCanonicalPlaceAsk(value: unknown, ports: Readonly<{ rpc: PlaceAskRpc; current: () => Promise<boolean> }>): Promise<PlaceAskReadOutcome> {
  const operation = parseRecoveryKey(value);
  if (!operation) return unavailable("invalid_input");
  try {
    if (!await ports.current()) return unavailable("unauthorized");
    const reply = await ports.rpc("grounded_ai_assist_work_v1", { p_input: { action: "selected_read", operation } });
    if (!await ports.current()) return unknown(operation);
    if (reply.error) { const code = knownError(reply.error.message); return code ? unavailable(denied[code]) : unknown(operation); }
    const v = reply.data;
    if (deniedReply(v)) return v;
    if (!record(v) || v.schemaVersion !== CANONICAL_PLACE_ASK_VERSION || v.readyForProvider !== false) return unknown(operation);
    if (exact(v, ["schemaVersion", "kind", "operation", "readyForProvider"]) && v.kind === "not_submitted" && record(v.operation)
      && sameOperation(v.operation, operation)) return structuredClone(v) as PlaceAskReadOutcome;
    if (!exact(v, ["schemaVersion", "kind", "operation", "receipt", "current", "readyForProvider"]) || v.kind !== "recovered" || !sameOperation(v.operation, operation) || !accepted(v.receipt) || !sameOperation(v.receipt.operation, operation) || !record(v.current)) return unknown(operation);
    const r = v.receipt.originalReceipt;
    if (operation.scopeKind === "thread" ? !(r.version === 2 || r.version === 3) : r.version !== 5 || !sameId(r.conversationId, operation.scopeId)) return unknown(operation);
    if (v.current.kind === "pending" && exact(v.current, ["kind"])) return structuredClone(v) as PlaceAskReadOutcome;
    if (v.current.kind === "unavailable" && exact(v.current, ["kind", "reason"]) && PLACE_ASK_REASONS.includes(v.current.reason as PlaceAskUnavailableReason)) return structuredClone(v) as PlaceAskReadOutcome;
    if (v.current.kind === "grounded" && exact(v.current, ["kind", "turn"]) && record(v.current.turn) && v.current.turn.kind === "grounded_turn"
      && v.current.turn.schemaVersion === "grounded-turn/1" && record(v.current.turn.result) && v.current.turn.result.projection === "current" && sameId(v.current.turn.turnId, v.receipt.binding.turnId) && sameId(v.current.turn.serviceTaskId ?? null, v.receipt.binding.serviceTaskId)) return structuredClone(v) as PlaceAskReadOutcome;
    return unknown(operation);
  } catch { return unknown(operation); }
}
