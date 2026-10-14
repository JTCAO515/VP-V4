# IOS-001 Muse-style connected frontend leaf

Restored scope from Main/JT on2026-10-14; own original WT/branch and all paused5 untracked/ignored artifacts retained. Main single-file interface de0ce108 was cherry-picked exactly as243aa53c; no parallel state, branch merge or shared root write. This interface commit is already owned/integrated by Main and must not be cherry-picked twice there.

## Main callsite

NativeFrontendChatView(state: frontendState, onOpenExpression: { /* Main sheet -> NativeFrontendExpressionView().environment(frontendState) */ }, onOpenPlace: { /* Main place sheet/route using the same state */ })

Outer NavigationStack, avatar toolbar, AppShell/AppRoute/AppTab/PBX and root callback presentation remain Main-only. This leaf declares no new tab/router/store, makes no service/model calls and uses no file/photo/microphone permission. Base lacks the two other leaf components; callbacks avoid copying them. Missing callbacks present an explanatory closable sheet rather than silent action. New source files exactly2: NativeFrontendChatView.swift and NativeFrontendChatSheet.swift in Features/Frontend/Chat.

All messages/draft/context/journey/material/confirmation state comes from the identical injected NativeFrontendState reference. IDs sample-plan and sample-shanghai are read from that store. Suggestions fill the same draft; actual submission calls state.submit. Library/journey actions call state.openMaterial/openJourney; context clear touches only shared chatContext. Return panel reads the existing shared confirmed flag and never invents fresh progress. Same-goal follow-up does not create another journey. Common NativeFrontendBoundary and NativeFrontendStatePanel are reused.

Confirmation sheet shows the actual fixture-only diff: current confirmation flag → confirmed local sample; existing day/content is explicitly unchanged. It requires pendingConfirmation and the same first/sample journey before state.confirmPlan. Cancel calls state.cancelPlan, preserving journey/content. It is NOT a real Trip diff, transaction or booking. Current state interface has no alternative plan content, so no invented day replacement is displayed.

Attachments list existing shared fixture materials, insert content into draft or open that exact material. Real PDF/screenshot lifecycle stays paused. Voice explicitly says no microphone/recognition and may insert visibly labeled sample text only. Both sheets close/return. Expression/place use Main callbacks and never choose a model/Agent. Chat input uses safeAreaInset above Tab,1..5 lines, scroll-dismiss, focus exit/Done and no fixed-width message cards. State chooser supplies ready/empty/loading/failed/cancelled; original common panel retry/cancel retains shared content. Accessibility sizes use reduced message indent; action rows use ViewThatFits to stack.

## Checks / limits

15 actual assertions compiled against Main’s exact NativeFrontendState and original AppTab: no-date literal input, same state/IDs across tabs, return context, same journey, explicit pending→confirm, cancel/no implicit confirm, unchanged material content, unknown ID guards, loading cancellation and coherent reset. PASS. Swift full leaf parse and targeted iOS SDK typecheck PASS, Swift6/minimum iOS17/Simulator27 SDK. Initial sandbox Observation macro plugin denial is retained in typecheck-r1; exact approved retry passes. No assertion or safety policy changed. Two later trivial edits select the existing same-type return panel when context exists and accurately label content reset; they do not change tested types/shared state.

Full App/Simulator render, keyboard/tab overlap, maximum text interaction, screenshots and UI smoke are Main-coordinated UNRUN here. No devices/ports/containers acquired, no root/PBX/shared source changes, no real services/user data/first_value/observations. No HTML original was located; design follows the approved light restrained card/spacing direction without claiming pixel fidelity to an unseen source. Original paused frontend source is not deleted/staged or mounted by this leaf.

Only the new Chat leaf/test/evidence commit should be integrated; do not merge the old branch’s unrelated unmerged preparation. No new PR is opened with that broad old history. Main owns the coherent App PR, formal review/CI and protected integration.
