import { isPlaceQuestionId, reviewedQuestionId, type ReviewedQuestionId } from "./questions.ts";
/** Model output is a routing suggestion, never evidence or a factual answer. */
export type KnowledgeIntent = Readonly<({ unansweredNeeds?: readonly string[]; placeName?: string } & (
  | { intent: ReviewedQuestionId; requestScope: "single" | "additional_needs" }
  | { intent: "clarification" | "unsupported"; requestScope: "unknown" }
))>;

export function knowledgeIntent(value: unknown, input?: string): KnowledgeIntent | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || ![2, 3, 4].includes(Object.keys(value).length)) return null;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !["intent", "requestScope", "unansweredNeeds", "placeName"].includes(key))) return null;
  const place = isPlaceQuestionId(row.intent);
  if (place !== Object.hasOwn(row, "placeName")) return null;
  if (place && (typeof row.placeName !== "string" || !row.placeName.trim() || row.placeName.length > 160
    || /[\u0000-\u001f\u007f\uD800-\uDFFF]/u.test(row.placeName) || typeof input !== "string" || !input.includes(row.placeName)
    || !Object.hasOwn(row, "unansweredNeeds"))) return null;
  const extra = Object.hasOwn(row, "unansweredNeeds");
  if (extra && (!Array.isArray(row.unansweredNeeds) || row.unansweredNeeds.length > 6
    || row.unansweredNeeds.some(x => typeof x !== "string" || !x.trim() || [...x].length > 240 || x.includes("\0") || /[\uD800-\uDFFF]/u.test(x) || typeof input !== "string" || !input.includes(x))
    || new Set(row.unansweredNeeds).size !== row.unansweredNeeds.length
    || (row.requestScope === "additional_needs") !== (row.unansweredNeeds.length > 0))) return null;
  const needs = extra ? { unansweredNeeds: row.unansweredNeeds as string[] } : {};
  if (reviewedQuestionId(row.intent) !== null && (row.requestScope === "single" || row.requestScope === "additional_needs")) {
    return { ...needs, ...(place ? { placeName: row.placeName as string } : {}), intent: row.intent as ReviewedQuestionId, requestScope: row.requestScope as "single" | "additional_needs" };
  }
  return (row.intent === "clarification" || row.intent === "unsupported") && row.requestScope === "unknown"
    ? { ...needs, intent: row.intent as "clarification" | "unsupported", requestScope: "unknown" } : null;
}
