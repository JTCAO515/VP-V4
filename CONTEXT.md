# Context

## Accepted frontend redesign baseline (2026-08-27)

[ADR-0018](docs/adr/ADR-0018-independent-frontend-redesign-baseline.md) and [WEB-02 #136](https://github.com/JTCAO515/VP-V4/issues/136) govern the complete frontend redesign. The current Homepage and `/visepanda` are stop-ship. Preserve functional/information relationships but independently redraw physical expression from VisePanda VI + Golden Route + Guide. Map is off by default; `Open VisePanda` is the Homepage primary CTA. Retire runtime source assets, Fig Grotesk and duplicate shapes through #138. Reuse #87 as Demo parity truth and #92 as the only Product Shell; #93-#116 retain capability ownership. Read `docs/frontend-redesign-issue-plan.md` before frontend work.

The redesign covers Homepage, invitation-only password Login, first-run/empty/global states, Today/Ask/Copilot/Tools/Explore/User, mobile, Profile/Privacy and store release. WEB-05/#139 records the direct choice of the Golden Route Guide direction; Homepage WEB-07/#141 and Login/first-run WEB-08/#142 are merged, and WEB-06/#140 establishes their shared tokens, locales, focus and motion behavior. It does not enable public signup, Magic Link, recovery, social login, AI, booking, payment, live data, Human Help or a China map. Open PR #124 conflicts with this baseline if merged as-is against the stop-ship surfaces.

WEB-10/#144 adds a reproducible Chromium acceptance suite for Homepage, password Login, and Product Shell across 320/390/430/768/1280/1440 widths, plus keyboard focus, Arabic RTL, and sign-in announcement coverage. It found and fixed the Login's 768px horizontal overflow by switching to the mobile layout below 800px. Assistive technology, physical-device keyboard/safe-area/200% zoom, and Preview rollback checks remain explicitly unrun rather than passed.

V4-08/#93 adds the frontend Ask route's durable, authenticated chat-thread boundary: a user can create, reopen and replay only their own thread metadata and ordered state events, then cancel an active state Turn idempotently. The user-facing control is deliberately bounded to a fixed `chat-state-control-v1` digest: it sends no Prompt, invokes no model, writes no Trip and cannot persist arbitrary request text. The migration enforces owner RLS and terminal append rules; its live local Supabase integration probe is explicitly unrun because that runtime is not started.

V4-09/#94 adds closed result-type vocabulary and durable feedback without overstating an unavailable model runtime. Only a persisted qualifying terminal result may receive a fixed another-option/inaccurate/reject-reason/correction code pair; the database locks its Turn to make concurrent retries idempotent. Free-text feedback, model output storage and all Fact/Trip writes remain excluded.

V4-10/#95 redraws `/visepanda/trips/[tripId]` as the owner-scoped canonical Trip Canvas. It reads the current head and append-only `trip_events` from one source, keeps the map disabled, and shows only recorded Proposal origins rather than treating them as chat threads. New Trips and every confirmed Proposal capture an immutable title snapshot. A prior available snapshot can only be restored by creating a fresh pending Proposal followed by an explicit confirm step, yielding the next version without rewriting history. [ADR-0019](docs/adr/ADR-0019-trip-snapshot-rollback-authorization.md) documents the only user-JWT `security definer` exception: fixed owner-checked snapshot/rollback RPCs with no service credential, while direct Trip update is revoked. Historic titles absent before this migration remain unavailable rather than invented. Local Supabase migration/RLS and browser runtime evidence remain unrun because that runtime is not started.

AI-13/#15 completes the Canvas Proposal loop without expanding server authority: the client reads the existing private no-store pending Proposal projection after the owner-scoped Trip; a 409 means no pending Proposal, while other Proposal-read failures remain unavailable. It renders title before/after and the only stored provenance state, `not_recorded`; confirm, reject, and revision go only to the existing protected endpoints and then re-read canonical Trip/Proposal state. The Canvas makes no direct Trip write, has no fixture fallback, keeps the map off, and applies the five supported locales including Arabic RTL. Anonymous production-build rendering passed at desktop and 390px widths, but owner/other-user pending-Proposal interaction, RLS/audit effects, Preview and production remain unrun without a local session/runtime or external authorization.

AI-16/#18 adds only a fixture-only server ModelGateway seam. Its four frozen DeepSeek/Qwen profile records distinguish submitted API IDs from observed deployments, force DeepSeek Flash ordinary thinking off, leave experimental Vision shadow-only, and validate Qwen strict output as a closed known/unknown union. The gateway accepts synthetic C0 only and emits closed validated/unavailable/cancelled outcomes; it has no HTTP/client SDK, key/environment read, provider route, domain truth authority, persistence, or Trip/Fact/permission/external write. Provider protocol, region/DPA, cost/latency, streamed usage, live abort/error semantics, accounts and deployment remain unrun and require an independent accepted transport/policy issue.

AI-17/#19 surrounds that frozen registry with a fixture-only routing and observability contract. Ordered policy/data/region and safety denials happen before selection; only C0 ordinary text reaches thinking-disabled Flash and only C0 strict known/unknown reaches Qwen, while Vision/schema mismatches stay unavailable. Route and fallback inputs both require exact key allowlists, rejecting six raw-content key families; pre-output provider/timeout/schema failures are the only fallback-eligible outcomes. The per-profile circuit is pure, bounded, and rejects unsafe cooldown overflow. Attempt traces are exact allowlisted metadata derived from the registry, with integer microunit cost snapshots and fixed false input/output recording booleans. It does not call a provider or persist telemetry. Live routing, real billing, DPA/region, provider failures/streaming, telemetry delivery, and transport integration remain unrun.

AI-18/#20 adds a synthetic C0-only lexical qrels harness, not a retrieval runtime. Its five-locale fixture tests exact alias, explicit transliteration, typo and no-answer behavior; runtime qrels require valid unique corpus IDs, five closed modes always report stable metrics, and nDCG is discounted gain. PostgreSQL/FTS/PGroonga/vector/provider, reviewed production corpus, eligibility joins, persistence and public search remain unrun.

AI-19/#21 adds a pure hybrid-retrieval contract on top of the existing Fact eligibility predicate: caller-supplied opaque lexical/vector ranks are filtered for eligibility before exact-first and deterministic RRF ordering, returning only opaque evidence IDs or no-evidence. Profile values are restricted opaque descriptors and timestamps require real timezone-qualified RFC3339 instants. It neither queries nor changes Supabase, generates embeddings, reranks, accepts text/user data, calls a provider, exposes a route, nor claims production RAG. Actual database/vector/provider adapter work remains separately gated.

AI-20/#22 adds a pure grounded-execution boundary: an explicit clock, typed `GroundedClaim` values and current `EvidenceReceipt`s either produce an immutable deterministically ordered execution card or return a truthful no-card outcome. Negative, stale, duplicate, future, malformed, unknown, or unsupported input fails closed; RL-04 has named stale/negative/forged fixtures and RL-05 preserves the exact deduplicated receipt set. Its semantic card renderer accepts only validated rows and five-locale labels, never model explanation, raw input, routes, persistence, providers, or mutations.

AI-21/#23 is an R2 release-evidence audit, not a Provider launch. The fixture-only AI-16–AI-20 repository evidence is green, including RL-04's three named unsupported fixtures and RL-05's exact receipt/card invariants, but real provider, region/DPA, cost/latency, feature-flag, staging SSE/degraded browser, local RLS and production observation evidence is absent. Its correct verdict is `blocked`; no runtime capability is promoted.

V4-11/#96 adds owner-scoped `TripPlaceReference` reads: `canonical` is an exact opaque POI UUID; `user` remains only a user-confirmed label. A `recheck_required` reference stays visible. No label is parsed into a POI, and no map provider/geography/route/live-fact data exists. Only a canonical UUID reaches Ask in validated `poiId` scope, where it remains an opaque identifier and does not submit a prompt.

V4-12/#97 replaces fictional Bookings with owner-scoped `TripActionReference` projections. Each is sourced from the durable Trip, has one explicit current/recheck/unavailable state and may have a recorded HTTPS external link (not an official-channel claim). It creates no order, payment, inventory or provider success; missing links remain unavailable.

Objective: maintain the dependency-ordered AI Core Issue program while converting Claude's knowledge-base research into a source-aware draft catalogue without bypassing operator, migration, review, RLS or eligibility gates.

Status: GitHub Program [#2](https://github.com/JTCAO515/VP-V4/issues/2) remains authoritative for delivery order. Claude's 2026-08-24 plan has been independently audited and converted into a local draft knowledge workbench: 30 record-type candidates, 18 non-executable readiness-rule candidates, and 6 source-backed `researched_draft` records. Reviewed/retrieval-eligible records remain 0. No runtime, database, bulk import or external account was activated.

Accepted repository facts:

- VP-V4 `main` is a Next.js 16 / React 19 / strict TypeScript / Tailwind v4 product preview with bounded R1 backend contracts, durable Trip RPCs and authenticated Trip route code. Real model, RAG, external data and fully accepted production Auth remain unavailable.
- The canonical user flow is VisePanda Chatbot -> TripProposal -> visible Trip Canvas diff -> user confirmation -> deterministic TripPatch.
- The provisional model candidates are DeepSeek Flash-0731 public beta for text with thinking explicitly off, DeepSeek Pro-0813 GA for complex async work, and separate Vision Exp for shadow; Qwen strict/specialist routes remain region-dependent candidates until conformance/eval/DPA gates pass.
- Qwen3.5 LiveTranslate joins ASR -> MT -> TTS as an end-to-end five-language voice challenger; Beijing/Singapore OCR/TTS availability changes the mandatory stack, so region is a P0 decision.
- Kimi and GLM remain eval-only until task-level VisePanda evidence supports promotion.
- Raw audio and images are not retained by default; provider region, retention, and production data flow remain operator/legal decisions.
- External data is proposed as ReviewedFact, LiveObservation, EphemeralObservation, UserConfirmedArtifact, and ExternalEntityRef, governed by a versioned Data License Registry.
- Flight schedule/status should use a licensed aviation provider after a China-route benchmark; purchasing and inventory remain out of scope.
- 12306 Terms prohibit unrecognized robot/spider/crawler access, so VP-V4 must not build a periodic 12306 scraper. Rail uses reviewed station/corridor guidance, user-confirmed ticket import, and official recheck actions.
- External-source POIs enter only as private Imported POI Candidates; they are never model-generated, auto-merged, auto-reviewed, or directly published.
- Canonical POI and reviewed/current Fact are the shared write model. Chatbot RAG, Explore, Trip Canvas, and SEO consume the same IDs and eligibility through rebuildable projections.
- Language, translation, payment instruments, passport contexts, accessibility, booking, and local-display capabilities are typed atomic Facts, not broad booleans or POI categories.
- The proposed RAG baseline is Postgres exact/alias/pg_trgm/FTS plus multilingual vector retrieval, RRF, and optional evaluated reranking; do not procure a second vector database initially.
- The proposed implementation starts as one public Next.js modular monolith with six deep product modules and three platform seams. No Ops UI in R1/R2; the first real curation UI uses a separate protected deploy and only then justifies a minimal shared core workspace.
- The first accepted tracer bullet is reviewed fixture -> grounded Chat -> TripProposal -> visible Canvas diff -> user confirmation -> persisted deterministic TripPatch -> privacy-safe trace.
- Confirm and apply are one atomic Trip transaction; pending Proposal revisions are immutable; grounded execution uses typed GroundedClaims/EvidenceReceipts and buffered validated events.
- Closed beta defaults to authenticated-only pending operator acceptance. User/Ops requests use verified JWT + RLS; system credentials are worker-only and must apply explicit owner/eligibility/policy filters.
- R1 uses fake model, one Fact fixture, durable Turns and Trip CAS only; no real model, pgvector, queue, external data or Ops UI.
- VP-Final migration is evidence-gated: #4 disposition matrix -> #11 TripPatch golden contract -> #13 Fact eligibility -> #16 RLS/fault patterns -> #25 import/review/audit. Reuse behavior/tests through V4 interfaces; do not copy directories, direct-write Copilot, static Explore seeds, secrets, or the old full monorepo.
- Current frontier at the 2026-08-27 governance audit: #122 AI-51b, #84 AI-51 and #130 AI-13c are closed after green merged PRs; #15 AI-13 is the independently executable R1 product frontier. #132 GOV-AFK-01 is the in-progress governance change that defines continuous cross-Issue scheduling. Every future session must re-query this state rather than treating it as permanent.
- Claude's referenced `research/fact-catalogue.json` is missing; 810/122 rows, five weeks and “zero unavailable” are unverified estimates, not targets.
- The catalogue uses `Knowledge Record Type Candidate`, not “30 Fact Types”: policy/operational Facts, directory entries, procedures, Safe Phrases, observations, assessments and rules have different lifecycle owners.
- The six researched drafts have direct source locators but no reviewer or licence policy and are explicitly ineligible. The 18 readiness rules all have `executable:false` and preserve Claude's single status only as a legacy hypothesis label; future output uses three axes.

Canonical domain language:

- `Imported POI Candidate`: private, externally sourced place candidate carrying source, licence, batch, and stable source identity; avoid “generated POI”.
- `Canonical POI`: stable internal identity for a real place; it does not certify every attribute about that place.
- `Fact`: one typed, evidenced, versioned, reviewed, and expiring claim about a scoped target.
- `Retrieval Unit`: rebuildable lexical/vector projection of eligible Facts or reviewed Guides; it is not the source of truth.
- `Explore Projection`: rebuildable public read model derived from Canonical POIs, eligible Facts, licensed media, and editorial placement.
- `Explore Collection`: editorial list of Canonical POI IDs for a city/scene; it does not change Fact eligibility.
- `Trip Place Reference`: user-confirmed Canvas reference to a Canonical POI plus required Fact/version receipts; avoid copied model-generated POI blobs.
- `Knowledge Record Type Candidate`: a proposed vocabulary entry that may later become a Fact, Directory Entry, Procedure, Safe Phrase, assessment or facet; it is not retrievable. Avoid calling all catalogue entries “Fact Types”.
- `Policy Fact`: a sourced rule whose value is conditional on audience, time, geography, authority and exceptions. Avoid “global rule”.
- `Operational Fact`: a current claim about a concrete venue, channel or process. Avoid “POI attribute” when evidence and expiry matter.
- `Directory Entry`: a sourced contact or institution record with jurisdiction, purpose, hours and validity. Avoid treating a count or list as guaranteed assistance.
- `Procedure`: an ordered product-owned sequence whose critical values reference separate eligible Facts. Avoid duplicating policy numbers inside free text.
- `Class Entitlement`: an obligation or recommendation attached to an official class/grade; it is not proof of current venue delivery. Avoid “class capability”.
- `Readiness Rule`: a versioned candidate derivation from Trip state and eligible evidence. It is not a Fact and cannot execute before acceptance. Avoid “AI readiness judgment”.

Reading order:

1. `docs/ai-core-integrated-research-report.md`
2. `docs/ai-core-engineering-development-acceptance-report.md`
3. `docs/research/ai-core-deep-optimization-evidence-2026-08-23.md`
4. `docs/research/ai-core-v1.1-independent-audit-2026-08-23.md`
5. `docs/research/ai-core-system-evidence-2026-08-23.md`
6. `docs/model-layer-plan.md`
7. `docs/external-data-chatbot-plan.md`
8. `docs/knowledge-rag-explore-plan.md`
9. `docs/research/knowledge-rag-explore-evidence-2026-08-23.md`
10. `docs/knowledge-base/README.md`
11. `docs/knowledge-base/claude-plan-disposition.md`
12. `docs/research/knowledgebase-claude-audit-2026-08-24.md`
13. `docs/research/external-data-evidence-2026-08-23.md`
14. `docs/research/model-provider-evidence-2026-08-22.md`
15. `README.md`
16. `AGENTS.md`
17. `docs/agents/issue-tracker.md`
18. `docs/agents/triage-labels.md`
19. `docs/agents/domain.md`
20. `docs/agents/continuous-afk-execution.md` when launching an unattended multi-Issue session
21. `docs/operator-actions.json` when launching an unattended multi-Issue session
22. `docs/adr/0001-nextjs-typescript-tailwind-migration.md`
23. `docs/adr/0002-visepanda-brand-localization-assets.md`

Historical note: #3 AI-01, #4 AI-02 and #13 AI-11 are closed. Their decisions and contracts do not promote the draft catalogue to reviewed or retrieval-eligible production content.

Rollback: remove `docs/knowledge-base/` and its audit link if the research disposition is rejected; no database or public content requires rollback. Preserve GitHub history by superseding replaced Issues rather than deleting them.

## VP-V4 production parity and bounded-agent planning

The operator requires the real VP-V4 product to reproduce the Early Access Demo's user capabilities without copying its static fixtures. The accepted planning package is `docs/vp-v4-production-feature-parity-report.md`, `docs/vp-v4-ai-trip-canvas-product-logic-upgrade-report.md`, `docs/vp-v4-agent-rag-memory-tools-context-engineering-report.md`, its source ledger, and `docs/vp-v4-production-parity-issue-plan.md`.

The tracker plan is published as V4-01 through V4-31 while preserving R0-R5. It adds ContextPlan, Tool Policy Gateway, ConstraintEngine and a rejectable RoutePattern RAG spike. LangChain/LangGraph/GraphRAG/multi-agent are not default implementation work. V4-13 supplies the owner-scoped Memory Profile lifecycle, consent, source/lifecycle receipts and safe retrieval projection; V4-14 supplies its owner-JWT Copilot governance UI/API, including durable lifecycle/consent writes and source/recorded-impact reads. V4-16 supplies a separate owner-JWT durable Profile workspace for explicit travel pace, locale, currency, units and departure time; it reloads server state, uses no browser-local data or service credential, and never infers settings from Memory. V4-17 supplies an owner-scoped, closed all-data export/delete request with immutable requested receipt only; no export, deletion or backup-purge executor exists. V4-18 supplies a deterministic fail-closed NextAction/nine-check engine, but its browser surface remains unavailable until an owner Trip/Fact reader exists. A verified Turn/Proposal coordinator still owns V4-15 impact receipts. V4-19 supplies only timestamped observations; V4-20 supplies delay/closure recovery; V4-21 supplies queue/ordinary-unwell Proposals and high-risk official-channel-only outcomes. None reads owner data or writes a Trip, provider contact, diagnosis, rescue, cancellation or purchase. V4-22 through V4-30 remain truthful five-locale/RTL unavailable surfaces. The V4-31 audit covers all 40 registry actions and has a blocked, non-release verdict until V4-15 writers/V4-17 execution and runtime evidence exist. The Continuous AFK scheduler must recompute native dependencies and labels after every PR or merge; label synchronization is skipped while `gh` lacks an authenticated user.

## Continuous AFK execution

The accepted direction removes routine per-Issue confirmation and adds a cross-Issue frontier loop.
Each Issue still has its own worktree, branch, PR, checks and evidence. Class A reversible repo-only
work may use GitHub auto-merge after every required gate succeeds. With an active explicit operator
instruction, Class B repository-only preparation may also auto-merge after independent automated
review and every required gate succeeds; it never authorizes production application. Class C operator
work is recorded in `docs/operator-actions.json` and skipped while another safe frontier exists.
No AFK instruction weakens RLS, permissions, privacy, data rights, rollback, branch protection or
irreversible-action gates.

## VisePanda visual identity assets

An owner-approved, non-runtime visual identity package is available under `brand/`; source Logo artwork is retained under `assets/brand/vise-panda/`. The package adds a handoff-ready handbook, design tokens, mascot poses, icons, UI references, social exports, and a machine-readable manifest. It does not change the product's implemented, placeholder, or not-connected boundaries. For visual or product-facing work, read the handbook and QA evidence after the core project governance documents; preserve the source artwork and use a revert commit if this delivery must be removed.

## Direct Issue queue and anonymous preview

Magic Link and its callback route are removed. Public preview traffic is anonymous; Trip APIs still
require a valid Supabase session claim and fail closed without one. Every defined Issue is directly
schedulable. Dependency references are integration context, not execution gates; runtime security,
data policy, and authorization checks remain unchanged.

## WEB-04 asset rights quarantine

WEB-04 removes legacy source assets, copied shapes and Fig Grotesk from runtime delivery. The
machine-checked ledger, SBOM, NOTICE and quarantine record live in `docs/licenses/`; existing preview
photographs are explicitly blocked from release until an operator rights record exists. This is a
release guard, not a claim that rights have been accepted.

## V4-02 Context Engineering

V4-02 (#85) establishes the deterministic ContextPlan/ContextAssembler baseline in
`lib/server/context/`. It has a fixed source order and per-section budgets; required system, policy,
hard constraints and current user message fail closed if unavailable. Eligible context must be
actor-scoped and is filtered before rendering; cross-user, draft, expired, prohibited, raw artifact
and raw Tool data are never included. Tool projections remain explicitly untrusted. Provenance
manifests keep only references, versions, counts, omission reasons and SHA-256 fingerprints rather
than raw content or actor IDs. Synthetic contract/eval fixtures establish full-history versus
compaction constraint retention and zero leaks; this does not claim real model/retrieval/provider
runtime evidence.

## V4-03 Tool Gateway

V4-03 (#88) establishes the pure server-side `ToolRegistry` and `executeToolIntent` baseline in
`lib/server/tools/`. A model/UI function call is only an intent: the gateway resolves a static
allowlist, verifies task/data/license/feature policy and schema, requires an exact actor-bound
expiring approval where needed, and claims idempotency before execution. `trip.*` and executable
Proposal tools are rejected at registration; Trip truth remains Proposal/Confirm/Patch.

Executors run under a deadline. Definite failures (provider error, invalid output, oversized output)
release their claim; an external side effect requires a durable pending/succeeded/unknown adapter and
retains an unknown claim on every started-executor failure to prevent an uncertain duplicate.
Receipts exclude raw executor output and actor IDs, exposing only a bounded entity-escaped
`<untrusted-tool-output>` projection. The synthetic tests prove gateway behavior, not provider
delivery, flag rollout, model selection, or production reconciliation.

## V4-04 Constraint Engine

V4-04 (#89) adds a pure deterministic `ConstraintEngine` in `lib/server/constraints/`. It evaluates
validated candidate plans against closed hard budget, time-window, transfer, opening, reservation
and route-evidence constraints; soft stop-count preferences create tradeoffs only. Hard violations
produce `infeasible`, missing current evidence produces `unknown`, and only a fully supported plan
is `feasible`. The final-state scorer maps these to `reject`, `needs_evidence`, and `accept`.

The engine neither calls providers/models nor writes Trip state. Group budget amounts are safe
integer currency minor units; price, opening/reservation and each route link must be current before
a pass. RFC3339 instants include an offset, are checked for real calendar dates and are compared as
instants, never as strings; candidate stops cannot overlap. Currency conversion,
actor/RLS, route/opening/booking freshness and evidence eligibility remain upstream obligations.
Its synthetic PLAN-EVAL does not claim live itinerary quality or provider evidence.

## V4-05 RoutePattern spike

V4-05 (#90) rejects RoutePattern runtime adoption. No reviewed, licensed route-pattern or
trajectory corpus is present, and its self-authored synthetic paired evaluation shows no final-state
gain over POI/Fact/Guide retrieval. A suggested order never replaces current route-matrix or Fact
evidence, and every candidate remains subject to the deterministic ConstraintEngine; there is no
new runtime, schema, provider, cache, model or Trip write path.
