# VPJ-77 fixture accessibility repair — 2026-10-02

The launch-only `-VPJ77Specimen` now passes full XCTest accessibility audits, including contrast, on iPhone SE / iOS 17.5 and iPhone 17 Pro / iOS 26.5 in zh/en and light/dark. This closes the reproduced fixture audit defect; it does **not** close #558 or establish VoiceOver, traveller, Staging or product acceptance.

## Reproduction and repair

Clean branch `codex/vpj77-accessibility-repair-20261002` started at verified main `036e8f855f3e8b903b28aa4739179631c8a90534`. The original [September 27 FAIL record](accessibility-20260927.md) remains unchanged.

The new unfiltered `.all` audit reproduced three findings on that base:

- English VP: `Inspect other visible states`, text frame y=700.8…721.3 on a 667-point screen.
- English Memory: `View source and seam`, text frame y=623.8…644.3 behind the tab bar.
- Chinese Memory: the complete long-term preference explanation reported `Text clipped`.

[Raw baseline findings](accessibility-20261002/baseline-findings.txt), [VP screenshot](accessibility-20261002/baseline-en-vp.png), [Memory screenshot](accessibility-20261002/baseline-en-memory.png), [clipping element](accessibility-20261002/baseline-zh-clipping-element.png). The disabled on-page correction action had already been repaired in main; the empty keyboard still had a disabled correction action.

`AssistantSpecimenView.swift` now keeps the two secondary detail actions in the navigation bar, with the same identifiers, full localized accessibility labels and sheets. They stay visible while the page scrolls. Input prompts use the existing dynamic secondary-text color; keyboard correction appears only with nonblank input, alongside the existing empty-state explanation. Action labels wrap vertically, with the decorative arrow excluded from speech. Search content scrolls so the shared result is reachable at maximum text size.

Opening the details during full auditing exposed additional close-control Dynamic Type and Chinese paragraph findings, retained in [detail diagnostics](accessibility-20261002/detail-findings-before-repair.txt). Details/search now use a 44-point close icon with the original zh/en accessibility label. A local multiline `UILabel` measures card paragraphs at the proposed width with the preferred body font and automatic content-size adjustment. It exposes the complete original text; no sentence splitting, truncation, font shrinking or accessibility-child removal is used for these paragraphs. Ineffective clipping/chrome/spacing experiments were removed.

No finding is ignored: both audit tests call `.all`, return `false` for every issue, and record audit exceptions as failures. The only explicitly hidden element is the decorative arrow, not a finding or actionable control.

## Final checks

| Check | Result | Scope and evidence |
| --- | --- | --- |
| iPhone SE, iOS 17.5: zh/en full `.all` audits in light/dark | **PASS** | VP initial + state details; Memory initial + source details, 16 page states. Two focused tests in final 5/5 run. |
| iPhone 17 Pro, iOS 26.5: same full `.all` audit matrix | **PASS** | Light 1/1 and dark 1/1; another 16 page states. Temporary owned Simulator subsequently deleted. |
| SE zh/en first encounter → compare → delegate → task → return → Journeys/Library/search shared result → keyboard Memory correction → source detail | **PASS** | Standard and maximum-size full-chain tests, in final 5/5 run. Standard test retains full empty hint/field-above-tab-bar assertions. |
| SE actual system text-size setting | **PASS** | `simctl ui … content_size` read back `large`, then `accessibility-extra-extra-extra-large` before final run, then restored/read back `large`. Normal tests explicitly request L; the maximum chain requests accessibility XXXL. |
| Existing maximum-size Memory/search entrance test | **PASS** | Retained and run alongside the stronger complete chain; final SE result 5/5, no skips. |
| Screenshot review | **PASS** | Normal prompts are readable; final maximum-size screenshots show that the new paragraph label actually grows with Dynamic Type. They are scrollable paragraphs, not an assertion that an entire paragraph fits on one screen. |
| Native build/test compilation | **PASS** | XcodeBuildMCP compiled and executed the changed native/UI targets. |
| `node scripts/docs-check.mjs`; `git diff --check` | **PASS** | Affected native/fixture scope; Web build is not required for unchanged Web code. |
| Real VoiceOver gestures and spoken order; traveller observation | **UNRUN** | Simulator audit and scripted discovery are not these acceptance criteria. No physical device work or unlock dependency in this slice. |
| Real Memory/task/provider/Staging/full product acceptance | **UNRUN** | No account Memory, background work, Trip mutation or target-environment operation exercised. #558 stays OPEN. |

Machine-readable [runs and source checksums](accessibility-20261002/runs.json). Local bundles are under `/Users/jtsm5p/Library/Developer/XcodeBuildMCP/workspaces/Codex-64a03d9ff053/result-bundles/`:

- SE final 5/5: `test_sim_2026-10-01T17-31-49-755Z_pid31617_b7ef64df.xcresult`.
- iOS 26 light 1/1: `test_sim_2026-10-01T17-26-35-065Z_pid31617_50b6e27d.xcresult`.
- iOS 26 dark 1/1: `test_sim_2026-10-01T17-29-16-415Z_pid31617_adaa11c7.xcresult`.

Retained final screenshots: SE [en/light](accessibility-20261002/se-en-memory-light.png), [zh/light](accessibility-20261002/se-zh-memory-light.png), [en/dark](accessibility-20261002/se-en-memory-dark.png), maximum-size [en detail](accessibility-20261002/se-largest-en-source-detail.png) / [zh detail](accessibility-20261002/se-largest-zh-source-detail.png); iOS 26 [en/light](accessibility-20261002/ios26-en-memory-light.png), [zh/light](accessibility-20261002/ios26-zh-memory-light.png), [zh/dark](accessibility-20261002/ios26-zh-memory-dark.png).

## Scope and rollback

Only the fixture source, VPJ-77 methods in `AppShellUITests.swift`, and this evidence change. No shared design tokens, production AppShell/TabRoot/Trip/Journeys, conversation/session, project registration, privacy or Memory authority changes. Undo by reverting this PR; no migration or retained user data is involved. Applicable PR CI and independent main-session review remain separate from the local evidence above.
