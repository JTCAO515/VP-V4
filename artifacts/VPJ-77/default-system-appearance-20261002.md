# VPJ-77 default system appearance — 2026-10-02

**New default-path evidence:** iPhone SE / iOS 17.5 and iPhone 17 Pro / iOS 26.5 each passed the real-system light/dark matrix and both same-process appearance transitions: **4/4 per runtime, zero failures/skips**. The combined scope is **32 default page states + four system-change transitions**. No forced QA palette was rerun or substituted for this result. #558 remains OPEN.

## Environment and scope

Clean branch `codex/vpj77-default-system-appearance-20261002` starts at verified main `c7cde77bbf4e261918703775357599501121a76c`. Previous #592 branch/worktree evidence is preserved. Read-only paired iPhone 17 lockState reported `passcodeRequired=true`, `unlockedSinceBoot=true`. No physical install, launch, unlock, permission, VoiceOver or Reduce Motion setting was attempted; no waiting for JT.

The host runner creates its own uniquely named Simulator, sets `simctl ui <owned UUID> appearance light|dark`, and requires actual readback to equal the request. App arguments include `-VPJ77Specimen`, locale/text-size and **read-only** appearance/trait probes. They never include `-VPJ77AuditAppearance`, so the fixture's presentation preference remains nil. Tests do not call `XCUIDevice.appearance` setters. The [previous iOS26 setter failure](accessibility-20261002/appearance-review.md) is retained; this independent host path does not repair or reclassify it.

Per runtime/style: zh/en × VP/Memory × initial/detail = eight page states. Each requires actual SwiftUI colorScheme equality and at least one visible UIKit paragraph's real `traitCollection.userInterfaceStyle` equality before screenshot and unfiltered `.all` audit. Every finding returns false. No ignored findings, expected-failure guard or UIKit theme forcing.

For transitions, the fixture remains in the same app process. The test verifies the initial theme, emits READY, and waits while the host actually changes the owned Simulator system appearance and reads it back. It then requires the new SwiftUI scheme and UIKit paragraph traits and records a screenshot. No app restart or QA preference changes are used to make the transition pass.

## Actual results

| Runtime | Default light matrix | Default dark matrix | Light → dark | Dark → light |
| --- | --- | --- | --- | --- |
| SE / iOS 17.5 | PASS, 8 states | PASS, 8 states | PASS, same process | PASS, same process |
| 17 Pro / iOS 26.5 | PASS, 8 states | PASS, 8 states | PASS, same process | PASS, same process |

Each selected test result is exactly one passed test, zero failed, zero skipped. The matrix runner additionally requires eight emitted page-state records, preventing a setup-only run from being reported as the full matrix. Runtime/setup was first confirmed on one page before expansion. Rendered [SE dark Memory](default-system-appearance-20261002/ios17-default-dark-en-memory.png) and [iOS26 dark detail](default-system-appearance-20261002/ios26-default-dark-zh-memory-detail.png) show actual dark surfaces and white text.

Source-bound summaries: [17.5](default-system-appearance-20261002/ios17-verification.json), [26.5](default-system-appearance-20261002/ios26-verification.json). Actual host setting/readback commands: [17.5](default-system-appearance-20261002/ios17-system-commands.json), [26.5](default-system-appearance-20261002/ios26-system-commands.json). Page and transition trait records: [17.5](default-system-appearance-20261002/ios17-traits.txt), [26.5](default-system-appearance-20261002/ios26-traits.txt).

Raw local outputs, logs, eight result bundles and full screenshots:

- `/tmp/vpj77-default-17-run-20261002/`
- `/tmp/vpj77-default-26-run-20261002/`

Both runner-created devices were deleted by exact owned UUID in finally. The two setup-only owned devices are separately cleaned up; no shutdown-all, erase-all, other-owner device or original iPhone/Simulator was touched.

## Reproduction and checks

Use a fresh `.xctestproducts` package built from this source (for example XcodeBuildMCP `test_sim` build-for-testing output). Then:

```sh
python3 scripts/ios/run-vpj77-default-appearance.py --runtime 17.5 --test-products /absolute/path/fresh.xctestproducts --output /tmp/new-default-17-evidence
python3 scripts/ios/run-vpj77-default-appearance.py --runtime 26.5 --test-products /absolute/path/fresh.xctestproducts --output /tmp/new-default-26-evidence
```

The runner supplies the explicit system-appearance gates, fails on any skipped/failed test or incomplete matrix, and acts only on its newly created device. In ordinary broad CI without this owned system-changing harness, the two new methods are explicitly gated skips; broad CI is not default-matrix acceptance. Prepared-package provenance remains the caller's responsibility; retained source checksums and compile commands identify the actual package used here.

Native compilation and actual owned-runner execution PASS; Python syntax, project plist syntax, docs check and diff check PASS. No runtime visual defect was reproduced in this default slice, so no theme/layout repair was added. The only fixture source addition is a new-flag-only read-only UILabel trait value; normal/QA rendering behavior is unchanged. Main approved the independent test's four unique-GUID registration additions. AppShellUITests (including Library #602 methods), shell, Ask, Knowledge, Translation and shared tokens are unchanged.

**UNRUN:** physical VoiceOver speech/gestures, real traveller discovery/observation, full-device fixture interaction, real product/Staging/provider/Memory/Trip acceptance. Simulator scripted discovery and audits are not equivalent to these. This closes only the previously unrun default-system matrix/switch evidence frontier, not #558 as a whole. Revert this PR to remove the read-only probe, independent test/registration and runner; no migration/data rollback.
