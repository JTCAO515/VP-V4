# IOS-003 place actions frontend

Owner: this sole-writer chat, branch `codex/ios003-place-ui-20261014`.
Base: `8731c54ed45940477672233cb9f96dc2c0996421` (clean at first inspection).
Scope: existing `ios/VisePanda/VisePanda/Features/PlaceActions/NativePlaceActionsView.swift`, new exclusive contract tests and this artifact. No shared Store/Identity/Trips/Journal/wire/Explore/navigation/PBX/locale/backend files modified.
Current live Issue: #209 `[IOS-003] 地点发现保存消歧和导航保持同一准确实体`, OPEN; this frontend slice does not complete the parent.

## Result

The existing selected-place view now shows the supplier original name and name source, separate VP/source IDs, explicit Trip selection, grouped Save/Ask actions, and a candidate panel with day/time/confirmation and visible disabled reasons. Route modes, supplier handoff/consent/billing, unknown timings/fares/accessibility and future-traffic limitations remain pending. No supplier call or route is fabricated.

The original Save/Ask/Add and original receipt/recovery/abandon/explicit-retry/Proposal review ports remain. The selected candidate and actor change clear local UI; locale participates in the read task key and invalidates the old context/time confirmation. Refresh/review return reset day/window confirmation. Durable original pending bytes are still owned by the original journal/store, unchanged.

The candidate form and route panel are reused by two isolated #Preview fixtures (Chinese and English accessibility3). Their Save/Ask/candidate diff/confirmation/cancel/unknown-result/recovery/reset interactions are memory-only and explicitly Sample / Unconnected. They do not instantiate a session, write storage, or request providers. Existing App navigation still calls the actual NativePlaceActionsView; no new shell or PBX registration is required.

## Actual verification

- PASS: local Xcode 27.0 (27A266a), Apple Swift 6.4, network `gh issue view 209`.
- Effective requested Sol/medium configuration: UNVERIFIED (no effective fields exposed).
- PASS: `xcrun swiftc -frontend -parse ios/VisePanda/VisePanda/Features/PlaceActions/NativePlaceActionsView.swift`.
- PASS: `python3 tests/contract/ios003-place-ui/presentation.test.py`: 3 tests. Executes the production Swift presentation enum (not a reimplementation): valid/invalid/missing/foreign day, explicit-confirm false, <=0/>24h/exact24h windows, busy and unknown-result dominance, all bilingual reasons. Source regression verifies original request pipeline and original receipt/Proposal construction remain verbatim (except receipt heading copy), scope/candidate/locale/expiry/reset fences and fixture isolation.
- PASS: actual appended candidate/route/Sample SwiftUI code independently typechecked using `xcrun swiftc -typecheck -sdk <iphonesimulator SDK> -target arm64-apple-ios17.0-simulator <temporary extracted presentation file>`. This is SwiftUI typechecking, not full App build or rendered preview evidence.
- PASS: `git diff --check` and implementing-owner diff inspection.
- UNRUN here: full affected App build, NativePlaceActionTests, rendered preview/simulator keyboard and large-text interactions. Main centrally owns App build/DerivedData/Simulator resources and has been sent the stable-source validation request. Existing Store tests were inspected for identity, stale/expired context, unknown ACK and original bytes/actor/cancellation; inspection is not an executed PASS.
- UNRUN: real Auth/data/provider, device/VoiceOver, signing/release. No such acceptance claimed.

## Remaining integration

Main may integrate this exact stable commit, execute affected App build/tests and simulator checks in its own window, and perform fixed-head review/required CI/protected merge. No self-merge or parent #209 closure. UI receipt expiry still follows the original source TTL and requires rereading; no new authority or source qualification.
