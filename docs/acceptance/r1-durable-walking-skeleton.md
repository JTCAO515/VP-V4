# R1 Durable Walking Skeleton acceptance audit

Issue: AI-15/#17. Audit target: `main@728fc22`.

This is a release-evidence audit, not a release approval. It validates what the repository can
reproduce locally and records why that evidence is insufficient for the R1 user journey:
reviewed Fact fixture -> Turn -> immutable Proposal -> atomic apply -> reload/audit.

## Scope and traceability

- Owner path: existing Trip, Turn, Canvas, identity and feature-flag contracts; this Issue adds no
  implementation.
- Environment: Windows local workspace and Node `v24.13.0`. The package manifest declares
  `pnpm@9.15.9`, while this audit's recorded commands used available pnpm `11.19.0`; it emitted the
  expected warning that the legacy `pnpm.overrides` field is ignored.
- Build/config: `pnpm check` completed; `pnpm check:flags` accepts the two default-off R1 flags.
- Do-not-touch confirmed: no database, migration, flag value, provider, account, deployment,
  production connection, Trip, Fact or user data was changed.

## Eight dimensions

| Dimension | Result | Evidence and remaining gap |
| --- | --- | --- |
| Functional | degraded | 139 contract and 29 static E2E checks pass, including buffered Turn, pending Proposal and Canvas flows; no authenticated end-to-end runtime trace exists. |
| Interface | pass for repository contracts | closed Proposal/patch, owner scope and no-direct-write assertions pass; no deployed compatibility or SSE session is exercised. |
| Data | blocked | `db:verify` reports a baseline but all three database probes are `not-configured`; no migration head, transaction or reload is observed. |
| Security | degraded | 67 security tests pass; the local Supabase owner-RLS/fault probe is skipped because the service is not running. |
| Performance | blocked | no environment, request sample, p50/p95/p99, latency or cost evidence exists. |
| UX | degraded | 29 static E2E checks pass, including Canvas, locale and RTL source behavior; no authenticated desktop/mobile browser session is recorded. |
| Observable | blocked | no live trace, metric, alert, flag observation or finite observation window exists. |
| Compliance | blocked | no production data processing, retention, region, provider or operational approval evidence is in scope. |

## Red-line evidence

The AI-42 frozen fixture registry describes the available deterministic baseline. It is not a
substitute for running RLS or transaction evidence.

| Suite | Frozen fixture count | Runtime invariant | Observed violations |
| --- | ---: | --- | --- |
| RL-01 | 2 | no unauthorised or unconfirmed Trip write; writer requires confirmed Proposal receipt | 0/2 fixture regressions; local RLS runtime unavailable |
| RL-02 | 3 | no cross-user/private/draft/expired leakage; authoritative eligibility on reads | 0/3 fixture regressions; local RLS runtime unavailable |
| RL-03 | 2 | no invalid Patch reaches writer; closed operation union validates before transaction | 0/2 fixture regressions; local transaction runtime unavailable |

## Runnable evidence

`artifacts/AI-15/commands.jsonl` records the exact command, exit code, UTC time and environment.
Observed current results: `pnpm check` and `pnpm check:flags` pass; contract 139/139; security
67 pass / 1 local-Supabase skip; integration 5 pass / 8 local-Supabase skips; E2E 29/29; evals
20/20; `db:verify` reports `database-baseline-present` with all probes `not-configured`.

## Unrun, rollback, and observation

The unrun ledger names the unavailable local Supabase, authenticated browser and release/production
checks with their owner and unblock condition. Rollback is a normal revert of this report, ledger,
handoff and execution-row correction; no runtime or durable state was created.

Before a future R1 acceptance can be `accepted`, start an isolated local Supabase instance, apply
the migration head, seed two disposable owner identities and a reviewed fixture, then capture the
owner/other/anonymous Proposal-confirmation and reload/audit journey. Follow with a separately
authorized staging deployment, flag rollback trace and finite observation window with named owner,
availability/error/latency signals and rollback threshold.

## Verdict

**Verdict: `blocked`.** The repository contracts are useful engineering evidence, but skipped
RLS/transaction probes and absent authenticated, deployed and observed runtime evidence mean the
required R1 walking skeleton is not release-accepted. No capability is promoted.
