# Native first-party knowledge reader

Related to #205/#206, S2. Implemented and observed 2026-09-13; complete Ask grounding, native release and product acceptance remain incomplete.

## Result and scope

Configured Staging builds now expose the real first-party reader in Explore. A signed-in traveller selects city and situation, reads zh/en statements with all conditions/exclusions, and expands source publisher/locator. Unconfigured builds retain the labelled preview. No Trip writes, model calls, additional recipients or database migration were introduced.

The reader uses NativeSession's fixed authenticated GET and account fence; it validates the response purpose, recipient, scope, identity and condition cardinality. Late responses cannot replace newer selections or revive cleared state. Only the active Explore tab reads. Session busy is not a cancellation identity, so an in-flight credential refresh cannot cancel itself. In-memory snapshots expire using server evaluatedAt/expiry minus round-trip duration, on a monotonic clock, at most30seconds. Refresh failures clear text.

Adjacent AppShellView/AppRoute edits pass the actual selected-tab visibility to this reader; no tab order or navigation selection changed. Explore, NativeSession and the Xcode project are necessary wiring. Source-batch README and handoff now distinguish the previously completed remote publication from original editorial inputs.

## Actual Staging observation

- Native base `c31fd0bbf67836793d28527184a50e4503b5bff8` plus the source hashes in [build manifest](build-manifest.json). This includes concurrently merged approved heart branding. The installed bundle fixes the Staging origin; remote destinations were not supplied through launch arguments.
- Backend `1db3578e7e447e9c38e4c43a338b16cb466f8d94`, Preview `dpl_6F4Kga71kMDjLvezKMnavVZwHWmw`, existing Staging39. No backend deployment or content mutation in this run.
- Actual iOS26.5 owned Simulator, ad-hoc signed. Existing controlled Staging account signed in through the normal native form; secrets were supplied through stdin and not retained in evidence.
- PASS: empty arrival is honest; payment shows3 statements, matching en/zh fact IDs. Previously revoked PAY-01 remains absent. [English](en-payment.json), [Chinese](zh-payment.json).
- PASS: English source disclosure shows People's Bank of China and printed/PDF page locator. [Source screenshot](en-sources.png), [source tree](en-sources.json).
- PASS: terminate/relaunch with Chinese locale restores the actual session and reads the same published content. [Chinese screenshot](zh-payment.png).
- PASS: normal native logout followed by Explore shows signed-out guidance and0notes. [Logout](signed-out.json), [screenshot](signed-out.png).
- PASS: cleanup disables the reader, Ops was never enabled,0active members,6auth users/3Trips and11published/1revoked remain. Original WAF rules restored atversion12, production target unchanged; owned Simulator deleted. [Summary](runtime-summary.json), [database](disable-result.json), [window](window-finished.json), [Simulator](simulator-cleanup.json).

This is real Staging data through a native Simulator UI, not a physical iPhone or Store release. Existing five-alias Production guard was also verified after preceding PR338: [guard](prior-evidence-merge-guard.json).

## Local checks and regressions

| Check | Result |
| --- | --- |
| Native build and final build-for-testing | PASS; [build](native-build.log), [final test build](native-ui-build-4.log). Actual Staging build also [passed](build-2.log). |
| New state tests |6/6 PASS: scope/language/recipient/cardinality, monotonic expiry including elapsed request time, late selection, clearing an outstanding response, failed refresh, empty coverage. |
| Related native unit target | XCTest33 executed,5 existing real-API skips,0failures;9Swift Testing tests PASS. Model/store code unchanged after this run; subsequent visibility/credential-task changes have direct UI checks. [Log](native-test-2.log). |
| Final actual SwiftUI loopback regression |2/2 PASS, zh/en. Hidden Explore performs0knowledge reads; near-expiry token refresh completes and server accepts only the refreshed token; note/conditions, withdrawal and disabled state verified. [Log](ui-4.log), [attachments](ui-attachments/manifest.json). This fixture is not real-service evidence. |
| Independent review | Final0Critical/0Important after fixing task self-cancellation and adding explicit selected-tab activity. [Review](review.json). |
| Documentation/diff | `pnpm docs:check` and `git diff --check` PASS. No redundant local Web build: server/Web code is unchanged. Required CI remains a delivery gate. |

## Failures and limitations retained

- Initial unit test helper used unsupported `nonisolated actor`; removed the invalid modifier, rebuilt and passed. [Initial failure](native-test.log).
- UI runs1–3 retained in `ui.log`, `ui-2.log`, `ui-3.log`. Counting all startup/hidden-page credential refreshes as one knowledge refresh was incorrect. The final fixture deliberately keeps tokens near expiry and compares newly observed refreshes plus successful authenticated reading. It also checks hidden-page zero reads. Two failed runs were interrupted after their failed precondition; none is counted as PASS.
- The independent review identified `session.busy` in task identity canceling the request's own refresh. Busy now only delays starting a read; account/selection/foreground/active-tab identity still cancels obsolete work. Review also covers the final explicit tab-visibility wiring.
- The test runner's xctestrun format was a direct target map rather than TestConfigurations; runner preparation was corrected without changing assertions. The Simulator was shut down by XCTest before manual staging installation; it was explicitly booted. One first-boot AX query failed and later succeeded.
- Manual source observation initially hit a refresh/loading interval, an obsolete scroll position, and the AX tool's `-x/-y` syntax requirement. These were observation failures, not new content writes. Fresh accessibility positions and a ready-state observation produced the saved source screenshot.
- Periodic refresh currently clears/recreates cards and may reset scroll/disclosure position. Snapshot lifetime is at most30seconds; withdrawal is not instantaneous push. This UI limitation is retained, not hidden as seamless live updates.
- No natural server token-expiry, physical device/VoiceOver/maximum-text, source-link external navigation, payment/SIM/rail/museum operation, Ask claim coverage or production acceptance in this run. JT deferred further physical-device checks. Existing S2 semantic FAIL remains unchanged.

## Delivery CI regression

Native34706592620 exposed offscreen contrast after the concurrently merged brand asset increased the shared header height. The final7-line BrandHeader change fits the full image into the established height; original bilingual light/dark Ask/Trip full audits pass locally. No audit filtering or experimental navigation changes were retained. See [regression evidence](ax-regression/verification.md). Fresh full CI remains required.
