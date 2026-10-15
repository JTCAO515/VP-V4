# IOS-005 fixed interface language correction

Accepted QA dependency: a76799149cec460e742ab101a8b8190512b24464.
Normal merge into the existing owner branch: 06f3b39f. The shared-state add/add conflict was resolved with the exact accepted QA file (blob 9327b6c8602106e06ae58cb34c7742aa2814088f), without authored shared changes. Original stable commits, branch and evidence remain.

Expression fixed headings, explanations, context labels, state picker labels, empty return action and navigation title now follow the environment locale: zh selects Chinese, all other locales select English. The existing App host owns selectedLocale and environment propagation. No new state store, wrapper or service.

Sample fixed notice/instructions/direction/state labels/original heading/open action/return explanation/title now follow the same locale. Its large card initializes the interface from that locale rather than the source language direction. The existing card-local Chinese interface toggle remains available and its fixed label follows the card interface. Language direction tokens and every original/translation/back-translation string remain unchanged.

Dynamic material/journey titles remain direct values. The fixed synthetic phrase factory, NativeTranslationPhrase readiness extension, recent card authority guard, saved reader entry and explicit source-origin wording are byte-identical to the accepted QA dependency. No automatic translation, sends, fees, persistence, scope/consent/TTL changes or resource operations.

Main independently owns the shared NativeFrontendStatePanel localization. This increment continues calling NativeFrontendStatePanel(state: state), unchanged. The ignored shared-state-panel.patch candidate was prepared before Main acknowledged ownership, never applied, and is superseded by Main's patch; it is not part of this commit.

PASS:
- verify_locale.py executes the actual Expression/Sample selectors for authored fixed labels in en/zh-Hans; checks dynamic payload expressions, fixture factory and authority/readiness/history source against exact QA bytes.
- verify.py executes existing negative readiness/actor/consent/current-result checks, typechecks actual SwiftUI card, Sample, shared state and Expression against installed iOS SDK, and parses the full Translation View.
- node scripts/docs-check.mjs and git diff --check.

UNRUN here: full App build and visual simulator interaction, owned by Main's exclusive simulator window. Shared-panel English UI remains Main's integration responsibility. Real provider/Auth/independent semantics/device/VoiceOver acceptance remains outside this fixed-copy increment; #216 stays open.

Integration: cherry-pick the correction commit only onto QA a767 or its descendant; do not merge this historical owner branch or reapply its accepted shared dependency.
