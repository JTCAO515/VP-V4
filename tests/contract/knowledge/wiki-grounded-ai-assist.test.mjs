import assert from "node:assert/strict";
import test from "node:test";
import { runGroundedAiAssist } from "../../../lib/server/knowledge/wiki/grounded-ai-assist.ts";

const provider = Object.freeze({ provider: "qwen", endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", configurationId: "11111111-1111-1111-1111-111111111111", configurationVersion: 1, timeoutMs: 5000 });
const baseInput = Object.freeze({ turnId: "22222222-2222-2222-2222-222222222222", maxRounds: 2, maxOutputTokens: 300, timeoutMs: 5000, provider });
const jobDeps = Object.freeze({ credential: () => "secret-key", recordDestination: async () => {} });

function chatResponse(content) {
  return Response.json({ model: "qwen3.7-plus-2026-05-26", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(content) } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
}
function knowledgeReadResponse(statements, status = "available") {
  return { schemaVersion: "knowledge-read/1", evaluatedAt: "2026-09-15T00:00:00Z", scope: { city: "shanghai", scene: "payment", locale: "en" }, purpose: "trip_planning", recipient: "first_party", territory: "CN-mainland", status, statements };
}
const contextRow = Object.freeze({ kind: "context", turnId: baseInput.turnId, city: "shanghai", locale: "en", intent: "payment_card_acceptance", inputText: "Can I pay by card in Shanghai?", placeName: null });

test("kind:unavailable from the context RPC (auth/turn-not-found) is not_offered/unauthorized, never reaches the search loop", async () => {
  const contextRpc = async () => ({ data: { kind: "unavailable" }, error: null });
  const outcome = await runGroundedAiAssist(baseInput, { ...jobDeps, contextRpc, rpc: () => { throw new Error("must not call"); }, fetch: () => { throw new Error("must not call"); } }, new AbortController().signal);
  assert.deepEqual(outcome, { kind: "not_offered", reason: "unauthorized" });
});

test("kind:not_applicable (the authoritative answer was not 'blocked') is not_offered/not_blocked -- this is the real gate against bypassing an answered/partial result", async () => {
  const contextRpc = async () => ({ data: { kind: "not_applicable" }, error: null });
  const outcome = await runGroundedAiAssist(baseInput, { ...jobDeps, contextRpc, rpc: () => { throw new Error("must not call"); }, fetch: () => { throw new Error("must not call"); } }, new AbortController().signal);
  assert.deepEqual(outcome, { kind: "not_offered", reason: "not_blocked" });
});

test("an RPC-level error or thrown call is not_offered/context_unavailable, not a throw", async () => {
  const errored = async () => ({ data: null, error: { message: "OPS_UNAVAILABLE" } });
  const thrown = async () => { throw new Error("network down"); };
  for (const contextRpc of [errored, thrown]) {
    const outcome = await runGroundedAiAssist(baseInput, { ...jobDeps, contextRpc, rpc: () => { throw new Error("must not call"); }, fetch: () => { throw new Error("must not call"); } }, new AbortController().signal);
    assert.deepEqual(outcome, { kind: "not_offered", reason: "context_unavailable" });
  }
});

test("a real context flows through to a real grounded search: scene mapped, question passed through, real answer returned", async () => {
  let seenScope;
  const contextRpc = async () => ({ data: contextRow, error: null });
  const rpc = async (name, params) => { seenScope = params.p_input; return { data: knowledgeReadResponse([{ factId: "f1", text: "Most large merchants accept international cards.", conditions: [], exclusions: [] }]), error: null }; };
  const answer = { action: "answer", coverage: "answered", summary: "Most large merchants accept international cards.", citations: [{ pageKey: "f1", quote: "accept international cards" }], gaps: [] };
  const outcome = await runGroundedAiAssist(baseInput, { ...jobDeps, contextRpc, rpc, fetch: async () => chatResponse(answer) }, new AbortController().signal);
  assert.deepEqual(seenScope, { city: "shanghai", scene: "payment", locale: "en" });
  assert.equal(outcome.kind, "answered");
  assert.equal(outcome.summary, answer.summary);
});

test("a place-question context resolves to scene 'attraction' via the same path as any other supported intent", async () => {
  let seenScope;
  const placeContext = { ...contextRow, intent: "place_opening_hours", placeName: "Shanghai Museum" };
  const contextRpc = async () => ({ data: placeContext, error: null });
  const rpc = async (name, params) => { seenScope = params.p_input; return { data: knowledgeReadResponse([], "no_eligible_content"), error: null }; };
  const outcome = await runGroundedAiAssist(baseInput, { ...jobDeps, contextRpc, rpc, fetch: () => { throw new Error("must not call"); } }, new AbortController().signal);
  assert.deepEqual(seenScope, { city: "shanghai", scene: "attraction", locale: "en" });
  assert.deepEqual(outcome, { kind: "unavailable", reason: "missing_content" });
});

test("a malformed context response (missing required fields) is not_offered/not_blocked, never crashes", async () => {
  for (const data of [{ kind: "context", city: "shanghai" }, { kind: "context", city: "shanghai", locale: "en", intent: "nonexistent_intent", inputText: "x" }, { kind: "context", city: "shanghai", locale: "en", intent: "place_address", inputText: "x", placeName: null }]) {
    const outcome = await runGroundedAiAssist(baseInput, { ...jobDeps, contextRpc: async () => ({ data, error: null }), rpc: () => { throw new Error("must not call"); }, fetch: () => { throw new Error("must not call"); } }, new AbortController().signal);
    assert.deepEqual(outcome, { kind: "not_offered", reason: "not_blocked" });
  }
});
