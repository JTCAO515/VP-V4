# IOS-001 conversation fixed-copy locale repair

2026-10-15. Accepted base: `a76799149cec460e742ab101a8b8190512b24464`.
Tested source commit: `424b306ad2fa95abcfc3cf9cfffb8025552294a0`.
Branch: `codex/ios-chat-fixed-locale-20261015`.

## Result and scope

The three authorized Chat files now read the existing SwiftUI locale environment for fixed display copy. Chinese language variants keep the original Chinese; other language identifiers use English, matching the accepted fallback. There is no new transport, store, dependency, resource, or shared-file change.

| File | Localized display sites | Source SHA-256 |
| --- | ---: | --- |
| NativeMuseChatHeader.swift | 6 | `8196e9dcf5bc2b7b34791d6261a0a19c116f8704fd35d2cb405e40e1ac78126e` |
| NativeFrontendChatSheet.swift | 34 | `cd3d6aa7d047d7824905cfb7c2dc4fca8be2a839c94c5b688b3f9a1c963314ae` |
| NativeFrontendChatView.swift | 11 | `aa3cbcc39ceb094b15282afa657a8c8a5974e37cdef45c5e19ef08b515811117` |

Header accessibility, invitation title/close, context actions, user role, result explanations/actions, attachment/empty/unavailable/confirmation sheets, and fixed voice-sample explanations are covered. The voice sample body and inserted literal remain Chinese and byte-identical. Message bodies, persona, notice, material title/source/content, journey content, context values and drafts are unchanged. Confirmation guards and all button actions remain unchanged.

## Actual verification

- PASS: `xcrun swiftc -frontend -parse` on all three changed Swift files.
- PASS: actual Header and referral SDK typecheck with `-swift-version 6 -strict-concurrency=complete`, Simulator SDK 27.0, `-target arm64-apple-ios17.0-simulator`. No simulator or App build was started.
- PASS: one-off source preservation audit restored each `copy("zh", "en")` to its original Chinese argument and removed only the new helper/environment declarations. It joined the unchanged voice prefix/body and restored the confirmation status interpolation. All three restored files matched the accepted base exactly, including callbacks, identifiers, routing, layout and dynamic reads. The audit counted 51 fixed display sites and checked all English arguments are nonempty with no Chinese characters. No permanent mirror test was added.
- PASS: one-off Swift executable compiled the four production helper bodies verbatim; each returned the expected Chinese/English argument for `zh`, `zh-Hans`, `zh-Hant`, `zh_CN`, `en`, `en_US`, `ar`, `es` (32 probes).
- PASS: existing `sh tests/contract/ios-frontend-library-memory/verify-material-chat.sh`: 21 exact-ID/body/current-material/missing/deleted/unlinked/orphan/same-journey checks; search/save/navigation/correction/source/forget/restore contracts; Chinese/English action copy and verbatim payload preservation.
- PASS: `git diff --check`; manual diff review restricted changes to authorized fixed-copy hunks.

## Limits and continuation

UNRUN here: full ChatSheet/ChatView app-context typecheck, full App build, rendered English/Chinese flow, live locale switching, Dynamic Type layout and VoiceOver. Main owns the unified build/UI acceptance and simulator 8F; no other owner's simulator was used. Real provider, backend, device and release checks were not run. This repair does not close parent #203 or establish runtime acceptance.

The initial edit script failed at encoding parse before writes; explicit UTF-8 fixed it. A first SDK command containing temporary-cache `rm -rf` cleanup was rejected by automatic approval review; removing cleanup allowed the SDK check to complete. No permission/configuration change or resource cleanup was attempted. Execution environment reports unrestricted filesystem, network enabled and approval never; Git push succeeded using existing credentials. Effective model and tier are not exposed (UNKNOWN); no model configuration was changed.

Source stability: this report adds Markdown only. Reuse the source checks above while all three recorded source hashes remain unchanged. Main performs exact-head review, applicable CI and protected integration.
