# VPJ-77 first slice verification — 2026-09-27

## Result and scope

Implemented a launch-only, offline native specimen for VP / Journeys / Library / Memory and global search. The scripted fixture runs first encounter → comparison → delegated queued task → simulated return → shared result reference → local Memory correction. Every page identifies the fixture. `fixture-task-1` and `fixture-artifact-1 r1` are invented specimen labels, never server IDs. The existing shipping shell and API/data authority are unchanged.

Start-to-reviewable-slice: approximately 20 minutes of this work session. Rework: one keyboard-focus defect found by the first UI run and fixed; a search-sheet presentation handoff was hardened before final UI validation. External waiting: none. This is not user acceptance.

## Checks

| Check | Result | Evidence / limit |
| --- | --- | --- |
| `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj` | PASS | Scheme and targets found |
| `xcrun simctl list devices available` | PASS | iPhone 15 Pro and iPhone SE iOS 17.5 available |
| `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO -quiet` | PASS | Native specimen compiled |
| `xcodebuild test ... -destination 'platform=iOS Simulator,id=3A81AB84-9493-46EB-A932-0F56A28EE339' -parallel-testing-enabled NO -only-testing:VisePandaUITests/AppShellUITests/testVPJ77FixtureJourneyAndMemoryCorrection CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-` | PASS | Latest search/result and correction path, zh/en; `Test-VisePanda-2026.09.27_02-06-21-+0800.xcresult` |
| Same test command with `testVPJ77FixtureRemainsReachableAtAccessibilityTextSize` | PASS | iPhone SE accessibility XXXL, Memory and search remained reachable; earlier `Test-VisePanda-2026.09.27_02-02-32-+0800.xcresult` |
| `pnpm docs:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:contract`, `git diff --check` | PASS | Local dependencies installed with frozen lockfile; after rebase onto `ea698082`, contract suite: 685/685 |
| First UI test before keyboard fix | FAIL, resolved | Memory keyboard obscured tab selection in zh/en. Focus is now dismissed by correction and keyboard Done. Subsequent UI run passed. |

Manual rendered inspection: [iPhone 15 Pro Chinese](iphone15pro-zh.png) and [iPhone SE English at accessibility XXXL](se-accessibility-en.png). These confirm fixture banner and four-tab layout on those snapshots. Automated taps confirm the named controls, not a human usability outcome.

## Unrun and limits

- VoiceOver spoken order and Reduce Motion/Transparency setting: **UNRUN**; simulator XCTest queried accessibility elements and large text but did not operate those OS modes. No accessibility acceptance claim.
- Physical iPhone, TestFlight, real app-close/restart, server task execution, persistence, Memory save/undo/recompute, Trip proposal confirmation and cross-client artifact reads: **UNRUN**. They belong to later producer/consumer and release slices.
- User observation of whether a traveller can find Memory, task and result without guidance: **UNRUN**. Scripted XCTest is not a user study.
- Full native test suite: **UNRUN** for this isolated fixture slice; focused UI tests and build exercised the changed behavior, while required CI remains the integration gate.

Rollback: revert this isolated PR to remove the launch argument, fixture view, UI test and documentation. No migration or user data is involved.
