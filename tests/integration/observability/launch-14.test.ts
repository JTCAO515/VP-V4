import assert from "node:assert/strict";
import test from "node:test";

import {
  Launch14CostBudgetGuard,
  admitLaunch14Execution,
  createContentFreeTraceChain,
  evaluateLaunch14Slo,
} from "../../../lib/server/observability/launch-14.ts";
import { defaultFlags } from "../../../lib/flags/registry.ts";

test("LAUNCH-14 synthetic provider fault produces an alert decision and stops a new call at the budget gate", () => {
  const chain = createContentFreeTraceChain({ mintTraceId: () => "fedcba9876543210fedcba9876543210" });
  const fault = chain.record({ stage: "provider", outcome: "failed", latencyMs: 200, retryCount: 1, inputTokens: 0, outputTokens: 0, costMicros: 0 });
  assert.deepEqual(fault, {
    schemaVersion: "vp-observability-l14/v1",
    traceId: "fedcba9876543210fedcba9876543210",
    stage: "provider",
    outcome: "failed",
    latencyMs: 200,
    retryCount: 1,
    inputTokens: 0,
    outputTokens: 0,
    costMicros: 0,
    recordContent: false,
  });
  assert.deepEqual(
    evaluateLaunch14Slo({ requestCount: 1, errorCount: 1, cancelledCount: 0, retryCount: 1, p95LatencyMs: 200, costMicros: 0 }),
    { kind: "alert", reason: "error_rate" },
  );

  const guard = new Launch14CostBudgetGuard({ maxCostMicros: 5 });
  const flags = { ...defaultFlags, TRIP_PERSISTENCE_ENABLED: true, CHAT_RUNTIME_ENABLED: true };
  assert.deepEqual(admitLaunch14Execution(flags, guard, { expectedCostMicros: 6 }), {
    kind: "unavailable",
    code: "COST_BUDGET_EXHAUSTED",
    metric: "cost_budget_exhausted",
  });
});
