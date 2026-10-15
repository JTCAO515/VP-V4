# IOS-003 Journeys locale repair — 2026-10-15

Isolated WT/branch `ios003-journeys-locale-20261015` / `codex/ios003-journeys-locale-20261015`, base accepted QA `a76799149cec460e742ab101a8b8190512b24464`. Original canonical WT/head6b50 and its evidence/resources remain untouched. The abbreviated a767 was ambiguous; resolved full commit was used for normal worktree creation, no reset/old-branch merge.

Only existing `Features/Frontend/Journeys/NativeFrontendJourneysView.swift` and exclusive locale checks/evidence changed. Owner retains this original Journeys lease, with no successor/release or overlapping tool. No Root/route/PBX/shared state/helper/Ask/canonical/Reader/backend/SQL edits. Sol6.1/medium requested; effective fields not exposed.

All seven leaf views now use the inherited selected Locale and the actual accepted PR714 NativeLibraryMemoryCopy helper. Eighty-six fixed UI pairs cover list, navigation, missing/empty states, confirmation labels, state menu, detail/day/place entry, schematic disclaimer, route mode display/constraints, checklist actions, explanation and booking-status sheets. Route picker tags remain original stable values. NativeFrontendStatePanel calls remain for Main's serial shared-panel locale fix; this branch does not copy that component.

Dynamic journey titles/subtitles/day titles remain direct payload reads. Schematic sample marker content (城市漫步/江景/休息) and day-focus sample prose remain unchanged, as requested; English fixed UI may therefore surround original Chinese sample content. No Trip, Proposal, navigation identity, confirmation state or checklist scope semantics changed.

## Verification

- PASS: `python3 tests/contract/ios003-place-ui/locale/verify.py`: executes the actual PR714 helper for every one of the 86 fixed pairs across zh-Hans, zh-Hant, en-US, ar, ru and und (516 selections). Chinese family maps to Chinese, all other/legacy locales to English exactly as PR714.
- PASS: the same check reverses only the paired copy/title adapters and verifies the entire original business/action/ID/binding/payload token stream equals QAa767. Explicit payload expressions and original sample content remain present unchanged.
- PASS: existing `python3 tests/contract/ios003-place-ui/journeys.test.py`, 2 tests executing shared state cross-page IDs/cancellation/reset and leaf isolation; unchanged checks reused.
- PASS: changed source Swift parse, diff inspection, `git diff --check`.
- PASS: actual changed Journeys source, original shared state/AppTab, actual PR714 helper and original place presentation typechecked against iOS17 Simulator SDK in Swift6/MainActor for DEBUG and release. No new source registration required.
- UNRUN here: complete App/simulator English/Chinese flow and screenshots. Main owns the unified simulator acceptance. No canonical/backend/provider/device matrix repeated.

## Shared integration seam (not applied)

The existing DEBUG NativePlaceActionsSampleExperience factory still initializes its local language to Chinese, regardless of inherited Locale. A precise DEBUG-only before/patch/after candidate is in `place-sample-candidate/`, preserving the no-argument API and manual language selection, using inherited locale until a local override, and resetting the existing child on app-locale change as it already resets on manual language change. Main may apply/verify it within its serial scope. Production PlaceActions/canonical/pending interfaces are untouched by this proposal. The Journeys caller stays on its original API.

Related to #209/#506, not completion or closure of their broader real functionality. No self-merge. Shared-panel and place factory candidates plus actual UI verification are Main's integration responsibility.
