# VPJ-77 native interaction specimen

This is an **offline fixture** entered only with the iOS launch argument `-VPJ77Specimen`. Every screen shows `FIXTURE · Offline example · No save` (or its Chinese equivalent). It proves presentation and tap flow, not persistence, background work, Memory use, Trip changes or release readiness. The shipping five-tab shell remains in place until the four-tab consumers and old-entry mappings have real sources. This specimen makes the intended four-tab shell reviewable now.

Run on Simulator by launching the `VisePanda` scheme with `-VPJ77Specimen` and optionally `-VisePandaLocale zh-Hans` or `-VisePandaLocale en`. The scripted path is VP → compare two directions → delegate → simulate return → open `fixture-artifact-1 r1` in VP/Journeys/Library/search → Memory correction → VP context cue. The return control is a **local state transition**, not an app-close or worker test. The keyboard field is intentionally non-sending.

## Visible state and click contract, version 0 fixture

These are component inputs/operations to freeze for consumers; they are not a wire schema. VPJ-78/79/80/#199 own authoritative IDs, versions, storage and validated commands. Real clients must derive every action from a permission-checked producer and its current revision. An absent/unknown producer never becomes success.

| Surface | Minimum visible input | Tap meaning | Safety condition |
| --- | --- | --- | --- |
| Message | stable message reference, role, text, source relationship and delivery state | Open referenced task/artifact or compose another message | Plain short answers render as prose; no arbitrary model HTML or inferred task assignment |
| Task | owned task reference, deliverable/scope, state, update cursor and optional result reference | Open activity/result; submit a separately validated amendment or cancellation | Accepted/queued/running/waiting input/waiting confirmation/completed/failed/cancelled/unknown remain distinct; no guessed percent or local completion |
| Artifact | owned ID, immutable revision, content kind, currentness, basis references and allowed typed actions | Open the **same** ID/revision from VP, Journeys, Library or search; select/edit a draft | Compare/draft/decision/practical result is not confirmed Trip or booking; stale/withdrawn revisions cannot confirm |
| Memory | source authority, scope, value, revision, state and applicable result basis | Correct/pause/forget through the authoritative service; show versioned receipt and scoped undo | Profile owns existing pace fields; Memory owns other explicit facts; local edit or uncertain write never says “saved” |

Presentation components use semantic roles: `fixtureBanner`, `conversation`, `taskStatus`, `resultCard`, `scopeNote`, `safeAction`, `memorySource`, `confirmationBoundary`. These roles map to existing `vpBackground`, `vpSurface`, `vpBrand`, `vpSecondaryText` and Dynamic Type rather than fixed pixels. Product styling may iterate without changing state semantics. The specimen uses `AssistantSpecimenMoment` only for local scripted navigation. No consumer should import it as a business state machine.

| Result/state | Component behavior | Click boundary |
| --- | --- | --- |
| Short answer | concise text | related task only if producer supplies a valid reference |
| Comparison | alternatives, tradeoffs, assumptions | selection updates an owned draft, not Trip |
| Draft | preserved choices, changes, unknown facts and revision | prepare a typed proposal through the real adapter |
| Pending confirmation | exact proposal/diff, affected revision and consequence | confirm only through existing TripProposal → visible diff → same-revision atomic Patch |
| Failed | reason and safe retry scope | retry via task producer after policy/basis check |
| Unknown | unresolved authoritative state | reconcile; no blind retry or success claim |
| No update | explicit continuity with no new result | keep prior result accessible; no invented activity |

## Integration seams

1. VPJ-78 supplies owner-scoped conversation/message/task association and ordered event cursor. Replace the local moment transition only after a validated acceptance receipt exists.
2. VPJ-80 supplies durable task state, update and failure/unknown handling. Returning to the app must read server authority, not `@State`.
3. VPJ-79 supplies permission-checked immutable artifact ID/revision shared by VP/Journeys/Library/search. `fixture-artifact-1 r1` is deliberately not a real ID.
4. #199 supplies Profile/Memory authority and versioned correction/undo plus affected-result invalidation. The local text change is only an interaction illustration.
5. VPJ-83 relocates real Trip/Today/map/tools/account/privacy/purchase and old deep links into the four-tab shell. Global search must distinguish eligible external content from private owned results.

No schema, RLS, payment, publication or data write is added here. Remove the launch-only specimen once production consumers and navigation pass their own acceptance; rollback of this slice is a revert of the specimen and launch branch.
