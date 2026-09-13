import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { parseGroundedHistory, sourceLink } from "../../../lib/grounded/read-model.ts";
import { savedAnswerNotice } from "../../../lib/grounded/copy.ts";

function fixture() {
  const owner = randomUUID(), policyId = randomUUID();
  const claims = ["original_valid_booking_id", "valid_ticket_not_itinerary_or_receipt"];
  const statements = claims.map(objectId => ({ factId: randomUUID(), assertionId: randomUUID(), version: 1, assertionRevision: 1,
    assertion: { subjectId: "rail_eticket_boarding", predicate: "requires_document", objectId, conditions: ["adult"], exclusions: [] },
    text: "Synthetic reviewed fact", conditions: ["Synthetic adults only"], exclusions: [],
    reviewedAt: "2026-09-01T00:00:00Z", publishedAt: "2026-09-02T00:00:00Z", expiresAt: "2026-09-13T00:00:10Z",
    sources: [{ sourceRevisionId: randomUUID(), publisher: "Synthetic publisher", uri: "https://example.test/source", locator: "Synthetic section" }] }));
  const knowledge = { schemaVersion: "knowledge-answer/1", evaluatedAt: "2026-09-13T00:00:00Z", purpose: "trip_planning", recipient: "first_party", territory: "CN-mainland",
    scope: { city: "shanghai", scene: "rail", locale: "en" }, status: "available", statements,
    answer: { questionId: "rail_boarding_documents", questionVersion: 1, outcome: "answered", claims: claims.map((id, index) => ({ id, status: "covered", factIds: [statements[index].factId], reasons: [] as string[] })) } };
  const turn = { kind: "grounded_turn", schemaVersion: "grounded-turn/1", turnId: randomUUID(), threadId: randomUUID(), serviceTaskId: randomUUID(), scopeVersion: 1,
    relationship: "new_goal", parentTurnId: null, locale: "en", input: "Synthetic question", status: "completed", outcome: "answered", output: "reviewed-answer-v1", createdAt: "2026-09-12T00:00:00Z",
    result: { type: "reviewed_answer", city: "shanghai", intent: "rail_boarding_documents", requestScope: "single", originalOutcome: "answered", completedAt: "2026-09-12T00:00:01Z", projection: "current", knowledge } };
  const policy = { kind: "policy", policy: { id: policyId, consentState: "accepted" } }, history = { kind: "grounded_history", turns: [turn] };
  return { owner, policyId, policy, history, turn, knowledge, read: (elapsed = 0) => parseGroundedHistory(owner, policy, history, policyId, elapsed) };
}

test("read preserves stored identity, city and source while subtracting full elapsed request", () => {
  const f = fixture(), result = f.read(2500);
  assert.equal(result.lifetimeMs, 7500); assert.equal(result.ownerId, f.owner);
  assert.equal(result.turns[0].taskId, f.turn.serviceTaskId); assert.equal(result.turns[0].facts[0].sources[0].href, "https://example.test/source");
  for (const elapsed of [10000, 30000, NaN, Infinity, -1]) assert.throws(() => f.read(elapsed));
});
test("reject mismatched claims, scope, provenance and consent", () => {
  const mutations = [
    (f: ReturnType<typeof fixture>) => { f.knowledge.scope.locale = "zh"; },
    (f: ReturnType<typeof fixture>) => { f.knowledge.scope.city = "beijing"; },
    (f: ReturnType<typeof fixture>) => { f.knowledge.recipient = "external"; },
    (f: ReturnType<typeof fixture>) => { f.knowledge.answer.claims.reverse(); },
    (f: ReturnType<typeof fixture>) => { f.knowledge.answer.claims[1].factIds = f.knowledge.answer.claims[0].factIds; },
    (f: ReturnType<typeof fixture>) => { f.knowledge.statements[0].assertion.objectId = "different_claim"; },
    (f: ReturnType<typeof fixture>) => { f.knowledge.statements[0].reviewedAt = "2026-09-20T00:00:00Z"; },
    (f: ReturnType<typeof fixture>) => { f.knowledge.statements[0].conditions = []; },
    (f: ReturnType<typeof fixture>) => { f.policy.policy.consentState = "withdrawn"; },
    (f: ReturnType<typeof fixture>) => { f.turn.result.originalOutcome = "partial"; },
    (f: ReturnType<typeof fixture>) => { f.history.turns.push(f.turn); },
  ];
  for (const mutate of mutations) { const f = fixture(); mutate(f); assert.throws(() => f.read()); }
});
test("revalidated partial coverage does not rewrite the original outcome", () => {
  const f = fixture(); f.knowledge.statements.pop();
  f.knowledge.answer.outcome = "partial";
  Object.assign(f.knowledge.answer.claims[1], { status: "unavailable", factIds: [], reasons: ["revoked"] });
  const result = f.read(); assert.equal(result.turns[0].coverage, "partial"); assert.equal(result.turns[0].outcome, "answered");
});
test("projection excludes private fields and disables unsafe source URLs", () => {
  const f = fixture(); Object.assign(f.knowledge, { _basis: "private-binding" }); Object.assign(f.turn, { secret: "private-content" });
  const json = JSON.stringify(f.read()); assert.ok(!json.includes("private-binding") && !json.includes("private-content"));
  for (const uri of ["javascript:alert(1)", "https://name:password@example.test", "urn:fixture:test", "/relative"]) assert.equal(sourceLink(uri), null);
});

