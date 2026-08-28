# R5 full-beta hardening acceptance audit

Issue: AI-41/#43. Audit target: `main@c72df1e`.

This is an evidence-only release-gate audit. It neither authorizes production, performs a canary,
nor turns fixture coverage into runtime or product evidence. Its only safe verdict is `blocked`
until the missing operator-controlled evidence is supplied.

Current local replay: `pnpm check` passed; contract 139/139, integration 12 passed with 8 local
Supabase skips, security 67/67 with 1 local-RLS skip, E2E 29/29 and evals 20/20 passed. Exact
timestamps and exit codes are in [`artifacts/AI-41/commands.jsonl`](../../artifacts/AI-41/commands.jsonl).

## Scope and current boundary

| Required R5 outcome | Repository evidence | What remains absent |
| --- | --- | --- |
| Functional beta path | bounded Trip, Turn, Knowledge, external-evidence and unavailable-route contracts | a complete closed-beta user journey with approved providers and data policy |
| Security and retention | named RL-01…RL-09 suites plus fail-closed boundaries | local RLS runtime, provider/media deletion and Storage recovery evidence |
| Backup and restore | AI-49 parameter-free isolated-rehearsal validator and runbook | real restore, PITR, compensation, RPO/RTO, Storage TTL/backup and reconciliation evidence |
| Performance and accessibility | static responsive/RTL and unavailable-state coverage | device, assistive-technology, latency, cost, load and error-budget measurements |
| Release operations | blocked runbooks and explicit rollback language | flags, deployment/cutover, canary, alert, trace, owner and finite observation window |

No row may be combined with another to claim that a closed beta has been operated.

## Eight dimensions

| Dimension | Result | Evidence and limit |
| --- | --- | --- |
| Functional | blocked | bounded contracts and truthful unavailable states exist; no end-to-end approved beta path exists |
| Interface | degraded | static routes, responsive fixtures and locale/RTL boundaries are covered; no full action-matrix browser/device proof exists |
| Data | blocked | owner-scoped contracts exist; no live policy/Fact, provider, private-artifact, backup or recovery evidence exists |
| Security | degraded | red-line source tests are deterministic; local RLS and all provider/runtime boundaries remain unrun |
| Performance | blocked | no p50/p95/p99, load, provider, queue or mobile measurements exist |
| UX | blocked | no device/accessibility/permission/interruption/correction study or participant observation exists |
| Observable | blocked | no accepted release trace, alert, metric, provider health signal, error budget or finite window exists |
| Compliance | blocked | no approved production provider/region/retention/DPA, rights, media/deletion or Storage policy authority exists |

## Red-line evidence

The named fixture registry has deterministic baseline counts: RL-01=2, RL-02=3, RL-03=2,
RL-04=3, RL-05=2, RL-06=2, RL-07=2, RL-08=3 and RL-09=2. A zero result means only `0/N`
observed violations in the named static fixtures; it never measures an unbounded production system.

| Suites | Runtime invariant | R5 result |
| --- | --- | --- |
| RL-01–RL-03 | no unauthorised/unconfirmed Trip write, private leak, or invalid patch reaches the writer | bounded source evidence only; local RLS/transaction runtime is unrun |
| RL-04–RL-05 | no unsupported high-risk claim or incorrect receipt becomes a card | bounded claim/receipt evidence only; no provider or human-quality result |
| RL-06–RL-07 | no prohibited data flow or raw media/secret in general logs | bounded policy/allowlist evidence only; no approved provider/media runtime |
| RL-08–RL-09 | no candidate/public leak or expired Explore capability | bounded source evidence only; no live Facts/projection/rendering |

## L1–L7 acceptance

| Level | Required evidence | R5 result |
| --- | --- | --- |
| L1 source policy | lint and source policy checks | pass: source lint plus 22 static checks |
| L2 type/build | typecheck and production build | pass: strict typecheck and production build |
| L3 bounded contracts | contract and integration suites | degraded: contract 139/139; integration 12 passed / 8 local-Supabase skips |
| L4 journey/UI | E2E static-route suite | pass: 29/29 static routes; no full browser/device journey |
| L5 security | security suite and runtime invariant | degraded: 67/67 source checks; 1 local-RLS skip and no provider runtime |
| L6 recovery/operations | restore, retention, queue, error-budget and load evidence | blocked: only parameter-free preparation exists |
| L7 release observation | canary, trace, alert, owner and finite window | blocked: no release environment or observation window exists |

## Unrun conditions and rollback

The following are intentionally unrun: production/Preview cutover, canary, traffic, provider calls,
real media, external storage, local Supabase RLS, database restore/PITR/compensation, S3 backup or
TTL deletion, physical device/accessibility, load/performance, alerting and observation. Their
absence is a blocker, not permission to weaken a fail-closed path.

Rollback remains: do not release; keep unavailable states and map-off; retain only accepted
contracts; revert this evidence record if it becomes inaccurate. No operator account, provider,
backup, production flag, DNS, payment, data or public claim was changed.

## Verdict

`blocked / non-release`. Merge can establish documentation and local source evidence only. R5
requires an authorized operator to supply an isolated runtime plan, accepted policy/region/retention
records, real recovery evidence, redacted runbook outputs, and a named canary observation window
before this verdict can change.
