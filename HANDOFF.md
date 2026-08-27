# Handoff

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
- #122 AI-51b adds operator-provisioned email/password login, sign-out and five-locale/RTL UI. Preview password session, authenticated Trip `403`, post-sign-out `401`, anonymous `401`, retired-route `404` and the controlled owner/other-user matrix are evidenced. It has no public signup or recovery and does not reuse Supabase Dashboard credentials. Merge #123, then re-evaluate #84 and #15 from main.
- AI-43 requires a current AI SDK Core/ToolLoop/Workflow comparison before execution; LangChain/LangGraph/GraphRAG/multi-agent are not default production dependencies.

## VisePanda visual identity delivery

- The owner-approved source artwork is in `assets/brand/vise-panda/`; preserve it unchanged.
- The ready-to-use visual package is in `brand/`: handbook, tokens, eight transparent IP poses, SVG icons/patterns/UI reference, and five social-media exports.
- Begin brand work with `brand/guidelines/visepanda-vi-guide.html`; use `brand/qa/asset-manifest.json` and `brand/qa/verification.md` to validate file inventory and delivery claims.
- Static asset, JSON, structural, source-integrity, and whitespace checks passed. A fresh isolated 375 px browser screenshot remains a manual review item; no live social-platform publishing test was run.
- `pnpm check` stopped before lint/type/build/test because the local dependency-security policy requires an operator decision for the ignored `sharp` build script. No approval, package-policy change, or bypass was applied.
- Roll back a rejected VI delivery with a new revert commit for this merge; do not rewrite shared history or alter the owner-approved source artwork.
