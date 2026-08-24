# AI-01 Decision Register — operator worksheet

- Issue: [#3 AI-01](https://github.com/JTCAO515/VP-V4/issues/3)
- Status: accepted by explicit operator delegation in the Codex conversation on 2026-08-24. The choices below are now the R0 execution baseline.
- Delegated decision owner: Codex, acting under the operator's explicit instruction to take responsibility for DEC and path selection.
- Agent role: record the accepted choice, evidence, impact, deferred behavior, review trigger, and rollback. Any future replacement still requires a new operator decision and ADR.

## How to use this register

The operator delegated selection authority to Codex on 2026-08-24. Each selected option becomes executable through the corresponding ADR; all capability outside its accepted boundary remains unavailable or fixture-only.

| ID | Selected option | Operator/date | ADR | Status |
| --- | --- | --- | --- | --- |
| DEC-01 | One Chatbot + one Canvas; immutable Proposal -> confirmed atomic Patch | Delegated to Codex / 2026-08-24 | ADR-0003 | accepted |
| DEC-02 | DeepSeek/Qwen provisional; Kimi/GLM eval-only; R1 fake-model first | Delegated to Codex / 2026-08-24 | ADR-0004 | accepted |
| DEC-03 | C0/C1-only controlled conformance; no C2/C3/raw-media provider flow | Delegated to Codex / 2026-08-24 | ADR-0005 | accepted |
| DEC-04 | New V4 Supabase lineage; port only approved contracts/tests | Delegated to Codex / 2026-08-24 | ADR-0006 | accepted |
| DEC-05 | Authenticated-only closed beta; no durable anonymous Trip | Delegated to Codex / 2026-08-24 | ADR-0007 | accepted |
| DEC-06 | Public Next.js Web; protected Ops only when curation requires it | Delegated to Codex / 2026-08-24 | ADR-0008 | accepted |
| DEC-07 | Canonical Fact truth + candidate-first + Postgres hybrid retrieval | Delegated to Codex / 2026-08-24 | ADR-0009 | accepted |
| DEC-08 | Beijing curated + Guangzhou ordinary pilot; max 10 candidates per batch | Delegated to Codex / 2026-08-24 | ADR-0010 | accepted |
| DEC-09 | No purchase/crawler; official rail handoff and licensed aviation gate | Delegated to Codex / 2026-08-24 | ADR-0011 | accepted |
| DEC-10 | Modular OCR/MT and ASR/MT/TTS; realtime challenger eval-only | Delegated to Codex / 2026-08-24 | ADR-0012 | accepted |
| DEC-11 | Five-language L1-L7, named RL suites, rollback and observation | Delegated to Codex / 2026-08-24 | ADR-0013 | accepted |

## DEC-01 — product definition and write invariant

**Decision.** Confirm the VisePanda core as one visible Chatbot plus one visible Trip Canvas, with every AI-originated Trip change following `TripProposal -> visible diff -> explicit user confirmation -> deterministic TripPatch(expectedVersion) -> audit/event`.

**Recommended default.** Accept the planning-and-execution workspace boundary and immutable proposal/atomic apply invariant.

**Alternatives.**

- Keep a chat-only preview and prohibit all runtime Trip writes.
- Reopen the product definition; this stops R1 contract implementation until a replacement ADR is accepted.

**If deferred.** No runtime write path and no public planning-and-execution promise changes.

**Evidence.** Integrated research report §13 DEC-01; engineering report §0.2, §4.3 and §12.2; AI-02 matrix M-01 through M-04.

**Rollback after acceptance.** New ADR replaces the invariant; existing accepted Trip events are not rewritten.

**Review trigger.** Any request for model-direct Trip writes, a second authoritative Canvas, or mutable pending proposals.

## DEC-02 — model baseline

**Decision.** Choose the initial provider strategy for text, structured output, and offline evaluation.

**Recommended default.** Treat DeepSeek and Qwen as provisional task-routed candidates; keep Kimi and GLM eval-only; keep all routes disabled until AI-16 conformance, region, retention, and cost gates pass.

**Alternatives.**

- Use fake-model-only R1 and defer every real provider route.
- Select a different candidate portfolio with equivalent provider-specific conformance and disclosure evidence.

**If deferred.** R1 remains fake-model only; no provider key is read and no paid model call occurs.

**Evidence.** Integrated research report §0.3 and §13 DEC-02; engineering report §6.1–§6.4.

**Rollback after acceptance.** Disable the relevant route/flag and return accepted turns to deterministic unavailable/degraded behavior.

**Review trigger.** Provider alias drift, changed pricing, changed data terms, conformance failure, or a new modality.

## DEC-03 — model, data, and media region/retention

**Decision.** Approve the permitted data classes, regions, retention periods, and provider data flows.

**Recommended default.** Do not send C2/C3 or raw media to any provider until a purpose/data-class decision and DPA/retention evidence exist; retain raw audio/image by default for no longer than the accepted task lifecycle.

**Alternatives.**

- Limit R1/R2 to fixture and non-sensitive synthetic data.
- Approve a named provider/region/data-class matrix through the security ADRs.

**If deferred.** No real provider, external-data, OCR, ASR, TTS, or Vision flow.

**Evidence.** Integrated research report §10 and §13 DEC-03; engineering report §5.6, §7 and §8.2.

**Rollback after acceptance.** Disable the provider route, purge permitted cached data under the accepted policy, and return unavailable.

**Review trigger.** New provider, changed region, changed retention term, sensitive attachment, or cross-border data flow.

## DEC-04 — Supabase lineage

**Decision.** Choose a new V4 Supabase project or a governed migration from VP-Final.

**Recommended default.** Use a new V4 project and port only golden contracts/tests selected by AI-02; do not copy historical migrations, service roles, data, or environment defaults.

**Alternatives.**

- Approve a schema-by-schema VP-Final migration with an append-only migration, ownership, RLS, backup, and rollback plan.

**If deferred.** Local fixture-only behavior; AI-08/AI-10 database work remains blocked.

**Evidence.** AI-02 matrix M-02, M-08, M-10; engineering report §5.3–§5.5; integrated report §13 DEC-04.

**Rollback after acceptance.** Disable the new data path; do not rewrite accepted migrations or import production data without a separate restoration plan.

**Review trigger.** Any database creation, migration, RLS policy, service credential, backup/restore design, or import proposal.

## DEC-05 — beta identity

**Decision.** Choose the identity requirement for durable Trip, Turn, user artifact, and preference state.

**Recommended default.** Authenticated-only closed beta; no durable anonymous Trip.

**Alternatives.**

- Anonymous preview limited to non-persistent local state.
- A separately specified guest model with explicit ownership, deletion, rate, and abuse controls.

**If deferred.** No durable user-owned data; preview remains local/fixture-only.

**Evidence.** Integrated report §13 DEC-05; engineering report §7.4; AI-02 matrix M-08.

**Rollback after acceptance.** Disable durable writes for the affected identity class and retain only data covered by the approved retention policy.

**Review trigger.** Login, invite, guest mode, share link, account recovery, or any persistent user data.

## DEC-06 — deployment shape

**Decision.** Approve the public Web and protected Ops deployment boundary.

**Recommended default.** Public Next.js modular monolith for R1/R2; no Ops UI until a real curation/review workflow requires a separate protected deployment.

**Alternatives.**

- Defer Ops entirely and keep all candidate/review workflows unavailable.
- Approve a separate Ops deployment with its own identity, role, secret, and audit controls.

**If deferred.** No privileged review UI or public path that carries Ops privileges.

**Evidence.** Engineering report §0.1 and §8; integrated report §13 DEC-06; AI-02 matrix M-07 and M-10.

**Rollback after acceptance.** Disable the protected deployment; no service-role secret is placed in the public Web environment.

**Review trigger.** New deploy target, privileged UI, worker, direct database access, or secret scope change.

## DEC-07 — Knowledge and RAG

**Decision.** Approve one canonical Fact truth model, candidate-first import, and Postgres hybrid retrieval baseline.

**Recommended default.** Canonical POI and reviewed/current Fact shared by Chat, Canvas, Explore, and SEO; exact/alias/FTS plus evaluated vector/RRF retrieval; no second vector database initially.

**Alternatives.**

- Fixture-only Knowledge with no public retrieval.
- A different retrieval design only after benchmark, privacy, and ownership evidence.

**If deferred.** No retrievable knowledge beyond reviewed fixtures; candidate/draft remains private and ineligible.

**Evidence.** Integrated report §8 and §13 DEC-07; external-data plan §2–§3; AI-02 matrix M-05 through M-07.

**Rollback after acceptance.** Disable the projection/index and fall back to exact reviewed lookup or unavailable.

**Review trigger.** New source, embedding provider, projection, public consumer, content lifecycle, or RAG ranking change.

## DEC-08 — content pilot

**Decision.** Choose the first city pilot, source/review capacity, and batch size.

**Recommended default.** One ordinary city plus one curated city, 10–20 externally sourced candidates per review batch, and no public coverage claim before review evidence.

**Alternatives.**

- Keep all city content fixture-only.
- Select different pilot cities/batch size with an equivalent review, source-rights, and observation plan.

**If deferred.** No new public city/POI coverage or bulk import.

**Evidence.** Integrated report §8–§9 and §13 DEC-08; knowledge-base workbench status; engineering report §12.1.

**Rollback after acceptance.** Stop the pilot import, keep candidates private, and invalidate public projections.

**Review trigger.** City expansion, batch increase, reviewer capacity change, source contract change, or public coverage claim.

## DEC-09 — transport

**Decision.** Confirm the no-purchase boundary, licensed aviation benchmark, and railway official-handoff policy.

**Recommended default.** No ticket purchase, inventory, or periodic 12306 crawler; use licensed aviation benchmark before one adapter, user-confirmed artifacts, reviewed rail guidance, and official recheck actions.

**Alternatives.**

- Defer aviation and use official handoff only.
- Add a licensed provider after contract, China-route benchmark, attribution, retention, and field-allowlist gates.

**If deferred.** No live transport status; show truthful unavailable/official action only.

**Evidence.** External-data plan §5 and §15; integrated report §7 and §13 DEC-09.

**Rollback after acceptance.** Disable the adapter, purge provider data under its policy, and retain only user-confirmed artifact/reference behavior.

**Review trigger.** Provider account/contract, field expansion, status display, cache/persist term, crawler proposal, or purchase flow.

## DEC-10 — multimodal release

**Decision.** Choose the image and voice translation release path and device/region gates.

**Recommended default.** Start with modular OCR-to-MT and ASR-to-MT-to-TTS baseline; evaluate realtime challenger separately; require five-language device, privacy, and final-only persistence evidence before release.

**Alternatives.**

- Text translation only until device/region gates are accepted.
- Approve a realtime path after protocol conformance, credential expiry, reconnect, and recording/retention controls pass.

**If deferred.** No image/voice provider call; show text-only or unavailable behavior as appropriate.

**Evidence.** Integrated report §6 and §13 DEC-10; engineering report §6 and §12.1.

**Rollback after acceptance.** Disable the modality flag, delete raw media under the accepted policy, and fall back to text/unavailable.

**Review trigger.** Camera/microphone permission, provider, device region, retention, TTS, realtime protocol, or media storage change.

## DEC-11 — definition of done

**Decision.** Confirm the release acceptance standard.

**Recommended default.** Require five-language evaluation and applicable L1–L7 evidence, named red-line suites with fixture counts/runtime invariants, explicit unrun checks, rollback, and observation window before a release claim.

**Alternatives.**

- Accept a narrower internal prototype gate, explicitly labelled prototype and not production/beta complete.
- Replace quality targets only with a new ADR and corresponding Issue/CI changes.

**If deferred.** No claim of complete AI capability or controlled beta readiness.

**Evidence.** Engineering report §9–§10 and §16; integrated report §11 and §13 DEC-11; issue execution contract RL-01 through RL-09.

**Rollback after acceptance.** Pause promotion, disable the affected flag, and return to the last evidence-backed release boundary.

**Review trigger.** Any release label, new red-line suite, quality metric, provider/model promotion, or public capability claim.

## Operator decision record

When an option is selected, append the following block under the applicable DEC section without overwriting the original options:

```md
### Operator record

- Selected option:
- Rationale:
- Date:
- ADR:
- Accepted downstream Issues:
- Deferred behavior and expiry/review date:
- Rollback owner and action:
```
