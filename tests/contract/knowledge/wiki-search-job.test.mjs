import assert from "node:assert/strict";
import test from "node:test";
import { runWikiSearchJob } from "../../../lib/server/jobs/wiki-search-job.ts";

const provider = Object.freeze({ provider: "qwen", endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", configurationId: "11111111-1111-1111-1111-111111111111", configurationVersion: 1, timeoutMs: 5000 });
const corpus = Object.freeze([{ pageKey: "source_summary:museum", text: "The museum opens at 9am and requires ID for entry." }]);
const baseInput = Object.freeze({ question: "When does the museum open?", locale: "en", corpus, maxRounds: 3, maxOutputTokens: 300, timeoutMs: 5000, provider });
const deps = Object.freeze({ credential: () => "secret-key", recordDestination: async () => {} });

function chatResponse(content) {
  return Response.json({
    model: "qwen3.7-plus-2026-05-26",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(content) } }],
    usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
  });
}

function queuedFetch(actions) {
  let call = 0;
  return async () => { const action = actions[Math.min(call, actions.length - 1)]; call += 1; return chatResponse(action); };
}

const answer = { action: "answer", coverage: "answered", summary: "The museum opens at 9am.", citations: [{ pageKey: "source_summary:museum", quote: "opens at 9am" }], gaps: [] };

test("answers in round 1 without searching when the model is already confident", async () => {
  const outcome = await runWikiSearchJob(baseInput, { ...deps, fetch: queuedFetch([answer]) }, new AbortController().signal);
  assert.equal(outcome.kind, "answered");
  assert.equal(outcome.rounds, 1);
  assert.deepEqual(outcome.queries, []);
  assert.equal(outcome.usage.totalTokens, 30);
});

test("search then answer: the second round's prompt includes the first round's results", async () => {
  let secondRoundBody;
  let call = 0;
  const fetch = async (_url, options) => {
    call += 1;
    if (call === 2) { secondRoundBody = JSON.parse(options.body); return chatResponse(answer); }
    return chatResponse({ action: "search", query: "museum opening hours" });
  };
  const outcome = await runWikiSearchJob(baseInput, { ...deps, fetch }, new AbortController().signal);
  assert.equal(outcome.kind, "answered");
  assert.equal(outcome.rounds, 2);
  assert.deepEqual(outcome.queries, ["museum opening hours"]);
  assert.match(secondRoundBody.messages[1].content, /museum opening hours/);
  assert.match(secondRoundBody.messages[1].content, /opens at 9am and requires ID/);
});

test("a repeated query runs no new search but still consumes a round and is visible to the next prompt", async () => {
  const search = { action: "search", query: "opening hours" };
  let thirdRoundBody;
  let call = 0;
  const fetch = async (_url, options) => {
    call += 1;
    if (call === 3) { thirdRoundBody = JSON.parse(options.body); return chatResponse(answer); }
    return chatResponse(search);
  };
  const outcome = await runWikiSearchJob({ ...baseInput, maxRounds: 3 }, { ...deps, fetch }, new AbortController().signal);
  assert.equal(outcome.kind, "answered");
  assert.equal(outcome.rounds, 3);
  assert.deepEqual(outcome.queries, ["opening hours"]);
  assert.match(thirdRoundBody.messages[1].content, /duplicate of an earlier query/);
});

test("budget exhausted when the model keeps searching past maxRounds without ever answering", async () => {
  const outcome = await runWikiSearchJob({ ...baseInput, maxRounds: 2 }, { ...deps, fetch: queuedFetch([{ action: "search", query: "a" }, { action: "search", query: "b" }]) }, new AbortController().signal);
  assert.equal(outcome.kind, "budget_exhausted");
  assert.equal(outcome.rounds, 2);
  assert.deepEqual(outcome.queries, ["a", "b"]);
});

test("a model response outside the closed action schema fails as MODEL_OUTPUT_INVALID", async () => {
  const outcome = await runWikiSearchJob(baseInput, { ...deps, fetch: queuedFetch([{ action: "search" }]) }, new AbortController().signal);
  assert.deepEqual(outcome, { kind: "failed", errorCode: "MODEL_OUTPUT_INVALID", rounds: 0, usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 } });
});

