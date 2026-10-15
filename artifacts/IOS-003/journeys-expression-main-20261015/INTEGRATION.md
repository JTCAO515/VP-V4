# Journeys / Expression selected-language integration

Code complete on accepted QA `a76799149cec460e742ab101a8b8190512b24464`.
Product source head: `e35bb736be284b46c6282fd32552b91ab8bed1f2`.

The existing English shell previously opened Journeys fixed labels in Chinese; Expression was also fixed Chinese or bilingual regardless of the selected UI language. Original owners supplied `35199584` and `7e028405`. Main integrated their deltas, localized the shared state panel, applied the explicitly released DEBUG place-sample default-language fragment, and corrected the three shared navigation labels found during actual UI verification. Dynamic titles, sample plan content, original/translated/back-translated text, IDs, stable tags, actions and authority guards remain unchanged.

## Verification

- Original owner source evidence: `../journeys-locale-20261015/evidence.md` and `../../IOS-005/frontend-20261014/locale-20261015/README.md`. Journeys 86 fixed-copy pairs execute with the accepted helper across six locales; normalization proves original actions/bindings/IDs/payload tokens unchanged. Expression executes actual locale selectors and compares unchanged dynamic/fixture/authority source. Original negative contracts and DEBUG/Release targeted SDK checks passed.
- Main shared-state/navigation contracts and actual Assistant SDK typecheck passed. Documentation baseline and diff checks passed. No new backend, provider, SQL, release or permission changes.
- Actual XcodeBuildMCP App build at `95188020`: PASS 42.063s (six existing warnings outside this diff). Runtime found three additional shared `AppRoute.swift` static labels. Corrected source `e35bb736`: App PASS 29.291s, no warnings. Same-source evidence is reused for later report-only commits.
- Main-owned simulator `8F6CA72C-73C0-45C0-8606-0543B1F725BD`, Debug, runtime iOS 26.5 (live simulator inventory), build SDK 27, minimum deployment 17; separate project/DD. Correct route selected with `-V10FrontendExperience`; app locale selected using existing `-VisePandaLocale en` / `zh-Hans`. Initial probes using the legacy escape flag or only OS language did not select this presentation/locale and are not acceptance evidence.
- Actual English UI PASS: Journeys list/header/status/day count; selected journey detail, day and place navigation; place sample starts in English; original Chinese plan payload stays unchanged. Expression sheet fixed copy and Back to chat; sample card starts in English with original `Hello.` / `你好。` / `Hello.` unchanged; Done returns to the same sample. Shared Loading → Cancel loading → Cancelled → Back to content works in English, with the sample boundary visible.
- Actual Chinese UI PASS: Journeys original heading/status/day count/header, Expression fixed labels, sample card initial Chinese interface and unchanged three text payloads. Shared return remains Chinese. Main visually inspected the actual English Journeys screenshot; no layout defect observed on this simulator.
- Independent two-axis fixed-source review: Standards 0 / Spec 0 at `a767…95188020` (five source files); separate shared navigation delta `cbfa…e35bb736` Standards 0 / Spec 0. Intermediate report-only deltas have source/tests zero diff. Reviews are source evidence, not real-service acceptance.

Private actual snapshots, screenshot and review outputs: `/Users/jtsm5p/Documents/Codex/2026-10-13/v10-main/ios-journeys-expression-locale-20261015/`; navigation follow-up review: sibling `canonical-acl-fix-review/`. Build logs remain in the XcodeBuildMCP workspace.

UNRUN: real Auth/provider/translation semantics, physical device, VoiceOver and release acceptance. These are local sample flows; no text was sent or translated, no Trip was confirmed or changed, no shared database was applied, and no TestFlight action occurred. Broad #203/#216/#365 completion is not claimed. Required exact-head CI and normal protected merge remain separate.
