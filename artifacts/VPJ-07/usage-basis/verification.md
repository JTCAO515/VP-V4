# VPJ-07 verified model usage before budget settlement

Related to #195 and #194. Baseline cd2201194402b87e6322f4b703dd780707fcae2e;
isolated Usage-Basis worktree. Scope: text-worker pricing eligibility, direct Turn integration
regressions and this contract/evidence. No provider outcome, HTTP transport, ledger/schema,
ops, native, policy or shared-handoff change.

## Reproduction and fix

Before the worker edit, the new focused regression ran the actual worker with real disposable
PostgreSQL and controlled loopback HTTP. A response declaring an unverified model but valid
usage produced `MODEL_OUTPUT_INVALID`; the worker still called the configured model's tariff.
The SQL row was settled at20 micros against a1000-micro reservation, instead of pending/null.
[The original failure](red.log) is retained:0passed/1failed. These are synthetic test amounts,
not a provider invoice or a claim that historical user rows suffered this failure.

The guard now prices only `protocol_validated` and the normalizer's verified-model/usage
`SAFETY_BLOCKED` path. All other protocol failures retain unknown cost. No public outcome type
or SQL behavior changed. Diagnostic usage on `MODEL_OUTPUT_INVALID` is not sufficient evidence
for the configured model's tariff, including for some otherwise known-model protocol failures.

## Real local validation

[Full Turn SQL/HTTP run](green.log):24passed/0failed/0skipped, applying every application
migration to exclusively owned network-none PostgreSQL fixtures. Minimal SQL Auth/session
fixtures are used; this is not GoTrue or real-user/provider qualification.

The new regression demonstrates that an unverified model never calls the price function,
retains1000micros/pending/null, blocks another reservation at concurrency1, stores one generic
technical_failure/failed terminal, and makes no second HTTP call on duplicate polling.

An11-case controlled HTTP matrix also checks:
- Normal answers, business blocked/technical_failure, invalid business JSON with a validated
  provider protocol, and a verified provider safety refusal still settle at20micros.
- Missing model, model mismatch plus safety finish reason, an error envelope with usage,
  partial protocol finish, invalid choices and invalid usage arithmetic stay pending at1000.
- Price-callback eligibility, exact ledger status/amount, concurrency occupancy, business
  outcome and technical terminal-once agree for each case.

Commands and broader check outcomes are recorded in commands.jsonl. No real key, paid request,
remote/shared DB or actual recipient activation was used. Disposable containers were removed.
No visible Web/native change: browser/device reruns do not establish additional evidence for
this guard. Existing required CI and independent exact-HEAD review remain merge gates.

## Remaining boundary and rollback

#195/#194 remain open for their complete runtime and operational acceptance. Conservative holds
can require later authoritative reconciliation; no timeout/refusal/invalid-output refund is
introduced. This patch makes no retrospective ledger edits, supplier billing claim or customer
charging decision. If reverting the guard, disable the affected worker rather than intentionally
restoring unverified-model settlement; retain all reservations and existing evidence.

## Evidence whitespace correction

The initial pre-add whitespace check excluded the then-untracked red log. Independent review
found the committed range failed `git diff --check` at red.log lines17 and25. The repository
copy now normalizes only those two assertion-diff trailing-space lines; failure content and
amounts are unchanged. The original temporary reproduction log remains intact (SHA256
1c2a9142fe94a1e8e8bcc923d49803a6211911ae4c15b24a0c52d89a37f9e0a0).
The exact-range failure is recorded in commands.jsonl. Runtime source and tests were unchanged;
the correction requires full base-relative whitespace verification, not another local runtime run.
