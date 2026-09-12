# Web readback of saved native Ask

Related to #195/#206; PR #344. This delivers a bounded read-only result, not full S2 or production acceptance.

## Observed result

On Staging migration 41, the existing English and Chinese test accounts signed in through the browser UI and read the same saved native service chains. English task `cb563c5f-709a-4cb3-a72b-3cdc22ad505c`, child `c129e9c3-6d68-4de6-af51-4c229c8c484b`; Chinese task `e9561b6c-472b-4dac-8439-018e137ebd14`, child `abba340c-8737-4dfb-87d9-642caa7d1ad3`. Both preserve their original city/language, question and published 12306 sources. Conditions and exclusions remain visible.

- Initial code `121988625c144cead8bf17a70ee714de8e5d3df3`, dedicated Preview `dpl_9KnD13xf3JJ5RVKPQQgdqHf6V2bE`: English/Chinese desktop and 390×844 source readback, same-task continuity, partial/clarification/blocked display, cross-tab logout and account switch passed. Over 36 seconds, 50 samples include two expired/hidden samples, zero reading-position drift and preserved source expansion. Disabling the reader removed facts/sources within the observed 27.665 seconds.
- The first real cross-tab test exposed an existing workspace defect: saved answers cleared, but old thread metadata remained. Final code `3278ed8157ce58bc5260244ad0439782f8b84225`, dedicated Preview `dpl_CZCsEXPfTzJtys7BpiBsPkaVaSVi`, remounts the entire workspace on logout/owner change. Real regression: 11 answers and 30 thread buttons became zero, Trip selector disappeared, and only the Chinese owner's original task returned after login. No original English task remained.
- Final browser network-offline emulation cleared facts; restoring network and navigating away/back re-read the same Chinese task. Final zh desktop 1280×900 and mobile 390×844 were inspected; no horizontal overflow. Legacy `locale=ar` retained `lang=ar`, RTL and its existing Arabic workspace without exposing the zh/en-only answer region. No console error/warning entries in the recorded final browser log.
- Actual OS background/freeze is **UNRUN**: this browser connection keeps its two tabs logically visible. Expiry hiding, real page navigation/return, offline/online and cross-tab auth were observed; do not substitute these for every browser/OS lifecycle.

## Validation

Projection/adversarial tests 4/4 PASS: scope/claim/consent/expiry binding, full request elapsed time, original versus current partial outcome, duplicate rejection, private-field omission and safe links. Existing real local GoTrue/native HTTP suite extended with SSR cookie identity, query/native/cross-site rejection, accepted foreign owner isolation, reader disable, consent withdrawal and deleted-session rejection: PASS, four synthetic model calls unchanged by all Web reads. No new SQL migration. Lint/typecheck/docs/build passed; final CI Quality `34720232265` and Budget `34720232303` plus Git Preview `Af2nvqMj4nK9Aa4FaCoFtKawMN1o` passed. Native was not changed; its accepted evidence is reused. Independent authority review finished with 0 Critical / 0 Important after visible-conditions and metadata-lifecycle fixes.

First-window before/after: 65 controlled-account attempts, 65 Turns and 304974 tariff micros CNY unchanged. This is a stored tariff observation, not a supplier invoice. No model or service worker was started for this Web slice. Final second-window audit independently retained the same 65 attempts/65 Turns/304974 micros. Both windows closed successfully, final WAF version26 restored, read/Ops disabled and active members0; the final browser session logout was observed before closing tabs. Original six auth users/three Trips and migration 41 were preserved.

## Boundaries and retained observations

Default-off Web flag plus existing local/Staging target/policy gates; no production activation, no client-selected policy, no new consent/Turn/Trip mutation. Normal Git previews remain unactivated. Production build guard and all production/shared-Staging aliases were verified unchanged before merge.

The first CLI deployment command had a duplicate flag and exited nonzero; inspection identified only a normal Git deployment before the corrected dedicated deployment. One immediate mobile capture retained the previous viewport, and one post-navigation selector inspection timed out; their raw observations are retained, followed by actual DOM-size checks and successful readback. They are not relabelled as product passes. Raw screenshots/DOM/process logs are retained in `/Users/jtcao/Library/Caches/visepanda/grounded-web-read-20260913` and `candidate-v2`.

Complete #195/#206 and S1–S6 acceptance remain open. In particular, do not infer crash-during-provider, every technical-failure/repair scenario, all browser lifecycle modes, real supplier billing or production readiness from this read-only slice. Physical-phone verification remains deferred by JT.
