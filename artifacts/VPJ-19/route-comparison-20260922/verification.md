# #364 route comparison verification

Base: origin/main 7a05827. Branch: codex/s3-364-route-comparison.
Scope: one current-departure comparison through existing authenticated place lookup,
Web + native Explore consumers and accurate AMap handoff/address fallback. Related to #364,
parent #209. PR481 is merged; #363 full acceptance is not claimed.

## Evidence at initial PR preparation

- PASS: `node --experimental-strip-types --test tests/contract/maps/*.test.mjs`: 101/101 before final strict-segment guard refinement; affected tests will be rerun in CI/current head.
- PASS: `pnpm typecheck`, `pnpm lint`, `pnpm docs:check` at initial implementation. Final head CI recorded separately.
- PASS: `git diff --check`.
- UNRUN: native completed build/tests. An isolated generic Simulator build with
  `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` and `/tmp/364-derived`
  reached asset compilation, then was interrupted on Overall's resource coordination request.
  The initial plain `xcrun simctl` failed because selected developer tools were CLI-only;
  explicit DEVELOPER_DIR successfully enumerated simulators.
- UNRUN: browser visual/interaction verification. Next dev :3364 began compiling /places,
  browser initially refused connection, then HTTP attempt timed out during extreme host load.
  Own dev server was stopped on Overall request. This is not a product PASS or waiver.
- Dedicated disposable simulator: VPJ364, `4D50DAE9-DA2F-4204-9609-876E502E8D6C`, iPhone 17 Pro / iOS 26.5, created but not booted. No shared simulator reset or database writes.
- UNRUN: real supplier calls; secure config path obtained privately from #363 owner, no values
  copied or printed. Specific call budget/scope is pending Overall verification.
- UNRUN: live signed-in dual-client route demonstration, future departure, missing/installed
  AMap app, OS open failure/return, denied-location device flow, real no-route/timeout/expiry,
  exact airport/station entrance and accessibility/VoiceOver. Unit/contract fixtures do not
  substitute for those outcomes. Future departure remains explicitly unsupported.

## Rollback / constraints

Disable AMAP_ROUTES_ENABLED or revert this isolated PR. No schema, Trip confirmation,
permissions, background location, persistent provider storage or production configuration change.
No project.pbxproj, NativeSession, Localizable or root navigation edits. Existing #216/#240/#221
increments are preserved. Shared handoff/issue-plan belongs to Overall.

Start 2026-09-22; acceptance pending. Rework: strict segment validation and expiry click guard
found during self-review. External waiting: severe local resource pressure, provider budget
confirmation. No complete Issue or user acceptance claim; #364/#209 remain open.

## Follow-up evidence

- PASS: focused route adapter contracts 5/5 after strict segments and numeric bounds.
- PASS: Quality PR for initial implementation 0a7d985a, run 35674646096.
- Added desktop and 390×844 Playwright fixture interactions to CI, including future-departure
  no-dispatch and expired-route removal; these are controlled fixtures, not live route proof.
- Native tests additionally cover late completion after clearing, mismatch/expiry rejection
  and POI/GCJ02 app-URL encoding. Execution remains pending the native CI/window.
- Preview deployment succeeded for 0a7d985a but browser request returned HTTP 403; no access
  controls bypassed, so remote visual verification remains UNRUN.

## Failures retained and repairs

At ac59e0bf, Quality run 35675163995 failed both new viewport cases waiting for the exact
Departure label (11 other browser cases passed); the select now has an explicit localized
accessible name and the original exact-label assertion is retained.
Native run 35675164037 failed ExploreView.swift:352 because Swift could not type-check the
optional map/String.init/concatenation expression in reasonable time. Typed local strings
replace that expression; this was a code defect, not dismissed as host load.

Overall-authorized read-only independent review found two P2 issues: transit fee was read
at the wrong response level and missing stop names were accepted. The adapter now requires
boarding/alighting names, reads the documented segment-level fee, counts alternatives once,
and leaves multi-segment totals unknown pending evidence of additive semantics. Protocol
fixtures cover multiple segments, alternatives and missing fares/stops. No unresolved P1
was reported by that review. Review fixes and CI repair need final-head CI.

Real supplier plan (UNRUN): two public, already identified AMap POIs, resolved by ID (2 calls),
then walking/transit/driving (3 calls), no retries, no real user location, no database writes.
Use only the existing ignored secure environment. Actual quota/charging is not established
by possession of credentials; do not dispatch until Overall verifies the existing authorized
budget/scope. Record timestamp, five statuses and sanitized output, never key-bearing URLs.

## 1b80a6cc native outcome and final address correction

Native run [35675850162](https://github.com/JTCAO515/VP-V4/actions/runs/35675850162)
completed app/test builds successfully; NativePlaceSearchTests passed all 9 cases, including
route expiry/identity, late clear and POI/GCJ02 handoff. The full UI run failed:

- AppShellUITests.swift:194 `testAccessibilityAtLargestTextSize`: audit error -56,
  "Audit failed to complete in time" (not the separately tracked ask.title clipping finding).
- AppShellUITests.swift:117 `testChineseReleaseLanguagePickerAndEnglishSwitch`: failed to tap
  the Chinese Done button after typing in Ask, **before** entering the language picker.
  The reported button collection lacked Done; this alone does not establish keyboard state.
- Diagnostics collection additionally reported missing simctl in xcrun's tool path. This is
  secondary to the two test failures, not a replacement explanation. Shared tests unchanged.

A final scoped correctness fix updates both pinned route endpoints from a successful,
identity-checked comparison reply. Otherwise its address card could retain a pre-query address
while handoff uses newly resolved coordinates. Web assertions now pair the new address with the
new navigation coordinate. Native assertions cover same-ID address/coordinate refresh and a
valid late reply after the user selects another destination. Read-only independent review
confirmed these guards and assertions; final-head execution remains required. The in-flight
1b80a6cc CI was allowed to end naturally, and is not claimed as evidence for this later fix.
