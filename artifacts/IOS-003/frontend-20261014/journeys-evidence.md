# IOS-003 / IOS-004 local Journeys frontend

Authorized resumption: Main's explicit Muse-reference frontend dispatch; original paused work/lease retained. Starting branch `codex/ios003-place-ui-20261014`, clean HEAD `77ab3209185ef82d207ef5c7e51427f955ee1dc6`.

## Integration contract

- Main's single-file interface commit `de0ce108aab1df832913a2b9103f10977443c6af` was cherry-picked precisely as `0445b234`; no whole branch merged, and interface bytes were not edited. Main must not re-pick this interface.
- New sole-owned source: `ios/VisePanda/VisePanda/Features/Frontend/Journeys/NativeFrontendJourneysView.swift`.
- Call `NativeFrontendJourneysView(state: state)` with Main's existing `NativeFrontendState` reference inside Main's existing NavigationStack. Main owns PBX registration of the one new source. No root/route/tab/shell/PBX changes made here.
- Existing place source/DEBUG factory remains `19fbb6d1`, reused directly as `NativePlaceActionsSampleExperience()`; the former selected-place production ports and invariants are preserved.

## Implemented interactions

Journey cards consume `state.journeys` and its IDs. Selecting a card opens that exact journey; shared `selectedJourneyID` supports chat-driven opening. Returning to the list clears local selection to prevent pushing the detail again. Missing journey/day is unavailable, with no fallback to another journey. Days use relative order and fixture titles, without invented dates or verified hours.

The overview shows a clearly local schematic, day links, same-journey chat (`openChat(context: journeyID)`) and original material (`openMaterial("sample-plan")`). A map explanation sheet dismisses back to the overview. Each day includes its sample focus, arrangement order, original place-action Sample entry, route explanation, same shared confirmation status and a separate explicitly non-transactional booked-status sheet. Checklist toggles are view-local, keyed by journey/day and do not verify or reserve anything. Route modes change their own explanation only; no supplier/position/duration/fare request or claim.

Every page uses `NativeFrontendBoundary`; shared empty/loading/failed/cancelled variants use `NativeFrontendStatePanel`. The root menu exercises these local states. Existing real domain/Today/read/write protocols, Session/Auth, stores, data, metrics, fees and providers are untouched.

## Actual checks

- PASS: first Git/dirty/branch/interface inspection, actual Xcode 27.0 and Swift 6.4, live #506 read (OPEN; full parent not closed).
- PASS: Foundation executable probe runs Main's actual Observation state for journey/chat/material ID continuity, invalid journey guard, loading/cancelled preservation, explicit return selection and reset; 2 new tests in `tests/contract/ios003-place-ui/journeys.test.py` (plus leaf identity/isolation contract checks).
- PASS: actual shared interface + new Journeys source + existing original place presentation typechecked against iOS17 Simulator SDK, Swift6/default MainActor, with both DEBUG and release conditions. Only an AppTab enum declaration was supplied as the missing Main-owned root type; no view/service doubles substituted.
- PASS: new source Swift frontend parse, diff inspection and `git diff --check`.
- Reused: prior place presentation tests/typechecking, exact unchanged source and the previously Main-integrated build of place/IOS005. That build does not validate this new Journeys source.
- UNRUN here: new full App/PBX integration build and rendered list/detail/day/return/sheets/locale/large-text/keyboard interactions. Main owns the central App/Simulator/DerivedData window; no shared resources touched and no App build repeated by this owner.
- UNRUN: real Today/confirmed-version rendering, accurate entities/address/navigation, real Auth/data/provider, booking, device/VoiceOver, signing/release. This is a local frontend fixture slice, not completion of #209/#506's original real-functionality acceptance.
