# IOS-CHAT-MUSE-20261014 composer

Owned slice for IOS-001 / #203 / #187. Base: `945a16094c62914f4922fec910cdb48b7ab3cc2e`.
Branch: `codex/ios-chat-composer-20261014`. Integration target: `codex/ios-chat-muse-main-20261014`.
Target model Sol / medium was supplied in the dispatch; effective configuration is not exposed by this session's tools and was not verified.

## Integration contract

```swift
NativeMuseChatComposerView(
    state: state,
    onAttach: { /* Chat's attachment explanation sheet */ },
    onExpression: { /* Chat's expression route / unavailable explanation */ },
    onPlace: { /* Chat's place route / unavailable explanation */ },
    onVoice: { /* Chat's voice explanation sheet */ }
)
```

All four callbacks are required, with no silent defaults. The original Chat owner supplies functional routes/sheets and inserts this leaf using `.safeAreaInset(edge: .bottom, spacing: 0)` in the existing Chat scroll content. Main retains the outer NavigationStack/four Tab shell. Main must register the two new Swift files in the existing target as needed; this slice does not edit PBX. The example comments above describe required host behavior, not working callbacks.

Placeholder is exactly `开始聊天`. Plus opens a native Menu with attachment/expression/place sample actions. Each tool clears composer focus before invoking its host callback. Empty/whitespace draft shows voice; other input shows send. Button and single-line Return submit through the same guard, call the existing `state.submit()` exactly once, then clear focus. The keyboard toolbar's `完成` clears focus without submitting. No truncating setter or local copy of the shared draft is introduced.

The guard counts original extended grapheme characters before trimming, refuses >2000, and refuses loading/failed. Thus 2000 spaces plus a nonspace character cannot bypass the length bound. State still owns its existing trim/append behavior; this leaf does not mutate screenState, messages, or business state. Tools do not request microphone/file permissions or use a network. The host retains the overall local-sample boundary and unconnected-service explanation.

Touch areas for plus/voice/send are 44×44. Body text follows Dynamic Type; the text field can compress horizontally and retain/scroll the full single-line draft. Capsule height grows with its text. The bottom inset is supplied by the host; there is no screen overlay, independent navigation shell, keyboard safe-area override, or separate tool row.

## Verification

Run `sh tests/contract/ios-chat-muse-composer/verify.sh`; captured output: [validation.txt](validation.txt).

- PASS: 11 executed input scenarios covering empty/Unicode whitespace, raw 2000/2001, padding overflow, emoji/combining characters, blocked send.
- PASS: real iOS Simulator 27.0 SDK targeted typecheck, deployment target iOS 17, Swift 6 / strict concurrency, with actual AppTab and current base NativeFrontendState.
- PASS: the same targeted typecheck against exact Main dependency `fedd8de8a70f6f014d41d3c3176dc6a9e6e47f71`, obtained read-only with `git show`. Shared state was not edited or cherry-picked in this owner branch.
- PASS: Swift parse and diff whitespace checks.
- Source inspection: one guarded submit call, focus clears before all tool callbacks, no draft clipping, no shell/provider/permission code.
- UNRUN: App target/PBX integration, small-screen and accessibility-size render, Return/keyboard dismissal runtime, actual Menu accessibility traversal, four-Tab overlap and VoiceOver. These remain Main's combined app/simulator checks; no simulator or shared DerivedData was used here.
- UNRUN: real attachment/voice/provider capabilities; outside this local presentation slice. #203 is not closed by this delivery.

Return handling follows Apple's [TextField](https://developer.apple.com/documentation/swiftui/textfield) and [onSubmit](https://developer.apple.com/documentation/swiftui/view/onsubmit(of:_:)) APIs; SDK compilation establishes availability/type correctness, not UI runtime acceptance.

## Scope and rollback

Writes are confined to `Features/Frontend/ChatComposer/**`, `tests/contract/ios-chat-muse-composer/**`, and this artifact directory. No Chat, Root, shared state, PBX, assets, DB/Auth, provider, credential, production, or resource changes. PR697 remains frozen and untouched. Main can revert this additive slice and its future host callsite; no migration or persisted data is involved.
