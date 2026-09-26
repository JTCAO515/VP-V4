# VPJ-25 T1 native Today preparation · 2026-09-24

Related to #506 and parent #215. Base: `origin/main` at `8002bb69`. Scope: native Trip → Today read-only consumer. No Trip writer, provider lookup, cache, entitlement gate, or shared Wiki/server/knowledge change.

## Result

- The confirmed Trip exposes a Today link. Today refreshes the same owner-scoped native Trip detail before showing its version, the current or next dated schedule, and a preparation-check link bound to that Trip version.
- No dates, no scheduled items, completed dates, incomplete dates/time zones, and failed online reads have distinct states. A failed refresh does not show an earlier detail as a current online result. Item titles remain readable without a map or image.
- The current confirmed Trip contract has no saved Chinese-address field and no persisted preparation result. Today says so explicitly. A Chinese address included in an item title remains visible as title text, but this does not satisfy a structured address or versioned place contract.

## Checks

| Check | Result | Environment |
| --- | --- | --- |
| `git diff --check` | PASS | local worktree |
| `pnpm docs:check` | PASS | local worktree |
| `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj` | PASS | Xcode 27.0 |
| `xcrun simctl list devices available` | PASS | iOS 17.5 and 26.5 runtimes available |
| `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/vpj25-t1-derived CODE_SIGNING_ALLOWED=NO` | PASS | local simulator SDK; no device runtime assertion |
| `xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=B0AD77FD-33C3-4616-92CE-2E76ACD93148' -derivedDataPath /tmp/vpj25-t1-derived -only-testing:VisePandaTests/NativeTripStateTests CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-` | PASS · 12 tests, 0 failures | iPhone 15 Pro, iOS 17.5 simulator; deterministic tests |
| Web `pnpm check`, unit/contract/e2e | NOT APPLICABLE | No Web, server, or shared contract changed |

## Integration and acceptance

- UNRUN: authenticated Staging and Web/native same-version readback after an actual confirmation. This worktree has no scoped test identity supplied for #506.
- UNRUN: physical iPhone interaction and accessibility observation.
- UNRUN: expired Pass/insufficient quota readback with a real account. The Today read path introduces no entitlement gate; this is source behavior, not target-environment proof.
- NOT MET: a separately saved Chinese address on the confirmed version. `TripContentRead` currently has day/item title/time only; `trip_place_references` is not version-bound and carries no saved address. The producer/contract needs an owner-coordinated extension before #506 can claim this acceptance criterion.
- NOT MET: T2 offline snapshot, lease and logout isolation; parent #215 remains open. Today currently reads online and makes that limit visible.

Rollback: remove the Trip → Today link and native read-only consumer. Existing Trip versions and additive history remain unchanged.

## 2026-09-26 continuation on main `ac16545c`

- Merged current main into the PR branch without conflict. Rechecked #506/#215 and PR #551 ownership. The Today read remains on `api/trips/native/v2/[tripId]` through the existing `NativeTripStore`; it does not depend on unmerged #551 code.
- Changed the Today label to show the time of its last successful online read and ask for an explicit refresh. Holding the screen open does not imply ongoing connectivity or background monitoring. If the shared Trip store clears or changes its selected version, Today hides its earlier in-memory detail.
- PASS: current Xcode 27 simulator build and `NativeTripStateTests` (13/13, iPhone 15 Pro iOS 17.5). Earlier PR head `4560404e` had all repository checks green; that CI result does not apply to the new branch head until the new checks complete.
- #551 concurrently edits `NativeTripStore`, `NativeTripView` and `NativeTripStateTests`. This branch adds no store change. The Today test was moved away from #551's insertion point to reduce merge overlap; final integration must still resolve any Git conflict if #551 lands first and rerun affected native checks.
- Chinese address remains NOT MET: neither the native v2 confirmed Trip snapshot nor its closed `upsert_item` patch has an address field. `trip_place_references` has no confirmed-version/item binding or saved address text. A future producer change must carry user-confirmed address text through proposal diff and atomic TripPatch, preserve older clients, and expose that exact version to Today; unconfirmed provider observations cannot fill this gap.
- Preparation remains a request-local, expiring check. Today opens it with the current Trip version and does not claim a persisted readiness state.
