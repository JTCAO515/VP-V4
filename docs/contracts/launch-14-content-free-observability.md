# LAUNCH-14 content-free observability preparation

## Status and boundary

This is a repository-only, in-memory preparation contract for LAUNCH-14. It contains no HTTP
exporter, log sink, dashboard, alert delivery, worker host, API route, provider adapter,
environment-variable read, credential, database, queue, user lookup, persistence, or deployment.
It is not evidence that the product is monitored or that a kill switch has been rehearsed.

## Trace boundary

`createContentFreeTraceChain()` mints one 32-character lowercase-hex correlation ID from a
server-controlled callback. Request, Turn, worker, and provider callers cannot provide or replace
that ID. A chain emits only `vp-observability-l14/v1` events with these fixed fields:

- correlation ID, one of four stages, one of six outcomes;
- bounded latency, retry, input-token, output-token, and cost-microunit counters; and
- `recordContent: false`.

The event input has an exact key allowlist. It rejects raw prompt/input/output/reasoning/messages,
user identifiers, email, keys, provider payloads, error text, arbitrary labels, negative values,
unsafe numbers, and counters above 2,147,483,647. Stage/outcome are bounded metric dimensions, not
caller-defined labels. The correlation ID is generated before any caller metadata and must never be
derived from an actor, task, message, provider response, credential, or content.

## Cost, SLO, and stop-loss decisions

`Launch14CostBudgetGuard` has a single exact `maxCostMicros` configuration and permanently reserves
an exact non-negative `expectedCostMicros` amount in process. It returns
`COST_BUDGET_EXHAUSTED` before a new call can be admitted. It does not bill, call a Provider, or
measure actual usage.

`admitLaunch14Execution()` first consumes the existing `CHAT_RUNTIME_ENABLED` flag and validates the
registry dependency. A disabled state returns `FLAG_DISABLED`; an illegal state returns `invalid`.
Neither state makes a rate or budget reservation. It next evaluates an in-memory fixed-window `Launch14RateGuard` by a server-created,
non-serializable subject handle; a `RATE_LIMITED` decision also makes no budget reservation. The
future API/worker boundary must bind that opaque handle only after verified server-side identity
resolution. This provides a deterministic integration seam only: LAUNCH-07/08 own the eventual
runtime consumers, and no deployed kill switch exists yet.

`evaluateLaunch14Slo()` accepts only bounded aggregate counts plus p95 latency and cost. It returns a
local `healthy` or closed alert reason (`error_rate`, `latency`, or `cost`). The deterministic error
threshold is more than 5% of a non-zero sample; p95 latency is over 3,000 ms; cost is over 1,000,000
microunits. It does not page, notify, query, retain a dashboard metric, or assert a real SLO.

## Verification, rollback, and deferred acceptance

The LAUNCH-14 tests prove synthetic API/Turn/worker/provider correlation, six classes of raw content
rejection plus PII/key/payload negatives, a synthetic fault-to-alert decision, and budget/flag
rejection before any transport exists. The deterministic tests are not a Staging fault injection.

Rollback is a normal revert of `lib/server/observability/launch-14.ts`, its tests and the LAUNCH-14
documentation. No external telemetry, metric, alert, flag configuration, Provider call, user data,
database row, queue job, account, or deployment exists to compensate.

Still required: a reviewed exporter/privacy policy, worker and API instrumentation, durable bounded
metrics, dashboard/query, real alert routing, verified identity-to-rate-subject binding, Staging fault
injection, Staging kill-switch rehearsal, and a finite observation window. Those actions remain
blocked on LAUNCH-07/08 and Staging/provider/operator gates.
