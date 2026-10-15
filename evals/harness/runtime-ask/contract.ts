import { uuid, hash, integer } from "../../../lib/server/today/recovery/contract.ts";
import { ownExact, record } from "../runtime-recovery/contract.ts";

export type AskSubmission = Readonly<{
  threadId: string; turnId: string; idempotencyKey: string; policyId: string;
  locale: "zh" | "en"; city: "shanghai" | "beijing" | "guangzhou" | "chongqing"; text: string;
  serviceTask: Readonly<{ id: string; scopeVersion: 1; relationship: "new_goal" | "clarification" | "repair"; parentTurnId: string | null }>;
}>;
export type AskRun = Readonly<{
  caseId: "H01" | "H04" | "H07"; mode: "controlled" | "staging";
  context: Readonly<{ ownerId: string; sessionId: string; mobileEpoch: number; policyId: string; noticeVersion: string; noticeHash: string; contextDigest: string }>;
  submission: AskSubmission; currentTripId: string | null;
  expectation: Readonly<{ outcome: "answered" | "clarification" | "partial"; factIds: readonly string[]; sourceRevisionIds: readonly string[]; gapIds: readonly string[] }>;
  bounds: Readonly<{ maxRequests: number; timeoutMs: number; deadlineAt: string; maxPolls: number; maxResponseBytes: number; maxTotalBytes: number; maxReads: number; maxEmptyReads: number }>;
}>;
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max && !v.includes("\0");
const strings = (v: unknown, check: (x: unknown) => boolean, max: number): v is string[] => {
  if (!Array.isArray(v) || v.length > max || Reflect.ownKeys(v).length !== v.length + 1) return false;
  for (let i = 0; i < v.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(v, String(i));
    if (!descriptor || descriptor.enumerable !== true || !Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "string" || !check(descriptor.value)) return false;
  }
  return new Set(v).size === v.length;
};

/** One closed DTO validator; both run admission and the standalone bridge execute it. */
export function parseAskSubmission(value: unknown): AskSubmission | null {
  try {
    if (!record(value) || !ownExact(value, ["threadId", "turnId", "idempotencyKey", "policyId", "locale", "city", "text", "serviceTask"])
      || ![value.threadId, value.turnId, value.idempotencyKey, value.policyId].every(uuid)
      || (value.locale !== "zh" && value.locale !== "en") || typeof value.city !== "string"
      || !["shanghai", "beijing", "guangzhou", "chongqing"].includes(value.city) || !text(value.text, 4000)
      || !record(value.serviceTask) || !ownExact(value.serviceTask, ["id", "scopeVersion", "relationship", "parentTurnId"])
      || !uuid(value.serviceTask.id) || value.serviceTask.id === value.turnId || value.serviceTask.scopeVersion !== 1
      || typeof value.serviceTask.relationship !== "string" || !["new_goal", "clarification", "repair"].includes(value.serviceTask.relationship)
      || (value.serviceTask.relationship === "new_goal" ? value.serviceTask.parentTurnId !== null
        : !uuid(value.serviceTask.parentTurnId) || value.serviceTask.parentTurnId === value.turnId)) return null;
    return structuredClone(value) as AskSubmission;
  } catch { return null; }
}

/** Native v4 submission DTO, current identity/notice, fixed development expectation
 * and technical bounds only. This declaration grants no session/consent/dispatch authority. */
export function parseAskRun(value: unknown): AskRun | null {
  try {
    if (!record(value) || !ownExact(value, ["caseId", "mode", "context", "submission", "currentTripId", "expectation", "bounds"])
      || typeof value.caseId !== "string" || !["H01", "H04", "H07"].includes(value.caseId)
      || typeof value.mode !== "string" || !["controlled", "staging"].includes(value.mode)
      || !record(value.context) || !ownExact(value.context, ["ownerId", "sessionId", "mobileEpoch", "policyId", "noticeVersion", "noticeHash", "contextDigest"])
      || ![value.context.ownerId, value.context.sessionId, value.context.policyId].every(uuid) || !integer(value.context.mobileEpoch, 1)
      || !text(value.context.noticeVersion, 100) || !hash(value.context.noticeHash) || !hash(value.context.contextDigest)
      || (value.currentTripId !== null && !uuid(value.currentTripId))
      || !record(value.expectation) || !ownExact(value.expectation, ["outcome", "factIds", "sourceRevisionIds", "gapIds"])
      || value.expectation.outcome !== ({ H01: "answered", H04: "clarification", H07: "partial" } as Record<string, string>)[value.caseId]
      || !strings(value.expectation.factIds, uuid, 50) || !strings(value.expectation.sourceRevisionIds, uuid, 150)
      || !strings(value.expectation.gapIds, v => typeof v === "string" && /^[a-z][a-z0-9_]{0,127}$/.test(v), 12)
      || (value.caseId === "H04" ? value.expectation.factIds.length !== 0 || value.expectation.sourceRevisionIds.length !== 0 || value.expectation.gapIds.length !== 0
        : value.expectation.factIds.length === 0 || value.expectation.sourceRevisionIds.length === 0 || (value.caseId === "H07" && value.expectation.gapIds.length === 0))
      || !record(value.bounds) || !ownExact(value.bounds, ["maxRequests", "timeoutMs", "deadlineAt", "maxPolls", "maxResponseBytes", "maxTotalBytes", "maxReads", "maxEmptyReads"])
      || !integer(value.bounds.maxRequests, 1) || value.bounds.maxRequests > 64 || !integer(value.bounds.timeoutMs, 1) || value.bounds.timeoutMs > 20000
      || !text(value.bounds.deadlineAt, 24) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.bounds.deadlineAt)
      || !Number.isFinite(Date.parse(value.bounds.deadlineAt)) || new Date(value.bounds.deadlineAt).toISOString() !== value.bounds.deadlineAt
      || !integer(value.bounds.maxPolls, 1) || value.bounds.maxPolls > 8
      || !integer(value.bounds.maxResponseBytes, 1) || value.bounds.maxResponseBytes > 262144
      || !integer(value.bounds.maxTotalBytes, 1) || value.bounds.maxTotalBytes > 1048576 || value.bounds.maxTotalBytes < value.bounds.maxResponseBytes
      || !integer(value.bounds.maxReads, 1) || value.bounds.maxReads > 4096
      || !integer(value.bounds.maxEmptyReads) || value.bounds.maxEmptyReads > 64) return null;
    const submission = parseAskSubmission(value.submission);
    if (!submission || submission.policyId !== value.context.policyId) return null;
    return { ...structuredClone(value), submission } as AskRun;
  } catch { return null; }
}
