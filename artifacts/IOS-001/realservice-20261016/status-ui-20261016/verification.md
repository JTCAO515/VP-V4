# VPV10-IOS-MUSE-UI-20261016 — NativeQA status UI

Code complete within the original NativeQA consumer domain. New branch `codex/p0-nativeqa-status-ui-20261016` starts from original delivered `f36ba13966c9b7490505981ef47584455e315070`; original branch/head preserved, initial worktree clean. No in-flight resources were inherited or started. Main owns integration after the base NativeQA PR.

Read the complete accepted report at `/Users/jtsm5p/Documents/Codex/2026-10-16/task-2/VP-Muse研究报告-2026-10-16.md`; actual SHA256 `a495a5ea202e6d3628a465866f1b6d59514d87574e2059f1913145d184b11c08` matched Main. This increment applies its immediate task-state guidance, not a full Muse clone or source-attachment pixel/font specification.

## Product result

- NativeQAWorkPresentation is a pure zh/en meaning/action mapping; NativeQAWorkCard renders semantic type, icon plus explicit text, a multiline primary action and the existing VP theme. Icons are decorative, headings have header traits; content scrolls without fixed heights or text-size caps. Status is conveyed by words as well as semantic tones.
- First visit gives an explicit sign-in or service-notice step; consent remains user-triggered against exact reviewed notice. Required/withdrawn/changed notice stays fully readable. Previously accepted notice and saved sessions can collapse. Empty sessions give Start a conversation; no invented question/result/task.
- Accepted/pending explicitly says unfinished. Partial, clarification, blocked and technical failure remain distinct, with same-session continuation or readback as appropriate. Answer saved is displayed only for a protected persisted `answered` message already accepted by the original Store gates; never for local submission/unknown/partial.
- Unknown and reconciliation offer only Check result as the primary action, calling original readonly refresh/recover. There is no Resend, not-submitted/free promise, percent or ETA. Reconciliation does not auto-poll; ordinary proven pending retains the original visible foreground polling behavior. Unconfirmed command identity, bytes, notice and receipt rules are unchanged. No cancellation-success promise was added.
- Private notice/history/input still render only under the original live scope+visibility gate. Pending/recovery states do not expose session-switch/new-session/input actions. All original `native.qa.*` selector names remain on their corresponding controls/content; new helpers add `native.qa.choose-session` and `native.qa.continue` without changing the View initializer or stable transport contract.

## Actual draft defect, RED/GREEN

The suggested causal chain was checked: `refresh()` itself does not call activate and already preserves a manual-check draft. Actual failure was repeated `activate(true)` under the same live scope/foreground calling invalidate unconditionally. The RED run executed19 tests with exactly1 failure: `testRepeatedForegroundActivationPreservesSameScopeUnsentDraft` saw empty string instead of the original synthetic unsent thought. Manual refresh and scope-change negatives passed.

Fix: same active foreground and exact bound scope now calls original refresh without invalidating. No draft is snapshotted/restored across an await, so later edits stay newer. Different actor/endpoint/epoch/process generation or background/disappearance still uses original invalidate/clear/cancel. No cross-scope private text is restored. Tests cover manual refresh preservation, repeated same-scope activation, later edit during the read, changed generation clears, and original background clearing. Original unknown command bytes are untouched.

## Actual verification

- PASS: final `python3 tests/contract/ios-realservice/run_consumer.py`,23 XCTest methods,0 failures,0 skips. Actual new product Contract/Store/WorkPresentation and original NativeDataScope definition compile in a private temporary SwiftPM module; transport is explicitly synthetic. Tests include original strict16 plus draft/state-copy checks, all7 terminal/message statuses in zh/en, unknown/reconciliation readonly action, no false saved result, explicit notice/withdrawn state, foreground cancellation and scope/byte/receipt gates. These are not real Auth/provider tests.
- PASS: final actual NativeQA source set including SwiftUI WorkCard/View, unchanged original Theme/Scope, Swift6 iPhoneOS SDK arm64 iOS17 typecheck using a disposable private module cache. No App build, simulator or DerivedData resource used.
- PASS: git diff whitespace and allowed path review; NativeQAContract.swift equals base byte-for-byte. Stable source was early delivered at cd95ebbe; the final small delta prevents reconciliation auto-poll and adds evidence.
- UNRUN: Main App/PBX registration for the two new files, actual new UI rendering/maximum Dynamic Type/VoiceOver, true target Auth/provider/session persistence and physical iPhone. Main owns integrated build/AX validation; original129 matrix was not rerun.

Only original new NativeQA domain, its dedicated tests/runner and own evidence changed. Root, NativeSession, PBX, old Ask, old Frontend/Chat/headers/gift/assets/navigation, server/SQL, config/flags, credentials, actual POST/provider/fees, deployment, signing/TestFlight/device and Main8F were untouched. Main must register NativeQAWorkPresentation.swift and NativeQAWorkCard.swift in its sole PBX scope. No shared patch is needed from this owner; public View/transport declarations remain compatible. Stable handoff then STOP; no agents/chats/automations were created.
