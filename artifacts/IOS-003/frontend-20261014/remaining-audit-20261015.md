# IOS-003 / IOS-004 current remaining audit — 2026-10-15

## Current source and ownership

Original WT/branch `ios003-place-ui-20261014` / `codex/ios003-place-ui-20261014` was clean at `c94783a60e58e068d598900b844c385858c37d04`. PR691 is CLOSED integrated, not reopened. Latest unique HANDOFF/DEVELOPMENT-RULES and live #209/#506 were read. Main exact source inspected at `9cfff2f96b93c20c430f8988e8737448de40495c` in agent-main-20261014; the older ios-main WT is not the current integration authority.

Main's Journeys source blob `cfae8efa357fe78553b6f22dba4482a3d1a9bdd8` and PlaceActions source blob `814e49e5656e6ea2e1fe9238eeb769e712400061` match this owner's delivered bytes exactly. Existing navigation, same-ID chat/material links, unavailable-object/day guards, local checklist, route/booking explanations and production place actions are not reimplemented. AppRoute already mounts both local Journeys and the original place experience. Main's shared frontend state has newer accepted continuity logic; this owner does not modify it.

Preserved original branch; normal new branch `codex/ios003-pending-confirm-20261015` created at exact Main9cfff without reset/merge of the old branch. Effective model/tier remains unexposed; filesystem/source writes and ordinary Git/gh tools worked. No shared simulator/DerivedData resource was operated.

## One concrete source correction

In the existing DEBUG place Sample, open a candidate diff, then switch on the unknown-result toggle. Save/Ask/Add already stop, but the existing Confirm button lacked the unresolved-result disable and could still set the local result to confirmed. Added `.disabled(unresolved)` to that button. This is an existing Sample interaction defect, not a real Trip/Proposal authority defect or a new scenario/helper. Cancel may still close the review; original-result recovery clears the sample unresolved flag before confirmation can resume. Reset remains explicitly local.

PASS: actual changed file Swift frontend parse; actual production presentation plus DEBUG Sample typechecked against iOS Simulator SDK with Swift6/default MainActor; implementing diff inspection and `git diff --check`. No new mirror test or repeated unchanged matrix was added. UNRUN: rendered unknown-result/confirm/recovery interactions; Main owns the simulator and has the exact reproduction path. No App build repeated here.

## Remaining boundaries, not additional leaf work

- #209's broad real entity/navigation acceptance is still OPEN. The present `NativePlaceCandidate` input contains provider/provider ID/rawName/canonical ID, not bilingual aliases/city/entrance provenance. This view explicitly marks unavailable details; it cannot invent them. Shared models, Explore/map/route suppliers and source qualification remain with their existing owners/Main. Existing real route/search/address consumers are retained; target/provider/device results require separate evidence, not another local fixture.
- #506's real structured Chinese address remains absent from `Features/Trip/NativeTripModels.swift`; `Features/Today/TodayView.swift` explicitly shows `today.address.unavailable` while keeping confirmed item text visible. The original Today empty-date/item/incomplete states exist. Completing structured address requires the accepted same-Trip/version-qualified producer/wire and coordinated domain lease before a native consumer can render it. This owner has no write lease for Trip/Today/models/server/SQL and supplies no speculative schema patch.
- Main is doing the applicable current UI acceptance; no source-wide/provider/QA blanket gate was invented. Existing native/source checks and already-integrated unchanged proofs are reused. Real entity/address/navigation/Auth/device/VoiceOver/signing/release remain separately unverified.

After this one-line correction, no additional missing implementation was identified in the currently authorized Journeys/PlaceActions presentation scope. Do not count this read-only audit as an ongoing product implementation line or create replacement helpers to fill concurrency. Original lease and old evidence remain preserved; #209/#506 are not closed by this correction.
