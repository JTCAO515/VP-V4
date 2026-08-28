# Issue execution contract

`docs/agents/issue-tracker.md` says what an Issue body must contain. This file supplies the four
execution parameters that Issue bodies do not carry: mandatory reading order, file ownership,
runnable commands, and evidence artifacts. An Issue body links here; this file is the authority.

Keep this file in sync with `package.json` scripts. If a command below does not exist yet, the
Issue that introduces it is named in the command registry.

## 1. Mandatory reading order

Read in this order before planning or implementing any AI Core Issue:

1. `docs/handoff.json` — machine-readable current state, blockers, operator actions.
2. `CONTEXT.md` and `AGENTS.md`.
3. `docs/ai-core-integrated-research-report.md` — product and system adjudication.
4. `docs/ai-core-engineering-development-acceptance-report.md` — WBS, interfaces, acceptance.
5. The current GitHub Issue and every Issue it is blocked by.
6. Accepted ADRs under `docs/adr/` that the Issue names.
7. This file's row for the Issue.
8. The owning module's frozen contract and tests, once they exist.
9. `git status`, current branch, and `origin/main`.

The domain plans (`docs/model-layer-plan.md`, `docs/external-data-chatbot-plan.md`,
`docs/knowledge-rag-explore-plan.md`) and `docs/research/**` are read on demand, not by default.
`docs/research/**` is a frozen evidence ledger: read-only for every implementation Issue.

## 2. Command registry

| Command | Status | Introduced by |
| --- | --- | --- |
| `pnpm lint` | exists | — |
| `pnpm typecheck` | exists | — |
| `pnpm build` | exists | — |
| `pnpm test` | exists | — |
| `pnpm check` | exists | — |
| `pnpm test:unit` | exists | AI-07a |
| `pnpm test:contract` | exists | AI-07a |
| `pnpm test:integration` | exists | AI-07a |
| `pnpm test:security` | exists | AI-07a |
| `pnpm test:e2e` | exists | AI-07a |
| `pnpm evals` | exists (scaffold only) | AI-07a scaffold, AI-42 corpus |
| `pnpm db:verify` | exists (scaffold only) | AI-07a scaffold, AI-08 implementation |
| `pnpm docs:check` | exists | AI-07a |
| `pnpm check:assets` | planned | WEB-04 #138 |

A planned command may not be silently skipped. Until AI-07a lands, an Issue records
`planned — not runnable at <sha>` for that row and runs `pnpm check`.

## 3. Evidence artifacts

Every Issue writes to `artifacts/<AI-nn>/`:

- `commands.jsonl` — one line per command: `{command, exitCode, startedAt, finishedAt, env}`;
- `unrun.md` — every check named in the Issue that was not run, and why;
- the Issue-specific outputs named in the table below.

`artifacts/` is git-ignored except `artifacts/**/*.md` summaries referenced by an acceptance report.

## 4. Red-line suite registry

The report's nine hard gates become nine named deterministic suites. `0` always means
`N/N observed violations in this named suite`, never a claim about unbounded scenarios.

| Suite | Invariant | Runtime fail-closed |
| --- | --- | --- |
| `RL-01` | no unauthorized or unconfirmed Trip write | writer rejects patch without a confirmed proposal receipt |
| `RL-02` | no cross-user / private / draft / expired leakage | authoritative eligibility join on every read path |
| `RL-03` | no invalid Patch reaches the writer | closed operation union validated before transaction |
| `RL-04` | no unsupported high-risk claim | `NO_ELIGIBLE_EVIDENCE` terminal outcome |
| `RL-05` | no wrong citation or fact receipt | typed `GroundedClaim` with current receipt |
| `RL-06` | no prohibited display/cache/persist/prompt/embed/translate/TTS | `DATA_POLICY_BLOCKED` before provider call |
| `RL-07` | no sensitive raw media or secret in general logs | allowlisted trace fields only |
| `RL-08` | no candidate or importer row public | shared eligibility view, RLS |
| `RL-09` | no expired Explore capability badge | fact-level freshness gate at render |

An Issue that claims a red line must name the suite ID, the fixture count, and the runtime
invariant. A suite may only be introduced or extended by the Issues listed in section 5.

## 5. Per-Issue execution parameters

Global forbidden paths for every implementation Issue: `.env*`, `docs/research/**`,
`docs/adr/**` (append a new ADR instead of editing an accepted one), `pnpm-lock.yaml`
(unless the Issue adds a dependency), `.github/workflows/**` (AI-07a only),
and any file owned by another Issue's row.

