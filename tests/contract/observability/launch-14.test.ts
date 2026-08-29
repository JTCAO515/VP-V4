import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTENT_FREE_TRACE_SCHEMA,
  createContentFreeTraceChain,
  evaluateLaunch14Slo,
} from "../../../lib/server/observability/launch-14.ts";

test("LAUNCH-14 correlates API, Turn, worker, and provider metadata without accepting caller trace IDs", () => {
  const chain = createContentFreeTraceChain();
  const events = [
    chain.record({ stage: "api", outcome: "started", latencyMs: 2, retryCount: 0, inputTokens: 0, outputTokens: 0, costMicros: 0 }),
    chain.record({ stage: "turn", outcome: "started", latencyMs: 3, retryCount: 0, inputTokens: 0, outputTokens: 0, costMicros: 0 }),
    chain.record({ stage: "worker", outcome: "retry_scheduled", latencyMs: 4, retryCount: 1, inputTokens: 0, outputTokens: 0, costMicros: 0 }),
    chain.record({ stage: "provider", outcome: "succeeded", latencyMs: 5, retryCount: 1, inputTokens: 11, outputTokens: 7, costMicros: 42 }),
  ];

  assert.match(events[0].traceId, /^[a-f0-9]{32}$/);
  assert.deepEqual(events.map((event) => event.traceId), Array(4).fill(events[0].traceId));
  assert.deepEqual(events.map((event) => event.schemaVersion), Array(4).fill(CONTENT_FREE_TRACE_SCHEMA));
  assert.deepEqual(events.map((event) => event.recordContent), [false, false, false, false]);
  assert.throws(() => chain.record({ stage: "api", outcome: "started", latencyMs: 1, retryCount: 0, inputTokens: 0, outputTokens: 0, costMicros: 0, traceId: "caller-controlled" }));
});

test("LAUNCH-14 produces a bounded alert decision for synthetic SLO faults only", () => {
  assert.deepEqual(
    evaluateLaunch14Slo({ requestCount: 20, errorCount: 2, cancelledCount: 0, retryCount: 1, p95LatencyMs: 100, costMicros: 200 }),
    { kind: "alert", reason: "error_rate" },
  );
  assert.deepEqual(
    evaluateLaunch14Slo({ requestCount: 20, errorCount: 0, cancelledCount: 0, retryCount: 1, p95LatencyMs: 100, costMicros: 200 }),
    { kind: "healthy" },
  );
});
