# VPJ-37 — budget-scope operational read model v1

Related to #229. This is a repository and isolated-database increment over the existing
durable ledger/Turn producers. #195/#227 and complete #229 acceptance remain open. There
is no customer/team endpoint, dashboard deployment, new ledger, kill switch or exporter.

## Source and snapshot

`public.read_ops_budget_scope_v1(p_scope_id uuid)` is executable only by `service_role`.
It returns `kind: unavailable` for an absent/null scope, otherwise one
`ops-budget-scope/v1` JSON snapshot. The SQL function is STABLE, read-only, with an empty
search path; all aggregates use the same statement snapshot. It takes no row/advisory locks
and does not change scope flags, costs, Turns, text, consent or membership.

An authorized deployment must select the scope and provide a finite-timeout service RPC
transport to `readOpsLedgerScope`. No credentials/client/route are supplied by this increment.
The account/team access decision must precede that call. The general product direction for
team CRUD does not activate a team role or make ordinary customer RLS permissive.

| Metric | Source / meaning |
| --- | --- |
| Attempt states | Actual `model_budget_attempts` rows in the selected scope; reserved/dispatched/pending/settled/released partition the total |
| Ledger debit | Sum of `actual_micros` only for settled attempts; a ledger price calculation, not an invoice |
| Unresolved hold | Sum of `reserved_micros` for reserved/dispatched/pending; all three still occupy the existing cost/concurrency budget |
| Exposure | Ledger debit plus unresolved hold; released rows contribute zero |
| Provider breakdown | Same attempt/money definitions grouped by the three allowlisted provider names; all rows sum back to scope totals |
| Tasks | Distinct ledger `task_id` values, counted once despite retries or multiple providers; not a ServiceTask/customer-usage count |
| Turn linkage | Same-owner Turn, missing Turn, or owner mismatch; those three counts partition distinct task IDs |
| Technical states | Same-owner Turn status; completed is a technical terminal, not evidence of a correct answer |
| Business outcomes | Only visible `text_content.output_kind` matching the Turn terminal: answered/partial/clarification → completed, blocked → unavailable, technical_failure → failed |
| Unobserved outcomes | No output, hidden content, absent/wrong-owner Turn, or mismatched output/terminal; these are never guessed to be successes |
| Integrity counts | Visible outcome/terminal mismatch and same-owner tasks with more than one terminal event; diagnostic observations, not automatic repairs |

`actualBilledMicros`, `providerLatencyMs`, `toolAttempts`, `humanTimeMs`, `semanticQuality`
and `serviceTaskCount` are explicitly `null` in `unobserved`. No accepted source is queried
for these metrics. A timestamp difference is not model latency. A partial answer is not
an answered request or proof of semantic quality. Empty scopes have observed zero rows,
while the absent metrics remain unknown even for an empty scope.

## Wire and disclosure

The top-level keys are `kind`, `schemaVersion`, `observedAt`, `scope`, `attempts`, `money`,
`providers`, `tasks`, `integrity`, `unobserved`. Scope contains currency and enabled/frozen/
expired flags, not its owner. Counts are safe nonnegative integers. Monetary aggregates are
decimal integer strings, preserving precision beyond JavaScript Number's safe range.

No owner, scope, task, attempt, policy or session UUID leaves the SQL snapshot. No input,
answer, title, provider error, model/price-version string or credential is returned. The
query uses identifiers internally for exact joins but selects no body columns. Hidden
content never supplies a business outcome. Existing budget records and metadata may outlive
other records; a missing Turn remains unknown and does not erase financial history.

`parseOpsLedgerSnapshot` enforces the exact allowlist and reconciles state/provider/task/
money partitions. Extra fields, invented values for unknown metrics, unsafe counters,
duplicate provider groups and mismatched totals fail closed. `readOpsLedgerScope` returns
only `unavailable` on missing scope, transport or decoding failure, without raw errors.
`apps/ops/ledger-report.ts` renders the validated snapshot as a plain-text diagnostic.

## Integration and rollback

Migration `20260910190658_vpj_37_ops_scope_read_model.sql` adds only this function and its
service-role execution grant. Existing table/RPC definitions and caller flags are unchanged.
It depends on the existing budget, Turn and text metadata migrations through native consumer31;
it has no dependency on the parallel #194/#190 work.

Validation uses newly created, network-isolated PostgreSQL with the full application migration
chain, existing service/owner RPCs, synthetic text, direct aggregate comparison and concurrent
settlement. That proves local SQL/service-role behavior, not remote GoTrue, real invoices,
deployed operational access or full #229. See [verification](../../artifacts/VPJ-37/verification.md).

Disable the future consumer or revert its code to stop using the read model. Preserve applied
migration history and original ledger/Turn/body records. No refund, ledger reset, data deletion,
scope enablement or permission expansion is part of rollback. Stop/resume remains owned by #194.

## Ops member read slice, 2026-09-17

An authenticated, active Ops member may request one budget-scope snapshot through
`public.ops_budget_scope_read_v1(uuid)`. Its public wrapper is security-invoker;
the sole definer function lives in `ops_budget_private`. It calls the existing
`knowledge_review_private.current_actor()` in the same transaction before the
existing service-only aggregate. That guard rechecks the live Auth session,
mobile-session state, Ops switch and membership under locks. The wider knowledge
private schema remains inaccessible to ordinary authenticated callers.

`GET /api/ops/budget?scopeId=<uuid>` uses the existing Cookie-authenticated Ops
configuration and a finite request lifetime. Authorization headers and extra query
parameters are rejected. The server validates the exact aggregate schema before
returning it, sets `private, no-store`, and never returns a raw SQL error or row.
`/ops/budget` renders the source-backed diagnostic in a zh/en Ops UI. It has no
mutation control; budget stop and resume are separate work. No service key is
available to the browser. Actual invoices, provider latency, tool attempts, human
time and semantic quality remain unknown, never zero-filled.

The isolated PostgreSQL 17.6 replay checks active/nonmember/anonymous access,
revocation, deleted session, original service-only RPC denial and unchanged
knowledge-schema grants. The local browser checks the route and narrow layout
without claiming Staging activation or customer access.

## Attempt reconciliation view, 2026-09-22

`/ops/budget` now presents the existing validated snapshot as separate zh/en task,
attempt, budget, provider, integrity and unobserved metric sections. No new RPC,
ledger or access grant is introduced. Business partial/failure/unobserved counts
remain separate from answered and technical completed; provider subtotals only
reconcile attempts and money, never task counts. All six absent metrics display
Unknown, including empty scopes. Micros remain decimal strings without conversion
to floating-point numbers. The original text diagnostic is available in a disclosure.

The UI and service reader derive findings from the same validated snapshot through
`opsLedgerFindings`; no additional query can introduce a different observation time.
Budget admission flags are read-only observations. This increment adds no stop/resume
protocol, capability/provider/city control, actual provider billing or operational
acceptance. Synthetic browser tests verify presentation and failure handling only.
