# NativeQA history presentation evidence

Related: IOS-001 #203 / WEB-001 #681 / VPV10-IOS-MUSE-UI-20261016.

- Owner WT: `/Users/jtsm5p/Documents/Codex/VP-V10-worktrees/ios-qa-history-20261016`.
- Base: `407082fd3f6d3094129edb71bc17cd212fc15a04`; source commit: `df2e12f894cc866df59ee03c563a4967ea4c0682`.
- Report read: 167 lines; SHA256 `a495a5ea202e6d3628a465866f1b6d59514d87574e2059f1913145d184b11c08`. No Muse pixel/attachment claim.
- Requested Sol6.1 / medium; effective model and tier UNKNOWN. Actual filesystem danger-full-access, network enabled, approval never.
- Ready/first safe source write occurred during this turn; exact historical timestamps were not captured and are not invented. Final synthetic execution timestamp is in behavior.log.

## Delivered behavior

Main supplies `NativeQAHistorySource(currentScope:expectedScope:read:onSelect:onCreate:)`. All closures are synchronous MainActor. Read returns `NativeQAHistorySnapshot(scope:sessions:selectedID:isLoading:canSelect:canCreate:)` from the original Store. The original DTO is retained verbatim. Only label filtering occurs locally. No API/cache/creation/persistence/selection owner is added.

Main must give nonnil scope only for active + readable projection, use the actual bound projection scope, and preserve original pending/unknown eligibility in the flags. Flags describe presentation only and confer no server authority. Each SwiftUI body render rechecks live scope; each intent checks it again, including the displayed scope and current list membership. Main should read the current Store inside each closure instead of capturing a previously materialized array. The parent must observe Store/scope changes so SwiftUI renders when those values change. Opaque ordinary closures cannot self-notify. There is no independent refresh loop or physical every-frame guarantee.

`NativeQAHistoryView(source:chinese:)` is embeddable content; Main owns the original entry/sheet/NavigationStack and PBX registration. Search State belongs exclusively to the scope-keyed subtree. Scope mismatch or inactive scene removes private rows/search. Selection stays in the original Store. Server labels and timestamps plus explicit ID disambiguate duplicate/empty labels without an invented semantic title. Loading never becomes an empty-history claim. A restricted snapshot remains readable without selectable/create actions. No resend/abandon control exists.

## Checks

- PASS: actual new View + presentation source, original NativeQAContract and VisePandaTheme typechecked using installed iPhoneOS27 SDK, target arm64 iOS17, Swift6. `ScopeDependency.swift` copies only the exact original NativeDataScope value declaration for isolated verification; it must never enter PBX. No source DTO stub.
- PASS: 7 macOS XCTest tests / 0 failures, Swift6, synthetic DTO and live closure inputs. Covers replaced source list / foreign ID, revoked scope / epoch / generation, scope changed within read, readable but restricted unknown, loading versus empty/no-match, zh/en label filtering with untouched DTOs, duplicate list / stale displayed scope, and allowed creation intent.
- PASS: `git diff --check`; owned source diff reviewed. Shared files remain untouched.
- UNRUN: actual App/PBX wiring, SwiftUI search-state teardown at runtime, dynamic type/VoiceOver/appearance/keyboard UI. Main exclusively owns simulator and central integration checks.
- UNRUN: real Auth/provider/session target persistence/device/release. Fixtures and isolated typecheck prove none of these.

Reproduce from repository with `zsh artifacts/IOS-001/qa-history-20261016/verify.sh`. This does not start a simulator or access a service. First command attempts failed due to absent XCTest search paths, Swift6 test self isolation, use of Linux XCTest runner names on macOS, then missing XCTestSwiftSupport link search path. Helpers became file-private values, runner uses actual XCTestSuite, and installed framework/library paths fixed the command. The retained initial Swift6 diagnostic is historical FAIL; final build log and execution log are separate.

Final state: source delivered/pushed; no product writes, in-flight tools, planned successor work or resource operations. Exact lease retained. Main may request necessary repair in this same chat.

## Requested performance correction

Removed the original animation Timeline loop. The View now uses a direct body gate inside Group, retains scenePhase, scope-keyed search subtree and all live tap guards. Parent Observable Store/scope updates are required. No API or callback signature changed.

- PASS: sourceguard.py excludes TimelineView, Timer, task-driven loops and async sleep from the owned History source, and checks that render/scope/tap guards remain. This is a source constraint, not UI runtime proof.
- PASS: corrected View and presentation source iOS17 / Swift6 typecheck, original DTO and Theme, original isolated scope dependency.
- REUSED: the previous 7/7 synthetic behavior tests; filtering, flags, scope and intent implementation are unchanged. No test matrix rerun.
- UNRUN: actual App/Observable wiring, SwiftUI lifecycle, large type and VoiceOver remain Main-owned.
