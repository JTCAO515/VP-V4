# P2 composer completion fix

Product commit: `6eb579eb`, parent `436dfba6`. This supersedes only the latch-release
contract in `verification.md`; the previous report and logs remain historical evidence.

The previous view released its synchronous send latch only after observed busy
true→false or canSend false→true. A fast local owner operation can complete entirely
between renders: busy remains false, draft clearing makes canSend true→false, and
the latched editor rejects the next question. Reproduced against original production
code in `p2-red.log`: next-question binding expected `second`, got empty (1 failure).

## Interface delta for the sole integration owner

```swift
// onSend is now @MainActor (@escaping @MainActor () -> Void) -> Void.
onSend: { completion in
    Task { @MainActor in
        defer { completion() }
        guard originalLiveCurrent(), !Task.isCancelled else { return }
        await store.send()
    }
}
```

Every completed, refused, or cancelled local owner invocation calls completion.
For synchronous refusal, call completion synchronously. This is an invocation-end
receipt, never proof of server success, request cancellation, or permission to resend.
An owner still running leaves its invocation latched. Main dispatches the actual
ServiceView/PBX integration to its sole integration owner; no shared files were changed here.

The view retains only an observable UUID attempt token. It synchronously acquires
the token before callback, and only its matching completion releases it. Invalidating
the view also discards that UI token. Completion does not touch input, scope, request
state, focus, or keyboard. A duplicate/late completion for A cannot release B, even
when the same view state object was reused after scope invalidation. Current owner,
scene, busy, and unconfirmed-request guards still independently determine eligibility.
There is no render-edge release and no delayed/timer unlock. No private draft copy,
normalization, automatic resend, networking, or persistence was introduced.

## Actual evidence

- RED: original source + coalesced-fast-completion binding regression failed as above.
- PASS: final actual access source + 11 Swift Testing methods, macOS synthetic only,
  0 failures, in `p2-green.log`. The original six scenarios remain; added fast-completion
  next edit/send, explicit refusal, actual local Task cancellation with defer completion
  and hidden private read, stale/duplicate completion versus successor, and unknown
  request denial after completion. Existing duplicate-send case withholds completion
  and proves two pre-busy taps produce one callback.
- PASS: new product source + original VP theme iOS17/Swift6 typecheck exit0, no diagnostics,
  `p2-ios17-typecheck.log`. Existing Xcode6.4 compiler / Simulator SDK27.0; no simulator used.
- Two intermediate test compile failures retained: `p2-test-macro-compile-fail.log`
  (Swift Testing macro function-call wrapping lost closure isolation) and
  `p2-test-closure-compile-fail.log` (test's saved closure required explicit MainActor type).
  Fixed by assigning call results before assertions and explicitly annotating that
  synthetic saved closure; no production isolation requirement weakened.
- Repro command `python3 artifacts/IOS-001/qa-composer-20261016/verify.py` now writes
  distinct `p2-replay.log` / `p2-ios17-replay.log`, preserving original logs. Replay
  also typechecks the explicitly synthetic `CompletionCallsite.swift` with the actual
  new view and the recommended Task/defer integration pattern.
- Full App, hosted UI, keyboard/Tab/large-text/VoiceOver, hosted Auth/provider, and
  physical device: UNRUN by this owner; solely integration owner's authorized scope.

Only original two composer source files, exclusive test, and this task's artifacts
changed. No new dependencies, resources, backend changes, fees or credential use.
