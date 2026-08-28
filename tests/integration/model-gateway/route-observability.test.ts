import assert from "node:assert/strict";
import test from "node:test";
import { resolveFixtureRoute } from "../../../lib/server/model-gateway/route/index.ts";
import { buildModelAttemptTrace } from "../../../lib/server/observability/model-attempt.ts";

test("records an unavailable policy-blocked route as metadata only", () => {
  const route = resolveFixtureRoute({
    task: "ordinary_text",
    dataClass: "c0_synthetic",
    modality: "text",
    schema: "none",
    region: "fixture_only",
    policy: "blocked",
    safety: "clear",
  });
  assert.deepEqual(route, { kind: "unavailable", code: "DATA_POLICY_BLOCKED" });

  const trace = buildModelAttemptTrace({
    attemptId: "attempt_policy_blocked_01",
    route,
    outcomeCode: "DATA_POLICY_BLOCKED",
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    priceVersion: "fixture-2026-08-28",
    inputMicrosPerToken: 0,
    outputMicrosPerToken: 0,
  });

  assert.equal(trace.outcomeCode, "DATA_POLICY_BLOCKED");
  assert.equal(trace.profileId, "none");
  assert.equal(trace.provider, "none");
  assert.equal(trace.recordInputs, false);
  assert.equal(trace.recordOutputs, false);
});
