/** Model output is a routing suggestion, never evidence or a factual answer. */
export type KnowledgeIntent = Readonly<
  | { intent: "rail_boarding_documents"; requestScope: "single" | "additional_needs" }
  | { intent: "clarification" | "unsupported"; requestScope: "unknown" }
>;

export function knowledgeIntent(value: unknown): KnowledgeIntent | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== 2) return null;
  const row = value as Record<string, unknown>;
  if (row.intent === "rail_boarding_documents" && ["single", "additional_needs"].includes(String(row.requestScope))) {
    return { intent: row.intent, requestScope: row.requestScope as "single" | "additional_needs" };
  }
  return ["clarification", "unsupported"].includes(String(row.intent)) && row.requestScope === "unknown"
    ? { intent: row.intent as "clarification" | "unsupported", requestScope: "unknown" } : null;
}
