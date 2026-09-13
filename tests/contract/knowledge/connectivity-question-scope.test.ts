import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { questionDefinition } from "../../../lib/server/knowledge/claim/questions.ts";
import { knowledgeIntent } from "../../../lib/server/knowledge/claim/intent.ts";

test("SIM obligations match the reviewed editorial relations without content or eligibility shortcuts", () => {
  const records = JSON.parse(readFileSync(new URL("../../../docs/knowledge-base/batches/2026-09-12-first-party/statements.json", import.meta.url), "utf8")).records;
  const expected = records.filter((r: { editorialId: string }) => r.editorialId.startsWith("SIM-")).map((r: { statement: { assertion: { subjectId: string; predicate: string; objectId: string } } }) => {
    const { subjectId, predicate, objectId } = r.statement.assertion;
    return { subjectId, predicate, objectId };
  });
  assert.equal(expected.length, 2);
  assert.deepEqual(questionDefinition("connectivity_getting_started"), { scene: "connectivity", claims: expected });
  assert.deepEqual(questionDefinition("connectivity_sim_documents")!.claims, [expected[0]]);
  assert.deepEqual(questionDefinition("connectivity_plan_allowances")!.claims, [expected[1]]);
  for (const intent of ["connectivity_getting_started", "connectivity_sim_documents", "connectivity_plan_allowances"]) {
    for (const requestScope of ["single", "additional_needs"]) assert.deepEqual(knowledgeIntent({ intent, requestScope }), { intent, requestScope });
    assert.equal(knowledgeIntent({ intent, requestScope: "single", facts: [] }), null);
  }
  for (const id of ["connectivity_esim", "connectivity_current_price", "connectivity_activate", "SIM-01", "__proto__"]) {
    assert.equal(questionDefinition(id), null);
    assert.equal(knowledgeIntent({ intent: id, requestScope: "single" }), null);
  }
});
