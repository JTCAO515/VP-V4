# IOS-001 NativeQA message reading surface

Authorized task: VPV10-IOS-MUSE-UI-20261016, related #203/#681. Owner branch `codex/ios-qa-message-cards-20261016`; base `407082fd3f6d3094129edb71bc17cd212fc15a04`. Initial implementation `030fd113`; Main requested removal of animation polling, implemented in the final correction commit. Only the two new `NativeQAUI/Messages` sources and the one dedicated test are product changes. Main owns ServiceView/PBX/root integration. No new Task, Result, queue, transport or persistence.

Accepted report read in full and SHA verified: `/Users/jtsm5p/Documents/Codex/2026-10-16/task-2/VP-Muse研究报告-2026-10-16.md`, SHA256 `a495a5ea202e6d3628a465866f1b6d59514d87574e2059f1913145d184b11c08`. Its unseen Muse pixels/assets are not implementation specifications.

## Main integration contract

`NativeQAMessageCard(message:expectedSessionID:isCurrent:chinese:)` takes the original persisted `NativeQAMessage`. `isCurrent` is an explicit `@MainActor () -> Bool`. Keep the original parent observable scope/scene/visibility/consent guard and pass a closure that **reads current authority** each call, comparing captured scope and expected session against the current Store. Include `store.hasReadableProjection`, scope equality, `store.selectedID == expectedSessionID`, consent accepted and parent visibility. A cached Boolean or `{ true }` is not a product gate. Register the two new App sources and one test only in Main's PBX.

The card calls `NativeQAMessagePresentation.resolve` directly in SwiftUI `body` rather than retaining a projection in State. The resolver reads live authority before validation and again before returning. It rejects invalid expected-session UUIDs and every original `message.valid(sessionID:)` failure before projecting either input or output. Main clarified “each frame” to mean each body presentation, without animation/timer polling. Observable authority reads in the live closure participate in body observation. Opaque non-observable changes must explicitly trigger a parent update; a closure cannot itself notify SwiftUI. Keep the original parent scope/selected-session/scene visibility guard and onDisappear invalidation. No rendered/frame timing acceptance was performed here.

The initial animation-timeline guard was removed at Main's request before final delivery. The earlier Apple documentation check established timeline cadence is system-controlled, and does not supply a privacy guarantee; no timeline or timer remains in final product code.

Identity is presented as separate native headers: You / 你, then VisePanda. Text uses semantic body/subheadline/headline fonts, dynamic theme colors, vertical expansion and no line truncation or fixed content height. Status includes an icon and explicit text; no color-only semantics or fictitious spinner/progress. `native.qa.answer.<id>` and `native.qa.message-status.<id>` remain; question/detail identifiers are additive. Existing app navigation/header/gift/assets are untouched.

| Original message status | Chinese / English title | Meaning |
| --- | --- | --- |
| pending | 处理中 / Processing | Not completed; no invented steps or time |
| reconciliation_required | 结果未确认 / Result unconfirmed | Check saved state before sending again |
| answered | 回答已保存 / Answer saved | Only this persisted status uses the saved-answer claim |
| partial | 部分回答 / Partial answer | Incomplete parts remain explicit |
| clarification | 需要补充信息 / More information needed | Read question and supplement this session |
| blocked | 暂时受阻 / Blocked | No completion; check service notice/state |
| technical_failure | 服务出错 / Service error | Technical failure, separate from unknown |

Unknown status strings fail original DTO decoding; no local invented `.unknown` result. The original Store-level unknown/pending-journal surface remains Main's responsibility. Optional blocked/failure text is displayed exactly when present; no substitute answer is created. No Trip/save-to-Trip/booking/export/share/cost or source claims are added. `Text(verbatim:)` presents Markdown/code/URLs as text, without loading images, parsing executable code, opening links, copying or sending. DTO strings remain byte-identical in the projection; this does not claim pixel-level whitespace preservation by the system renderer.

## Verification

Run `python3 artifacts/IOS-001/qa-messages-20261016/verify.py` in this WT. The script copies exact production Contract/Presentation and extracts the original NativeDataScope definition unchanged into a temporary SwiftPM module. No dependencies installed, no simulator/device/App/DB/provider/credential access. Logs and SHA pins are beside this file.

- PASS: six Swift Testing functions (one parameterized across seven statuses), zero failures, zero skips; final compiler log has zero warnings. XCTest's zero-test preamble is separate from the actual Swift Testing result. Covers bilingual state facts, absent blocked/failure response, 13 malformed/foreign-session DTO variants plus invalid expected UUID, live gate revocation/recheck, long Chinese/English/decomposed Unicode/emoji/literal markup UTF8 bytes, unknown-status decode rejection.
- PASS: actual original Contract + Theme + new Presentation/Card + exact extracted Scope, Swift language mode 6, strict concurrency complete, actual iPhoneOS SDK 27.0, target arm64 iOS 17.0. Typecheck only; no App link/build or simulator used.
- PASS: source-only rendering guards confirm direct body resolver placement and no timer/timeline/task, verbatim payload Text and existing AX identifiers, absence of selection, links, remote images, tasks and fixed line limits. This is source inspection, not UI runtime evidence.
- PASS: changed-source diff review and `git diff --check`.
- Initial FAIL retained: test compile lacked explicit MainActor type on stored gate closure. Fixed test annotation, then replaced mutable captured local with MainActor test reference to remove capture warning. `initial-test-compile-failure.log` and `initial-pass-with-test-warning.log` preserve both stages. Production types required no compile fix. Main later requested removal of TimelineView; final body directly reads the live gate, with unchanged signature and no polling.
- UNRUN: App integration/build, rendered large Chinese/English/Dynamic Type, dark mode, VoiceOver reading order, immediate frame-level revocation behavior, real Auth/provider/persistence/device/production/TestFlight. Main owns integration and shared simulator; no fake pass inferred from synthetic tests or SDK typecheck.

Requested Sol6.1/medium; effective model configuration not exposed, UNKNOWN. At completion STOP, no in-flight tool or planned work, lease retained. No successor task or agent created.
