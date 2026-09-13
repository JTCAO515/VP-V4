import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { QUESTION_DEFINITIONS, questionDefinition, reviewedQuestionId } from "../../../lib/server/knowledge/claim/questions.ts";

const records = JSON.parse(readFileSync(new URL("../../../docs/knowledge-base/batches/2026-09-12-first-party/statements.json", import.meta.url), "utf8")).records;

test("payment obligations match editorial relations without importing editorial content or eligibility", () => {
  const overview = questionDefinition("payment_getting_started")!;
  const candidates = records.filter((record: { editorialId: string }) => record.editorialId.startsWith("PAY-"));
  assert.equal(candidates.length, 4);
  assert.equal(overview.scene, "payment");
  assert.deepEqual(overview.claims, candidates.map((record: { statement: { assertion: { subjectId: string; predicate: string; objectId: string } } }) => {
    const { subjectId, predicate, objectId } = record.statement.assertion;
    return { subjectId, predicate, objectId };
  }));
  // Withdrawal of PAY-01 must be resolved against publications, not erased from the question.
  assert.deepEqual(questionDefinition("payment_card_acceptance")!.claims, [overview.claims[0]]);
  assert.deepEqual(questionDefinition("payment_mobile_setup")!.claims, [overview.claims[1]]);
  assert.deepEqual(questionDefinition("payment_cash_access")!.claims, overview.claims.slice(2));
  assert.deepEqual(questionDefinition("payment_mobile_and_cash")!.claims, overview.claims.slice(1));
  for (const definition of Object.values(QUESTION_DEFINITIONS)) {
    assert.equal(new Set(definition.claims.map(claim => claim.objectId)).size, definition.claims.length);
    assert.deepEqual(Object.keys(definition).sort(), ["claims", "scene"]);
    for (const claim of definition.claims) assert.deepEqual(Object.keys(claim).sort(), ["objectId", "predicate", "subjectId"]);
  }
});

test("question identity is closed, preserves rail, and rejects inherited or coercible keys", () => {
  for (const value of [null, undefined, 1, {}, ["payment_mobile_setup"], "constructor", "__proto__", "toString", "payment_fees", "payment_transfer", "PAY-02"]) {
    assert.equal(reviewedQuestionId(value), null);
    assert.equal(questionDefinition(value), null);
  }
  assert.deepEqual(questionDefinition("rail_boarding_documents")!.claims.map(claim => claim.objectId), ["original_valid_booking_id", "valid_ticket_not_itinerary_or_receipt"]);
});
