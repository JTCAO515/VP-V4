import { isKnowledgeStatement, KNOWLEDGE_CITIES, KNOWLEDGE_SCENES, type KnowledgeReadScope, type KnowledgeStatement } from "../publication/statement.ts";

/** Rendering input from a trusted evidence planner, not a publication/use grant.
 * The integration MUST revalidate scope, rights, revision and expiry before sending
 * any content to a model and before displaying or restoring this projection.
 * requiredIds is server-owned; a model cannot decide what counts as complete.
 */
export type ReviewedSelectionPlan = Readonly<{
  scope: KnowledgeReadScope;
  requiredIds: readonly string[];
  statements: readonly Readonly<{ id: string; statement: KnowledgeStatement }>[];
}>;
export type ReviewedSelection = Readonly<{
  kind: "answered" | "partial" | "no_answer";
  missingRequiredIds: readonly string[];
  rows: readonly Readonly<{
    id: string;
    role: "required" | "background";
    text: string;
    conditions: readonly string[];
    exclusions: readonly string[];
  }>[];
}>;
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

/** A closed selection protocol, deliberately not a free-prose semantic verifier.
 * It never accepts model-written facts, conditions, outcomes or source locators.
 * Missing IDs denote coverage only; they do not establish a knowledge-gap cause.
 */
export function renderReviewedSelection(plan: ReviewedSelectionPlan, output: unknown): ReviewedSelection {
  if (!closed(plan, ["scope", "requiredIds", "statements"]) || !closed(plan.scope, ["city", "scene", "locale"])
    || !KNOWLEDGE_CITIES.includes(plan.scope.city) || !KNOWLEDGE_SCENES.includes(plan.scope.scene)
    || !["zh", "en"].includes(plan.scope.locale)
    || !ids(plan.requiredIds) || plan.requiredIds.length === 0
    || !Array.isArray(plan.statements) || plan.statements.length > 50) throw new TypeError("Invalid reviewed selection plan");
  const byId = new Map<string, KnowledgeStatement>();
  for (const entry of plan.statements) {
    if (!closed(entry, ["id", "statement"]) || typeof entry.id !== "string" || !idPattern.test(entry.id)
      || byId.has(entry.id) || !isKnowledgeStatement(entry.statement)
      || !entry.statement.scope.cities.includes(plan.scope.city) || entry.statement.scope.scene !== plan.scope.scene) {
      throw new TypeError("Invalid or out-of-scope reviewed statement");
    }
    byId.set(entry.id, entry.statement);
  }
  if (!closed(output, ["selectedStatementIds"]) || !ids(output.selectedStatementIds)
    || output.selectedStatementIds.some(id => !byId.has(id))) throw new TypeError("Invalid reviewed selection output");
  const selected = new Set(output.selectedStatementIds);
  // A model refusal/omission is not a knowledge gap when required evidence exists.
  if (plan.requiredIds.some(id => byId.has(id) && !selected.has(id))) throw new TypeError("Required reviewed evidence omitted");
  const required = new Set(plan.requiredIds);
  const missingRequiredIds = Object.freeze(plan.requiredIds.filter(id => !selected.has(id)));
  // Stable server order, independent of model ranking. This is the shared source
  // for both prose rows and cards; consumers must retain every qualifier.
  const rows = Object.freeze(plan.statements.filter(entry => selected.has(entry.id)).map(entry => {
    const expression = entry.statement.expressions[plan.scope.locale];
    return Object.freeze({ id: entry.id, role: required.has(entry.id) ? "required" as const : "background" as const,
      text: expression.text, conditions: Object.freeze([...expression.conditions]), exclusions: Object.freeze([...expression.exclusions]) });
  }));
  const coveredRequired = rows.some(row => row.role === "required");
  return Object.freeze({ kind: missingRequiredIds.length === 0 ? "answered" : coveredRequired ? "partial" : "no_answer",
    missingRequiredIds, rows });
}

function closed(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function ids(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length <= 50 && new Set(value).size === value.length
    && value.every(id => typeof id === "string" && idPattern.test(id));
}
