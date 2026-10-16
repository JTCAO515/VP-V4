# NativeQA composer verification

Product source commit: `b4be75fa`. Base: `407082fd3f6d3094129edb71bc17cd212fc15a04`.
WT: `/Users/jtsm5p/Documents/Codex/VP-V10-worktrees/ios-qa-composer-20261016`.
Branch: `codex/ios-qa-composer-20261016`. Related: #203 / #681.
Requested model: Sol 6.1 / medium; effective model and tier: UNKNOWN (not exposed).

## Scope and integration

Only two new product Swift files under `NativeQAUI/Composer` and the exclusive
`NativeQAComposerTests.swift`. No shared Store/Contract/ServiceView/AppShell/PBX edits.
Main registers both product files and the test in PBX and places `NativeQAComposer`
in the real service page's bottom `safeAreaInset` within the current four-tab shell.
No `ignoresSafeArea(.keyboard)` or fixed editor height is introduced.

```swift
NativeQAComposer(
    draft: /* Main's scope-protected binding to original Store.draft */,
    canSend: store.canSend,
    isBusy: store.busy,
    hasUnconfirmedRequest: /* pending != nil OR pending/unknown state OR waiting messages */,
    chinese: chinese,
    isCurrent: /* capture exact scope/session/projection generation;
                  live-check original owner + active/scene eligibility */,
    onSend: /* Main invokes original Store.send() after its live owner check */
)
```

`isCurrent` is an authority closure, not a snapshot Bool: old closures must remain
false after a scope/session/generation change, including A→B→A. The draft binding
must itself remain scoped; a new arbitrary current account does not qualify an old
composer. Scene-phase checks in the component additionally hide its field when inactive.
The component never owns a private draft copy, clears a draft, creates a request,
or performs network/persistence work. Main/original Store owns invalidation and data lifecycle.

Getter returns empty without reading the owner binding when ineligible; setter and
send recheck eligibility. Edits are synchronous and preserve all bytes, including
over-limit input. Validation only tests whitespace emptiness and UTF-16 ≤4000.
Return inserts newlines; there is no `onSubmit` callback. Explicit Send latches before
calling Main to close the async busy-publication gap. Latch releases on observed
busy true→false or canSend false→true; if owner silently refuses without changing
state, input stays safely latched until owner republishes/recreates the scoped view.
Unconfirmed requests display only a saved-state-check prompt; no resend/free/cancel promise.

UI uses existing VP theme colors, body/footnote Dynamic Type, 44pt send/keyboard
targets, multiline scrolling input, 3 accessibility-size lines / 5 regular-size lines,
wrapping notices and existing “开始聊天” / “Start chatting” wording. No tool/attachment
buttons or new capabilities. Apple documents multiline TextField scrolling beyond
its line range: [lineLimit](https://developer.apple.com/documentation/swiftui/view/linelimit(_:)-7ufty).

## Actual checks

- PASS: actual new product source + unchanged VisePandaTheme, iOS17 simulator target,
  Swift language mode 6, installed Xcode Swift6.4 / Simulator SDK27.0, typecheck exit0.
  `ios17-typecheck.log` is empty because the compiler emitted no diagnostics.
- PASS: 6 Swift Testing cases / 0 failures on macOS, using actual
  `NativeQAComposerAccess.swift` and actual test source via scratch-package symlinks.
  `behavior-final.log`: original byte/over-limit retention, stale getter/setter scope
  isolation without private read, background/pending edit denial, exact UTF-16 and
  whitespace boundaries, synchronous duplicate-send latch, denied/stale send callbacks.
- PASS: staged diff whitespace check; changes restricted to assigned new paths.
- Initial behavioral run also passed 6/6 but emitted three test-only captured-var
  warnings; replaced mutable eligibility captures with a MainActor fixture object.
  `behavior.log` retains that first run; final run has no warnings.
- UNRUN: full App build, simulated UI/keyboard/safeArea/Tab collision checks, large-text
  screenshots, VoiceOver, real Auth/provider/session, physical device and release.
  Main owns simulator 8F and centralized App/UI validation; this thread used no simulator.

Reproduce the two offline checks from this WT with:

```sh
python3 artifacts/IOS-001/qa-composer-20261016/verify.py
```

Scratch build output stays excluded by the local `.gitignore`. These are synthetic
binding/action and source compilation results, not real service or device acceptance.

Accepted report fully read: 167 lines, SHA256
`a495a5ea202e6d3628a465866f1b6d59514d87574e2059f1913145d184b11c08`.
Its unseen Muse pixels/attachments were not treated as specifications.
