import { uuid, hash, integer, exact, parseRecoverySelection, type RecoverySelection } from "../../../lib/server/today/recovery/contract.ts";

export type RuntimeContext = Readonly<{
  ownerId: string; sessionId: string; mobileEpoch: number;
  taskId: string; turnId: string; conversationId: string; policyId: string; tripId: string;
  source: Readonly<{ apiSha: string; workerSha: string; configurationDigest: string }>;
}>;
export type RecoveryRun = Readonly<{
  scenario: "H09" | "H10"; mode: "controlled" | "staging";
  action: "reconcile" | "confirm_once" | "cancel";
  context: RuntimeContext; baseVersion: number; operation: RecoverySelection | null;
  proposalId: string | null; proposalRevision: number | null; digest: string | null; idempotencyKey: string | null;
  maxRequests: number; timeoutMs: number; replayPages: number;
}>;
export const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Exact, content-free invocation. Context describes caller binding; it grants no authority. */
export function parseRun(v: unknown): RecoveryRun | null {
  if (!record(v) || !exact(v, ["scenario", "mode", "action", "context", "baseVersion", "operation", "proposalId", "proposalRevision", "digest", "idempotencyKey", "maxRequests", "timeoutMs", "replayPages"])
    || !["H09", "H10"].includes(String(v.scenario)) || !["controlled", "staging"].includes(String(v.mode))
    || (v.scenario === "H09" ? !["reconcile", "confirm_once"].includes(String(v.action)) : !["reconcile", "cancel"].includes(String(v.action)))
    || !record(v.context) || !exact(v.context, ["ownerId", "sessionId", "mobileEpoch", "taskId", "turnId", "conversationId", "policyId", "tripId", "source"])
    || ![v.context.ownerId, v.context.sessionId, v.context.taskId, v.context.turnId, v.context.conversationId, v.context.policyId, v.context.tripId].every(uuid)
    || v.context.taskId === v.context.turnId || !integer(v.context.mobileEpoch, 1)
    || !record(v.context.source) || !exact(v.context.source, ["apiSha", "workerSha", "configurationDigest"])
    || ![v.context.source.apiSha, v.context.source.workerSha].every(s => typeof s === "string" && /^[0-9a-f]{40}$/.test(s))
    || !hash(v.context.source.configurationDigest) || !integer(v.baseVersion)
    || !integer(v.maxRequests, 1) || v.maxRequests > 64 || !integer(v.timeoutMs, 1) || v.timeoutMs > 60000
    || !integer(v.replayPages, 1) || v.replayPages > 8) return null;
  const absent = v.operation === null && v.proposalId === null && v.proposalRevision === null && v.digest === null && v.idempotencyKey === null;
  if (absent ? v.scenario !== "H10" : !parseRecoverySelection(v.operation) || !uuid(v.proposalId) || !uuid(v.idempotencyKey)
    || !integer(v.proposalRevision, 1) || typeof v.digest !== "string" || !/^trip-v2:[0-9a-f]{64}$/.test(v.digest)) return null;
  return structuredClone(v) as RecoveryRun;
}
