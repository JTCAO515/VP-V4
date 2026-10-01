# VPJ-77 fixture accessibility repair — 2026-10-02

The launch-only `-VPJ77Specimen` has repaired the reproduced scroll-boundary contrast and Chinese paragraph clipping defects. **Explicit fixture QA light/dark palettes** now pass full `.all` audits with actual `colorScheme` equality guards on SE / iOS 17.5 and iPhone 17 Pro / iOS 26.5. This does not close #558, prove VoiceOver/traveller acceptance, or substitute forced QA presentation for default-system acceptance.

## Repair and retained failures

Branch `codex/vpj77-accessibility-repair-20261002` started at verified main `036e8f855f3e8b903b28aa4739179631c8a90534`. The [September 27 FAIL record](accessibility-20260927.md) is unchanged. New baseline `.all` auditing reproduced English `Inspect other visible states` outside the SE viewport, `View source and seam` behind the tab bar, and Chinese Memory explanation clipping. [Raw findings](accessibility-20261002/baseline-findings.txt), [VP](accessibility-20261002/baseline-en-vp.png), [Memory](accessibility-20261002/baseline-en-memory.png), [clipping element](accessibility-20261002/baseline-zh-clipping-element.png).

The two secondary actions now stay in the navigation bar with the same identifiers, localized labels and sheets. The VP instruction precedes the scripted actions, keeping it away from the composer/tab boundary. Input prompts use the existing dynamic secondary-text color; keyboard correction appears only with nonblank input. Search scrolls at large text size; action labels wrap. The only explicitly hidden element is the decorative arrow. Card body text uses an intrinsic multiline preferred-body-font UILabel, with complete original text, automatic content-size adjustment and color resolved against its SwiftUI environment. No font shrinking or paragraph/accessibility-child removal.

Details/search keep localized close labels on a 44-point close icon. Additional close-control Dynamic Type and Chinese findings remain in [detail diagnostics](accessibility-20261002/detail-findings-before-repair.txt). Both full audit tests call `.all`, return false for every finding and explicitly fail on audit errors.

## Appearance correction and boundaries

Main review found that f5df2498's named-dark screenshots actually rendered light. **The previous dark-render claim is withdrawn.** The original pictures remain as [SE requested-dark/observed-light](accessibility-20261002/se-en-memory-requested-dark-observed-light.png) and [iOS26 requested-dark/observed-light](accessibility-20261002/ios26-zh-memory-requested-dark-observed-light.png).

QA runs now explicitly pass `-VPJ77AppearanceProbe` and `-VPJ77AuditAppearance light|dark`. The preference applies to the root and each sheet's presentation boundary; every audited page must read back exactly the requested colorScheme before its screenshot/audit. QA navigation appearance/backgrounds are explicit; ordinary launches return **nil** and use **automatic** toolbar backgrounds. No global appearance, production shell or shared-token change. Final [SE actual dark](accessibility-20261002/se-en-memory-dark-verified.png) and [iOS26 actual dark](accessibility-20261002/ios26-zh-memory-dark-verified.png) are rendered evidence, not test-name inference.

**Default system following is separate.** `simctl ui … appearance dark` readback plus direct launch without either QA parameter produced actual dark rendering on [SE](accessibility-20261002/se-default-system-dark.png) and [iOS26](accessibility-20261002/ios26-default-system-dark.png). SE English default-dark detail also passed one targeted `.all` audit. These bounded observations do not prove a default-system full locale/Tab/detail matrix. The iOS26 XCTest-setter path still has a recorded **FAIL** (`requested dark, fixture light`); it is neither repaired nor replaced by the forced-palette result.

[Appearance review, targeted UIKit measurements, pixels and retained limits](accessibility-20261002/appearance-review.md). In the SE English detail comparison, actual system-dark/no-QA passes; system-light/QA-dark with automatic transparent/material navigation background reports title contrast FAIL despite dark screenshots and a white resolved title. A visible QA navigation background passes. Exact audit-algorithm cause is unconfirmed; neither title hiding/replacement nor finding suppression was used.

## Checks and limits

| Check | Result | Scope |
| --- | --- | --- |
| Explicit QA light/dark full `.all`, zh/en, VP/Memory initial/detail, SE 17.5 | **PASS 2/2** | 16 audited page states, requested/actual scheme equality. Final `…20-10-03…17300573.xcresult`. |
| Same explicit QA palette matrix, iPhone 17 Pro 26.5 | **PASS 2/2** | Another 16 page states. Final `…20-16-00…50a41ab5.xcresult`. |
| SE standard + maximum-size full delegation/task/return/Journeys/Library/search/keyboard correction/source chain; original large entrance | **PASS 3/3** | `…18-54-38…9fd5c7ed.xcresult`; its separate dark audit FAIL is retained and was fixed before final palette runs. Layout/interaction code unchanged by later palette-only corrections. |
| Actual SE system text size | **PASS** | Earlier final full chain: large → actual accessibility XXXL readback → large restored; actual maximum rendered paragraphs reviewed, not claimed to fit on one screen. |
| Default system-dark direct launch, no QA parameters | **PASS, bounded** | SE and iOS26 screenshots/readback; SE targeted English detail `.all` PASS. |
| Default system-dark full matrix / reliable iOS26 XCTest appearance setter | **UNRUN / FAIL respectively** | Explicit QA palette does not satisfy these. Setter mismatch bundle retained in appearance review. |
| Native build/tests, docs check, diff check | **PASS** | Affected native scope. New PR head CI remains separate; no unchanged Web build required locally. |
| Exploratory runner signal-kill | **FAIL, cause unconfirmed** | Later isolated maximum-chain test PASS; both records retained. |
| Physical VoiceOver, traveller discovery/observation, real Memory/task/provider/Staging/full product | **UNRUN** | No physical-device work or target writes; #558 stays OPEN. |

[Machine-readable runs and source checksums](accessibility-20261002/runs.json). Raw bundles are under `/Users/jtsm5p/Library/Developer/XcodeBuildMCP/workspaces/Codex-64a03d9ff053/result-bundles/`:

- Palette SE: `test_sim_2026-10-01T20-10-03-304Z_pid31617_17300573.xcresult`.
- Palette iOS26: `test_sim_2026-10-01T20-16-00-371Z_pid31617_50a41ab5.xcresult`.
- Latest standard/max/entrance: `test_sim_2026-10-01T18-54-38-576Z_pid31617_9fd5c7ed.xcresult`.

## Scope and rollback

Only fixture source, VPJ-77 methods in AppShellUITests and evidence. No shared tokens, AppShell/TabRoot/Trip/Journeys runtime, conversation/session, project registration, privacy or Memory authority changes. Temporary diagnostic probes were removed. Revert the PR to undo; no migration or retained user data. Independent main-session review and current-head CI remain merge gates.