| Issue | Owning module | Allowed paths | Required commands | Artifacts | Red-line suites |
| --- | --- | --- | --- | --- | --- |
| #2 AI-00 | Program / tracker | `docs/handoff.json, HANDOFF.md, CONTEXT.md` | `pnpm check`; `pnpm docs:check`, `jq empty docs/handoff.json`, `git diff --check` | program-status.md | — |
| #3 AI-01 | Governance / Decision Register | `docs/decisions/decision-register.md, docs/adr/**` | `pnpm check`; `pnpm docs:check`, `jq empty docs/handoff.json`, `git diff --check` | decision-register.md, ADR-0003..ADR-0013 | — |
| #4 AI-02 | Architecture / Migration | `docs/architecture/ai-02-vp-final-disposition-matrix.md` | `pnpm check`; `pnpm docs:check`, `jq empty docs/handoff.json`, `git diff --check` | disposition-matrix.md | — |
| #5 AI-03 | Domain Contracts | `lib/server/contracts/**, tests/contract/domain/**, docs/contracts/**` | `pnpm check`; `pnpm docs:check`, `jq empty docs/handoff.json`, `git diff --check`; `pnpm test:contract` | schema snapshots, consumer tests | — |
| #6 AI-04 | Identity / Data Platform | `docs/adr/**, docs/architecture/actor-model.md` | `pnpm check`; `pnpm docs:check`, `jq empty docs/handoff.json`, `git diff --check` | ADR + actor x credential matrix | — |
| #7 AI-05 | Security / Privacy | `docs/adr/**, docs/policy/data-classes.md, docs/policy/threat-model.md` | `pnpm check`; `pnpm docs:check`, `jq empty docs/handoff.json`, `git diff --check` | C0-C4 table, region ADR, threat model | RL-06 RL-07 |
| #8 AI-06 | TurnCoordinator / Web protocol | `lib/server/turn/contract.ts, docs/contracts/turn-sse-v1.md, tests/contract/turn/**` | `pnpm check`; `pnpm docs:check`, `jq empty docs/handoff.json`, `git diff --check`; `pnpm test:contract` | SSE event schema, replay fixtures | — |
| #9 AI-07a | Quality / CI | `package.json, scripts/**, .github/workflows/**, tests/**/README.md, evals/**, .gitignore, artifacts/**, docs/acceptance/**, docs/agents/issue-execution-contract.md` | `pnpm check`; `pnpm check` plus every suite this Issue touches | CI config, empty suite scaffolds, artifacts/ layout | registry owner |
| #10 AI-08 | Data Platform | `supabase/**, scripts/db/**` | `pnpm check`; `pnpm db:verify`, `pnpm test:integration` | migration head, three connection probes | — |
| #11 AI-09 | TripWorkspace / Migration | `lib/server/trip/patch/**, tests/contract/trip/**` | `pnpm check`; `pnpm test:contract` | golden patch fixtures, old-vs-new diff | RL-03 |
| #12 AI-10 | TripWorkspace | `lib/server/trip/**, supabase/migrations/**, app/api/trips/**` | `pnpm check`; `pnpm db:verify`, `pnpm test:integration`; `pnpm test:contract`; `pnpm test:integration` | fault-injection log, idempotency matrix | RL-01 RL-03 |
| #13 AI-11 | KnowledgeSystem / Migration | `lib/server/knowledge/fact/**, tests/contract/knowledge/**` | `pnpm check`; `pnpm test:contract` | eligibility golden + negative fixtures | RL-02 RL-05 |
| #14 AI-12 | TurnCoordinator | `lib/server/turn/**, app/api/chat/**, components/chat/**` | `pnpm check`; `pnpm test:contract`; `pnpm test:integration` | fake-model turn transcript, resume proof | — |
| #15 AI-13 | Trip Canvas UI | `components/canvas/**, app/(product)/trips/**` | `pnpm check`; `pnpm test:e2e`; browser QA at 1280x800 and 390x844, `lang=ar dir=rtl` pass | browser + 390x844 + RTL screenshots | RL-01 |
| #16 AI-14 | Security / RLS | `supabase/migrations/**, tests/security/**` | `pnpm check`; `pnpm test:security`; `pnpm db:verify`, `pnpm test:integration` | actor x table/RPC matrix, fault log | RL-01 RL-02 |
| #84 AI-51 | Identity / UserDataAdapter | `app/(auth)/**, app/api/trips/**, lib/server/identity/**, docs/contracts/user-data-adapter.md, tests/{contract,integration,security}/identity/**` | `pnpm check`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm test:e2e`; browser QA at 1280x800 and 390x844 | session/callback proof, owner/other/anon route matrix, CSRF proof | RL-01 RL-02 |
| #122 AI-51b | Identity / Password Login | `app/(auth)/**, app/api/auth/**, components/auth/**, lib/server/identity/**, lib/i18n.ts, app/globals.css, tests/{contract,security,e2e}/identity/**, docs/adr/ADR-0017-password-authenticated-closed-beta.md, docs/contracts/user-data-adapter.md, docs/agents/issue-execution-contract.md, docs/handoff.json, HANDOFF.md, CONTEXT.md, artifacts/AI-51b/unrun.md` | `pnpm test:contract`; `pnpm test:security`; `pnpm test:e2e`; `pnpm docs:check`; `pnpm check`; copy/claim scan; browser QA at 1280x800 and 390x844 plus Arabic RTL; `jq empty docs/handoff.json`; `git diff --check` | `artifacts/AI-51b/commands.jsonl`, `artifacts/AI-51b/unrun.md`, password-session acceptance summary | RL-01 RL-02 RL-07 |
| #126 AI-13a | Trip API / Pending Proposal Read | `app/api/trips/[tripId]/proposal/**, lib/server/identity/**, tests/{contract,integration,security}/identity/**, docs/contracts/pending-proposal-read.md, docs/agents/issue-execution-contract.md, artifacts/AI-13a/**` | `pnpm check`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm docs:check`; `jq empty docs/handoff.json`; `git diff --check` | pending-proposal contract, owner/other matrix, unrun | RL-01 RL-02 |
| #127 AI-13b | TripWorkspace / Proposal Revision | `lib/server/trip/**, supabase/migrations/**, app/api/trips/[tripId]/proposal/**, tests/{contract,integration,security}/trip/**, docs/contracts/**, docs/agents/issue-execution-contract.md, artifacts/AI-13b/**` | `pnpm check`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm db:verify`; `pnpm docs:check`; `jq empty docs/handoff.json`; `git diff --check` | revision lineage, CAS/idempotency matrix, migration/rollback proof, unrun | RL-01 |
| #130 AI-13c | Trip API / Proposal Reject | `app/api/trips/[tripId]/proposal/reject/**, lib/server/identity/**, tests/{contract,integration,security}/trip/**, docs/contracts/proposal-reject-v1.md, docs/agents/issue-execution-contract.md, artifacts/AI-13c/**` | `pnpm check`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:security`; `pnpm docs:check`; `jq empty docs/handoff.json`; `git diff --check` | reject contract, owner/other/replay matrix, unrun | RL-01 |
| #17 AI-15 | Release gate R1 | `docs/acceptance/r1-*.md` | `pnpm check`; `pnpm check` plus every suite this Issue touches | eight-dimension acceptance report | RL-01 RL-02 RL-03 |
| #18 AI-16 | ModelGateway | `lib/server/model-gateway/**, tests/contract/model-gateway/**` | `pnpm check`; `pnpm test:contract` | provider conformance matrix | — |
| #19 AI-17 | ModelGateway / Observability | `lib/server/model-gateway/route/**, lib/server/observability/**` | `pnpm check`; `pnpm test:contract`; `pnpm test:integration` | trace sample, cost/route snapshots | RL-07 |
| #20 AI-18 | Knowledge / Retrieval | `lib/server/knowledge/retrieval/lexical/**, evals/qrels/**` | `pnpm check`; `pnpm evals` | per-locale MRR/nDCG/no-answer report | — |
| #21 AI-19 | Knowledge / Retrieval | `lib/server/knowledge/retrieval/**, supabase/migrations/**` | `pnpm check`; `pnpm evals`; `pnpm db:verify`, `pnpm test:integration`; `pnpm test:security` | recall/rank report, leakage suite | RL-02 RL-05 |
| #22 AI-20 | Knowledge / Claims | `lib/server/knowledge/claim/**, components/chat/cards/**` | `pnpm check`; `pnpm test:contract`; `pnpm evals` | typed claim fixtures, card renders | RL-04 RL-05 |
| #23 AI-21 | Release gate R2 | `docs/acceptance/r2-*.md` | `pnpm check`; `pnpm check` plus every suite this Issue touches | eight-dimension acceptance report | RL-04 RL-05 |
| #24 AI-22 | Policy / Licence | `lib/server/policy/**, supabase/migrations/**` | `pnpm check`; `pnpm test:contract`; `pnpm test:security` | PolicyReceipt fixtures, cascade proof | RL-06 |
| #25 AI-23 | Knowledge / Migration | `lib/server/knowledge/import/**, tests/security/**` | `pnpm check`; `pnpm test:security`; `pnpm db:verify`, `pnpm test:integration` | import/review golden + RLS fixtures | RL-08 |
| #26 AI-24 | Knowledge / Import | `lib/server/knowledge/import/**, supabase/migrations/**` | `pnpm check`; `pnpm db:verify`, `pnpm test:integration`; `pnpm test:integration` | dry-run diff, idempotency/conflict log | RL-08 |
| #27 AI-25 | Ops deployment | `apps/ops/**, lib/server/knowledge/review/**` | `pnpm check`; `pnpm test:security`; `pnpm test:e2e` | separate-deploy proof, author!=reviewer test | RL-08 |
| #28 AI-26 | Jobs / Queue | `lib/server/jobs/**, supabase/functions/**` | `pnpm check`; `pnpm test:integration`; `pnpm test:security` | crash/duplicate/poison replay log | RL-02 |
| #29 AI-27 | Explore | `app/explore/**, app/[city]/[poi]/**, components/explore/**` | `pnpm check`; `pnpm test:e2e`; browser QA at 1280x800 and 390x844, `lang=ar dir=rtl` pass | five-locale/RTL/a11y/SEO evidence | RL-08 RL-09 |
| #30 AI-28 | Explore / TripWorkspace | `components/explore/**, lib/server/explore/**` | `pnpm check`; `pnpm test:e2e`; `pnpm test:contract` | exact-ID Ask/Add trace | RL-01 |
| #31 AI-29 | Release gate R3 | `docs/acceptance/r3-*.md` | `pnpm check`; `pnpm check` plus every suite this Issue touches | content provenance + eligibility report | RL-08 RL-09 |
| #32 AI-30 | Media | `lib/server/media/**, app/api/media/**` | `pnpm check`; `pnpm test:security`; `pnpm test:integration` | upload/TTL/delete receipts | RL-06 RL-07 |
| #33 AI-31 | BatchTranslation | `lib/server/media-translation/**, components/translate/**` | `pnpm check`; `pnpm evals`; `pnpm test:e2e` | five-language OCR CER/field-exact report | RL-04 |
| #34 AI-32 | RealtimeTranslation | `lib/server/media-translation/realtime/**` | `pnpm check`; `pnpm test:contract`; `pnpm test:security` | protocol conformance, credential expiry proof | RL-07 |
| #35 AI-33 | Translate UI | `components/translate/**, app/(product)/translate/**` | `pnpm check`; `pnpm test:e2e`; browser QA at 1280x800 and 390x844, `lang=ar dir=rtl` pass | device recordings, TTS==screen proof | RL-04 |
| #36 AI-34 | Release gate R4 | `docs/acceptance/r4-*.md` | `pnpm check`; `pnpm check` plus every suite this Issue touches | five-language device eval report | RL-04 RL-06 |
| #37 AI-35 | ExternalEvidenceResolver | `lib/server/external-evidence/**` | `pnpm check`; `pnpm test:contract`; `pnpm test:security` | policy receipts, freshness ladder | RL-06 |
| #38 AI-36 | External / Weather | `lib/server/external-evidence/weather/**, components/chat/cards/**` | `pnpm check`; `pnpm test:contract`; `pnpm test:e2e` | card fixtures, degraded paths | RL-04 RL-06 |
| #39 AI-37 | User artifacts | `lib/server/artifacts/**, lib/server/trip/**` | `pnpm check`; `pnpm test:security`; `pnpm test:integration` | redaction proof, import idempotency | RL-06 RL-07 |
| #40 AI-38 | External / Rail | `lib/server/external-evidence/rail/**, docs/runbooks/**` | `pnpm check`; `pnpm test:contract`; `pnpm test:security` | zero-crawler network log | RL-06 |
| #41 AI-39 | External / Aviation benchmark | `docs/benchmarks/aviation/**` | `pnpm check`; `pnpm docs:check`, `jq empty docs/handoff.json`, `git diff --check`; `pnpm evals` | provider scorecard, purge evidence | RL-06 |
| #42 AI-40 | External / Flight adapter | `lib/server/external-evidence/flight/**` | `pnpm check`; `pnpm test:contract`; `pnpm test:integration` | field allowlist proof, recheck trace | RL-06 |
| #43 AI-41 | Release gate R5 / beta | `docs/runbooks/**, docs/acceptance/r5-*.md` | `pnpm check`; `pnpm check` plus every suite this Issue touches | L1-L7 evidence ledger, runbooks | all RL-01..RL-09 |

