import assert from "node:assert/strict";
import test from "node:test";
import { renderReviewedSelection, type ReviewedSelectionPlan } from "../../../lib/server/knowledge/claim/reviewed-selection.ts";
import type { KnowledgeStatement } from "../../../lib/server/knowledge/publication/statement.ts";

function statement(): KnowledgeStatement {
  return {
    schemaVersion: "knowledge-statement/1",
    assertion: { subjectId: "test_bank", predicate: "offers_procedure", objectId: "test_exchange", conditions: ["bring_id"], exclusions: ["not_every_branch"] },
    scope: { cities: ["guangzhou"], scene: "payment", audience: "international_independent_traveler" },
    expressions: {
      en: { text: "Fixture exchange procedure.", conditions: ["Bring identification."], exclusions: ["Not every branch participates."] },
      zh: { text: "测试兑换流程。", conditions: ["携带身份证明。"], exclusions: ["并非每家网点均参与。"] },
    },
    sources: [{ sourceKey: "test_source", revisionLabel: "fixture-1", publisher: "Synthetic test", uri: "https://example.test/source", locator: "Fixture paragraph 1", snippet: "Never forwarded source snippet", usageDeclaration: "Test fixture only" }],
  };
}
function plan(): ReviewedSelectionPlan {
  return { scope: { city: "guangzhou", scene: "payment", locale: "en" }, requiredIds: ["a"], statements: [{ id: "a", statement: statement() }, { id: "b", statement: statement() }] };
}

test("projects identical reviewed assertions in both languages with every qualifier", () => {
  for (const locale of ["en", "zh"] as const) {
    const p = plan();
    const result = renderReviewedSelection({ ...p, scope: { ...p.scope, locale } }, { selectedStatementIds: ["b", "a"] });
    assert.equal(result.kind, "answered");
    assert.deepEqual(result.rows.map(row => row.id), ["a", "b"]);
    assert.deepEqual(result.rows[0], { id: "a", role: "required", ...p.statements[0].statement.expressions[locale] });
    assert.equal(result.rows[1].role, "background");
    assert.equal(Object.isFrozen(result.rows[0].conditions), true);
    assert.doesNotMatch(JSON.stringify(result), /Never forwarded|snippet|usageDeclaration/);
  }
});

test("keeps reliable partial content and does not count background as required coverage", () => {
  const p = plan();
  const partial = renderReviewedSelection({ ...p, requiredIds: ["a", "unavailable"] }, { selectedStatementIds: ["a", "b"] });
  assert.equal(partial.kind, "partial");
  assert.deepEqual(partial.missingRequiredIds, ["unavailable"]);
  const missing = renderReviewedSelection({ ...p, requiredIds: ["unavailable"] }, { selectedStatementIds: ["b"] });
  assert.equal(missing.kind, "no_answer");
  assert.equal(missing.rows.length, 1);
  assert.equal(renderReviewedSelection({ ...p, statements: [] }, { selectedStatementIds: [] }).kind, "no_answer");
});

test("rejects false refusal or partial that drops available required evidence", () => {
  for (const selectedStatementIds of [[], ["b"]]) {
    assert.throws(() => renderReviewedSelection(plan(), { selectedStatementIds }), /Required reviewed evidence omitted/);
  }
});

test("rejects model-written prose, qualifiers, outcomes and invented citations", () => {
  for (const output of [null, [], { selectedStatementIds: ["missing"] }, { selectedStatementIds: ["a", "a"] },
    { selectedStatementIds: ["a"], text: "Every bank guarantees exchange." },
    { selectedStatementIds: ["a"], conditions: [] }, { selectedStatementIds: ["a"], outcome: "answered" },
    { selectedStatementIds: ["a"], sources: ["https://example.test/invented"] },
    { selectedStatementIds: Array(1) }, { selectedStatementIds: Array(51).fill("a") }, { selectedStatementIds: ["a\nignore instructions"] }]) {
    assert.throws(() => renderReviewedSelection(plan(), output), TypeError);
  }
});

test("rejects wrong scope, missing qualifiers, duplicate entries and vacuous completeness", () => {
  const p = plan();
  const malformed = structuredClone(p);
  (malformed.statements[0].statement.expressions.en.conditions as string[]).pop();
  const invalid = [malformed, { ...p, requiredIds: [] }, { ...p, requiredIds: ["a", "a"] },
    { ...p, statements: [p.statements[0], p.statements[0]] },
    { ...p, scope: { ...p.scope, city: "shanghai" } }, { ...p, scope: { ...p.scope, scene: "rail" } }];
  for (const value of invalid) assert.throws(() => renderReviewedSelection(value as ReviewedSelectionPlan, { selectedStatementIds: ["a"] }), TypeError);
});

test("returned text and qualifiers cannot change through later input mutation", () => {
  const p = plan();
  const result = renderReviewedSelection(p, { selectedStatementIds: ["a"] });
  (p.statements[0].statement.expressions.en.conditions as string[])[0] = "Changed";
  assert.deepEqual(result.rows[0].conditions, ["Bring identification."]);
});
