# Bounded hypotheses and same-device baseline comparison

2026-09-10. These checks preserve FAIL outcomes; they do not complete VPJ-01.

## Hypothesis 1: a larger banner font repairs Chinese clipping

`20260910-012418` changed only the message from footnote to subheadline, added an AX identifier, and ran Chinese first with a full-visibility assertion and screenshot before `.all`. Banner `(16,371.67,361,90)` was fully inside `97.67...704`. Audit still reported Text clipped on the same sentence, now `(30,409.8,287.7,38)`. The hypothesis was rejected; subheadline was reverted. Trip was not reached in that failing method. See `subheadline-banner-visible.png` and the run observations.

## Hypothesis 2: positioning the viewport between text blocks removes edge failures

Tools run `20260910-012647`: the complete original-size banner was visible at the initial position `(20,170.67,353,485.33)` within `170.67...769`. After scrolling, Translation `(20,369,353,85.33)`, Address card `(20,454.33,353,147.33)`, and Safe phrases `(20,601.67,353,147.33)` each passed full-frame/hit assertions within `97.67...769`. The List had reached its content end: six successive alignment attempts left Translation at y369, while banner `-116.33...369` still crossed the navigation boundary. `.all` reported Dynamic Type unsupported (nil element). The proposed gap could not be reached through scrolling alone. This does not prove that the visible tool rows caused the failure.

English Ask run `20260910-012920`: the final prompt was fully visible at `(16,531,361,46)` within `97.67...705`; the observations list the complete-visible frame of every returned body string across initial/intermediate/final positions. At the content end, the main heading `(16,63.43,263,81.67)` still crossed the top boundary; the gap assertion failed before `.all`. This run is FAIL, not an accessibility audit pass. See initial/final coverage screenshots. Run `012829` returned exit0 but executed **zero tests** due to test discovery; it is not PASS evidence. Explicit ObjC exposure corrected the diagnostic harness. Tools preliminary run `012552` stopped on querying an offscreen, not-yet-instantiated row; it is not a product diagnosis.

`diagnostic.patch` preserves these temporary methods/IDs against 3f3b651; for hypothesis1 change preview.message's footnote to subheadline after applying the patch. All trial product/test changes were subsequently restored. No text was hidden, no issue filter added, and no audit category removed.

## Same-device product baseline comparison

The exact two-method `ComparisonTests.swift` replaced only the UI test file in two checkouts. Product files were unchanged relative to their stated commits, verified by `git diff --exit-code -- ios/VisePanda/VisePanda`. Both used the same iPhone15 iOS17.5 simulator, launch arguments, appearance, UI positioning, and `.all` calls. `continueAfterFailure=true` collects all audit failures; each callback returns false, and both tests remain failed. Product-tree and injected-test hashes are in `comparison-source.json`. This is **test injection**, not an unmodified historical CI run.

| Product / run | Chinese Ask initial `.all` | Tools largest `.all` |
| --- | --- | --- |
| main080d5f0 / 20260910-013341 | Same banner Text clipped; four contrast findings; one bottom-notice Dynamic Type finding | Two Dynamic Type unsupported(nil), Text clipped(nil), Translation contrast |
| candidate3f3b651 / 20260910-013501 | Same banner Text clipped; no other findings | Same two Dynamic Type unsupported(nil), Text clipped(nil); no Translation contrast finding |

Both exit65. The original Chinese message frame was `(68.3,406.8,273.7,14.3)`; the candidate frame was `(30,409.8,296.3,15.7)`. The unchanged sentence fails clipping in both layouts. The two requested failure points therefore have **existing-baseline evidence**, while remaining unresolved. No new issue category appeared in these two compared scenarios; this does not establish absence of regressions in untested states, maximum-size Ask, dark mode, or device/VoiceOver acceptance.

The failed baseline setup run `013213` stopped after the first Chinese contrast issue and could not initially query Translation because its larger banner put it outside the AX tree. The final matched test adds the original test's reveal-Translation step and collects all failures in both products. Only final `013341` / `013501` support the table.

Each comparison directory contains original exported failure attachments and manifest. Observation text retains reported labels/frames/errors. Full xcresult/logs remain under `/Users/jtcao/Library/Caches/visepanda/native-acceptance/<run>/`; commands.jsonl records commands and sourceRoot. The temporary baseline worktree is retained at `/Users/jtcao/Library/Caches/visepanda/native-acceptance/baseline080`, restored clean. The candidate's production/UI-test code is restored to 3f3b651; this follow-up changes evidence only. No full-suite rerun was performed because neither hypothesis established a fix, and the previous final-suite source blobs are unchanged.