| #46 AI-42 | Quality / Evals | `evals/**, tests/fixtures/red-lines/**, docs/agents/issue-execution-contract.md` | `pnpm check`; `pnpm evals`; `pnpm docs:check` | qrels version list, stratified report, suite registry | RL-01…RL-09 (registry owner) |
| #47 AI-43 | ModelGateway / Transport | `lib/server/model-gateway/spike/**, docs/adr/**, docs/architecture/ml-01-ai-sdk-decision.md` | `pnpm check`; `pnpm test:contract`; `pnpm docs:check` | five-condition table, bundle/latency measurements, ADR | RL-07 |
| #48 AI-44 | Domain Contracts / UX | `lib/server/contracts/errors/**, lib/i18n.ts, tests/contract/errors/**, docs/contracts/failure-taxonomy.md` | `pnpm check`; `pnpm test:contract`; `pnpm docs:check` | taxonomy table, five-locale copy snapshots, mapping tests | RL-04 |
| #49 AI-45 | Release / Platform | `package.json, lib/flags/**, scripts/check-flags.mjs, tests/unit/flags/**, docs/contracts/feature-flags.md, docs/agents/issue-execution-contract.md, artifacts/AI-45/unrun.md` | `pnpm check`; `pnpm test:unit`; `pnpm check:flags`; `pnpm docs:check`; `git diff --check` | flag registry, illegal-combination cases | — |
| #50 AI-46 | Data Platform | `scripts/db/**, supabase/**, docs/contracts/plat-conf-00.md, tests/integration/db/**` | `pnpm check`; `pnpm db:verify`; `pnpm test:integration` | three-path probe logs, frozen configuration table | RL-02 |
| #51 AI-47 | ModelGateway / Governance | `lib/server/model-gateway/prompt/**, lib/server/model-gateway/registry/**, tests/contract/model-gateway/**` | `pnpm check`; `pnpm test:contract`; `pnpm evals` | version registry snapshot, drift trigger log | RL-07 |
| #52 AI-48 | Security / Cost | `lib/server/model-gateway/budget/**, lib/server/identity/quota/**, tests/security/cost/**` | `pnpm check`; `pnpm test:security`; `pnpm test:integration` | quota-exhaustion trace, load/abuse report | RL-07 |
| #53 AI-49 | Data Platform / Operations | `scripts/db/restore/**, docs/runbooks/backup-restore.md, tests/integration/restore/**` | `pnpm check`; `pnpm db:verify`; `pnpm test:integration` | restore rehearsal record, RPO/RTO table, Storage policy | RL-06 RL-07 |
| #54 AI-50 | KnowledgeSystem / Ops | `lib/server/knowledge/report/**, apps/ops/report/**, tests/security/takedown/**` | `pnpm check`; `pnpm test:security`; `pnpm test:integration`; `pnpm test:e2e` | cascade-invalidation proof, audit record samples | RL-02 RL-08 RL-09 |

