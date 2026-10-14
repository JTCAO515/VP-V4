# IOS-005 frontend slice · 2026-10-14

Base: 8731c54ed45940477672233cb9f96dc2c0996421. Sole writer: this IOS-005 chat, branch `codex/ios005-expression-ui-20261014`.

Implemented in the existing NativeTranslationView/NativeTranslationCard, already called by the existing view:
- Recent/saved request source and English/Chinese direction labels; original, translation and AI back-translation remain separate.
- Card-local Chinese/English interface switch, scalable 44-point translation with optional larger text, scrollable content, stable accessibility identifiers and Done return without a generation call.
- Keyboard Done/interactive dismissal and dismissal before submitting/opening a card.
- Direct card calls refuse invalid, pending, cancelled, unknown, empty or missing outputs. Recent card opening and displayed cover require the current actor scope, valid accepted policy and byte-equivalent current phrase. Scene/scope and saved history TTL checks remain in the original consumer; changed Trip source closes the recent card.
- Isolated previews visibly say Sample / service not connected. They do not inject a production session or provider.

Wire limitation: NativeTranslationPhrase has no typed-text versus Trip-source metadata. UI states that limitation explicitly and never reconstructs provenance from the current input/Trip selection. No store/history/provider/PBX/AppShell changes or shared seam needed.

PASS: `python3 tests/contract/ios005-expression-ui/verify.py` executes real phrase validity/presentation predicates with synthetic values and actual current-result gate with minimal scope/policy containers; negatives cover missing/blank/oversized outputs, unknown/unsupported/same language, invalid original, nontranslated states, actor change/no active scope, missing/invalid/withdrawn policy and removed/replaced result. Actual production card typechecked against installed iOS Simulator SDK; full changed view syntax parsed. No mocked service or successful translation claim.
PASS: `node scripts/docs-check.mjs`; `git diff --check`.
Toolchain observed: Xcode 27.0 build 27A266a, Apple Swift 6.4. Effective model/service tier unavailable.

UNRUN: full affected App build, existing NativeTranslationTests and simulator interaction/preview rendering (Main coordinates the unique nonce/DerivedData build window); keyboard, language toggle, larger text and Done have source/typecheck evidence only. Real Auth/provider, independent bilingual semantics, physical device/max Dynamic Type/VoiceOver and release acceptance UNRUN. Existing store tests were inspected, not rerun or claimed PASS.

Code complete for this owned frontend slice; partial parent IOS-005/#216 stays open. Main handles exact-head review, applicable CI, navigation integration validation and protected merge. No merge or device/resource operations performed.
