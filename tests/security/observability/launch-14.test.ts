import assert from "node:assert/strict";
import test from "node:test";

import {
  Launch14CostBudgetGuard,
  Launch14RateGuard,
  admitLaunch14Execution,
  createLaunch14RateSubject,
  createContentFreeTraceChain,
} from "../../../lib/server/observability/launch-14.ts";
import { defaultFlags } from "../../../lib/flags/registry.ts";

test("LAUNCH-14 rejects raw content, PII-shaped fields, secrets, and unbounded telemetry labels", () => {
  const chain = createContentFreeTraceChain();
  const valid = { stage: "provider", outcome: "succeeded", latencyMs: 1, retryCount: 0, inputTokens: 1, outputTokens: 1, costMicros: 1 };
  for (const key of ["prompt", "input", "output", "reasoning", "media", "messages", "userId", "email", "apiKey", "errorMessage", "providerPayload"]) {
    assert.throws(() => chain.record({ ...valid, [key]: "never-record" }));
  }
  assert.throws(() => chain.record({ ...valid, stage: "unbounded-label" }));
  const attemptedOverride = (createContentFreeTraceChain as unknown as (value: unknown) => ReturnType<typeof createContentFreeTraceChain>)({ mintTraceId: () => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
  const overrideEvent = attemptedOverride.record(valid);
  assert.notEqual(overrideEvent.traceId, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
});

test("LAUNCH-14 consumes the fail-closed chat flag before reserving a bounded cost budget", () => {
  const disabled = new Launch14CostBudgetGuard({ maxCostMicros: 10 });
  const disabledRate = new Launch14RateGuard({ windowMs: 60_000, perSubjectAttempts: 1 });
  assert.deepEqual(admitLaunch14Execution(defaultFlags, disabled, disabledRate, createLaunch14RateSubject(), { expectedCostMicros: 1 }), {
    kind: "unavailable",
    code: "FLAG_DISABLED",
    metric: "flag_disabled",
  });
  assert.equal(disabled.reservedCostMicros, 0);

  const enabled = new Launch14CostBudgetGuard({ maxCostMicros: 10 });
  const rate = new Launch14RateGuard({ windowMs: 60_000, perSubjectAttempts: 1 });
  const subject = createLaunch14RateSubject();
  const flags = { ...defaultFlags, TRIP_PERSISTENCE_ENABLED: true, CHAT_RUNTIME_ENABLED: true };
  assert.deepEqual(admitLaunch14Execution(flags, enabled, rate, subject, { expectedCostMicros: 7 }), { kind: "admitted", reservedCostMicros: 7 });
  assert.deepEqual(admitLaunch14Execution(flags, enabled, rate, subject, { expectedCostMicros: 4 }), {
    kind: "unavailable",
    code: "RATE_LIMITED",
    metric: "rate_limited",
  });
  assert.equal(enabled.reservedCostMicros, 7);
});