Any Issue added after this file was written must add its own row here before it moves to
`status:ready`.

| #87 V4-01 | Program / Architecture | `docs/architecture/**, docs/contracts/**, docs/agents/issue-execution-contract.md, docs/handoff.json, HANDOFF.md, CONTEXT.md, artifacts/V4-01/unrun.md` | `pnpm check`; `pnpm docs:check`; `jq empty docs/handoff.json`; `git diff --check` | `artifacts/V4-01/commands.jsonl`, `artifacts/V4-01/unrun.md`, parity registry, framework adoption matrix, execution-contract rows | — |
| #85 V4-02 | Context Engineering | `lib/server/context/**, tests/contract/context/**, evals/context/**, docs/contracts/context-plan.md, artifacts/V4-02/**, docs/handoff.json, HANDOFF.md, CONTEXT.md, docs/agents/issue-execution-contract.md, docs/superpowers/plans/2026-08-28-v4-02-context-engineering.md` | `pnpm check`; `pnpm test:contract`; `pnpm evals`; `pnpm docs:check` | `artifacts/V4-02/commands.jsonl`, `artifacts/V4-02/unrun.md`, context fixtures, ablation report, privacy-safe manifests | RL-02 RL-07 |
| #88 V4-03 | Tool Gateway | `lib/server/tools/**, tests/contract/tools/**, tests/security/tools/**, docs/contracts/tool-gateway.md, artifacts/V4-03/**, docs/handoff.json, HANDOFF.md, CONTEXT.md, docs/agents/issue-execution-contract.md, docs/superpowers/plans/2026-08-28-v4-03-tool-gateway.md` | `pnpm check`; `pnpm test:contract`; `pnpm test:security`; `pnpm docs:check` | `artifacts/V4-03/commands.jsonl`, `artifacts/V4-03/unrun.md`, tool conformance, approval/idempotency/injection traces | RL-01 RL-02 RL-06 RL-07 |
| #89 V4-04 | Constraint Engine | `lib/server/constraints/**, tests/unit/constraints/**, evals/planning/**, docs/contracts/travel-constraints.md, artifacts/V4-04/**, docs/handoff.json, HANDOFF.md, CONTEXT.md, docs/agents/issue-execution-contract.md, docs/superpowers/plans/2026-08-28-v4-04-constraint-engine.md` | `pnpm check`; `pnpm test:unit`; `pnpm test:contract`; `pnpm evals`; `pnpm docs:check` | `artifacts/V4-04/commands.jsonl`, `artifacts/V4-04/unrun.md`, constraint corpus, feasibility report, final-state scorer | RL-03 RL-04 |
| #90 V4-05 | Knowledge / Planning Research | docs/benchmarks/route-pattern/**, evals/route-pattern/** | pnpm check; pnpm evals; pnpm docs:check | artifacts/V4-05/commands.jsonl、artifacts/V4-05/unrun.md、rights matrix, paired retrieval report, adopt/reject record | RL-02 RL-05 RL-06 |
| #91 V4-06 | Identity / Product Web | lib/server/identity/**, app/(product)/**, tests/security/auth/** | pnpm check; pnpm test:security; pnpm test:e2e; pnpm docs:check | artifacts/V4-06/commands.jsonl、artifacts/V4-06/unrun.md、actor/session matrix, protected-route E2E | RL-01 RL-02 RL-07 |
| #92 V4-07 | Product Shell | app/(product)/**, components/product-shell/**, lib/i18n.ts, app/visepanda/page.tsx, components/VisePandaChatWorkspace.tsx, tests/static-output.test.mjs | pnpm check; pnpm test:e2e; pnpm docs:check | artifacts/V4-07/commands.jsonl、artifacts/V4-07/unrun.md、five-locale desktop/mobile/RTL evidence | RL-01 |
| #93 V4-08 | Chat Web / Turn | `app/(product)/chat/**, app/visepanda/ask/**, app/api/chat/**, components/chat/**, lib/server/turn/**, lib/server/identity/{user-data-adapter,request-guards}.ts, supabase/migrations/20260828153000_v4_08_durable_chat_threads.sql, tests/{contract,integration,security}/turn/**, docs/agents/issue-execution-contract.md, docs/handoff.json, HANDOFF.md, CONTEXT.md, artifacts/V4-08/**` | `pnpm check`; `pnpm test:contract`; `pnpm test:integration`; `pnpm test:e2e`; `pnpm docs:check`; `git diff --check` | `artifacts/V4-08/commands.jsonl`, `artifacts/V4-08/unrun.md`, thread transcript, reconnect/cancel proof | RL-07 |
| #94 V4-09 | Chat Feedback | `app/api/chat/**, components/chat/**, lib/server/turn/{feedback,contract}.ts, lib/server/identity/{user-data-adapter,request-guards}.ts, supabase/migrations/20260828160000_v4_09_chat_feedback.sql, tests/{contract,e2e,integration,security}/turn/**, docs/agents/issue-execution-contract.md, docs/handoff.json, HANDOFF.md, CONTEXT.md, artifacts/V4-09/**` | `pnpm check`; `pnpm test:contract`; `pnpm evals`; `pnpm test:e2e`; `pnpm docs:check`; `git diff --check` | `artifacts/V4-09/commands.jsonl`, `artifacts/V4-09/unrun.md`, result-type and feedback fixtures | RL-04 RL-05 |
| #95 V4-10 | Trip Canvas | app/visepanda/trips/**, app/api/trips/**, components/canvas/**, lib/server/identity/{user-data-adapter,request-guards}.ts, supabase/migrations/20260828170000_v4_10_trip_version_snapshots.sql, tests/contract/identity/request-guards.test.ts, tests/e2e/canvas/v4-10-trip-canvas.test.mjs, tests/integration/trip/v4-10-rollback.test.mjs, tests/security/trip/v4-10-rollback-security.test.mjs, docs/{adr,architecture,agents}/**, docs/handoff.json, HANDOFF.md, CONTEXT.md | pnpm check; pnpm test:contract; pnpm test:e2e; pnpm test:integration; pnpm test:security | artifacts/V4-10/commands.jsonl、artifacts/V4-10/unrun.md、version/reload/rollback browser evidence | RL-01 RL-03 |
| #96 V4-11 | Trip Canvas / Knowledge | app/api/trips/**, app/visepanda/{trips,ask}/**, components/{canvas,chat}/**, lib/server/{trip/place,identity}/**, supabase/migrations/**, tests/{contract,e2e,integration,security}/{trip,turn,identity}/**, tests/e2e/chat/{v4-08-ask-route,v4-09-feedback}.test.mjs, docs/{contracts,architecture,agents}/**, docs/handoff.json, HANDOFF.md, CONTEXT.md | pnpm check; pnpm test:contract; pnpm test:e2e; pnpm test:integration; pnpm test:security | artifacts/V4-11/commands.jsonl、artifacts/V4-11/unrun.md、exact-ID scope traces and recheck fixtures | RL-01 RL-09 |
| #97 V4-12 | Trip Actions | app/api/trips/**, app/visepanda/trips/**, components/canvas/**, lib/server/{trip/actions,identity}/**, supabase/migrations/**, tests/{contract,e2e,integration,security}/trip/**, docs/{contracts,architecture,agents}/**, docs/handoff.json, HANDOFF.md, CONTEXT.md | pnpm check; pnpm test:contract; pnpm test:e2e; pnpm test:integration; pnpm test:security | artifacts/V4-12/commands.jsonl、artifacts/V4-12/unrun.md、action projection and degraded fixtures | RL-04 RL-06 |
| #98 V4-13 | Memory Profile | lib/server/memory/**, supabase/migrations/**, tests/security/memory/**, docs/contracts/memory-profile.md | pnpm check; pnpm db:verify; pnpm test:contract; pnpm test:security | artifacts/V4-13/commands.jsonl、artifacts/V4-13/unrun.md、memory lifecycle and actor matrix | RL-02 RL-07 |
| #99 V4-14 | Copilot Memory Web | app/api/memory/**, app/(product)/copilot/**, components/copilot/**, lib/server/{identity,memory}/**, tests/{contract,e2e,integration,security}/memory/**, docs/{contracts,architecture,acceptance,agents}/**, docs/handoff.json, HANDOFF.md, CONTEXT.md | pnpm check; pnpm test:contract; pnpm test:security; pnpm test:integration; pnpm test:e2e | artifacts/V4-14/commands.jsonl、artifacts/V4-14/unrun.md、owner-only governance/reload, impact, five-locale/RTL evidence | RL-02 |
| #100 V4-15 | Memory Consumers | lib/server/memory/**, supabase/migrations/**, components/chat/**, components/canvas/** | pnpm check; pnpm test:contract; pnpm evals; pnpm test:e2e | artifacts/V4-15/commands.jsonl、artifacts/V4-15/unrun.md、memory receipt and pause/reject propagation traces | RL-02 RL-05 |
| #101 V4-16 | User Profile | app/api/profile/**, app/visepanda/profile/**, components/user/**, lib/server/{identity,profile}/**, supabase/migrations/**, tests/{contract,e2e,integration,security}/user/**, docs/{contracts,architecture,acceptance,agents}/**, docs/handoff.json, HANDOFF.md, CONTEXT.md | pnpm check; pnpm test:contract; pnpm test:security; pnpm test:integration; pnpm test:e2e | artifacts/V4-16/commands.jsonl、artifacts/V4-16/unrun.md、owner-only profile persistence/reload and locale/unit evidence | RL-02 RL-07 |
| #102 V4-17 | Privacy Lifecycle | lib/server/privacy/**, app/api/privacy/**, lib/server/identity/{request-guards,user-data-adapter}.ts, supabase/migrations/**, tests/{contract,security,e2e}/privacy/**, tests/contract/trip/proposal-reject.test.ts, docs/{contracts,runbooks}/privacy-lifecycle.md, docs/{architecture,acceptance}/**, docs/agents/issue-execution-contract.md, docs/handoff.json, HANDOFF.md, CONTEXT.md, artifacts/V4-17/** | pnpm check; pnpm test:contract; pnpm test:security; pnpm test:integration; pnpm test:e2e; pnpm docs:check; git diff --check | artifacts/V4-17/commands.jsonl、artifacts/V4-17/unrun.md、request/receipt/retention evidence | RL-02 RL-06 RL-07 |
| #103 V4-18 | Today Engine | lib/server/today/**, app/{(product),visepanda}/today/**, components/today/**, tests/{contract,e2e}/today/**, evals/today/**, docs/{contracts,architecture,acceptance,agents}/**, docs/handoff.json, HANDOFF.md, CONTEXT.md, artifacts/V4-18/** | pnpm check; pnpm test:contract; pnpm evals; pnpm test:e2e | artifacts/V4-18/commands.jsonl、artifacts/V4-18/unrun.md、NextAction and trip-check corpus | RL-04 RL-05 |
| #104 V4-19 | Today / External Evidence | lib/server/today/**, app/{(product),visepanda}/today/**, components/today/**, tests/{contract,e2e,integration}/today/**, docs/{contracts,architecture,acceptance,agents}/**, docs/handoff.json, HANDOFF.md, CONTEXT.md, artifacts/V4-19/** | pnpm check; pnpm test:contract; pnpm test:integration; pnpm test:e2e | artifacts/V4-19/commands.jsonl、artifacts/V4-19/unrun.md、freshness and degraded observation traces | RL-04 RL-06 |
| #105 V4-20 | Recovery / External | lib/server/today/recovery/**, components/today/**, tests/{contract,integration,e2e}/today/**, tests/contract/acceptance/v4-31-parity-audit.test.mjs, docs/{contracts,architecture,acceptance,agents}/**, docs/handoff.json, HANDOFF.md, CONTEXT.md, artifacts/V4-20/** | pnpm check; pnpm test:contract; pnpm test:integration; pnpm test:e2e | artifacts/V4-20/commands.jsonl、artifacts/V4-20/unrun.md、delay/closure proposal scenarios | RL-01 RL-04 RL-06 |
| #106 V4-21 | Recovery / Safety | lib/server/today/recovery/**, components/today/**, tests/{contract,e2e}/today/**, tests/contract/acceptance/v4-31-parity-audit.test.mjs, docs/{contracts,architecture,acceptance,agents}/**, docs/handoff.json, HANDOFF.md, CONTEXT.md, artifacts/V4-21/** | pnpm check; pnpm test:contract; pnpm evals; pnpm test:e2e | artifacts/V4-21/commands.jsonl、artifacts/V4-21/unrun.md、queue/unwell/official-channel scenarios | RL-01 RL-04 |
| #107 V4-22 | Tool Surface | app/visepanda/tools/**, components/tools/**, tests/e2e/tools/**, docs/contracts/tool-surface-unavailable.md, artifacts/V4-22/**, docs/agents/issue-execution-contract.md | pnpm check; pnpm test:contract; pnpm test:e2e | artifacts/V4-22/commands.jsonl、artifacts/V4-22/unrun.md、health/degraded/offline browser matrix | RL-04 RL-06 |
| #108 V4-23 | Safe Phrase Tools | app/visepanda/tools/safe-phrase/**, components/tools/**, tests/e2e/tools/**, docs/contracts/safe-phrase-unavailable.md, artifacts/V4-23/**, docs/agents/issue-execution-contract.md | pnpm check; pnpm test:contract; pnpm evals; pnpm test:e2e | artifacts/V4-23/commands.jsonl、artifacts/V4-23/unrun.md、TTS-equals-display and offline phrase proof | RL-04 RL-06 |
| #109 V4-24 | Ride Assist | app/visepanda/tools/ride/**, components/tools/**, tests/e2e/tools/**, docs/contracts/ride-assist-unavailable.md, artifacts/V4-24/**, docs/agents/issue-execution-contract.md | pnpm check; pnpm test:contract; pnpm test:security; pnpm test:e2e | artifacts/V4-24/commands.jsonl、artifacts/V4-24/unrun.md、location/privacy/provider-handoff fixtures | RL-04 RL-06 RL-07 |
| #110 V4-25 | Visa Tool | app/visepanda/tools/visa/**, components/tools/**, tests/e2e/tools/**, docs/contracts/visa-unavailable.md, artifacts/V4-25/**, docs/agents/issue-execution-contract.md | pnpm check; pnpm test:contract; pnpm evals; pnpm test:e2e | artifacts/V4-25/commands.jsonl、artifacts/V4-25/unrun.md、scope/expiry/official-channel cases | RL-04 RL-05 RL-06 |
| #111 V4-26 | Network Tool | app/visepanda/tools/network/**, components/tools/**, tests/e2e/tools/**, docs/contracts/network-unavailable.md, artifacts/V4-26/**, docs/agents/issue-execution-contract.md | pnpm check; pnpm test:contract; pnpm test:e2e | artifacts/V4-26/commands.jsonl、artifacts/V4-26/unrun.md、reviewed guide and unavailable fixtures | RL-04 RL-06 |
| #112 V4-27 | Human Handoff Pack | app/visepanda/tools/handoff/**, components/tools/**, tests/e2e/tools/**, docs/contracts/human-handoff-unavailable.md, artifacts/V4-27/**, docs/agents/issue-execution-contract.md | pnpm check; pnpm test:contract; pnpm test:e2e | artifacts/V4-27/commands.jsonl、artifacts/V4-27/unrun.md、handoff-pack and emergency-boundary evidence | RL-04 RL-07 |
| #113 V4-28 | Guide Artifact Import | app/visepanda/import/**, components/import/**, tests/e2e/import/**, docs/contracts/guide-import-unavailable.md, artifacts/V4-28/**, docs/agents/issue-execution-contract.md | pnpm check; pnpm test:security; pnpm test:integration; pnpm test:e2e | artifacts/V4-28/commands.jsonl、artifacts/V4-28/unrun.md、extraction/correction/injection/TTL traces | RL-06 RL-07 |
| #114 V4-29 | Guide Conflict / Trip | app/visepanda/import/conflicts/**, components/import/**, tests/e2e/import/**, docs/contracts/guide-conflict-unavailable.md, artifacts/V4-29/**, docs/agents/issue-execution-contract.md | pnpm check; pnpm test:contract; pnpm test:integration; pnpm test:e2e | artifacts/V4-29/commands.jsonl、artifacts/V4-29/unrun.md、conflict-to-proposal and version traces | RL-01 RL-04 RL-05 |
| #115 V4-30 | Offline Product | app/visepanda/offline/**, components/offline/**, tests/e2e/offline/**, docs/contracts/offline-unavailable.md, artifacts/V4-30/**, docs/agents/issue-execution-contract.md | pnpm check; pnpm test:security; pnpm test:e2e | artifacts/V4-30/commands.jsonl、artifacts/V4-30/unrun.md、offline/device/cache isolation evidence | RL-02 RL-07 |
| #116 V4-31 | Release Gate / Product Parity | docs/acceptance/**, docs/runbooks/**, tests/contract/acceptance/**, artifacts/V4-31/**, docs/{handoff.json,agents/issue-execution-contract.md}, HANDOFF.md, CONTEXT.md | pnpm check; pnpm docs:check; pnpm test:contract; pnpm test:integration; pnpm test:security; pnpm test:e2e; pnpm evals | artifacts/V4-31/commands.jsonl、artifacts/V4-31/unrun.md、eight-dimension L1-L7 parity report | RL-01 RL-02 RL-03 RL-04 RL-05 RL-06 RL-07 RL-08 RL-09 |
| #132 GOV-AFK-01 | Governance / Continuous execution | `AGENTS.md, CONTEXT.md, HANDOFF.md, docs/handoff.json, docs/operator-actions.json, docs/agents/**, scripts/docs-check.mjs, artifacts/GOV-AFK-01/**` | `pnpm docs:check`; `pnpm check`; `jq empty docs/handoff.json docs/operator-actions.json`; local Markdown-link check; `git diff --check` | `artifacts/GOV-AFK-01/commands.jsonl`, `artifacts/GOV-AFK-01/unrun.md`, policy, kickoff prompt, queue schema | — |
| #136 WEB-02 | Frontend program / public contract | `docs/frontend-redesign-issue-plan.md, docs/handoff.json, HANDOFF.md, CONTEXT.md, artifacts/WEB-02/**` | `pnpm docs:check`; `pnpm check`; local Markdown-link check; `git diff --check` | `artifacts/WEB-02/commands.jsonl`, `artifacts/WEB-02/unrun.md`, dependency/frontier audit | — |
| #137 WEB-03 | Frontend governance | `docs/adr/ADR-0018-independent-frontend-redesign-baseline.md, docs/frontend-redesign-issue-plan.md, docs/agents/issue-execution-contract.md, docs/handoff.json, HANDOFF.md, CONTEXT.md, artifacts/WEB-03/**` | `pnpm docs:check`; `pnpm check`; `jq empty docs/handoff.json`; local Markdown-link check; `git diff --check` | `artifacts/WEB-03/commands.jsonl`, `artifacts/WEB-03/unrun.md`, tracker DAG audit | — |
| #138 WEB-04 | Frontend assets / rights | `package.json, public/assets/**, app/layout.tsx, app/globals.css, components/VisePandaLanding.tsx, brand/qa/**, docs/licenses/**, scripts/check-assets.mjs, tests/**/assets/**, docs/handoff.json, HANDOFF.md, CONTEXT.md, artifacts/WEB-04/**` | `pnpm check`; `pnpm test`; `pnpm check:assets`; `pnpm docs:check`; `git diff --check` | `artifacts/WEB-04/commands.jsonl`, `artifacts/WEB-04/unrun.md`, rights ledger, SBOM/NOTICE, denylist result | — |
| #139 WEB-05 | Frontend design direction | `docs/design/frontend-redesign/**, docs/handoff.json, HANDOFF.md, CONTEXT.md, artifacts/WEB-05/**` | `pnpm docs:check`; local Markdown-link check; `git diff --check` | `artifacts/WEB-05/commands.jsonl`, `artifacts/WEB-05/unrun.md`, three directions, selection/dissent record | — |
| #140 WEB-06 | Shared frontend foundation | `components/brand/**, components/ui/**, components/shell/**, components/motion/**, components/homepage/**, components/auth/**, lib/design/**, lib/i18n.ts, app/globals.css, app/design-tokens.generated.css, scripts/generate-design-tokens.mjs, package.json, tests/**/design/**, tests/static-output.test.mjs, docs/handoff.json, HANDOFF.md, CONTEXT.md, artifacts/WEB-06/**` | `pnpm lint`; `pnpm typecheck`; `pnpm build`; `pnpm test`; `pnpm test:e2e`; `pnpm docs:check`; `git diff --check` | `artifacts/WEB-06/commands.jsonl`, `artifacts/WEB-06/unrun.md`, token/font/five-locale/a11y evidence | — |
| #141 WEB-07 | Homepage | `app/page.tsx, components/homepage/**, lib/i18n.ts, tests/e2e/homepage/**, docs/homepage-redesign.md, docs/handoff.json, HANDOFF.md, CONTEXT.md, artifacts/WEB-07/**` | `pnpm check`; `pnpm test:e2e`; `pnpm docs:check`; claim/asset scan; desktop/390x844/RTL browser QA; `git diff --check` | `artifacts/WEB-07/commands.jsonl`, `artifacts/WEB-07/unrun.md`, five-locale screenshots, claim/asset results | — |
| #142 WEB-08 | Auth / first-run web | `app/(auth)/**, components/auth/**, components/first-run/**, lib/i18n.ts, tests/e2e/identity/**, docs/handoff.json, HANDOFF.md, CONTEXT.md, artifacts/WEB-08/**` | `pnpm check`; `pnpm test:security`; `pnpm test:e2e`; `pnpm docs:check`; desktop/mobile/RTL/keyboard QA; `git diff --check` | `artifacts/WEB-08/commands.jsonl`, `artifacts/WEB-08/unrun.md`, auth-state and mobile evidence | RL-02 RL-07 |
| #143 WEB-09 | Frontend navigation / identity | `lib/navigation/**, tests/e2e/navigation/**, docs/handoff.json, HANDOFF.md, CONTEXT.md, artifacts/WEB-09/**` | `pnpm check`; `pnpm test:security`; `pnpm test:e2e`; `pnpm docs:check`; `git diff --check` | `artifacts/WEB-09/commands.jsonl`, `artifacts/WEB-09/unrun.md`, entry-contract/deep-link/returnTo/locale traces; #141/#142/#92 own consumer integration | RL-01 RL-02 RL-07 |
| #144 WEB-10 | Frontend acceptance | `tests/e2e/frontend/**, playwright.config.mjs, package.json, pnpm-lock.yaml, components/auth/PasswordSignInForm.module.css, scripts/record-command.mjs, docs/acceptance/frontend-*.md, artifacts/WEB-10/**, docs/handoff.json, HANDOFF.md, CONTEXT.md` | `pnpm check`; `pnpm test:e2e`; `pnpm test:e2e:frontend`; `pnpm docs:check`; asset/claim scan; local Markdown-link check; `git diff --check` | `artifacts/WEB-10/commands.jsonl`, `artifacts/WEB-10/unrun.md`, viewport/locale/a11y/motion/state matrix; #132 transfers ongoing `record-command` portability maintenance here | RL-01 RL-02 RL-04 RL-07 |
| #145 WEB-11 | Frontend release gate | `docs/acceptance/frontend-release-*.md, docs/runbooks/frontend-cutover.md, docs/licenses/**, artifacts/WEB-11/**, docs/handoff.json, HANDOFF.md, CONTEXT.md` | `pnpm check`; `pnpm test:e2e`; `pnpm check:assets:release`; `pnpm docs:check`; asset/claim/SBOM/NOTICE checks; Preview/rollback smoke; `git diff --check` | `artifacts/WEB-11/commands.jsonl`, `artifacts/WEB-11/unrun.md`, release decision, store claim matrix, cutover/rollback record | RL-01…RL-09 |

