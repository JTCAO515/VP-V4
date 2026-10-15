import { isUuid } from "../../identity/request-guards.ts";
import { selection } from "../../explore/place-action-base.ts";

export const CANONICAL_PLACE_ASK_VERSION = "canonical-place-ask/1" as const;
type Locale = "zh" | "en";
export type OriginalTaskSubmission = Readonly<{
  threadId: string; turnId: string; idempotencyKey: string; policyId: string; locale: Locale; text: string;
  serviceTask: Readonly<{ id: string; scopeVersion: 1; relationship: "new_goal" | "clarification" | "repair"; parentTurnId: string | null }>;
}>;
export type OriginalAssistantSubmission = Readonly<{
  conversationId: string; messageId: string; idempotencyKey: string; policyId: string; locale: Locale; text: string;
  relationship: "independent_question" | "goal_start" | "follow_up" | "amendment" | "clarification";
  goalId: string | null; expectedGoalVersion: number | null; taskId: string | null; parentMessageId: string | null; turnId: string | null;
}>;
export type PlaceAskExpectation = Readonly<{
  tripId: string; headVersion: number; canonicalPoiId: string; provider: "amap" | "tencent"; providerPoiId: string;
  mappingDigest: string; contextDigest: string; referenceId: string | null; locale: Locale;
}>;
export type CanonicalPlaceAskRequest = Readonly<{
  schemaVersion: typeof CANONICAL_PLACE_ASK_VERSION;
  submission: OriginalTaskSubmission | OriginalAssistantSubmission;
  expectation: PlaceAskExpectation;
}>;
export const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const exact = (v: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
export const uuid = (v: unknown): v is string => typeof v === "string" && isUuid(v);
export const digest = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
export const sameId = (a: unknown, b: unknown): boolean => a === null || b === null ? a === b : uuid(a) && uuid(b) && a.toLowerCase() === b.toLowerCase();
const locale = (v: unknown): v is Locale => v === "zh" || v === "en";
const nullableId = (v: unknown): boolean => v === null || uuid(v);
const positive = (v: unknown): boolean => Number.isSafeInteger(v) && Number(v) > 0 && Number(v) <= 2147483647;
function validSubmission(v: unknown): v is CanonicalPlaceAskRequest["submission"] {
  if (!record(v) || !uuid(v.idempotencyKey) || !uuid(v.policyId) || !locale(v.locale)
    || typeof v.text !== "string" || !v.text.trim() || v.text.length > 4000) return false;
  if (Object.hasOwn(v, "threadId")) {
    if (!exact(v, ["threadId", "turnId", "idempotencyKey", "policyId", "locale", "text", "serviceTask"])
      || !uuid(v.threadId) || !uuid(v.turnId) || !record(v.serviceTask)
      || !exact(v.serviceTask, ["id", "scopeVersion", "relationship", "parentTurnId"])
      || !uuid(v.serviceTask.id) || sameId(v.serviceTask.id, v.turnId) || v.serviceTask.scopeVersion !== 1
      || !["new_goal", "clarification", "repair"].includes(String(v.serviceTask.relationship))
      || !nullableId(v.serviceTask.parentTurnId)) return false;
    return (v.serviceTask.relationship === "new_goal") === (v.serviceTask.parentTurnId === null);
  }
  if (!exact(v, ["conversationId", "messageId", "idempotencyKey", "policyId", "locale", "text", "relationship", "goalId", "expectedGoalVersion", "taskId", "parentMessageId", "turnId"])
    || !uuid(v.conversationId) || !uuid(v.messageId) || ![v.goalId, v.taskId, v.parentMessageId, v.turnId].every(nullableId)) return false;
  if (v.relationship === "independent_question") return uuid(v.turnId) && v.goalId === null && v.expectedGoalVersion === null && v.taskId === null && v.parentMessageId === null;
  if (v.relationship === "goal_start") return uuid(v.goalId) && v.expectedGoalVersion === null && v.taskId === null && v.parentMessageId === null && v.turnId === null;
  return ["follow_up", "amendment", "clarification"].includes(String(v.relationship)) && uuid(v.goalId) && positive(v.expectedGoalVersion)
    && uuid(v.parentMessageId) && v.turnId === null && (v.relationship !== "clarification" || v.taskId === null);
}
export function validExpectation(e: unknown): e is PlaceAskExpectation {
  return record(e) && exact(e, ["tripId", "headVersion", "canonicalPoiId", "provider", "providerPoiId", "mappingDigest", "contextDigest", "referenceId", "locale"])
    && uuid(e.tripId) && Number.isSafeInteger(e.headVersion) && Number(e.headVersion) >= 0 && Number(e.headVersion) <= 2147483647
    && selection({ canonicalPoiId: e.canonicalPoiId, provider: e.provider, providerPoiId: e.providerPoiId })
    && digest(e.mappingDigest) && digest(e.contextDigest) && nullableId(e.referenceId) && locale(e.locale);
}
export function parseCanonicalPlaceAsk(value: unknown): CanonicalPlaceAskRequest | null {
  try {
    if (!record(value) || !exact(value, ["schemaVersion", "submission", "expectation"]) || value.schemaVersion !== CANONICAL_PLACE_ASK_VERSION
      || !validSubmission(value.submission) || !validExpectation(value.expectation) || value.expectation.locale !== value.submission.locale) return null;
    // Original identities, field order and question whitespace are retained.
    return structuredClone(value) as CanonicalPlaceAskRequest;
  } catch { return null; }
}

export type PlaceAskRecoveryKey = Readonly<{ operationId: string; scopeKind: "thread" | "conversation"; scopeId: string; messageId: string | null; turnId: string | null }>;
export function recoveryKey(request: CanonicalPlaceAskRequest): PlaceAskRecoveryKey {
  const s = request.submission;
  return { operationId: s.idempotencyKey, scopeKind: "threadId" in s ? "thread" : "conversation", scopeId: "threadId" in s ? s.threadId : s.conversationId,
    messageId: "messageId" in s ? s.messageId : null, turnId: s.turnId };
}
export function parseRecoveryKey(value: unknown): PlaceAskRecoveryKey | null {
  if (!record(value) || !exact(value, ["operationId", "scopeKind", "scopeId", "messageId", "turnId"]) || !uuid(value.operationId) || !uuid(value.scopeId)
    || !nullableId(value.messageId) || !nullableId(value.turnId)) return null;
  if (value.scopeKind === "thread" ? value.messageId !== null || !uuid(value.turnId) : value.scopeKind !== "conversation" || !uuid(value.messageId)) return null;
  return structuredClone(value) as PlaceAskRecoveryKey;
}
