import assert from "node:assert/strict";
import test from "node:test";
import { runGroundedWikiSearch } from "../../../lib/server/knowledge/wiki/grounded-search.ts";

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
const publishedStatement = Object.freeze({ factId: "fact-1", text: "Most large merchants accept international cards.", conditions: [], exclusions: [] });

function chatResponse(content) {
  return Response.json({ model: "qwen3.7-plus-2026-05-26", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(content) } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
}
const answer = { action: "answer", coverage: "answered", summary: "Most large merchants accept international cards.", citations: [{ pageKey: "fact-1", quote: "accept international cards" }], gaps: [] };
const noContentAnswer = { action: "answer", coverage: "no_content", summary: "Nothing in the search results addressed this.", citations: [], gaps: ["Not covered by any published statement."] };

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

test("a place-question intent is capability_unsupported here (no place disambiguation performed by this module)", async () => {
  const rpc = () => { throw new Error("must not call"); };
  const outcome = await runGroundedWikiSearch({ ...baseInput, intent: { intent: "place_opening_hours", requestScope: "single", placeName: "Shanghai Museum" } }, { ...jobDeps, rpc }, new AbortController().signal);
  assert.deepEqual(outcome, { kind: "unavailable", reason: "capability_unsupported" });
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

test("a real published statement flows all the way through to a real answer", async () => {
  const rpc = async () => ({ data: knowledgeReadResponse([publishedStatement]), error: null });
  const outcome = await runGroundedWikiSearch(baseInput, { ...jobDeps, rpc, fetch: async () => chatResponse(answer) }, new AbortController().signal);
  assert.equal(outcome.kind, "answered");
  assert.equal(outcome.summary, answer.summary);
  assert.deepEqual(outcome.citations, answer.citations);
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

test("an invalid city is rejected by the corpus adapter, surfaced as provider_failure", async () => {
  const outcome = await runGroundedWikiSearch({ ...baseInput, city: "atlantis" }, { ...jobDeps, rpc: () => { throw new Error("must not call"); }, fetch: () => { throw new Error("must not call"); } }, new AbortController().signal);
  assert.deepEqual(outcome, { kind: "unavailable", reason: "provider_failure", providerCode: "INVALID_INPUT" });
});
