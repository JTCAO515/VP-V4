import { reviewedQuestionId, type ReviewedQuestionId } from "./questions.ts";
/** Model output is a routing suggestion, never evidence or a factual answer. */
export type KnowledgeIntent = Readonly<
  | { intent: ReviewedQuestionId; requestScope: "single" | "additional_needs" }
  | { intent: "clarification" | "unsupported"; requestScope: "unknown" }
>;

export function knowledgeIntent(value: unknown): KnowledgeIntent | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== 2) return null;
  const row = value as Record<string, unknown>;
  if (reviewedQuestionId(row.intent) !== null && (row.requestScope === "single" || row.requestScope === "additional_needs")) {
    return { intent: row.intent as ReviewedQuestionId, requestScope: row.requestScope as "single" | "additional_needs" };
  }
  return (row.intent === "clarification" || row.intent === "unsupported") && row.requestScope === "unknown"
    ? { intent: row.intent as "clarification" | "unsupported", requestScope: "unknown" } : null;
}
