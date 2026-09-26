# VP personal journey assistant — coding-agent development plan

Date: 2026-09-27. Authority: JT's explicit acceptance of the discussed experience and implementation direction, followed by authorization to revise documents, ADRs and GitHub tasks. Decision: [ADR-0027](../../adr/ADR-0027-personal-journey-assistant.md). Scope of this delivery: **planning and tracker changes only**; no runtime capability, pricing activation or release is claimed.

## Start here

1. Read this page and the current live Issue/PR.
2. Read [EXPERIENCE.md](EXPERIENCE.md) for what the user must see and be able to do.
3. Read [ARCHITECTURE.md](ARCHITECTURE.md) for affected producer/consumer and compatibility boundaries.
4. Use [CODING-AGENT.md](CODING-AGENT.md) to select one bounded delivery and checks.
5. Get task identity, scope, complete acceptance and dependencies from the existing [manifest](../../program/2026-09-05/issue-plan.json) and generated [execution rows](../../program/2026-09-05/EXECUTION-CONTRACT.md). This directory is the experience/architecture contract, not a second task database.

## Accepted product direction

- Main relationship: one recognisable VP, natural continuous conversation, explicit memory and accepted work that survives leaving the app.
- Acquisition hypothesis: a first-time/less-familiar independent traveller has intent to visit China but still needs to choose route, pace, accommodation and practical arrangements. Deliver appealing, personally relevant choices before an administrative readiness checklist.
- Native tabs: **VP / Journeys / Library / Memory**. Search is global; visual exploration is a search/discovery surface. No activity tab. Account/privacy/purchases remain reachable. Today stays within a journey; Library contains Tools and My materials/results.
- The persona is warm, direct and calm, with optional light humour where appropriate. Never pretend to be a human, fabricate a remembered fact, fake work/percentages or narrate hidden reasoning. Real action state determines visible copy.
- Memory must be visible at four points: dedicated tab, relevant VP-home cues, actual save/undo feedback, and explanations of preference use in results. Correction changes subsequent work, not just a label.
- Paid service expands delegated research, coordination and supported ongoing work. Basic useful planning, an appropriately bounded delegation experience, basic memory and data controls remain available free. Exact price, quotas and renewal terms remain unselected. Do not reinstate old Ask counts as the new product contract.
- Existing logo/mascot assets and semantic design foundations may be reused; interaction layout may be redesigned. The selected ideas are relationship-first + visual discovery + actionable results, not pixel approval of any generated image.

## Visual references and their limits

Three generated concepts from the discussion are preserved in [references](references/README.md): companion, living journey, discovery. Their old tab labels, generated locations, copy, route geometry, dates and apparent activity are illustrative. The **four-tab contract and Memory prominence in this plan take precedence**. They are not runtime screenshots, licensed destination photographs or evidence of an available itinerary. VPJ-77 resolves one coherent visual system and renders the key states before production implementation.

## Required user story

1. A user gives a vague China trip idea without mandatory exact dates or a complete questionnaire; VP gives a useful direction/comparison and asks at most the next material question.
2. The user adds a preference or selects a direction without re-entering known details. Explicitly saved preference use is visible and correctable.
3. The user delegates a bounded research task, adds a condition while it runs, and can ask a separate question. Work, conversation and active Trip stay correctly associated.
4. The app closes. The accepted task continues within its authorized scope; a worker restart retains progress and cost accounting.
5. On return, VP presents the actual new result, its recommendation and a next decision. The same artifact is found in Journeys and Library.
6. A user correction invalidates obsolete work/results as appropriate. A selected change goes through a visible exact diff and confirmation, and the updated Trip reads back consistently.

## Current implementation baseline

Source inspected: main `72059c6327d6ec658e86dee64508f88dd88314e6` (2026-09-27 local date). Refresh main/PR and relevant target environment before coding. Source observations below are not fresh runtime validation.

| Seam | Existing asset | Change needed |
| --- | --- | --- |
| Native conversation | `NativeAskStore`, pending submission, session guard, event replay | Fresh-thread/new-goal and short clarification/repair chains cannot directly represent open continuous conversation; add a versioned mode |
| Text worker | `lib/server/turn/text-worker.ts`, durable leases and attempts | Current text path bounds model steps to one; add a bounded planning executor, not just a larger prompt |
| Context | `lib/server/context/` | Task-specific permitted Trip/memory/evidence, source revisions, unresolved decisions and invalidation; do not inject the memory management list |
| Memory | `lib/server/memory/`, native travel-pace API and current native consumer | Generalize only needed explicit preferences; visible tab and real model/proposal use; keep Profile field authority |
| Tools | `lib/server/tools/` | Trip/proposal and external effects currently rejected; introduce a narrow proposal-producing capability with persistent action claims, retain denial elsewhere |
| Trip | native adapter, proposal/revision/confirm and immutable snapshots | Reuse the sole confirmed writer; preserve address/other versioned fields and exact-base checks |
| Planning | `NativeRelativeOutline` / `NativeTripView` | Local direction generator is a partial input/UX seam, not full research/planning; progressively replace its producer |
| Knowledge/maps | published eligibility/EvidencePack, map adapters, constraints | Plan-level eligible evidence, consistent calculations, honest unsupported coverage; no new vector database by default |
| Notifications | `lib/server/notifications/contract.ts` | Delivery explicitly unavailable in inspected code; actual transport/scheduler proof still required |
| Release | #237/#243/#242 and current evidence | Preserve installation, independent Production and RC gaps; merged code does not prove these resolved |

