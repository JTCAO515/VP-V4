import assert from "node:assert/strict";
import test from "node:test";

import {
  Launch14CostBudgetGuard,
  admitLaunch14Execution,
  createContentFreeTraceChain,
} from "../../../lib/server/observability/launch-14.ts";
import { defaultFlags } from "../../../lib/flags/registry.ts";

test("LAUNCH-14 rejects raw content, PII-shaped fields, secrets, and unbounded telemetry labels", () => {
  const chain = createContentFreeTraceChain({ mintTraceId: () => "0123456789abcdef0123456789abcdef" });
  const valid = { stage: "provider", outcome: "succeeded", latencyMs: 1, retryCount: 0, inputTokens: 1, outputTokens: 1, costMicros: 1 };
  for (const key of ["prompt", "input", "output", "reasoning", "media", "messages", "userId", "email", "apiKey", "errorMessage", "providerPayload"]) {
    assert.throws(() => chain.record({ ...valid, [key]: "never-record" }));
  }
  assert.throws(() => chain.record({ ...valid, stage: "unbounded-label" }));
  assert.throws(() => createContentFreeTraceChain({ mintTraceId: () => "user@example.com" }));
});

test("LAUNCH-14 consumes the fail-closed chat flag before reserving a bounded cost budget", () => {
  const disabled = new Launch14CostBudgetGuard({ maxCostMicros: 10 });
  assert.deepEqual(admitLaunch14Execution(defaultFlags, disabled, { expectedCostMicros: 1 }), {
    kind: "unavailable",
    code: "FLAG_DISABLED",
    metric: "flag_disabled",
  });
  assert.equal(disabled.reservedCostMicros, 0);

  const enabled = new Launch14CostBudgetGuard({ maxCostMicros: 10 });
  const flags = { ...defaultFlags, TRIP_PERSISTENCE_ENABLED: true, CHAT_RUNTIME_ENABLED: true };
  assert.deepEqual(admitLaunch14Execution(flags, enabled, { expectedCostMicros: 7 }), { kind: "admitted", reservedCostMicros: 7 });
  assert.deepEqual(admitLaunch14Execution(flags, enabled, { expectedCostMicros: 4 }), {
    kind: "unavailable",
    code: "COST_BUDGET_EXHAUSTED",
    metric: "cost_budget_exhausted",
  });
  assert.equal(enabled.reservedCostMicros, 7);
});
