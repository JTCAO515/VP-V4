# Actual C0 provider conformance — 2026-09-10

User authorized wholly synthetic travel-text tests, supplier retention/model improvement
under applicable terms, and cumulative CNY30 per provider/CNY90 total; no recharge.
Keys were read from the local login Keychain into the authorized process only. No real
user/Trip data, generated tool execution or customer interface was involved.

## Observed results

- 27/27 main protocol samples validated:9 each Qwen,GLM,DeepSeek across ordinary English
  text, Chinese known/unknown JSON and an English function-tool candidate.
- Qwen/DeepSeek initial three samples used max_tokens1024. Later matched rounds2/3 use4096
  for all providers; GLM recovery samples also use4096. Never aggregate as three identical
  configurations. Native GLM thinking remains enabled; the other two explicitly disable it.
- Initial GLM disabled-thinking request and a64-token diagnostic returned400/1210. The
  matched diagnostic omitting that field returned200 with23+64 tokens/length. Adapter fix
  preserves default GLM mode, and its subsequent9 complete protocol samples passed.
- Six actual-endpoint client timeout/cancel probes passed, with AbortSignal observed and
  full cost holds preserved. This does not prove upstream generation stopped or was free.
- Two separate Node workers raced one real DeepSeek attempt: exactly one transport call.
  Another worker was SIGKILLed after emitting a metering receipt but before settlement;
  its ledger remained dispatched, a restarted worker made no second call, and the durable
  receipt reconciled the budget debit. Both process proofs PASS, two extra HTTP calls.
- Total38 HTTP transport invocations:27 main samples,3 GLM diagnostic/failure requests,
  6 client-boundary attempts and2 process-proof calls.32 responses were observed,30 had
  complete metering. Client-boundary invocations are not all proven server acceptances.

## Cost and data boundaries

The same isolated persistent PostgreSQL budget scope was reused without resetting caps.
[C0 accounting v1](../../../docs/benchmarks/vpj-06/c0-cost-accounting-20260910.md) records
validated usage at frozen highest public standard tariffs and rounds upward to micro-CNY.
A durable sidecar is written before settlement; this is a conservative internal budget debit,
not a supplier invoice or customer charge.28.9CNY remains held for the two no-usage400s and
six client-boundary attempts; it is not a claim that28.9CNY was spent. Complete-usage debits
total0.035014CNY, including diagnostics/process proofs; actual billed amount remains unknown.
Provider-specific debit+outstanding hold remains below30CNY, total below90CNY.

Only metadata, self-authored case text and deterministic conclusions appear in results.json;
no raw response/chain-of-thought, keys, private actor IDs or backup contents are published.
This is a three-case auxiliary development probe, not the12 canonical Harness acceptance set.
General semantic quality, calibrated human preference, production model selection, serving
location beyond the selected documented endpoint and deployed-worker/native integration
remain unverified. No model winner or parent Issue completion is claimed.

## Reproduction and checks

The main protocol factory and durable budget modules are repository code. The operator-scoped
runner is deliberately not a default gateway: private campaign journal/locks prevent blind
replay, and execution requires the same approved cap/receipt context. Request cases and safe
configuration versions are in results.json. Pricing sources and debit semantics are versioned
in C0 accounting v1. No generic command here may reset or silently create a new spending scope.

Actual private commands executed: init.mjs, run.mjs execute, two bounded GLM diagnostics,
reconcile-upper.mjs, run-followups.mjs execute, transport-boundaries.mjs and process-proof.mjs.
The first preflight rejected an alias inconsistent with the reviewed Qwen pinned snapshot;
it was aligned before any reservation or call. The fixed code's21 protocol/security tests
pass; full required checks and exact-HEAD review are recorded in the delivery PR.
