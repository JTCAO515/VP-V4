# R2 Grounded Text Internal Alpha acceptance audit

Issue: AI-21/#23. Audit target: `main@d8404727baf9e380d29a01139528dda1e1d7d382`.

This is an evidence audit, not a provider or release approval. The audit is intentionally completed
with a `blocked` verdict: the repository has fixture contracts for the R2 boundaries, but does not
have the external evidence required to call them an internal alpha.

## Scope and traceability

- Owner modules: AI-16 ModelGateway registry, AI-17 fixture route/trace, AI-18 lexical qrels,
  AI-19 eligibility-first hybrid retrieval, and AI-20 typed execution cards.
- Environment: Windows, Node `v24.13.0`, package manifest `pnpm@9.15.9`; a clean pinned-pnpm
  frozen install completed before this audit.
- Do-not-touch confirmed: no provider SDK/HTTP route, environment or credential access, schema,
  migration, database write, public capability, flag, release, DNS, or account operation.

## Provider, region, and runtime truth

| Candidate | Lifecycle in registry | Route state | Region/runtime evidence |
| --- | --- | --- | --- |
| DeepSeek Flash | beta | fixture only; thinking disabled | no real region, request, or returned-model sample |
| DeepSeek Pro | GA | fixture only | no real region, request, or returned-model sample |
| DeepSeek Vision | experimental | shadow only | no requestable runtime path |
| Qwen 3.7 strict | candidate | fixture only | no real region, request, or returned-model sample |

The only accepted route input is C0 synthetic text with `fixture_only` region. C1–C4, an
unapproved region, policy/safety blocks, Vision, unsupported schema, malformed data, and all raw
content fields fail closed. No route claims Explore, voice, external data, booking, payment, live
answer, or a provider-backed execution result.

## Eight dimensions

| Dimension | Result | Evidence / gap |
| --- | --- | --- |
| Functional | degraded | deterministic fixture routing, lexical evaluation, eligibility-first fusion, and typed cards pass tests; no real provider answer |
| Interface | pass for fixture boundary | exact-key route/input validation, closed known/unknown output, and typed evidence-card contract pass |
| Data | blocked | no reviewed runtime corpus, vector/FTS adapter, staging dataset, or local Supabase integration |
| Security | degraded | source security suite passes 26 tests; 1 RLS test is skipped because local Supabase is not running |
| Performance | blocked | no provider, staging, time-to-status, time-to-validated-answer, p50/p95/p99, or cost sample exists |
| UX | degraded | static five-locale/RTL and 22 frontend checks pass; no provider-backed answer/card or degraded-path browser session exists |
| Observable | blocked | trace projections are synthetic metadata only; no real trace, alert, health, flag, or observation window exists |
| Compliance | blocked | fixture policy denial exists, but no approved region/DPA, provider contract, data flow, or production policy receipt exists |

## Red-line results

| Suite | Fixture count | Runtime invariant | Observed violations |
| --- | ---: | --- | ---: |
| RL-04 | 3 named fixtures: stale receipt, negative evidence, forged claim type | `NO_ELIGIBLE_EVIDENCE` / unsupported execution returns zero card rows | 0/3 |
| RL-05 | 1 rendered money-card fixture | every card repeats the exact deduplicated current `EvidenceReceipt` set; no model text substitutes a typed value | 0/1 |

## Command evidence

The complete command ledger is `artifacts/AI-21/commands.jsonl`. The broad repository gate passed:
lint (114 files), typecheck, production build, static output (22), contract (110), security (26
passing plus 1 local-Supabase skip), integration (1 passing plus 8 local-Supabase skips), evals
(16), docs check, JSON parse, database configuration probe, and whitespace validation.

## Unrun, blockers, and rollback

No network, provider, credential, account, region/DPA, provider alias-drift, real cost/latency,
feature-flag rollback, staging SSE/abort/degraded E2E, browser, production, or local database/RLS
runtime check was run. These require explicitly authorized external or local-runtime conditions and
are listed with unblock conditions in `artifacts/AI-21/unrun.md`.

Rollback is a normal revert of this acceptance/audit record and its evidence. No flag, migration,
data, provider configuration, or deployment exists to undo.

## Observation window and verdict

Before the audit can become `accepted`, run a separately authorized staging experiment with named
provider/model/region, synthetic approved samples, time-to-status and time-to-validated-answer
measurements, bounded cost samples, alias/feature-flag rollback, SSE abort/degraded traces, and
independent RLS/eligibility verification. Assign an owner and a finite observation window in that
future release record.

**Verdict: `blocked`.** The repository evidence proves only fixture contracts. It does not prove a
real R2 internal alpha and must not be used for a provider, Explore, voice, external-data, or
release claim.

Independent automated review completed after ledger and fixture-count corrections with no remaining
Critical or Important finding.
