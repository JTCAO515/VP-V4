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

### Real compilation, then a real caught bug, then a real test run

This sandbox's `xcode-select` initially pointed at Command Line Tools only
(`xcodebuild` refuses to build against that). JT ran
`sudo xcode-select -s /Applications/Xcode.app` and accepted the Xcode
license (`sudo xcodebuild -license`) on request, at which point
`xcodebuild build` and `build-for-testing` both reported success with
zero errors.

That first "success" was misleading and is worth recording exactly why:
**`NativeAiAssistStateTests.swift` had never been added to
`VisePanda.xcodeproj/project.pbxproj`'s `VisePandaTests` target** (this
project uses explicit `PBXFileReference`/`PBXBuildFile`/
`PBXSourcesBuildPhase` entries, not synchronized folder groups) --
dropping a new file on disk does not add it to any Xcode target on its
own. The build "succeeded" because the compiler never saw the file at
all. This was caught by actually running the tests once this session's
CoreSimulator self-recovered from an initial version mismatch
(`xcrun simctl` had hung; a later retry succeeded, listing real booted-
capable simulators) -- `-only-testing:VisePandaTests/NativeAiAssistStateTests`
reported **"Executed 0 tests"**, the tell that the filter matched nothing
because the class was never compiled into the target.

Fixed by adding the file's `PBXFileReference` (id `...55`), its
`PBXBuildFile` entry, and its membership in both the `VisePandaTests`
`PBXGroup` and that target's `PBXSourcesBuildPhase`, mirroring the
existing `NativeAskStateTests.swift` entries exactly. Rebuilding then
surfaced a **second** real bug: the five test methods lacked `@MainActor`
(only the shared `groundedStore()` helper had it), which
`NativeAskStateTests.swift`'s own tests all carry -- without it, Swift's
strict concurrency checker correctly refused to let a nonisolated test
method read `@MainActor`-isolated `NativeAskStore.aiAssist` inside an
`XCTAssert` autoclosure. Fixed by adding `@MainActor` to each test
method.

After both fixes:

- `xcodebuild test -only-testing:VisePandaTests/NativeAiAssistStateTests -destination "id=<a real booted iPhone 17 Pro simulator>"` — **Executed 5 tests, with 0 failures** (all five: immediate `answered`, `not_offered`, a real `pending → succeeded` two-poll transition with a real 1.5s `Task.sleep` between polls, a malformed-reply `.error` path, and an unknown turn id being a no-op).
- `xcodebuild test -only-testing:VisePandaTests` (the whole existing target, same destination) — **Executed 51 tests, 6 skipped (network-gated integration tests, consistent with this repo's existing skip convention), 0 failures** — no regressions from this slice's changes to `NativeAskModels.swift`/`NativeAskStore.swift`/`NativeAskView.swift`.

This is a real, run-to-completion XCTest pass on a real simulator, not a
compile-only check -- and the fact that the first "BUILD SUCCEEDED" was
wrong is left in this record deliberately, as a reminder that a green
build without an actual test-count sanity check (`Executed N tests`) can
hide a file that was never really part of the target.

### The repo's own real native CI script, run locally end to end

This PR's own "simulator" GitHub Actions check (self-hosted runner,
`.github/workflows/native-ios.yml` → `scripts/ios/ci.py`) failed, but not
from anything in the diff: `ci.py` pinned `XCODE = "Xcode 26.6\nBuild
version 17F113"`, and the self-hosted Mac's own Xcode install had since
moved to 27.0 with "no automatic fallback" -- this would fail identically
on any PR touching `ios/` right now, not just this one. JT asked to bump
the pin. Fixed by updating `XCODE` to `"Xcode 27.0\nBuild version
27A266a"` (the exact string this session's own `xcodebuild -version`
reports, matching the failing job's own error message) and the matching
line in `docs/contracts/vpj-56.md`. `RUNTIME`
(`com.apple.CoreSimulator.SimRuntime.iOS-26-5`) and `DEVICE`
(`iPhone 17 Pro`) needed no change -- this Xcode 27.0 install still ships
iOS 26.5 simulators.

Verified by running `scripts/ios/ci.py` itself locally, end to end,
exactly as the self-hosted runner would (`DEVELOPER_DIR=/Applications/
Xcode.app/Contents/Developer python3 scripts/ios/ci.py --output ...`,
no `--preflight`): build, build-for-testing, ad-hoc signature and
verification, an owned fresh simulator created/booted/deleted, and
`test-without-building` against the **entire** shared scheme -- every
step exited 0. The full evidence trail this script itself produces
(`tests.log`) shows every suite: `VisePandaTests` 51/51 (6 skipped),
`VisePandaUITests` 25/25 (17 skipped, real network-gated UI suites) --
0 failures anywhere in this repo's real native CI, not just the one new
test file.

### What was NOT verified

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
