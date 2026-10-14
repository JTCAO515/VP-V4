# IOS-CHAT-MUSE-20261014 sidebar evidence

Owned slice: `ChatSidebar/**`, `tests/contract/ios-chat-muse-sidebar/**` and this artifact directory. Related to IOS-001 / #203 / #187; no parent Issue closure.

Starting branch `codex/ios-chat-sidebar-20261014`, clean base `945a16094c62914f4922fec910cdb48b7ab3cc2e`. Main-authorized single-file dependency `fedd8de8a70f6f014d41d3c3176dc6a9e6e47f71` was cherry-picked as `2603c792`; no additional edits to shared state. Original Main / PR697 were not changed.

## Result

`@MainActor NativeMuseChatSidebarView(state:onClose:)` renders drawer content only, up to 320 points wide. New conversation, local history selection and close controls are buttons with accessibility identifiers. Current selection is visible and has the selected accessibility trait. History titles come directly from `state.localConversations`; no dates or fabricated progress are appended. New and history selection call the Main state method synchronously, followed by `onClose()`, including selection of the current row. The Chat owner supplies the drawer overlay and dismissal.

The persistent heading and each row identify local sample history and explain that real history services are not connected. No model/Agent/mode chooser, separate store, persistence, networking or outer navigation shell was added.

## Actual verification

- PASS: `bash tests/contract/ios-chat-muse-sidebar/check.sh`: Swift parse, actual iPhoneSimulator SDK typecheck targeting arm64 iOS 17 under Swift 6, then a compiled macOS executable using the actual Main `NativeFrontendState.swift` and `AppTab.swift`.
- PASS: contract checks for initial quiet conversation; idempotent new on already empty state; new conversation from a populated state; title from user content; selecting current and unknown IDs; local historical messages; draft/context/pending-confirmation restoration across switches; preservation of journey selection, material selection/saved flag, memory and assistant identity. No mirror state implementation or transport stub.
- PASS: implementing-owner source/diff inspection confirms callback ordering, explicit local boundary, immutable list consumption and no forbidden paths written beyond the explicitly authorized dependency cherry-pick.
- PASS: `git diff --check` during the verification command.
- PASS: `pnpm docs:check` (existing documentation baseline and archived plan checks).
- Toolchain observed: Apple Swift 6.4 / swiftlang-6.4.0.34.1. Effective chat model/reasoning/service tier fields were not exposed and were not asserted.

## Remaining integration evidence

- UNRUN here: full App build, PBX inclusion, drawer overlay interactions, visual/dynamic-type/VoiceOver runtime verification and original-reference comparison. These belong to Main's integrated target; no simulator or DerivedData was borrowed.
- UNRUN: real Session/Auth/provider/persistence/device/release acceptance. This local presentation slice neither exercises nor claims them.
- Integration: Chat owner instantiates `NativeMuseChatSidebarView(state: state, onClose: { /* close drawer */ })`. Main owns PBX registration if needed. Cherry-pick the sidebar feature commit only when `fedd8de8` is already present.
