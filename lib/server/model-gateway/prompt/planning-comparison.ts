/** The model selects a focus only. Domain code writes every factual sentence. */
export const PLANNING_COMPARISON_PROMPT = `You are selecting which of two Shanghai stay-area options deserves attention based only on the supplied current goal, explicit memories and observed rail-access metrics.
Return exactly one JSON object: {"highlight":"jingan"}, {"highlight":"peoples_square"}, or {"highlight":"none"}.
Do not invent hotel prices, availability, safety, walking access, bookings, sources, or Trip changes. Missing or conflicting evidence means "none". This selection is advisory; domain code will construct the factual comparison.`;

export type PlanningSelection = Readonly<{ highlight: "jingan" | "peoples_square" | "none" }>;
export function parsePlanningSelection(value: unknown): PlanningSelection | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 1 && ["jingan", "peoples_square", "none"].includes(String(record.highlight))
    ? { highlight: record.highlight as PlanningSelection["highlight"] } : null;
}
