# VPJ-37 operational ledger read model

Base `26669d9ffa595bb069b81e6faa4031568c1cea0e`; branch `codex/ops-229-ledger-read-model`.
Related to #229. This increment implements and verifies a real service-only SQL metadata
read model plus a strict TypeScript diagnostic consumer. It does not close #229/#195/#227.

## Actual result

The isolated test creates the existing budget scope/attempt states through their real RPCs,
creates/finishes text Turns through existing owner/service RPCs, then reads the new aggregate
as `service_role`. The diagnostic in [ops-db.log](ops-db.log) is rendered from that database
response, not a hand-authored dashboard sample.

- Five actual attempts partition into one reserved, dispatched, pending, settled and released.
  Provider subtotals reconcile exactly. Ledger debit7 + unresolved hold1000 = exposure1007 CNY
  micros; actual billed cost remains unknown. Reserved/dispatched/pending continue to occupy
  the original budget; no hold is released or changed by the reader.
- Two provider attempts for the same partial-response Turn contribute one task and one partial
  outcome. Another task is blocked; a metadata-only technical failure and an unlinked task
  have unobserved business outcomes, not invented successful answers.
- Hidden content does not supply a business outcome. Foreign-owner task IDs are counted as
  owner mismatches without returning identifiers or body fields. No body, UUID, model name or
  price-version string appears in the diagnostic.
- Deliberately inconsistent terminal/output metadata and duplicate terminal events produce
  explicit integrity diagnostics. The reader does not repair or delete source records.
- Concurrent settlement and15 reads keep all state/provider/money equations consistent and
  leave the other scope byte-identical. The function succeeds in an explicitly read-only
  transaction; both ordinary roles are denied execute access.
- The new migration preserves existing ledger/scope/Turn/text rows byte-for-byte; repeated
  reads and report rendering also preserve those snapshots.

## Checks

- Full base31 application migrations plus the new read-only migration applied transactionally
  on unique PostgreSQL17.6 containers with `--network none`, no published ports and a private
  Unix socket. Minimal SQL Auth declarations are fixtures, not GoTrue/JWT acceptance.
- Isolated PostgreSQL suite: **5 passed /0 failed /0 skipped**. Each test run removed only its
  unique container, including earlier failed runs. No existing local or remote database used.
- New contract tests: **3 passed**; exact allowlist, arbitrary-precision money, unavailable
  transport, extra fields, invented unknown metrics and inconsistent aggregates covered.
- `pnpm check`: lint/typecheck/build and22 static tests passed. Unit92 and contract202 passed,
  zero skips. Required docs/diff results and actual commands are in `commands.jsonl`.
- Budget PostgreSQL CI includes the explicit opt-in ops suite and observability path filters;
  its original budget and Turn checks remain. Exact-HEAD CI and independent review remain
  delivery gates and are not claimed by these local results.

Two initial test-helper failures were fixed without changing the read model: the SQL function
name validator rejected the version digit, then a pg_catalog `"char"` concatenation needed an
explicit text cast. Those runs were failures (0/5 then4/5), not relabeled as passes. A final
repeat additionally verified execution inside a read-only transaction.

No provider call, credential read, team permission activation, new platform, paid operation,
customer endpoint or remote migration occurred. Quality/latency/tools/human time/ServiceTask
metrics remain explicitly unknown. See [unrun.md](unrun.md), the
[contract](../../docs/contracts/vpj-37.md) and [runbook](../../docs/runbooks/ops-ledger-reconciliation.md).
