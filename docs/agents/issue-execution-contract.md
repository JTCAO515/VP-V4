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
| #49 AI-45 | Release / Platform | `lib/flags/**, scripts/check-flags.mjs, tests/unit/flags/**, docs/contracts/feature-flags.md` | `pnpm check`; `pnpm test:unit`; `pnpm docs:check` | flag registry, illegal-combination cases | — |
| #50 AI-46 | Data Platform | `scripts/db/**, supabase/**, docs/contracts/plat-conf-00.md, tests/integration/db/**` | `pnpm check`; `pnpm db:verify`; `pnpm test:integration` | three-path probe logs, frozen configuration table | RL-02 |
| #51 AI-47 | ModelGateway / Governance | `lib/server/model-gateway/prompt/**, lib/server/model-gateway/registry/**, tests/contract/model-gateway/**` | `pnpm check`; `pnpm test:contract`; `pnpm evals` | version registry snapshot, drift trigger log | RL-07 |
| #52 AI-48 | Security / Cost | `lib/server/model-gateway/budget/**, lib/server/identity/quota/**, tests/security/cost/**` | `pnpm check`; `pnpm test:security`; `pnpm test:integration` | quota-exhaustion trace, load/abuse report | RL-07 |
| #53 AI-49 | Data Platform / Operations | `scripts/db/restore/**, docs/runbooks/backup-restore.md, tests/integration/restore/**` | `pnpm check`; `pnpm db:verify`; `pnpm test:integration` | restore rehearsal record, RPO/RTO table, Storage policy | RL-06 RL-07 |
| #54 AI-50 | KnowledgeSystem / Ops | `lib/server/knowledge/report/**, apps/ops/report/**, tests/security/takedown/**` | `pnpm check`; `pnpm test:security`; `pnpm test:integration`; `pnpm test:e2e` | cascade-invalidation proof, audit record samples | RL-02 RL-08 RL-09 |

Any Issue added after this file was written must add its own row here before it moves to
`status:ready`.

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
