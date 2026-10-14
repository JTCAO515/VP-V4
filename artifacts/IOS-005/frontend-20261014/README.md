# IOS-005 frontend slice · 2026-10-14

Base: 8731c54ed45940477672233cb9f96dc2c0996421. Sole writer: this IOS-005 chat, branch `codex/ios005-expression-ui-20261014`.

Implemented in the existing NativeTranslationView/NativeTranslationCard, already called by the existing view:
- Recent/saved request source and English/Chinese direction labels; original, translation and AI back-translation remain separate.
- Card-local Chinese/English interface switch, scalable 44-point translation with optional larger text, scrollable content, stable accessibility identifiers and Done return without a generation call.
- Keyboard Done/interactive dismissal and dismissal before submitting/opening a card.
- Direct card calls refuse invalid, pending, cancelled, unknown, empty or missing outputs. Recent card opening and displayed cover require the current actor scope, valid accepted policy and matching current phrase value. Scene/scope and saved history TTL checks remain in the original consumer; changed Trip source closes the recent card.
- Isolated previews visibly say Sample / service not connected. They do not inject a production session or provider.

Wire limitation: NativeTranslationPhrase has no typed-text versus Trip-source metadata. UI states that limitation explicitly and never reconstructs provenance from the current input/Trip selection. No store/history/provider/PBX/AppShell changes or shared seam needed.

PASS: `python3 tests/contract/ios005-expression-ui/verify.py` executes real phrase validity/presentation predicates with synthetic values and actual current-result gate with minimal scope/policy containers; negatives cover missing/blank/oversized outputs, unknown/unsupported/same language, invalid original, nontranslated states, actor change/no active scope, missing/invalid/withdrawn policy and removed/replaced result. Actual production card typechecked against installed iOS Simulator SDK; full changed view syntax parsed. No mocked service or successful translation claim.
PASS: `node scripts/docs-check.mjs`; `git diff --check`.
Toolchain observed: Xcode 27.0 build 27A266a, Apple Swift 6.4. Effective model/service tier unavailable.

UNRUN: full affected App build, existing NativeTranslationTests and simulator interaction/preview rendering (Main coordinates the unique nonce/DerivedData build window); keyboard, language toggle, larger text and Done have source/typecheck evidence only. Real Auth/provider, independent bilingual semantics, physical device/max Dynamic Type/VoiceOver and release acceptance UNRUN. Existing store tests were inspected, not rerun or claimed PASS.

Code complete for this owned frontend slice; partial parent IOS-005/#216 stays open. Main handles exact-head review, applicable CI, navigation integration validation and protected merge. No merge or device/resource operations performed.

## DEBUG sample integration entry

Main can directly mount `NativeTranslationSampleExperienceView()` under the existing DEBUG navigation. No initializer arguments, environment objects, store, session, HTTP, provider, Trip, metrics or persistence are required. The leaf offers fixed English/Chinese direction and ready/pending/unavailable/unknown states, then presents the production `NativeTranslationCard` with `.sample` origin; its production Done callback dismisses back to the sample choices. All sample state lives in local SwiftUI State. It is compiled only under `#if DEBUG` and visibly labels Sample / not connected.

Required SourceFiles: existing `ios/VisePanda/VisePanda/Features/Translation/NativeTranslationView.swift` only (already in project). Existing NativeTranslationPhrase and Color.vpBackground remain its normal module dependencies. No new PBX entry or shared source patch is needed. The main Sample preview uses the same no-argument entry and fixed fixture factory as the debug experience.

PASS: affected real card + DEBUG sample SwiftUI SDK typecheck and full-view syntax parse; predicate negatives reused and rerun by the same scoped verifier. Sample rendered interaction is UNRUN here, owned by Main's unique simulator/build window.

## Resumed Muse-reference frontend seam

Main's single-file interface commit `de0ce108aab1df832913a2b9103f10977443c6af` was cherry-picked unchanged as `0645126f`. Main already owns/integrated that interface; do not integrate this dependency commit a second time.

New no-argument `@MainActor NativeFrontendExpressionView()` is a DEBUG-only leaf using `.environment(Main's existing NativeFrontendState)` from the host. SourceFile: `ios/VisePanda/VisePanda/Features/Frontend/Expression/NativeFrontendExpressionView.swift` (Main adds its PBX reference). It reuses the delivered sample experience and production card; no replacement shell or parallel state/store. The wrapper uses NativeFrontendBoundary/NativeFrontendStatePanel, shared screenState and selectedJourneyID/selectedMaterialID. Selected context titles are read from the same shared arrays and never copied into translation input. Ready/empty/loading/failed/cancelled are selectable; empty has a return action, and the shared panel owns loading cancel/failure retry/cancelled return.

The original text/actor/scope/policy/scene/saved-TTL gates are unchanged in this resumed increment. Production NativeTranslationView and the existing card/sample source have no new modifications. Existing sample card still supports interface language, text size, fixed bilingual direction, pending/unknown refusal and Done return.

PASS: same scoped verifier now typechecks the actual card, DEBUG sample, actual shared state/boundary/panel, and new wrapper together against installed iOS SDK (only AppTab/Color constants stubbed for isolated module assembly). Full App and interaction remain Main-owned; earlier Main build report applied to the prior integrated source, not this new wrapper. No simulator/resource operation here.