The supplied Muse PDF cites three `docs/product/2026-09-24-...` files not found in this main checkout. Its interpretations are advisory; do not treat missing references as code or runtime proof.

## Work ownership and sequence

The [task map with live Issue links](TASK-MAP.md) lists 7 new responsibilities (#558–564) and 21 revised existing tasks. Acceptance is still sourced from the manifest.

`deliverySupplements.assistant-20260927` in the manifest owns the wave membership. U0–U4 are scheduling views over VPJ tasks, not new Issue identities. Existing S1–S6 fields classify full acceptance; an entire old stage need not close before a bounded upgrade slice can start.

| Wave | User-visible deliverable | Primary tasks | Integration stop condition |
| --- | --- | --- | --- |
| U0 | A coherent interactive specimen of first visit, delegation, return and memory correction | VPJ-77 | User can find work, memory and result without explanation; include small/large text, loading/error/empty states; fixture label retained |
| U1 | The same VP continues a conversation and correctly applies/corrects memory | VPJ-78, existing VPJ-11/#199 | Ordinary questions without Trip; concurrent messages and scope changes; old clients compatible; owner and revoked-memory isolation |
| U2 | A delegated planning task produces a durable, actionable result while the app is closed | VPJ-79, VPJ-80, existing VPJ-09/#197 and VPJ-10/#198 | Real model/tools + restart + artifact readback + exact proposal confirmation; unknown/failed outcomes retained |
| U3 | The new VP, Journeys, Library and Memory operate as one product | VPJ-81, VPJ-82, VPJ-83; existing #203/#210/#211/#221 | Four tabs, global search, same artifact identity, real activity, nonblocking chat, memory impact and supported tool entry |
| U4 | The three-moment experience is verified and the sale/release candidate is honest | existing #233/#234/#242/#264–268/#246/#247 and commercial #225–227 | Versioned real RC evidence, privacy/failure paths, observed user behaviour and costs; no new success claim from prototype/merge |

Preparation may run before final integration inputs exist, with explicit unavailable inputs. Reuse existing team ownership; keep one primary result per active coding chat and coordinate shared native models, SQL, context, tools and Staging writes. This plan does not dispatch agents or change the coordinator's current concurrency/model settings. Existing in-flight foundational work may finish; the new experience takes priority over unstarted horizontal expansion. Production isolation, installed build, data protection and purchase correctness remain release prerequisites.

## Existing task disposition

- Reuse and revise #195/#196 for bounded text/event foundations; VPJ-78 owns new conversation/task membership, VPJ-80 owns planning execution. Do not make three independent coordinators.
- Reuse #199 for all memory storage/qualification/consumer work. Do not create a second Memory feature Issue or hidden profile database.
- Reuse #197/#198 for planning and confirmed changes. VPJ-79 owns artifact lifecycle; VPJ-81 renders conversation; VPJ-83 integrates navigation and journey surfaces.
- Reuse #203 for first/return entry, #210 for discovery content/actions, #211 for staged readiness, #221 for reasoned follow-up and transport. Search and Library aggregation belong to VPJ-82.
- Revise #225–227 for subscription-oriented packaging and compatibility with existing Pass/grants; retain #503's official transaction validation. #252 retains annual-plan/transaction-depth evidence work, not a blanket prohibition on the accepted subscription direction.
- Reuse #233/#234/#242 and Harness #264–268 for full verification. New regression cases extend the current suite; do not relabel blocked or unknown as task completion.
- Customer discovery #246 and operating measurement #247 test planning-stage value, task delegation, memory correction, payment independent of bookings, and journey-window retention. Do not assume annual retention or commission income.
- Existing translation, voice, maps, Today, import, profile, sharing and service-case functions remain accessible when supported. eSIM is a candidate Library capability, not an approved supplier, sale or activation flow.
- No Issue is deleted or marked completed by this replan. Existing checked items remain scoped historical evidence. Closed #188 remains a completed old-shell foundation; VPJ-83 owns the new shell. Community/Creator/Android/nationwide expansion keep their existing identities and are outside the first upgrade path.

## Priority of documents and rollout

ADR-0027 and this directory override conflicting navigation, upgrade sequencing and new packaging assumptions in the older master plan, team kickoff and six-stage narrative. Unaffected domain/security/release contracts remain authoritative. The manifest remains the sole task definition; generated bodies retain historical checked items and progress.

Use versioned contracts and additive migrations, supported-client capabilities, a bounded target-environment rollout and a readable/cancellable fallback. Do not silently reinterpret existing thread IDs, snapshots, charges, grants or deleted memory. Each delivery reports implemented / target-environment observed / user accepted / released separately.

## Research basis

The user's accepted direction is authoritative. Public descriptions support exploration, not claims of competitor reliability or VP capability: [Muse design](https://introducing.muse.ai/), [Muse safety architecture](https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse), [Anthropic agent patterns](https://www.anthropic.com/engineering/building-effective-agents), [context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents). No new framework or provider purchase follows from citing them.
