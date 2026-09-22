# VPJ-26 remaining acceptance

- UNRUN: charged real-provider translation and bilingual semantic review. The historical CNY30/provider authorization was limited to 20260910; it is not reused. No provider request or secret lookup was performed for this slice.
- UNRUN: deployed Preview/native end-to-end path with a current-input policy, consent, real durable worker/budget, cancellation and exhausted generation budget. The API delegates these gates to existing code; isolated tests are not deployment evidence.
- UNRUN: on-device large-card interaction, VoiceOver, maximum text and field comprehension. Focused simulator state tests and a build do not prove these.
- UNRUN: direct same-Trip item selection; this slice accepts typed/pasted user-selected addresses only. No automatic location access or Trip mutation.
- Current saved scope is recent server history (20 total text requests), plus active-view memory; offline persistence and durable uncertain-submit recovery are not implemented by this slice.
- #216 remains open. No merge, production release, policy/permission changes or claims of whole-Issue acceptance.

## Concrete next real-model check, awaiting new spend authority

Use `evals/translation/field-text-cases.json`: eight C0 synthetic inputs, four semantic categories in both directions. Example source: “My limit is CNY 50, not CNY 500.” No user location, account history or sensitive personal data.

Proposed ceiling: CNY 1 total, at most eight model attempts, max 600 input UTF-16 units plus the versioned prompt and max 2000 output tokens each, one currently approved text provider, no provider fallback and no automatic retry. Before any request, the operator-configured price snapshot and durable reservation must prove the total fits that ceiling; stop if not. This is a proposal, not an activated budget or permission. The existing worker's retry configuration must be bounded accordingly before running this batch.

For each result record provider/model/config/price version, actual usage/cost or unresolved charge, structural status, and separate human semantic findings for negation, amount/currency, place and allergy. Do not turn provider failure, missing notice/worker or ambiguous costs into a passing translation claim. Fresh runtime policy/worker availability still needs checking; approval of spend alone does not provision them.