test("no_content coverage cannot carry citations; answered/partial cannot have zero citations", async () => {
  const bad = { action: "answer", coverage: "no_content", summary: "Nothing found.", citations: [{ pageKey: "x", quote: "y" }], gaps: [] };
  const outcome = await runWikiSearchJob(baseInput, { ...deps, fetch: queuedFetch([bad]) }, new AbortController().signal);
  assert.equal(outcome.kind, "failed");
  assert.equal(outcome.errorCode, "MODEL_OUTPUT_INVALID");
});

test("a provider HTTP failure surfaces as a failed outcome with a code, not a throw", async () => {
  const outcome = await runWikiSearchJob(baseInput, { ...deps, fetch: async () => new Response("", { status: 500 }) }, new AbortController().signal);
  assert.equal(outcome.kind, "failed");
});

test("an already-aborted signal cancels before any network call", async () => {
  const controller = new AbortController();
  controller.abort();
  const outcome = await runWikiSearchJob(baseInput, { ...deps, fetch: () => { throw new Error("must not call"); } }, controller.signal);
  assert.deepEqual(outcome, { kind: "cancelled", rounds: 0, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } });
});

test("invalid input (bad locale) is rejected before any network call", async () => {
  const outcome = await runWikiSearchJob({ ...baseInput, locale: "fr" }, { ...deps, fetch: () => { throw new Error("must not call"); } }, new AbortController().signal);
  assert.deepEqual(outcome, { kind: "failed", errorCode: "INVALID_INPUT", rounds: 0, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } });
});

test("usage accumulates across multiple rounds", async () => {
  const fetch = queuedFetch([{ action: "search", query: "a" }, answer]);
  const outcome = await runWikiSearchJob(baseInput, { ...deps, fetch }, new AbortController().signal);
  assert.equal(outcome.kind, "answered");
  assert.equal(outcome.usage.totalTokens, 60);
});

test("a rephrased (non-identical) query that surfaces no page beyond what's already been seen is flagged as no-new-evidence, distinct from an exact duplicate", async () => {
  // maxRounds: 4 so the no-new-evidence round (round 3) is not itself the
  // final round -- final-round guidance takes priority when both apply,
  // exercised separately below.
  let thirdRoundBody;
  let call = 0;
  const fetch = async (_url, options) => {
    call += 1;
    if (call === 3) { thirdRoundBody = JSON.parse(options.body); return chatResponse(answer); }
    // Different wording each round, but both hit the same (only) corpus entry -- no exact duplicate, but no new evidence either.
    return chatResponse({ action: "search", query: call === 1 ? "museum hours" : "museum opening time" });
  };
  const outcome = await runWikiSearchJob({ ...baseInput, maxRounds: 4 }, { ...deps, fetch }, new AbortController().signal);
  assert.equal(outcome.kind, "answered");
  assert.equal(outcome.rounds, 3);
  assert.deepEqual(outcome.queries, ["museum hours", "museum opening time"]);
  assert.match(thirdRoundBody.messages[1].content, /every result was already surfaced by an earlier round's search/, "the round-2 entry itself is labeled as no-new-evidence");
  assert.doesNotMatch(thirdRoundBody.messages[1].content, /duplicate of an earlier query/, "not an exact duplicate -- a different message should explain the lack of new evidence");
  assert.match(thirdRoundBody.messages[1].content, /Rephrasing again is unlikely to help/);
});

test("the final round's prompt tells the model there is no round after this one, distinct from an ordinary mid-loop round", async () => {
  let finalRoundBody;
  const fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.messages[1].content.includes("final round")) { finalRoundBody = body; return chatResponse(answer); }
    return chatResponse({ action: "search", query: "x" });
  };
  const outcome = await runWikiSearchJob({ ...baseInput, maxRounds: 2 }, { ...deps, fetch }, new AbortController().signal);
  assert.equal(outcome.kind, "answered");
  assert.equal(outcome.rounds, 2);
  assert.match(finalRoundBody.messages[1].content, /This is your final round/);
  assert.match(finalRoundBody.messages[1].content, /running out of rounds is not/);
});
