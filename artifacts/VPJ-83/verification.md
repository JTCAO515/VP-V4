# VPJ-83 first four-tab shell slice — 2026-09-30

## Scope before implementation

Clean isolated branch `codex/vpj83-four-tab-shell-20260930`, base `6bd4a3bf0f94a466d6b33db9c3e0118f47ab3dd8`. Owning Issue #564 is OPEN. This U3/S4 slice delivers opt-in VP / Journeys / Library / Memory navigation, shared Search, old-entry compatibility and a five-tab fallback. It reuses AskView (including #562's existing assistant-mode consumer), TripView, #563's NativeKnowledgeView, #199's NativeTravelPaceView, ExploreView, ToolsView and ProfileView. No new domain writer, result model or persisted projection.

Relevant inputs: ADR-0027, ADR-0023/0025 invariants, execution row VPJ-83, artifacts/VPJ-81 and VPJ-82 verification/unrun. #558's specimen remains explicitly offline; #559–#563 interfaces are present on this base but their real Staging/provider/device acceptance is not inferred from merges. Adjacent native tests and the bundled flag/URL scheme configuration are necessary for this route change. Global handoff stays with V5 coordination.

Before-edit retained gaps: Memory-to-real-result mutation, undated-goal aggregation in Journeys, hosted/provider work, real target-environment account switch, physical device/VoiceOver and release are UNRUN for this slice. #564 will remain OPEN. Native toolchain/simulator and repository checks will be recorded below.

## Implemented result and rollout

- More destinations → Try four-tab navigation enters the real consumer shell; Use previous navigation returns to five tabs. The choice is per-launch. The bundled boolean remains false; an explicit four-tab launch argument opts in and the legacy launch argument wins at launch. Four-tab launch/switch defaults to VP.
- One NavigationStack per tab retains history for ordinary tab switching. Explicit entry/deep-link root jumps recreate only the requested tab; actor/session generation changes recreate all tab views and close secondary entries. Existing consumer scope fences reject late responses.
- Search is a global sheet, never an activity tab. It delegates to existing place search or the existing latest-comparison Library reader. Every old entry is available through More destinations; account/privacy/Pass/logout reuse ProfileView. The Memory tab reuses saved travel pace/authoritative undo; Journeys reuses Trip.
- `visepanda://ask|trip|knowledge|memory|profile|today|tools|explore|search` plus VP/Journeys/Library/account/privacy/purchase/logout aliases are entry-only. No URL triggers a purchase, logout, deletion or write. Payload paths, query, fragment, credentials and unknown hosts are rejected. No previous inbound native handler/scheme was present on the base; Web/entity/universal links remain UNRUN.

## Checks and observed limits

Full commands/exit codes are in `commands.jsonl`. Native app was built/tested from this isolated checkout using Xcode; no source checkout changes or target service writes.

| Check | Result | Scope |
| --- | --- | --- |
| Native unsigned Simulator build | PASS | App compile, including shell/route/flag and localization changes |
| `xcodebuild -list`, `xcrun simctl list devices available` | PASS | Actual project, scheme and UDIDs discovered |
| `pnpm docs:check`, `pnpm lint`, `pnpm typecheck`, `git diff --check` | PASS | Repository rules/docs/format/type checks |
| `pnpm test:contract` | PASS 695/695, 0 skip | Existing contract suite; no Web/server behavior changed |
| iOS 26.5 iPhone 17 Pro UI | PASS 3/3 | zh/en four-tab entries and in-app rollback; zh/en/ar maximum text Search hit-region/element/trait audit; old English Today/translation route and independent tab history |
| iOS 17.5 iPhone SE native consumers | PASS 38; 2 UNRUN | Navigation/rollout/URL allowlist, Memory store, Knowledge actor/revocation/exact-read negatives, session/Pass scope checks. The two real local login/redirect integration tests skipped without their disposable identity target |
| iOS 17.5 iPhone SE maximum text UI | PASS | zh/en/ar maximum-text global Search reachable from every tab, same limited accessibility audit as above; native root-reset change included |
| Runtime entry URLs on iOS 26.5 | PASS for trip/privacy/memory | Installed latest app; system Open confirmation accepted once. Actual Trip/Journeys, Profile and Memory destinations observed in saved screenshots. This is signed-out entry reachability only |

Rework preserved: the first UI run failed because toolbar placement outside NavigationStack hid Search; moving it into the stack fixed this. The second found the close action missing after Search navigation; Search now uses destination links and a persistent sheet-close row. The iPhone SE route test found its privacy assertion had not scrolled to the off-screen section; the test now scrolls and verifies the actual visible section. Failed runs stay in `commands.jsonl`; the successful final route rerun is recorded separately below. Xcode diagnostic collection stalled after the failed UI runs; only those diagnostic subprocesses were terminated to allow their failed xcresult bundles to finish. No test failure was suppressed.

Screenshots: `entry-trip-ios26.png`, `entry-privacy-ios26.png`, `entry-memory-ios26.png` and `se-memory-maximum-text-zh.png`. The installed build has no configured API origin in these signed-out screenshots, so inherited interface-preview/sample content remains visibly identified. Neither these images nor the route tests prove a real provider/Memory/result chain. The accessibility audit selects hitRegion/elementDetection/trait; full contrast/text-clipping/spoken VoiceOver and Reduce Motion review are not claimed.

Rollback is the in-app previous-navigation choice, the legacy launch override, or disabling the bundled rollout flag. Existing assistant task/history/cancel and result consumers stay reachable via Ask and Library in fallback; no stored task/artifact is migrated, cancelled or deleted by navigation switching. Reverting this PR removes only navigation/configuration changes. Parent #564 remains OPEN with `unrun.md`.

Final iPhone SE route rerun: **PASS 1/1, 0 skip/fail**, `/tmp/vpj83-shell-se-routes-final.xcresult`; this covers both release languages, Profile/privacy scrolling, Today/Tools/Explore, Search return to the selected Library tab, in-app four→five→four navigation and fallback Library/Memory access. iOS 17 Form section headings capitalize their English accessibility labels; the test matches case-insensitively while still requiring the actual visible privacy section. The failed case-sensitive and pre-scroll attempts remain in command history. The final native code was exercised by the preceding iPhone SE consumer/maximum-text run; only this UI selector changed afterward.

Evidence summaries: `ios26-ui-summary.json` (three passing UI checks), `ios17-initial-summary.json` (38 native + maximum-text pass, 2 integration skips, failed initial privacy selector), `ios17-final-route-summary.json` (passing route rerun). Reviewed final diff: native navigation/configuration, existing navigation/UI tests, two affected product documents and task-local evidence only. Approximate start-to-reviewable slice: 35 minutes including investigation and simulator retries; no external approval wait. Required remote CI and independent V5 review remain merge gates.
