# Complete iOS frontend — local experience

Related: IOS-001/#203, IOS-003/#209, IOS-004/#506, IOS-005/#216, IOS-011/#692, IOS-012/#693; parent #187. This frontend slice does not close the broader real-service criteria of #203/#209/#506/#216.

## User result and entry

Build/run the VisePanda scheme in Debug. Ordinary launch now enters the existing four-tab AppShell: 对话 / 旅程 / 资料库 / 记忆. Avatar opens assistant detail. All content is explicitly local sample state; no model selector, account login, provider, real booking/payment, persistent Trip/Library/Memory or new data authority is enabled.

Main-owned iPhone 17/iOS 26.5 simulator: E9445CEC-6CAC-4B27-B867-1ED0207E01A6. Built installed bundle: space.go2china.VisePanda. App: /Users/jtsm5p/Documents/Codex/2026-10-13/v10-main/ios-main-derived-data-20261014/Build/Products/Debug-iphonesimulator/VisePanda.app.

Explicit legacy/real-service launch arguments retain their original consumers: -VisePandaLegacyShell, -VisePandaNativeAPI, -VisePandaFourTabShell or -V10RealServiceFrontend. The sample interface does not restore/validate real sessions or handle real entry-resume/notification sheets. Release requires explicit -V10FrontendExperience to opt into the sample; release/provider/device acceptance is not claimed.

## Actual validation

- PASS: full App build/install/launch on the owned simulator; first complete build 34.2s. Six pre-existing trailing-closure warnings retained. Latest copy/source build 30.2s; one unchanged warning. Build log: /Users/jtsm5p/Library/Developer/XcodeBuildMCP/workspaces/Documents-2025647e2650/logs/build_run_sim_2026-10-14T09-01-55-837Z_pid3685_e00e6423.log.
- PASS: four real runtime tabs; suggested Chinese draft → explicit sample send → structured result → visible before/after confirmation → same journey confirmation; journey → day → route mode and place sample save → navigation return.
- PASS: library → exact sample material → save/unsave → export preview; share audience preview confirmation and cancellation remain explicitly unsent; material → same journey → chat with same context. Latest display uses journey title and omits internal material IDs.
- PASS: memory → exact preference detail → actual keyboard edit → original/new diff → confirmation → same-ID updated title → forgetting cancelled with content retained → explicit forgetting → empty state → explicit local sample restoration.
- PASS: avatar → persona preview/save with actual keyboard input → header reflects same name; activity/detail → same library material; permission sample toggle changes local displayed status only; local todo completed/cancelled states.
- PASS: expression → existing sample → large card → done/return; final origin labels say 样例译文 / 样例回译, fixed local content, no translation performed. Current shared journey/material context is display-only.
- PASS: failure → sample retry; loading → cancel → return content. Voice/attachment entries explain unavailable real capability and provide close/return/sample-material paths.
- PASS: affected SDK typechecks/Swift parsing, 3 place presentation tests, 2 journey tests, 22 library-memory state assertions, assistant persona/todo bounds tests, 15 actual shared-state chat checks, Main cross-page ID/input/explicit-confirm/reset checks, docs and diff checks.

Initial Memory navigation FAIL is preserved in first-runtime-snapshots.json and memory-initial-navigation-failure.jpg. A leaf-only navigation-value change still failed against the typed production [AppRoute] stack. Main changed only the sample branch of the existing TabRoot to its own implicit NavigationStack; production routing remains intact. The real successful correction/forget/restore trace is in final-runtime-snapshots.json. No failure was relabeled as PASS.

UI automation limitations: AXe cannot type Chinese directly; Chinese suggestions were selected through actual UI. Text input was focused with touch before ASCII typing. Some expired refs/no-op wrapper switch taps were refreshed; observed state changes, rather than tool success alone, define PASS. Two observations with extra external UI changes were retained; JT subsequently explicitly returned the simulator to Main before final validation.

## Inspectable evidence

Screens: 01-chat.jpg, 02-confirmation.jpg, 03-journeys.jpg, 04-journey-detail.jpg, 05-day.jpg, 06-place.jpg, 07-library.jpg, 08-memory.jpg, 09-assistant.jpg, 10-persona-saved.jpg, 11-memory-fixed.jpg, 13-expression-final.jpg. Earlier 12-expression.jpg preserves the original incorrect sample AI label.

Continuous unedited runtime recording (local, not committed due size): /Users/jtsm5p/Documents/Codex/2026-10-13/v10-main/ios-complete-frontend-final-flow-20261014.mp4. Earlier first/second runs and memory-routing-failure recording remain in the same private Main directory. Final copy-only assertions are in final-copy-runtime-snapshots.json. Source/compile/local sample runtime are separate from real service/device/release evidence.

## Remaining boundaries

Real Auth/provider/persistent Session/Trip/Library/Memory, payment/booking, physical device/VoiceOver and release are UNRUN. Prior QA/DB recovery failures and frozen E2/lifecycle scope are unchanged. Approved Muse HTML identity is known (libfile_cfee5ae80ee08191847a4d8fafce1d04 / file_00000000d02c81f8afa0f952e74f1e56), but the official Library reader/materializer is absent from this Main's actual tool registry. Implementation follows the complete approved page/interaction scope formally relayed by product; exact HTML pixel matching is not claimed.