test("terminal queue rows without a completed answer never appear to be processing", () => {
  for (const status of ["cancelled", "failed", "accepted"]) {
    const f = fixture();
    Object.assign(f.turn, { status, outcome: null, output: null });
    Object.assign(f.turn.result, { completedAt: null, originalOutcome: null, intent: null, requestScope: null, knowledge: null, projection: "pending" });
    const turn = f.read().turns[0];
    assert.equal(turn.status, status);
    assert.equal(savedAnswerNotice(turn), status === "accepted" ? "pending" : status);
    assert.deepEqual(turn.facts, []);
  }
});

test("payment and SIM history bind requested relations and route withdrawal guidance by domain", async () => {
  const { QUESTION_DEFINITIONS } = await import("../../../lib/server/knowledge/claim/questions.ts");
  for (const [questionId, definition] of Object.entries(QUESTION_DEFINITIONS)) {
    if (definition.scene === "rail") continue;
    const f = fixture(), template = f.knowledge.statements[0];
    f.turn.result.intent = questionId;
    f.knowledge.answer.questionId = questionId;
    f.knowledge.scope.scene = definition.scene;
    f.knowledge.statements = definition.claims.map(claim => ({ ...structuredClone(template), factId: randomUUID(), assertionId: randomUUID(), assertion: { ...template.assertion, ...claim } }));
    f.knowledge.answer.claims = definition.claims.map((claim, index) => ({ id: claim.objectId, status: "covered", factIds: [f.knowledge.statements[index].factId], reasons: [] }));
    const full = f.read();
    assert.equal(full.turns[0].facts.length, definition.claims.length);
    assert.equal(full.turns[0].questionId, questionId);
    assert.equal(savedAnswerNotice(full.turns[0]), null);
    f.knowledge.statements[0].assertion.subjectId = "unrelated_subject";
    assert.throws(() => f.read(), "a matching object alone is insufficient");
    f.knowledge.statements.shift();
    f.knowledge.answer.claims[0] = { ...f.knowledge.answer.claims[0], status: "unavailable", factIds: [], reasons: ["revoked"] };
    const partial = f.knowledge.statements.length > 0;
    f.knowledge.status = partial ? "available" : "no_eligible_content";
    f.knowledge.answer.outcome = partial ? "partial" : "no_answer";
    f.turn.outcome = f.turn.result.originalOutcome = partial ? "partial" : "blocked";
    f.turn.status = partial ? "completed" : "unavailable";
    assert.equal(savedAnswerNotice(f.read().turns[0]), definition.scene === "connectivity" ? partial ? "connectivityPartial" : "connectivityBlocked" : partial ? "paymentPartial" : "paymentBlocked");
    f.knowledge.answer.questionId = "rail_boarding_documents";
    assert.throws(() => f.read(), "another domain cannot be relabelled as rail");
  }
});