## 6. Rules

- One Issue, one branch, one reviewable PR, base `main`. No stacked PRs on unmerged work.
- An Issue may not modify a path owned by another Issue's row. If it must, stop and raise the
  conflict on the Program Issue rather than widening scope.
- A release-gate Issue (`AI-15`, `AI-21`, `AI-29`, `AI-34`, `AI-41`) produces evidence only.
  It never contains implementation.
- Operator-owned Issues (`AI-01`, `AI-04`, `AI-05`, `AI-39`) may be prepared by an agent as an
  option matrix with evidence and rollback, but the decision line stays empty until the operator
  fills it. An agent must not write the decision.
- Merging proves engineering acceptance only. Product effect is reviewed in the Issue's stated
  observation window.

## 7. Direct queue and continuous scheduler

Defined Issues are directly schedulable. Do not defer implementation solely because another Issue is
open. `status:blocked` reports an unavailable runtime, provider, legal, or operator state; it does
not prohibit development, testing, automated review, or merge of independently scoped work.
Dependency references are planning context only. Runtime authorization, data-policy, and safety
guards remain fail-closed.

The one-Issue/branch/PR rule scopes a work unit; it does not require the whole session to pause after
that work unit. A session launched in Continuous AFK mode follows
`docs/agents/continuous-afk-execution.md` and, after each PR, merge or safe handoff, recomputes the
live frontier and continues without routine operator confirmation.

The scheduler may not start an Issue with a missing row, path collision,
unaccepted contract or operator-owned decision. Operator-owned work is recorded in
`docs/operator-actions.json` and skipped while another independent frontier exists. The scheduler
does not weaken the rules above, any RL suite, required check, review, RLS, migration or production
gate.
