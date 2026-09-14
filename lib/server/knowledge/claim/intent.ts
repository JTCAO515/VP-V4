import { isPlaceQuestionId, reviewedQuestionId, type ReviewedQuestionId } from "./questions.ts";
/** Model output is a routing suggestion, never evidence or a factual answer. */
export type KnowledgeIntent = Readonly<({ unansweredNeeds?: readonly string[]; placeName?: string } & (
  | { intent: ReviewedQuestionId; requestScope: "single" | "additional_needs" }
  | { intent: "clarification" | "unsupported"; requestScope: "unknown" }
))>;

export type KnowledgeIntentRejection = "object_shape" | "unknown_keys" | "place_name_presence" | "place_name_invalid" | "unanswered_needs_invalid" | "intent_scope_invalid";
export type KnowledgeIntentValidation =
  | Readonly<{ kind: "valid"; value: KnowledgeIntent }>
  | Readonly<{ kind: "invalid"; reason: KnowledgeIntentRejection }>;

export function knowledgeIntent(value: unknown, input?: string): KnowledgeIntent | null {
  const result = validateKnowledgeIntent(value, input);
  return result.kind === "valid" ? result.value : null;
}

/** Fixed reason codes only: never return model text, field values or user excerpts. */
export function validateKnowledgeIntent(value: unknown, input?: string): KnowledgeIntentValidation {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || ![2, 3, 4].includes(Object.keys(value).length)) return { kind: "invalid", reason: "object_shape" };
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !["intent", "requestScope", "unansweredNeeds", "placeName"].includes(key))) return { kind: "invalid", reason: "unknown_keys" };
  const place = isPlaceQuestionId(row.intent);
  if (place !== Object.hasOwn(row, "placeName")) return { kind: "invalid", reason: "place_name_presence" };
  if (place && (typeof row.placeName !== "string" || !row.placeName.trim() || row.placeName.length > 160
    || /[\u0000-\u001f\u007f\uD800-\uDFFF]/u.test(row.placeName) || typeof input !== "string" || !input.includes(row.placeName)
    || !Object.hasOwn(row, "unansweredNeeds"))) return { kind: "invalid", reason: "place_name_invalid" };
  const extra = Object.hasOwn(row, "unansweredNeeds");
  if (extra && (!Array.isArray(row.unansweredNeeds) || row.unansweredNeeds.length > 6
    || row.unansweredNeeds.some(x => typeof x !== "string" || !x.trim() || [...x].length > 240 || x.includes("\0") || /[\uD800-\uDFFF]/u.test(x) || typeof input !== "string" || !input.includes(x))
    || new Set(row.unansweredNeeds).size !== row.unansweredNeeds.length
    || (row.requestScope === "additional_needs") !== (row.unansweredNeeds.length > 0))) return { kind: "invalid", reason: "unanswered_needs_invalid" };
  const needs = extra ? { unansweredNeeds: row.unansweredNeeds as string[] } : {};
  if (reviewedQuestionId(row.intent) !== null && (row.requestScope === "single" || row.requestScope === "additional_needs")) {
    return { kind: "valid", value: { ...needs, ...(place ? { placeName: row.placeName as string } : {}), intent: row.intent as ReviewedQuestionId, requestScope: row.requestScope as "single" | "additional_needs" } };
  }
  return (row.intent === "clarification" || row.intent === "unsupported") && row.requestScope === "unknown"
    ? { kind: "valid", value: { ...needs, intent: row.intent as "clarification" | "unsupported", requestScope: "unknown" } } : { kind: "invalid", reason: "intent_scope_invalid" };
}
