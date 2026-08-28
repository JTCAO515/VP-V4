import assert from "node:assert/strict";
import test from "node:test";
import { calculateCostMicros, buildModelAttemptTrace } from "../../../lib/server/observability/model-attempt.ts";

const validTraceInput = () => ({
  attemptId: "attempt_fixture_01",
  route: { kind: "route" as const, profileId: "qwen_37_strict" as const, lane: "baseline" as const },
  outcomeCode: "VALIDATED" as const,
  inputTokens: 3,
  outputTokens: 2,
  latencyMs: 17,
  priceVersion: "fixture-2026-08-28",
  inputMicrosPerToken: 7,
  outputMicrosPerToken: 11,
});

test("builds an allowlisted completed trace with fixed content-recording booleans and integer cost", () => {
  const trace = buildModelAttemptTrace(validTraceInput());
  assert.equal(trace.recordInputs, false);
  assert.equal(trace.recordOutputs, false);
  assert.equal(trace.costMicros, 43);
  assert.equal(trace.requestedModel, "qwen3.7-plus-2026-05-26");
  assert.equal(trace.observedDeployment, "qwen3.7-plus-2026-05-26");
  assert.equal("prompt" in trace, false);
  assert.equal("output" in trace, false);
  assert.equal("reasoning" in trace, false);
});

test("rejects six raw-content keys, invalid prices, and negative counters", () => {
  for (const key of ["prompt", "input", "output", "reasoning", "media", "messages"]) {
    assert.throws(() => buildModelAttemptTrace({ ...validTraceInput(), [key]: "never-record" } as never));
  }
  assert.throws(() => buildModelAttemptTrace({ ...validTraceInput(), inputTokens: -1 }));
  assert.throws(() => calculateCostMicros({ inputTokens: -1, outputTokens: 1, inputMicrosPerToken: 1, outputMicrosPerToken: 1 }));
});
