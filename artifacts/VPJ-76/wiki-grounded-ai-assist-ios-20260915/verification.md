# #360 (VPJ-76) verification — slice 9, iOS trigger

## What this slice implements

Slice 8 wired the Web client to `grounded_ai_assist_work_v1`. JT asked to
finish the other client explicitly deferred in slice 8: iOS. This slice
adds the native counterpart — same job, same database, same fencing —
reached over the app's separate Bearer/native-session identity instead of
the Web cookie session.

## What was built

- `lib/server/turn/native-ai-assist-http.ts`, `nativeGroundedAiAssist`: a
  thin wrapper around the already-tested `runGroundedAiAssistJob`,
  authenticated by copying `nativeGroundedEvents`'s exact pattern
  (`verifyNativeCredentials` + the session subject/sessionId cross-check).
  Plain JSON, not SSE — the client polls it, like the Web route.
- `app/api/chat/native/v4/turns/[turnId]/ai-assist/route.ts`: the POST
  route wrapper, matching the existing `.../events/route.ts` convention
  exactly.
- `ios/VisePanda/VisePanda/Features/Ask/NativeAskModels.swift`:
  `NativeAiAssistStatus`/`NativeAiAssistOutcome`/`NativeAiAssistReply`,
  decoding the route's JSON with a `valid` gate lighter than
  `NativeGroundedResult`'s closed-schema checks (deliberately — this is a
  non-authoritative, non-persisted, real-time supplement, never as
  reliable as the reviewed answer above it).
- `ios/VisePanda/VisePanda/Features/Ask/NativeAskStore.swift`,
  `runAiAssist(_:using:)`: per-turn polling (1.5s interval, 20-poll cap),
  fenced by its own `aiAssistTokens` map — deliberately **outside**
  `perform()`/the store's single `busy` slot, the same design `receiveEvents`
  already uses, so a multi-second AI search does not freeze every other Ask
  action (send/cancel/reload) for its duration.
- `ios/VisePanda/VisePanda/Features/Ask/NativeAskView.swift`:
  `aiAssistPanel`/`aiAssistResult`, appearing only when
  `result.originalOutcome == "blocked"`, rendering the six reason codes,
  `budget_exhausted`/`cancelled`/`failed`/`not_offered`, and the answered
  case with an explicit "AI-generated, not reviewed" disclaimer — mirroring
  `SavedAnswers.tsx` (slice 8) in content, independently in SwiftUI.

## What was verified

### Real compilation (this session's own environment, not simulated)

This sandbox's `xcode-select` initially pointed at Command Line Tools only
(`xcodebuild` refuses to build against that). JT ran
`sudo xcode-select -s /Applications/Xcode.app` and accepted the Xcode
license (`sudo xcodebuild -license`) on request, at which point:

- `xcodebuild build -scheme VisePanda -destination "generic/platform=iOS Simulator"` — **BUILD SUCCEEDED**, zero errors, for the full app target including every file this slice touched.
- `xcodebuild build-for-testing` (same destination) — **TEST BUILD SUCCEEDED**, zero errors, including the new `NativeAiAssistStateTests.swift`.

This is real `swiftc` type-checking and compilation against the actual
project, not a syntax read-through.

### What was NOT verified

- **The new XCTest cases were never actually run.** This sandbox's
  CoreSimulator is version-mismatched against this Xcode install
  (`CoreSimulator is out of date. Current version (1051.55.0) is older
  than build version (1171.7.0)`), and `xcrun simctl list devices`
  itself hangs indefinitely here — an environment defect, not something
  introduced by this slice. `NativeAiAssistStateTests.swift` (5 cases:
  immediate `answered`, `not_offered`, a real `pending → succeeded`
  two-poll transition, a malformed-reply `.error` path, and an unknown
  turn id being a no-op) compiles and links against the real
  `NativeAskStore`/`NativeSession`/model types, but no simulator in this
  session actually executed them. **Run
  `xcodebuild test -scheme VisePanda -only-testing:VisePandaTests/NativeAiAssistStateTests -destination "platform=iOS Simulator,name=<a booted simulator>"` locally before merging** to get a real pass/fail, the way every other iOS test in this repo would be confirmed.
- **No real model call.** The route reuses the same env-based provider
  gate as the Web route (`VISEPANDA_GROUNDED_AI_ASSIST` +
  provider/credential env vars), unset in every environment — consistent
  with slice 8 and every other real-model wiring in this codebase.
- **No native integration test** (the Docker-gated pattern
  `tests/integration/turn/native-grounded-http.test.mjs` already uses for
  `nativeGroundedEvents`) was added for `nativeGroundedAiAssist` — the new
  route is a narrow, pattern-identical copy of that already-tested auth
  wiring, and the job it delegates to is independently verified (real
  database, 10 scenarios, slice 8's own verification) and unit-tested (9
  fixture cases). Adding a full Docker-based native integration test for
  this specific route was judged lower-value than that existing coverage
  and left undone.
- No real device or simulator screenshot exercised the SwiftUI button/
  panel visually.

Also re-ran for regressions on the TypeScript side (the server route is
new code but shares its dependency graph with slice 8): `pnpm lint` /
`pnpm typecheck` / `pnpm docs:check` — all clean; no TS contract-suite
regressions (no TS logic changed in this slice beyond the new thin route
wrapper, which typechecks).
