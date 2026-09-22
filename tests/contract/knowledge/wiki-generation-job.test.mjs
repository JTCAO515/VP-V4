import assert from "node:assert/strict";
import test from "node:test";
import { runWikiGenerationJob, computeWikiInputDigest } from "../../../lib/server/jobs/wiki-generation-job.ts";

const provider = Object.freeze({ provider: "qwen", endpoint: "https://llm-fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions", configurationId: "11111111-1111-1111-1111-111111111111", configurationVersion: 1, timeoutMs: 5000 });
const baseInput = Object.freeze({
  pageType: "source_summary", pageKey: "source_summary:test", sourceText: "The museum opens at 9am and closes at 5pm daily.",
  promptVersion: "vp-wiki-generation-v1", configDigest: "a".repeat(64), maxOutputTokens: 300, timeoutMs: 5000, provider,
});
const deps = Object.freeze({ qwenEndpoint: provider.endpoint, credential: () => "secret-key", recordDestination: async () => {} });

function chatResponse(content) {
  return Response.json({
    model: "qwen3.7-plus-2026-05-26",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(content) } }],
    usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
  });
}

test("computeWikiInputDigest is deterministic and content-sensitive", () => {
  const a = computeWikiInputDigest("v1", "d".repeat(64), "text");
  const b = computeWikiInputDigest("v1", "d".repeat(64), "text");
  const c = computeWikiInputDigest("v1", "d".repeat(64), "different text");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("succeeded outcome returns validated draft output and usage, never leaks the credential", async () => {
  let seenAuth;
  const outcome = await runWikiGenerationJob(baseInput, {
    ...deps,
    fetch: async (_url, options) => { seenAuth = options.headers.authorization; return chatResponse({ summary: "The museum has daily hours.", gaps: [] }); },
  }, new AbortController().signal);
  assert.equal(outcome.kind, "succeeded");
  assert.equal(outcome.output.summary, "The museum has daily hours.");
  assert.deepEqual(outcome.output.gaps, []);
  assert.equal(outcome.usage.totalTokens, 30);
  assert.equal(seenAuth, "Bearer secret-key");
});

test("a model response outside the closed {summary, gaps} schema fails as MODEL_OUTPUT_INVALID, with a bounded diagnostic snapshot", async () => {
  const outcome = await runWikiGenerationJob(baseInput, {
    ...deps, fetch: async () => chatResponse({ summary: "ok", gaps: [], extraField: "not allowed" }),
  }, new AbortController().signal);
  assert.equal(outcome.kind, "failed");
  assert.equal(outcome.errorCode, "MODEL_OUTPUT_INVALID");
  // captureRawResponseOnInvalid is on for this job (approved-source input,
  // not a traveler's own text) -- the diagnostic snapshot is an allowlisted
  // preview, not the verbatim response, and must never carry reasoning.
  assert.equal(typeof outcome.rawResponseForDiagnostics, "string");
  const snapshot = JSON.parse(outcome.rawResponseForDiagnostics);
  assert.equal(snapshot.finishReason, "stop");
  assert.match(snapshot.contentPreview, /extraField/);
  assert.equal(Object.hasOwn(snapshot, "reasoning_content"), false);
  assert.doesNotMatch(outcome.rawResponseForDiagnostics, /reasoning/);
});

test("a provider-protocol-level MODEL_OUTPUT_INVALID (missing usage) also carries the diagnostic snapshot", async () => {
  const outcome = await runWikiGenerationJob(baseInput, {
    ...deps, fetch: async () => Response.json({ model: "qwen3.7-plus-2026-05-26", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "{}" } }] }),
  }, new AbortController().signal);
  assert.equal(outcome.kind, "failed");
  assert.equal(outcome.errorCode, "MODEL_OUTPUT_INVALID");
  assert.equal(typeof outcome.rawResponseForDiagnostics, "string");
});

test("a successful outcome never carries a diagnostic field", async () => {
  const outcome = await runWikiGenerationJob(baseInput, {
    ...deps, fetch: async () => chatResponse({ summary: "The museum has daily hours.", gaps: [] }),
  }, new AbortController().signal);
  assert.equal(outcome.kind, "succeeded");
  assert.equal(Object.hasOwn(outcome, "rawResponseForDiagnostics"), false);
});

test("a provider HTTP failure surfaces as a failed outcome with a code, not a throw", async () => {
  const outcome = await runWikiGenerationJob(baseInput, {
    ...deps, fetch: async () => new Response("", { status: 500 }),
  }, new AbortController().signal);
  assert.equal(outcome.kind, "failed");
});

test("an already-aborted signal cancels before any network call", async () => {
  const controller = new AbortController();
  controller.abort();
  const outcome = await runWikiGenerationJob(baseInput, { ...deps, fetch: () => { throw new Error("must not call"); } }, controller.signal);
  assert.deepEqual(outcome, { kind: "cancelled" });
});

test("invalid input (bad configDigest shape) is rejected before any network call", async () => {
  const outcome = await runWikiGenerationJob({ ...baseInput, configDigest: "not-a-digest" }, { ...deps, fetch: () => { throw new Error("must not call"); } }, new AbortController().signal);
  assert.deepEqual(outcome, { kind: "failed", errorCode: "INVALID_INPUT" });
});

test("empty source text is rejected", async () => {
  const outcome = await runWikiGenerationJob({ ...baseInput, sourceText: "   " }, { ...deps, fetch: () => { throw new Error("must not call"); } }, new AbortController().signal);
  assert.deepEqual(outcome, { kind: "failed", errorCode: "INVALID_INPUT" });
});
