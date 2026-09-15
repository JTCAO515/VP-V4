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

test("an unsupported intent (clarification/unsupported) never calls the RPC", async () => {
  const rpc = () => { throw new Error("must not call"); };
  const outcome = await runGroundedWikiSearch({ ...baseInput, intent: { intent: "clarification", requestScope: "unknown" } }, { ...jobDeps, rpc }, new AbortController().signal);
  assert.deepEqual(outcome, { kind: "unsupported_intent" });
});

test("a place-question intent is unsupported here (no place disambiguation performed by this module)", async () => {
  const rpc = () => { throw new Error("must not call"); };
  const outcome = await runGroundedWikiSearch({ ...baseInput, intent: { intent: "place_opening_hours", requestScope: "single", placeName: "Shanghai Museum" } }, { ...jobDeps, rpc }, new AbortController().signal);
  assert.deepEqual(outcome, { kind: "unsupported_intent" });
});

test("maps the intent's question definition to the correct scene when calling knowledge_read_v1", async () => {
  let seenScope;
  const rpc = async (name, params) => { seenScope = params.p_input; return { data: knowledgeReadResponse([], "no_eligible_content"), error: null }; };
  await runGroundedWikiSearch(baseInput, { ...jobDeps, rpc }, new AbortController().signal);
  assert.deepEqual(seenScope, { city: "shanghai", scene: "payment", locale: "en" });
});

test("no published content short-circuits to no_content without any model call", async () => {
  const rpc = async () => ({ data: knowledgeReadResponse([], "no_eligible_content"), error: null });
  const outcome = await runGroundedWikiSearch(baseInput, { ...jobDeps, rpc, fetch: () => { throw new Error("must not call"); } }, new AbortController().signal);
  assert.deepEqual(outcome, { kind: "no_content" });
});

test("an RPC-level error propagates as corpus_unavailable with its code", async () => {
  const rpc = async () => ({ data: null, error: { message: "KNOWLEDGE_DISABLED" } });
  const outcome = await runGroundedWikiSearch(baseInput, { ...jobDeps, rpc, fetch: () => { throw new Error("must not call"); } }, new AbortController().signal);
  assert.deepEqual(outcome, { kind: "corpus_unavailable", code: "KNOWLEDGE_DISABLED" });
});

test("a real published statement flows all the way through to the search loop and back", async () => {
  const rpc = async () => ({ data: knowledgeReadResponse([publishedStatement]), error: null });
  const outcome = await runGroundedWikiSearch(baseInput, { ...jobDeps, rpc, fetch: async () => chatResponse(answer) }, new AbortController().signal);
  assert.equal(outcome.kind, "answered");
  assert.equal(outcome.summary, answer.summary);
  assert.deepEqual(outcome.citations, answer.citations);
});

test("an invalid city is rejected by the corpus adapter, surfaced as corpus_unavailable", async () => {
  const outcome = await runGroundedWikiSearch({ ...baseInput, city: "atlantis" }, { ...jobDeps, rpc: () => { throw new Error("must not call"); }, fetch: () => { throw new Error("must not call"); } }, new AbortController().signal);
  assert.deepEqual(outcome, { kind: "corpus_unavailable", code: "INVALID_INPUT" });
});
