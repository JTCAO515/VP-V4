# ADR-0027: Personal journey assistant with visible memory and durable work

Status: accepted product and architecture direction by JT in the 2026-09-27 planning conversation. Implementation, target-environment acceptance and release remain separate. This ADR authorizes the repository plan; it is not evidence that any new capability is running.

## Context and authority

JT accepted three decisions: use the personal VP relationship as the main experience, visual discovery for inspiration, and interactive journey artifacts for results; rebuild the interaction layer while reusing sound domain foundations; make memory conspicuous. The subsequent instruction explicitly authorizes a new coding-agent plan and changes to repository documents, ADRs and GitHub Issues, including existing tasks. It lifts the historical tracker-edit exclusion for this replan, but does not require deleting history or authorize an unrelated production, account or money operation.

The target customer is an international independent traveller seriously planning China while important choices remain open. Planning is the initial acquisition and payment hypothesis; preparation and in-trip recovery deliver continuity. This is a hypothesis to validate, not an observed conversion or retention claim. The user's estimate of under US$5 for 200 questions already includes model, search, maps and voice; new background workload and support costs remain to be measured.

## Decision

1. Native iOS remains the complete zh/en product; Web remains a lightweight consumer of the same Trip and supported shared results. No second web product or React Native migration is implied.
2. The new native navigation is **VP / Journeys / Library / Memory**, default VP. Search is a global destination; its empty state can host visual discovery. Account, privacy and purchase controls remain reachable from the account entry. No standalone activity feed. Existing tools, exploration, Today and profile capabilities are relocated, not silently removed.
3. Memory is visible through its own tab, contextual cues on VP, successful-save/undo feedback and an explanation of relevant preference use in results. Long-term explicit memory, current-Trip facts, temporary context, task state and external evidence remain distinct. Free and paid users retain basic memory and correction/deletion rights.
4. A stable user-facing conversation can contain multiple bounded ServiceTasks and related Turns. Conversation continuity is separate from task execution, billing and Trip identity. Ordinary questions require no Trip or long-lived goal. A journey goal may exist before exact dates or a saved Trip and reference multiple ServiceTasks; it is a thin owner-scoped grouping, not a second scheduler or copy of Trip content.
5. Durable, versioned result artifacts are shared references across VP, Journeys, Library and search. A route comparison or draft is not a confirmed Trip or booking. Existing UserArtifact ingestion remains distinct from an assistant-produced result, with explicit references rather than duplicated material.
6. Extend the existing durable work, model budget, context and tool boundaries with a bounded planning execution mode. Persist checkpoints and action receipts; wake on user input, explicitly accepted follow-up or relevant supported events. Waiting releases workers. A model may propose a next step, but domain code owns authorization, validation, CAS, cost limits and completion.
7. Proposal production uses a narrowly typed, validated adapter to the existing TripProposal path. Never register arbitrary Trip writes, invoke confirm from an LLM, or remove ToolRegistry's protection wholesale. The user reviews the exact diff/revision before the existing atomic Patch applies it.
8. Rebuild native conversation, work-progress and result presentation around these contracts. Existing auth/session invalidation, pending recovery, event replay, native Trip readers, map/knowledge adapters and entitlement readers remain candidates for reuse. Source existence is not integration evidence.
9. Paid value centres on deeper planning research, coordination and ongoing service. Direct subscription is an accepted product direction; monthly is the first packaging candidate. Final price, renewal period, quotas and sales activation are not frozen by this ADR. Existing 720h Pass/grant implementations remain legacy-compatible until an explicitly versioned replacement is validated. Commission never improves organic recommendation rank; partner relationships and coverage are disclosed.

## Scoped supersession

This supersedes ADR-0023's five-tab/default-Ask presentation and any requirement to sell only the non-renewing 30-day Pass. It supersedes ADR-0025's runtime v1 restriction to one fresh thread per task and clarification/repair-only continuation **only for a newly versioned assistant mode**. Old clients/wires keep their existing semantics. It does not rewrite either ADR's historical evidence.

TripProposal/diff/confirm/atomic Patch, actor isolation/RLS, consent and recipient checks, append-only migrations, licences, budget controls, deletion/rollback, legacy locale compatibility and official purchase validation remain in force. ADR-0026's confirmed-address proposal keeps its independent status and acceptance.

The [upgrade plan](../product/assistant-upgrade-2026-09-27/README.md) sets current upgrade sequencing ahead of conflicting historical rollout orders. Existing S1–S6 stages remain acceptance categories. This is still VPJ-00 #187, with tasks in the existing manifest; no duplicate program, goal queue, memory store or billing ledger is introduced.

## Alternatives

- Keep old screens and add memory text: useful as a bounded slice, insufficient for independent background tasks, persistent results and visible continuity.
- Replace UI and reuse domain core: selected; it permits a visibly new product while retaining required transaction and identity semantics.
- Replace the entire application and backend: not categorically forbidden, but requires a concrete incompatibility and a scoped replacement/migration proposal. Sunk cost is not the reason to retain code; verified invariants are.
- Copy Muse's per-user VM, open browser and self-authored tools: deferred. Initial planning work uses bounded adapters; no general computer access is required to prove delegated work.

## Delivery and rollback

The [experience contract](../product/assistant-upgrade-2026-09-27/EXPERIENCE.md) defines observable results, and the [architecture contract](../product/assistant-upgrade-2026-09-27/ARCHITECTURE.md) defines versioned seams. VPJ-77 validates an interaction specimen; VPJ-78…83 and revised existing tasks deliver production consumers. Prototype visuals never count as provider, background or memory proof.

Activate new producers/readers behind versioned capabilities, retain compatible old clients, and switch the shell only after its complete supported path works. Rollback disables new execution/entry points and preserves accepted work, confirmed Trips, artifacts and revocations; a fallback must still let the user read or cancel in-flight new tasks. Never rewrite applied migrations or resurrect forgotten memory. Any unsupported legacy read must report upgrade-required rather than erase fields.
