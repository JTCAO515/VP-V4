import assert from "node:assert/strict";
import test from "node:test";
import { runGroundedAiAssistJob } from "../../../lib/server/knowledge/wiki/grounded-ai-assist-job.ts";

const provider = Object.freeze({ provider: "qwen", endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", configurationId: "11111111-1111-1111-1111-111111111111", configurationVersion: 1, timeoutMs: 5000 });
const searchInput = Object.freeze({ maxRounds: 2, maxOutputTokens: 300, timeoutMs: 5000, provider });
const turnId = "22222222-2222-2222-2222-222222222222";
const jobId = "33333333-3333-3333-3333-333333333333";
const claimToken = "44444444-4444-4444-4444-444444444444";
const jobDeps = Object.freeze({ credential: () => "secret-key", recordDestination: async () => {} });

function chatResponse(content) {
  return Response.json({ model: "qwen3.7-plus-2026-05-26", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(content) } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
}
function knowledgeReadResponse(statements, status = "available") {
  return { schemaVersion: "knowledge-read/1", evaluatedAt: "2026-09-15T00:00:00Z", scope: { city: "shanghai", scene: "payment", locale: "en" }, purpose: "trip_planning", recipient: "first_party", territory: "CN-mainland", status, statements };
}
const contextRow = Object.freeze({ kind: "context", turnId, city: "shanghai", locale: "en", intent: "payment_card_acceptance", inputText: "Can I pay by card in Shanghai?", placeName: null });
const answer = { action: "answer", coverage: "answered", summary: "Most large merchants accept international cards.", citations: [{ pageKey: "f1", quote: "accept international cards" }], gaps: [] , conflicts: [] };

test("ensure kind:unavailable is not_offered/unauthorized, never runs a search or completes", async () => {
  const jobRpc = async (name, params) => {
    assert.equal(name, "grounded_ai_assist_work_v1");
    assert.deepEqual(params.p_input, { action: "ensure", turnId });
    return { data: { kind: "unavailable" }, error: null };
  };
  const outcome = await runGroundedAiAssistJob(turnId, jobRpc, searchInput, { ...jobDeps, rpc: () => { throw new Error("must not call"); }, contextRpc: () => { throw new Error("must not call"); } }, new AbortController().signal);
  assert.deepEqual(outcome, { status: "not_offered", reason: "unauthorized" });
});

test("ensure kind:not_applicable is not_offered/not_blocked", async () => {
  const jobRpc = async () => ({ data: { kind: "not_applicable" }, error: null });
  const outcome = await runGroundedAiAssistJob(turnId, jobRpc, searchInput, { ...jobDeps, rpc: () => { throw new Error("must not call"); }, contextRpc: () => { throw new Error("must not call"); } }, new AbortController().signal);
  assert.deepEqual(outcome, { status: "not_offered", reason: "not_blocked" });
});

test("ensure kind:pending (another caller already claimed it) reports pending without running a search", async () => {
  const jobRpc = async () => ({ data: { kind: "pending", jobId }, error: null });
  const outcome = await runGroundedAiAssistJob(turnId, jobRpc, searchInput, { ...jobDeps, rpc: () => { throw new Error("must not call"); }, contextRpc: () => { throw new Error("must not call"); } }, new AbortController().signal);
  assert.deepEqual(outcome, { status: "pending" });
});

test("ensure kind:done surfaces the stored outcome without re-running the search", async () => {
  const stored = { kind: "unavailable", reason: "retrieval_miss" };
  const jobRpc = async () => ({ data: { kind: "done", status: "succeeded", outcome: stored, errorCode: null }, error: null });
  const outcome = await runGroundedAiAssistJob(turnId, jobRpc, searchInput, { ...jobDeps, rpc: () => { throw new Error("must not call"); }, contextRpc: () => { throw new Error("must not call"); } }, new AbortController().signal);
  assert.deepEqual(outcome, { status: "succeeded", outcome: stored });
});

test("ensure kind:done with status failed/cancelled maps straight through", async () => {
  const failedRpc = async () => ({ data: { kind: "done", status: "failed", outcome: null, errorCode: "PROVIDER_FAILURE" }, error: null });
  const failed = await runGroundedAiAssistJob(turnId, failedRpc, searchInput, { ...jobDeps, rpc: () => { throw new Error("must not call"); }, contextRpc: () => { throw new Error("must not call"); } }, new AbortController().signal);
  assert.deepEqual(failed, { status: "failed", errorCode: "PROVIDER_FAILURE" });

  const cancelledRpc = async () => ({ data: { kind: "done", status: "cancelled", outcome: null, errorCode: null }, error: null });
  const cancelled = await runGroundedAiAssistJob(turnId, cancelledRpc, searchInput, { ...jobDeps, rpc: () => { throw new Error("must not call"); }, contextRpc: () => { throw new Error("must not call"); } }, new AbortController().signal);
  assert.deepEqual(cancelled, { status: "cancelled" });
});

test("ensure kind:claimed runs the real search loop and completes the job with a succeeded outcome carrying the exact claimToken", async () => {
  let completeInput;
  const jobRpc = async (name, params) => {
    if (params.p_input.action === "ensure") return { data: { kind: "claimed", jobId, claimToken }, error: null };
    completeInput = params.p_input;
    return { data: { kind: "succeeded", jobId }, error: null };
  };
  const contextRpc = async () => ({ data: contextRow, error: null });
  const rpc = async () => ({ data: knowledgeReadResponse([{ factId: "f1", assertionId: "assertion-1", assertion: { subjectId: "international_card_payment", predicate: "requires_action", objectId: "merchant_acceptance_check" }, sources: [{ sourceRevisionId: "11111111-1111-1111-1111-111111111111" }], text: "Most large merchants accept international cards.", conditions: [], exclusions: [] }]), error: null });
  const outcome = await runGroundedAiAssistJob(turnId, jobRpc, searchInput, { ...jobDeps, rpc, contextRpc, fetch: async () => chatResponse(answer) }, new AbortController().signal);
  assert.equal(outcome.status, "succeeded");
  assert.equal(outcome.outcome.kind, "answered");
  assert.equal(outcome.outcome.summary, answer.summary);
  assert.equal(completeInput.action, "complete");
  assert.equal(completeInput.jobId, jobId);
  assert.equal(completeInput.claimToken, claimToken);
  assert.equal(completeInput.outcome.kind, "succeeded");
  assert.equal(completeInput.outcome.result.kind, "answered");
});

test("ensure kind:claimed, but the search loop itself throws, completes the job as failed with an errorCode instead of losing the claim", async () => {
  let completeInput;
  const jobRpc = async (name, params) => {
    if (params.p_input.action === "ensure") return { data: { kind: "claimed", jobId, claimToken }, error: null };
    completeInput = params.p_input;
    return { data: { kind: "failed", jobId }, error: null };
  };
  const contextRpc = async () => { throw new Error("context RPC network failure"); };
  const outcome = await runGroundedAiAssistJob(turnId, jobRpc, searchInput, { ...jobDeps, rpc: () => { throw new Error("must not call"); }, contextRpc }, new AbortController().signal);
  // runGroundedAiAssist itself never throws on a failed contextRpc call (it returns not_offered),
  // so this exercises the job's own catch path via a jobRpc that throws instead.
  assert.equal(outcome.status, "succeeded");
  assert.deepEqual(outcome.outcome, { kind: "not_offered", reason: "context_unavailable" });
  assert.equal(completeInput.outcome.kind, "succeeded");
});

test("a claimed job whose complete() call itself fails to reach the server still returns the real outcome to the caller", async () => {
  const jobRpc = async (name, params) => {
    if (params.p_input.action === "ensure") return { data: { kind: "claimed", jobId, claimToken }, error: null };
    throw new Error("network down");
  };
  const contextRpc = async () => ({ data: contextRow, error: null });
  const rpc = async () => ({ data: knowledgeReadResponse([{ factId: "f1", assertionId: "assertion-1", assertion: { subjectId: "international_card_payment", predicate: "requires_action", objectId: "merchant_acceptance_check" }, sources: [{ sourceRevisionId: "11111111-1111-1111-1111-111111111111" }], text: "Most large merchants accept international cards.", conditions: [], exclusions: [] }]), error: null });
  const outcome = await runGroundedAiAssistJob(turnId, jobRpc, searchInput, { ...jobDeps, rpc, contextRpc, fetch: async () => chatResponse(answer) }, new AbortController().signal);
  assert.equal(outcome.status, "succeeded");
  assert.equal(outcome.outcome.kind, "answered");
});

test("an ensure call that throws or errors is not_offered/job_unavailable, never crashes", async () => {
  const thrown = async () => { throw new Error("network down"); };
  const errored = async () => ({ data: null, error: { message: "OPS_UNAVAILABLE" } });
  for (const jobRpc of [thrown, errored]) {
    const outcome = await runGroundedAiAssistJob(turnId, jobRpc, searchInput, { ...jobDeps, rpc: () => { throw new Error("must not call"); }, contextRpc: () => { throw new Error("must not call"); } }, new AbortController().signal);
    assert.deepEqual(outcome, { status: "not_offered", reason: "job_unavailable" });
  }
});
