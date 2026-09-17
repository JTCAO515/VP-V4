import assert from "node:assert/strict";
import test from "node:test";
import { runGroundedWikiSearch, tunedMaxRounds } from "../../../lib/server/knowledge/wiki/grounded-search.ts";

const provider = Object.freeze({ provider: "qwen", endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", configurationId: "11111111-1111-1111-1111-111111111111", configurationVersion: 1, timeoutMs: 5000 });
const baseInput = Object.freeze({
  intent: { intent: "payment_card_acceptance", requestScope: "single" },
  question: "Can I pay by international card in Shanghai?",
  city: "shanghai", locale: "en", maxRounds: 2, maxOutputTokens: 300, timeoutMs: 5000, provider,
});
const jobDeps = Object.freeze({ credential: () => "secret-key", recordDestination: async () => {} });

function knowledgeReadResponse(statements, status = "available") {
  return { schemaVersion: "knowledge-read/1", evaluatedAt: "2026-09-15T00:00:00Z", scope: { city: "shanghai", scene: "payment", locale: "en" }, purpose: "trip_planning", recipient: "first_party", territory: "CN-mainland", status, statements };
}
const publishedStatement = Object.freeze({ factId: "fact-1", assertionId: "assertion-1", assertion: { subjectId: "international_card_payment", predicate: "requires_action", objectId: "merchant_acceptance_check" }, sources: [{ sourceRevisionId: "11111111-1111-1111-1111-111111111111" }], text: "Most large merchants accept international cards.", conditions: [], exclusions: [] });

function chatResponse(content) {
  return Response.json({ model: "qwen3.7-plus-2026-05-26", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(content) } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
}
const answer = { action: "answer", coverage: "answered", summary: "Most large merchants accept international cards.", citations: [{ pageKey: "fact-1", quote: "accept international cards" }], gaps: [] , conflicts: [] };
const noContentAnswer = { action: "answer", coverage: "no_content", summary: "Nothing in the search results addressed this.", citations: [], gaps: ["Not covered by any published statement."] , conflicts: [] };

test("a clarification intent -- the traveler's own input was insufficient -- is user_input_missing, and never calls the RPC", async () => {
  const rpc = () => { throw new Error("must not call"); };
  const outcome = await runGroundedWikiSearch({ ...baseInput, intent: { intent: "clarification", requestScope: "unknown" } }, { ...jobDeps, rpc }, new AbortController().signal);
  assert.deepEqual(outcome, { kind: "unavailable", reason: "user_input_missing" });
});

test("an unsupported intent is capability_unsupported, distinct from a missing user input", async () => {
  const rpc = () => { throw new Error("must not call"); };
  const outcome = await runGroundedWikiSearch({ ...baseInput, intent: { intent: "unsupported", requestScope: "unknown" } }, { ...jobDeps, rpc }, new AbortController().signal);
  assert.deepEqual(outcome, { kind: "unavailable", reason: "capability_unsupported" });
});

test("a place-question intent is supported: it queries scene 'attraction' without needing a resolved placeSubjectId", async () => {
  let seenScope;
  const rpc = async (name, params) => { seenScope = params.p_input; return { data: knowledgeReadResponse([], "no_eligible_content"), error: null }; };
  const placeIntent = { intent: "place_opening_hours", requestScope: "single", placeName: "Shanghai Museum" };
  const outcome = await runGroundedWikiSearch({ ...baseInput, intent: placeIntent, city: "shanghai" }, { ...jobDeps, rpc }, new AbortController().signal);
  assert.deepEqual(seenScope, { city: "shanghai", scene: "attraction", locale: "en" });
  assert.deepEqual(outcome, { kind: "unavailable", reason: "missing_content" });
});

test("all three place question ids resolve to scene 'attraction'", async () => {
  for (const intent of ["place_address", "place_opening_hours", "place_address_and_hours"]) {
    let seenScope;
    const rpc = async (name, params) => { seenScope = params.p_input; return { data: knowledgeReadResponse([], "no_eligible_content"), error: null }; };
    await runGroundedWikiSearch({ ...baseInput, intent: { intent, requestScope: "single", placeName: "x" } }, { ...jobDeps, rpc }, new AbortController().signal);
    assert.equal(seenScope.scene, "attraction", `${intent} should resolve to scene "attraction"`);
  }
});

test("a real published place statement flows through to a real answer, same as any other supported intent", async () => {
  const placeStatement = Object.freeze({ factId: "fact-museum", assertionId: "assertion-museum", assertion: { subjectId: "shanghai_museum", predicate: "opens_during", objectId: "opening_hours" }, sources: [{ sourceRevisionId: "22222222-2222-2222-2222-222222222222" }], text: "Shanghai Museum opens at 9am and closes at 5pm.", conditions: [], exclusions: [] });
  const placeAnswer = { action: "answer", coverage: "answered", summary: "Shanghai Museum opens at 9am.", citations: [{ pageKey: "fact-museum", quote: "opens at 9am" }], gaps: [] , conflicts: [] };
  const rpc = async () => ({ data: knowledgeReadResponse([placeStatement]), error: null });
  const placeIntent = { intent: "place_opening_hours", requestScope: "single", placeName: "Shanghai Museum" };
  const outcome = await runGroundedWikiSearch({ ...baseInput, intent: placeIntent, question: "When does Shanghai Museum open?" }, { ...jobDeps, rpc, fetch: async () => chatResponse(placeAnswer) }, new AbortController().signal);
  assert.equal(outcome.kind, "answered");
  assert.equal(outcome.summary, placeAnswer.summary);
});

test("maps the intent's question definition to the correct scene when calling knowledge_read_v1", async () => {
  let seenScope;
  const rpc = async (name, params) => { seenScope = params.p_input; return { data: knowledgeReadResponse([], "no_eligible_content"), error: null }; };
  await runGroundedWikiSearch(baseInput, { ...jobDeps, rpc }, new AbortController().signal);
  assert.deepEqual(seenScope, { city: "shanghai", scene: "payment", locale: "en" });
});

test("no published content is missing_content, short-circuited without any model call", async () => {
  const rpc = async () => ({ data: knowledgeReadResponse([], "no_eligible_content"), error: null });
  const outcome = await runGroundedWikiSearch(baseInput, { ...jobDeps, rpc, fetch: () => { throw new Error("must not call"); } }, new AbortController().signal);
  assert.deepEqual(outcome, { kind: "unavailable", reason: "missing_content" });
});

test("a policy shutdown (KNOWLEDGE_DISABLED) is policy_denied, not a generic provider failure", async () => {
  const rpc = async () => ({ data: null, error: { message: "KNOWLEDGE_DISABLED" } });
  const outcome = await runGroundedWikiSearch(baseInput, { ...jobDeps, rpc, fetch: () => { throw new Error("must not call"); } }, new AbortController().signal);
  assert.deepEqual(outcome, { kind: "unavailable", reason: "policy_denied", providerCode: "KNOWLEDGE_DISABLED" });
});

test("any other RPC-level error is provider_failure with its code preserved", async () => {
  const rpc = async () => ({ data: null, error: { message: "KNOWLEDGE_UNAVAILABLE" } });
  const outcome = await runGroundedWikiSearch(baseInput, { ...jobDeps, rpc, fetch: () => { throw new Error("must not call"); } }, new AbortController().signal);
  assert.deepEqual(outcome, { kind: "unavailable", reason: "provider_failure", providerCode: "KNOWLEDGE_UNAVAILABLE" });
});

test("real content exists but the search loop finds nothing relevant: retrieval_miss, distinct from missing_content", async () => {
  const rpc = async () => ({ data: knowledgeReadResponse([publishedStatement]), error: null });
  const outcome = await runGroundedWikiSearch(baseInput, { ...jobDeps, rpc, fetch: async () => chatResponse(noContentAnswer) }, new AbortController().signal);
  assert.deepEqual(outcome, { kind: "unavailable", reason: "retrieval_miss" });
});

test("a provider/model failure is provider_failure with the underlying error code", async () => {
  const rpc = async () => ({ data: knowledgeReadResponse([publishedStatement]), error: null });
  const outcome = await runGroundedWikiSearch(baseInput, { ...jobDeps, rpc, fetch: async () => new Response("", { status: 500 }) }, new AbortController().signal);
  assert.deepEqual(outcome, { kind: "unavailable", reason: "provider_failure", providerCode: "PROVIDER_UNAVAILABLE" });
});

test("a real published statement flows all the way through to a real answer, and its EvidencePack v2 covers the real required claim with real provenance", async () => {
  const rpc = async () => ({ data: knowledgeReadResponse([publishedStatement]), error: null });
  const outcome = await runGroundedWikiSearch(baseInput, { ...jobDeps, rpc, fetch: async () => chatResponse(answer) }, new AbortController().signal);
  assert.equal(outcome.kind, "answered");
  assert.equal(outcome.summary, answer.summary);
  assert.deepEqual(outcome.citations, answer.citations);
  assert.equal(outcome.evidence.schemaVersion, "evidence-pack/2");
  assert.deepEqual(outcome.evidence.required, [{
    claimId: "merchant_acceptance_check", status: "covered",
    refs: [{ statementId: "fact-1", publicationId: "assertion-1", sourceIds: ["11111111-1111-1111-1111-111111111111"], span: "accept international cards" }],
  }]);
  assert.deepEqual(outcome.evidence.background, []);
  assert.deepEqual(outcome.evidence.missing, []);
  assert.deepEqual(outcome.evidence.conflicts, []);
});

test("a place-question answer never fabricates required-claim coverage: EvidencePack v2's required stays empty since this module resolves no subject", async () => {
  const placeStatement = Object.freeze({ factId: "fact-museum-2", assertionId: "assertion-museum-2", assertion: { subjectId: "shanghai_museum", predicate: "opens_during", objectId: "opening_hours" }, sources: [{ sourceRevisionId: "33333333-3333-3333-3333-333333333333" }], text: "Shanghai Museum opens at 9am.", conditions: [], exclusions: [] });
  const placeAnswer = { action: "answer", coverage: "answered", summary: "Shanghai Museum opens at 9am.", citations: [{ pageKey: "fact-museum-2", quote: "opens at 9am" }], gaps: [], conflicts: [] };
  const rpc = async () => ({ data: knowledgeReadResponse([placeStatement]), error: null });
  const placeIntent = { intent: "place_opening_hours", requestScope: "single", placeName: "Shanghai Museum" };
  const outcome = await runGroundedWikiSearch({ ...baseInput, intent: placeIntent, question: "When does Shanghai Museum open?" }, { ...jobDeps, rpc, fetch: async () => chatResponse(placeAnswer) }, new AbortController().signal);
  assert.equal(outcome.kind, "answered");
  assert.deepEqual(outcome.evidence.required, []);
  assert.deepEqual(outcome.evidence.background, [{ statementId: "fact-museum-2", publicationId: "assertion-museum-2", sourceIds: ["33333333-3333-3333-3333-333333333333"], span: "opens at 9am" }]);
});

test("budget_exhausted and cancelled pass through as their own terminal kinds, not folded into the six reason codes", async () => {
  const rpc = async () => ({ data: knowledgeReadResponse([publishedStatement]), error: null });
  const exhausted = await runGroundedWikiSearch(baseInput, { ...jobDeps, rpc, fetch: async () => chatResponse({ action: "search", query: "x" }) }, new AbortController().signal);
  assert.equal(exhausted.kind, "budget_exhausted");
  assert.equal(exhausted.rounds, 2);

  const controller = new AbortController();
  controller.abort();
  const cancelled = await runGroundedWikiSearch(baseInput, { ...jobDeps, rpc, fetch: () => { throw new Error("must not call"); } }, controller.signal);
  assert.deepEqual(cancelled, { kind: "cancelled", rounds: 0, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } });
});

test("tunedMaxRounds raises the floor to requiredClaimCount+1 capped at 6, never lowers what the caller requested", () => {
  assert.equal(tunedMaxRounds(2, 0), 2, "a place question (0 claims here) is unaffected");
  assert.equal(tunedMaxRounds(2, 1), 2, "1 claim: floor 2 equals the existing default, no change");
  assert.equal(tunedMaxRounds(2, 4), 5, "4 claims (payment_getting_started): floor rises to 5");
  assert.equal(tunedMaxRounds(6, 10), 6, "the floor never exceeds runWikiSearchJob's own hard bound of 6");
  assert.equal(tunedMaxRounds(5, 1), 5, "a caller's higher request is preserved, never lowered to the floor");
});

test("a multi-claim question (payment_getting_started, 4 required claims) gets more real rounds than a flat maxRounds: 2 would allow, before falling back to budget_exhausted", async () => {
  const rpc = async () => ({ data: knowledgeReadResponse([publishedStatement]), error: null });
  let calls = 0;
  const fetch = async () => { calls += 1; return chatResponse({ action: "search", query: `attempt ${calls}` }); };
  const input = { ...baseInput, intent: { intent: "payment_getting_started", requestScope: "single" }, maxRounds: 2 };
  const outcome = await runGroundedWikiSearch(input, { ...jobDeps, rpc, fetch }, new AbortController().signal);
  assert.equal(outcome.kind, "budget_exhausted");
  // Without the tuning fix this would be 2 (the caller's flat request); 4 claims -> floor 5.
  assert.equal(outcome.rounds, 5, "4 required claims tunes the round budget to 5, not the caller's flat 2");
  assert.equal(calls, 5, "the model was actually given 5 real chances to search, not 2");
});

test("a single-claim question (payment_card_acceptance, 1 required claim) is unaffected by the tuning floor", async () => {
  const rpc = async () => ({ data: knowledgeReadResponse([publishedStatement]), error: null });
  let calls = 0;
  const fetch = async () => { calls += 1; return chatResponse({ action: "search", query: `attempt ${calls}` }); };
  const outcome = await runGroundedWikiSearch(baseInput, { ...jobDeps, rpc, fetch }, new AbortController().signal);
  assert.equal(outcome.kind, "budget_exhausted");
  assert.equal(outcome.rounds, 2, "1 required claim: floor 2 equals baseInput's own maxRounds, unchanged from before this fix");
  assert.equal(calls, 2);
});

test("an invalid city is rejected by the corpus adapter, surfaced as provider_failure", async () => {
  const outcome = await runGroundedWikiSearch({ ...baseInput, city: "atlantis" }, { ...jobDeps, rpc: () => { throw new Error("must not call"); }, fetch: () => { throw new Error("must not call"); } }, new AbortController().signal);
  assert.deepEqual(outcome, { kind: "unavailable", reason: "provider_failure", providerCode: "INVALID_INPUT" });
});
