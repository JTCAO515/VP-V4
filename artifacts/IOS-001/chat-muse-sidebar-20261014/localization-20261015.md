# IOS-CHAT-MUSE / #203 sidebar zh/en

Exact input: QA `4ff26a2889b841de594f8ba34ebd6e6388abacb1`; original clean sidebar HEAD `dc37d73e94d6c843aa3af89bf0b568173a8b1bd2`. Fetch succeeded. Read-only merge-tree preflight found no conflicts; normal merge accepted the exact QA commit, with zero tree diff against QA before this repair. Original branch/worktree and prior commits remain intact.

Official project inventory confirms VP - V10 project ID `4f2191db-3e04-4042-94b5-ec94ff67b427`, path `/Users/jtsm5p/Documents`. This inventory does not independently expose the calling chat membership. Local read/write, Swift parse/compiler invocation, Git fetch and commit tools were actually available; model/reasoning/service-tier effective fields were not exposed.

The already-registered sidebar source consumes `@Environment(\.locale)`. English locale language codes select English static copy; Chinese text and the existing non-English fallback retain the original Chinese strings. Ten pairs cover Chats, New chat, local history heading/boundary, current/sample labels, empty history, close accessibility label and both action hints. Existing accessibility IDs, 320-point width, maximum-Dynamic-Type scrolling layout, conversation IDs and callback order remain unchanged. The additive empty-history message has ID `frontend.chat.sidebar.empty`.

Conversation titles use `Text(verbatim: conversation.title)`. No comparison, replacement or translation of user title/message/draft values occurs. No state, transport, persistence, shared catalog, PBX or other owner source is modified.

## Verification

- PASS: leaf `xcrun swiftc -parse`.
- PASS: `python3 tests/contract/ios-chat-muse-sidebar/localization-check.py`: extracts and compiles the actual leaf locale method, with Foundation only; checks ten actual copy pairs for en, en-US, en-GB, zh-Hans and zh-Hant. Also checks verbatim title rendering and original start/select → onClose order. This is pure locale logic/source evidence, not rendered UI evidence.
- PASS: implementing-owner diff review and `git diff --check`.
- UNRUN: full leaf SDK/App/simulator/VoiceOver/max-size/combined locale behavior, owned by Main. No simulator or DerivedData borrowed.

## Shared title provenance gap for Main

QA's `NativeFrontendConversation.title` contains both generated Chinese titles (initial/new `新对话`, seeded history `上海漫步 · 本地样例`) and user-derived titles, with no provenance field. This leaf preserves all of them exactly as required; an English UI can consequently show Chinese conversation content. Do not infer provenance from title equality or conversation ID (a seeded conversation can later receive a user-derived title). If Main wants generated titles localized too, supply an explicit read-only title-origin discriminator, e.g. generated-new / seeded-history / user-content, updated when `saveActiveLocalConversation` adopts a user message title. The leaf can then localize only explicit generated/seeded origins while retaining user text verbatim. No shared source was edited here.
