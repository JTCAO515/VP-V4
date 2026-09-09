# VPJ-01 scaled workflow badges

Related to #188. Bounded local fix; #188 remains open.

## Defect and change

At actual system accessibility-extra-extra-extra-large on iOS17.5, white workflow digits extended outside the fixed 28pt purple circles. The earlier AX text-frame check in PR296 was insufficient: a large accessible text frame did not prove that its painted background grew. Its screenshot remains valid failure evidence, and is copied here as `screenshots/before-ios17-largest-zh-Hans-pr296.png`.

`TripView` now uses `@ScaledMetric(relativeTo: .caption)` for its existing 28pt badge dimensions. The caption font, colors, row order and `.accessibilityElement(children: .combine)` stay the same. No additional AX elements, labels, filters or audit waivers are introduced. At normal system text size the dimensions remain 28pt; at maximum they scale with caption. Larger circles reduce the neighboring label width; both language screenshots show complete labels wrapping vertically in the existing scroll view.

## Direct regression

The committed UI test launches with zh/en locale arguments but **no app content-size override**. The command runner controls Simulator's actual system `content_size`. It scrolls to the three badges, captures full screenshots, and probes painted RGB pixels 2pt beyond the top/bottom/left/right midpoint of each digit's actual text frame. Pale or white pixels fail the check. This is direct background evidence, not another glyph-height-only assertion. It is scoped to these light-theme purple badges; it is not a general contrast or VoiceOver audit.

Baseline b8d3f80727796bcea402c8988214f87fe75c1460 plus the same new test: run 20260910-063520 FAILED, exit65. Badge1 top probe was RGB242,242,247 (pale background); text height51.333pt. The captured English baseline and the earlier Chinese baseline visibly show overflow.

After the two-line product change, iOS17.5 runs 20260910-063611 (system largest) and 20260910-063645 (system large/normal) PASS in zh/en, all three badges and four probes per badge. Maximum digit height51.333pt versus normal14.333pt confirms different actual rendered sizes. Both largest screenshots were visually inspected: each white digit is fully enclosed in purple; none reaches the pale page background.

iOS26.5 initial run 20260910-063719 did not reach a test: Simulator cold-start/test service failed with `NSMachErrorDomain -308 server died`; it was interrupted and exited73. The requested size change had first failed because that Simulator was shutdown; the booted setting was observed as large. This attempt is not a normal-size pass. After a bounded reboot and serializing Simulator use, run 20260910-064331 passed the same zh/en badge test at actual system accessibility-extra-extra-extra-large. Both screenshots were visually inspected and all digits are enclosed in purple.

Related iOS17.5 run 20260910-064127 passed 8 unit tests plus English tabs/Today/translation navigation and Today maximum-size accessibility (2 UI tests). No full-audit result is inferred.

iOS26.5 final run 20260910-064536 passed 8 unit tests and 3 UI tests: English navigation, Today largest-text accessibility, and the zh/en badge background test at system large/normal (digit height14.333pt). All four normal-size zh/en screenshots across both runtimes were visually inspected; the 28pt circles retain the normal appearance. See the normal screenshots beside the maximum screenshots. `pnpm docs:check` and `git diff --check` also passed. Web-only suites were not rerun for this isolated SwiftUI geometry change; required PR CI remains separate.

## Preserved acceptance boundaries

The prior four iOS17.5 full-audit failures are retained under `artifacts/VPJ-01/ios17-foundation/verification.md` (PR296). They were not filtered, deleted, reclassified or cleared by this narrow regression. The original full maximum-size contrast diagnostic remains **FAIL**, not waived or converted to UNRUN. Physical VoiceOver, physical Dynamic Type, Reduce Motion, signed device build and real selected-Trip flows remain **UNRUN** as previously recorded. No physical phone action, signing/account change, backend/provider call, migration or production deployment occurred.

## Reproduce and rollback

Use `commands.jsonl` for full xcodebuild commands/results. Before a largest run, boot the recorded Simulator and run `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun simctl ui <UDID> content_size accessibility-extra-extra-extra-large`; normal uses `large`. Run `testWorkflowBadgeBackgroundAtSystemTextSize` and restore the original system setting afterward. Do not infer a requested setting took effect on a shutdown Simulator.

Revert this isolated product/test commit to restore the previous badge implementation. No stored data or migration rollback is involved.

After verification, system text size was restored to large and the test Simulators were shut down to release resources.
