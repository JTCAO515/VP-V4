# Handoff

## Frontend redesign governance — 2026-08-27

- Operator decision: accepted in [ADR-0018](docs/adr/ADR-0018-independent-frontend-redesign-baseline.md).
- Program: [WEB-02 #136](https://github.com/JTCAO515/VP-V4/issues/136); tracker mapping in `docs/frontend-redesign-issue-plan.md`.
- Current frontend maturity: Homepage and `/visepanda` are `stop-ship`; implementation has not started.
- Completed governance work: [WEB-03 #137](https://github.com/JTCAO515/VP-V4/issues/137) published the ADR, Issue DAG, execution rows and handoff to `main@0b6c27f`.
- WEB-04 #138 quarantines 48 legacy source assets and four duplicate shapes, removes Fig Grotesk from runtime, and adds a hash-verified rights ledger, SBOM, NOTICE and denylist check. Nine current preview photographs remain `blocked-release` until a separate operator rights record exists.
- Next frontend work: #139 visual-direction selection remains operator-owned; the direct Issue queue may proceed with another independently scoped Issue without waiting for that selection.
- Shared authorities: #87 Demo parity, #92 Product Shell, ADR-0003 Trip writes, ADR-0017 password-authenticated closed beta.
- Map: disabled until a separate compliance gate closes. Homepage primary CTA: `Open VisePanda`.
- WIP conflict resolved: PR #124 was closed as superseded; approved derivatives may re-enter only through #138/#140.
- Rollback: no compliant stop-ship clone may be republished; use truthful unavailable/Early Access if no cleared release exists.

VP-V4 now contains bounded R1 contracts, durable Trip persistence/RLS paths, a fake-model TurnCoordinator and authenticated Trip route code. The product surface remains a preview: real model, RAG, Explore, external data, multimodal providers and fully accepted production Magic Link/session evidence are not available.

GitHub delivery program is now live: [AI-00 Program #2](https://github.com/JTCAO515/VP-V4/issues/2) contains 41 native sub-issues (#3–#43), and every implementation ticket has a full engineering body, textual blockers, native dependency edges, phase/priority/status labels, acceptance, rollback, documentation impact, and observation.

The completed artifacts are the proposed system baselines for rebuilding the product core:

- [ai-core-integrated-research-report.md](docs/ai-core-integrated-research-report.md) v1.1 consolidates five research rounds and the product audit into one Decision Register, canonical evidence/proposal/claim model, six execution moments, model/region candidates, degraded modes, external-data rights, Knowledge/RAG/Explore linkage, and product hypotheses.
- [ai-core-engineering-development-acceptance-report.md](docs/ai-core-engineering-development-acceptance-report.md) v1.1 defines deep modules/interfaces, durable validated Turns, atomic Proposal confirm/apply, actor/RLS paths, data consistency/retention/restore, queue semantics, deployment topology, CI/evals, 24–35 week critical path, risk, and release acceptance.
- [ai-core-system-evidence-2026-08-23.md](docs/research/ai-core-system-evidence-2026-08-23.md) records the fourth-round repository and official-source verification, especially the DeepSeek Vision Exp correction and current platform engineering evidence.
- [ai-core-deep-optimization-evidence-2026-08-23.md](docs/research/ai-core-deep-optimization-evidence-2026-08-23.md) records 117 first-party/source links for the fifth-round DeepSeek/Qwen/provider lifecycle, multimodal regions/protocols, Vercel/Supabase/RAG/queue and licensing corrections.
- [ai-core-v1.1-independent-audit-2026-08-23.md](docs/research/ai-core-v1.1-independent-audit-2026-08-23.md) persists both independent audit finding sets and the file/section-level P0 disposition instead of treating model agreement as evidence.
- [model-layer-plan.md](docs/model-layer-plan.md) contains the final architecture decision proposal, DeepSeek/Qwen task routing, Chatbot-to-Canvas confirmation contract, multimodal plan, eval gates, work packages, rollout, observability, privacy, and rollback.
- [model-provider-evidence-2026-08-22.md](docs/research/model-provider-evidence-2026-08-22.md) preserves the official-source capability, pricing, region, privacy, OCR, ASR, TTS, and model-id evidence used by the final plan.
- [external-data-chatbot-plan.md](docs/external-data-chatbot-plan.md) defines external evidence classes, the Data License Registry, Chatbot tool and deterministic-card paths, Canvas persistence/freshness, weather, aviation, rail, maps/POI, crawl policy, and the development sequence.
- [external-data-evidence-2026-08-23.md](docs/research/external-data-evidence-2026-08-23.md) records current provider APIs, licences, caching/attribution limits, 12306 crawler restrictions, and the aviation/OSM evidence behind that plan.
- [knowledge-rag-explore-plan.md](docs/knowledge-rag-explore-plan.md) defines external-source POI candidate import, the shared Canonical POI/Fact knowledge model, typed content facets, hybrid RAG, city-first Explore, and exact-ID Chatbot/Canvas linkage.
- [knowledge-rag-explore-evidence-2026-08-23.md](docs/research/knowledge-rag-explore-evidence-2026-08-23.md) records repository evidence and current first-party RAG, import, source-licence, accessibility, and SEO evidence behind that plan.
- [Draft Knowledge Base](docs/knowledge-base/README.md) converts Claude's proposal into 30 typed record candidates, 18 non-executable readiness hypotheses and six source-backed but ineligible researched drafts.
- [Claude plan disposition](docs/knowledge-base/claude-plan-disposition.md) records adopt/revise/reject decisions; [independent audit](docs/research/knowledgebase-claude-audit-2026-08-24.md) provides 75 first-party/repository links and migration/acceptance evidence.
- [issue-tracker.md](docs/agents/issue-tracker.md), [triage-labels.md](docs/agents/triage-labels.md), and [domain.md](docs/agents/domain.md) configure GitHub, the screenshot-style label/state vocabulary, and single-context domain reading rules for future engineering skills.

Key proposal:

- treat `deepseek-v4-flash` Flash-0731 as a public-beta text baseline candidate with thinking explicitly disabled, not an accepted stable primary;
- treat DeepSeek Pro-0813 as GA and `deepseek-v4-flash-vision-exp` as a separate experimental vision challenger;
- treat `deepseek-v4-flash-vision-exp` as a separate experimental vision route for shadow/bake-off/canary; the base Flash model remains text-only;
- use region-aware Qwen strict/specialist candidates; compare ASR->MT->TTS with Qwen3.5 LiveTranslate; Beijing/Singapore changes OCR/TTS availability;
- keep Qwen3.8 Max, Kimi K3, and GLM-5.3 as offline/async challengers initially;
- never allow a model to mutate Trip directly;
- require immutable TripProposal revisions and one atomic `confirmAndApplyProposal` transaction; background completion never mutates a pending revision.
- unify Fact/Observation/UserArtifact as typed EvidenceReceipts; critical execution values use typed GroundedClaims and deterministic cards, not string supporting-value checks.
- integrate no ticket purchasing or inventory; benchmark one licensed aviation schedule/status provider for by-flight use.
- never build a periodic 12306 crawler under the current Terms; import user-owned tickets and hand off current rail checks to official channels.
- require a versioned Data License Registry before any provider content can be displayed, cached, sent to an LLM/TTS, or persisted.
- import externally sourced POIs only as private `ImportedPoiCandidate` records; never generate missing POIs/fields, auto-merge identities, auto-review Facts, or directly publish import rows.
- use one Canonical POI/Fact write model and the same eligibility/IDs for Chatbot RAG, Explore, Trip Canvas, and SEO; projections are rebuildable and cannot become a second truth source.
- model language, translation, payment network/channel, passport context, accessibility, and booking as atomic typed Facts with source, review, and expiry.
- start RAG in Postgres with exact identity/alias resolution, `pg_trgm`/FTS, exact multilingual vectors, RRF, and eval-gated Qwen reranking; do not add a separate vector database initially.
- make Explore city-first, use deterministic evidence-backed filters/ranking, and let `Ask VisePanda`/`Add to Trip` carry the exact Canonical POI ID into Proposal and Canvas confirmation flows.
- implement a public Next.js modular monolith with six deep product modules and three platform seams; R1/R2 has no Ops UI, and real curation later receives a separate protected deploy.
- default closed beta to authenticated-only pending operator acceptance; user/Ops JWT requests use RLS, while system credentials remain worker-only with explicit owner/eligibility/policy filters.
- R1 uses fake model + one reviewed Fact fixture + durable Turn/Trip only; no real model, vector, queue, external data or Ops UI.
- accept the first runtime milestone only when a reviewed fixture reaches grounded Chat, Proposal, visible Canvas diff, explicit confirmation, persisted deterministic Patch, reload, and privacy-safe trace.
- migrate selected VP-Final behavior only in the order #4 -> #11 -> #13 -> #16 -> #25, with golden tests before implementation and explicit reuse/port/rewrite/retire decisions; do not copy legacy directories or runtime defaults.
- do not accept Claude's 810/122/five-week/zero-unavailable claims without the missing source catalogue and a real pilot; treat them as capacity hypotheses.
- distinguish Fact, Directory Entry, Procedure, Safe Phrase, Observation, assessment and Readiness Rule; target scope and applicability conditions are separate.
- keep all six researched drafts without reviewer/licence policy and therefore `retrievalEligible:false`; keep all 18 Readiness Rules `executable:false`.
- never let class/grade obligations, payment fee arithmetic, eSIM preparation, rail timing or city defaults silently produce POI readiness or guaranteed execution.

Verification completed:

- fetched and matched current `origin/main` for VP-V4 and VP-Final;
- inspected the current VP-V4 product boundary and VP-Final ADRs, domain contracts, model router, Copilot service, safety layer, two-pass completion, and workspace UI;
- checked the Claude draft against current first-party provider documentation;
- recorded official-source evidence without calling a paid model or reading a secret;
- inspected VP-Final Knowledge, Content AI, bulk import, Explore, and SEO paths plus the current Guangzhou content template/audit boundaries;
- checked current Postgres, pgvector, Supabase hybrid/RLS, Qwen embedding/rerank, OSM/Google/Amap licence, WCAG, and Google SEO primary sources;
- ran two bounded, read-only Overpass research samples; Shanghai restaurant `opening_hours` coverage was 35/293 and Chengdu 4/88 in the stated sample boxes, which is not a nationwide estimate;
- final third-step `git diff --check`, handoff JSON parsing, and local Markdown-link validation passed.
- `pnpm check` passed after the third-step update: source-policy lint, strict TypeScript, Next.js production build, and 11/11 tests.
- fourth-round final `git diff --check`, handoff JSON parsing, and local Markdown-link validation passed.
- fourth-round `pnpm check` passed: source-policy lint, strict TypeScript, Next.js production build, and 11/11 tests.
- fifth-round official evidence file and two independent read-only report audits completed; all audit P0s were resolved and persisted in the audit disposition record.
- final `git diff --check`, handoff JSON, 21-file local links, Markdown structure/fences, 240-character paragraph limit, stale-contract scan, and post-Issue-setup `pnpm check` passed; build and 11/11 tests are green.
- GitHub audit passed: 42 AI Issues, 41 Program sub-issues, 39 initially blocked children, exactly three ready Issues (Program #2, human #3, agent #4), five migration-labelled Issues with migration quality gates, no missing body sections, and no undefined blocker references.
- Native GitHub relationship audit passed: Program reports 41 sub-issues; sampled #5 reports two blockers; final #43 reports six blockers. Textual `Blocked by #N` remains the portable fallback.
- Full frontier audit passed with `blocked_mismatches=0` and `ready_mismatches=0`.
- Draft Knowledge Base validation passed: 30 unique record types, 18 unique readiness rules, six source-backed drafts, zero executable rules, zero reviewed/eligible records and zero unresolved rule references.
- Claude audit passed Markdown/links/structure checks and confirmed the referenced `fact-catalogue.json` is absent; no paid model, POI import or production database was used.

Historical note: #3 AI-01, #4 AI-02 and #13 AI-11 are closed. Their accepted contracts do not make any researched draft reviewed, retrieval-eligible or production-importable.

Rollback: remove the local `docs/knowledge-base/` package and audit link if the research disposition is rejected. No database, public content or runtime state needs rollback. Preserve Issue history through `status:superseded` rather than deletion.

## VP-V4 production parity and bounded-agent tracker package

- Product parity baseline: `docs/vp-v4-production-feature-parity-report.md`.
- AI and Trip Canvas product logic: `docs/vp-v4-ai-trip-canvas-product-logic-upgrade-report.md`.
- Agent/RAG/Memory/Tool/Context architecture: `docs/vp-v4-agent-rag-memory-tools-context-engineering-report.md`; source ledger: `docs/research/agent-context-rag-memory-tool-evidence-2026-08-25.md`.
- Published tracker graph: `docs/vp-v4-production-parity-issue-plan.md`, V4-01 through V4-31, mapped to #85/#87-#116 and registered in `docs/agents/issue-execution-contract.md`.
- V4-01 adds `docs/architecture/v4-01-demo-parity-registry.md` and `v4-01-framework-adoption-matrix.md`: 40 grouped Demo actions, 14 framework candidates, explicit fixture disposition and 31/31 execution-row audit. It activates no runtime.
- #87 V4-01 is closed. The operator then retired Magic Link after masked email-rate-limit and `otp_expired` evidence; #120/PR #121 is closed without merge.
- #122 AI-51b and #84 AI-51 are closed after the password-session and route evidence merged. #127 AI-13b and #130 AI-13c are also closed after durable revision/reject work. At the 2026-08-27 live audit, #15 AI-13 is the ready R1 product frontier; future sessions must re-query rather than rely on this snapshot.
- AI-43 requires a current AI SDK Core/ToolLoop/Workflow comparison before execution; LangChain/LangGraph/GraphRAG/multi-agent are not default production dependencies.

## VisePanda visual identity delivery

- The owner-approved source artwork is in `assets/brand/vise-panda/`; preserve it unchanged.
- The ready-to-use visual package is in `brand/`: handbook, tokens, eight transparent IP poses, SVG icons/patterns/UI reference, and five social-media exports.
- Begin brand work with `brand/guidelines/visepanda-vi-guide.html`; use `brand/qa/asset-manifest.json` and `brand/qa/verification.md` to validate file inventory and delivery claims.
- Static asset, JSON, structural, source-integrity, and whitespace checks passed. A fresh isolated 375 px browser screenshot remains a manual review item; no live social-platform publishing test was run.
- `pnpm check` stopped before lint/type/build/test because the local dependency-security policy requires an operator decision for the ignored `sharp` build script. No approval, package-policy change, or bypass was applied.
- Roll back a rejected VI delivery with a new revert commit for this merge; do not rewrite shared history or alter the owner-approved source artwork.

## Direct Issue queue and anonymous preview

Magic Link and callback entrypoints are removed. The public preview is anonymous, while Trip APIs
remain session-claim protected and fail closed without a valid claim. Every defined Issue is directly
schedulable; dependency references inform integration but do not block development, testing,
automated review, or merge. GitHub Issue label/status synchronization is skipped until the local
`gh` CLI has authenticated access.

Verification for this change: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`,
`pnpm test:unit`, `pnpm test:contract`, `pnpm test:e2e`, `pnpm docs:check`, and `git diff --check`
passed. Integration and local-RLS security fixtures were skipped because local Supabase was not
running; no bypass was applied.

`gh auth status --hostname github.com` reported no logged-in GitHub host, so no remote Issue label
or status mutation was attempted.

## V4-02 Context Engineering

- #85 adds a pure server-side `ContextPlan` and `ContextAssembler` contract. It fixes source order and budgets, requires system/policy/constraints/current user message, and fails closed if an eligibility filter removes a required source.
- Candidates are actor-scoped and must be `eligible`; only global system/policy candidates may have a null owner. Cross-user, unscoped, draft, expired, prohibited, raw user-artifact and raw Tool payload candidates never enter rendered context or the manifest. High-risk plans do not allow Tool context.
- The manifest deliberately includes only selected source refs/versions, category-only omission reasons, counts and SHA-256 fingerprints. It contains no rejected IDs, actor ID, owner ID, raw source text, credential or provider payload. A model-safe Tool projection uses an allowlisted ref and entity-escaped untrusted-data boundary.
- `tests/contract/context/` passed 13/13 after the expected missing-module red state; reviewer regressions also proved and then fixed unscoped owner inclusion, Tool ref/text boundary injection, rejected-ID disclosure, caller-count budget bypass, escaped-Tool and inter-candidate-separator budget undercount, and partial hard-constraint loss. `pnpm evals` passed 2/2 with synthetic full-history/compaction and zero-leak cases. See [context-plan.md](docs/contracts/context-plan.md) and `artifacts/V4-02/`.
- Rollback: revert the #85 merge. No schema, database, provider, cache or production data is affected. The remaining runtime integration, model-quality, retrieval-latency and production observation evidence belong to later owning Issues.

## Continuous AFK execution

- [continuous-afk-execution.md](docs/agents/continuous-afk-execution.md) makes completion of one Issue a scheduler event instead of a session stop. It retains one Issue/worktree/branch/PR and all required checks; user-authorized direct scheduling supersedes dependency closure as a start condition.
- [continuous-afk-kickoff.md](docs/agents/prompts/continuous-afk-kickoff.md) is the copyable startup prompt. It requires a live audit and continuous frontier recomputation after every PR, CI result, merge or blocker change.
- [operator-actions.json](docs/operator-actions.json) is the machine-readable queue for genuinely non-delegable actions. The session records and skips an operator-only path while independent safe work remains.
- Class A reversible repo-only work may enable GitHub auto-merge only after all required gates pass and without bypass. Class B auth/RLS/migration/data-policy work can be implemented and evidenced but cannot self-approve or execute production changes. Class C legal, account, payment, production and irreversible actions remain operator-owned.
- Rollback is a normal revert of the governance PR; no runtime, RLS, schema or production data changes are part of GOV-AFK-01.
