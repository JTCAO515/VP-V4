# Closed v2 model output receipt — structural data only

2026-10-03, #560. Base main `f97ecc5d0461471d017111e8607a80f01b5ccbdd`. This pure server module is not wired to the worker. It performs no I/O, SQL, dispatch, persistence, settlement or completion, and grants no permission.

## Exact constructor and wire

`createPlanningV2ModelOutputReceipt(raw: unknown, expected: unknown)` returns a validated immutable receipt or null. Constructor input is exactly five fields:

- `schemaVersion: "planning-v2-model-output/1"`.
- `binding`: exactly the approved13tuple fields, ordered for hashing as `owner,task,turn,lease,textPolicy,planningPolicy,scope,attempt,provider,model,priceVersion,intakeDigest,planningDigest`.
- `usageReceipt`: the unchanged closed `validated-planning-usage/1` schema.
- `output`: the existing closed PlanningSelection `{highlight:"jingan"|"peoples_square"|"none"}`.
- `observedAt`: real ISO UTC with exactly three fractional digits and `Z`, checked by Date roundtrip.

The independent expected object must itself be exactly that13tuple; each field must match as a string, with no inferred/latest/default source. First8 fields require canonical lowercase UUIDs, provider literally string `qwen`, model/priceVersion bounded ASCII keys, both digests distinct lower SHA256. Task differs from Turn as required by the existing planning usage contract. Exact string equality preserves the captured identities; Uppercase raw/expected UUIDs are rejected, not silently normalized. Corresponding usage UUID identities must match the lowercase tuple exactly; the old usage validator is unchanged.

Existing `validatedPlanningUsageReceipt` checks the complete usage/attempt shape, tariffs, time and token invariants. This module additionally rejects provider-array coercion and matches scope/owner/Task/attempt/provider/model/priceVersion to the tuple, plus usage turnId and separately accepted planning policyId. Existing legacy validators are unchanged. Selection requires an actual string enum; arrays, facts, prose, actions and suitability fields are rejected.

Main clarified the money boundary: **known non-negative integer actualMicros only**, including legitimate0. Unknown/null cannot form this existing validated receipt and is rejected; no fake0, nullable wrapper or schema widening. Nullable cached/uncached/reasoning token counts remain null and obey the existing validator. No caller-authored amount is established as a real ledger/provider fact by this structural check.

Constructor returns exactly nine fields: those five plus `outputDigest`, `usageDigest`, `executionAvailable:false`, `readyForPublication:false`. Nested binding, usage, attempt, token usage and selection are captured/frozen, so later input mutation cannot change the receipt. No supplied digest/flag is accepted on constructor input.

`parsePlanningV2ModelOutputReceipt(raw: unknown, expected: unknown)` accepts only this nine-field wire, with literal false flags. It reconstructs through the same constructor, recomputes both hashes and requires equality to the supplied wire hashes. Unknown/missing keys or changed output/usage with old hashes return null.

## Exact hash domains

SHA256 hex of UTF8 JSON.stringify arrays, with the13 values in fixed order above:

- `outputDigest = hash(["planning-v2-model-output/1",tuple,observedAt,{highlight}])`.
- `usageDigest = hash(["planning-v2-model-output-usage/1",tuple,observedAt,validatedUsageReceipt])`.

Validated usage has the existing validator's deterministic property order, so arbitrary input object-key ordering cannot change either hash. Output changes affect outputDigest; usage changes affect usageDigest. Captured tuple or outer observation time changes affect both. Usage's own observedAt is included inside usageDigest. Both timestamps are structurally validated; no freshness, relative ordering or current SQL authority is inferred.

These unkeyed hashes are integrity/correlation values, not signatures or trusted provider provenance. A caller can fabricate internally consistent data. Independent expected matching establishes structural coherence only: it cannot prove the original lease is current, that a model dispatched/generated this selection, that a durable output exists, or that ledger settlement permits publication.

## Evidence and remaining gap

Dedicated contract tests cover all13 expected mismatches with valid alternate UUIDs, all usage identity mismatches/crossattempt, enum arrays/provider coercion, unknown keys/self-supplied digests/flags, invalid UTC millisecond values, amount/null/0 and token/tariff invariants, immutable capture, key-order stability, independent output/usage digest changes and tamper rejection. Existing validator evidence is reused; binding/completion/PostgreSQL matrices are not rerun.

Actual worker integration, persisted dispatch/output/usage provenance, current SQL lease/policy/basis qualification, ledger matching, capacity/terminal replay, completion gate and publication transaction remain unimplemented/UNRUN here. A later reviewed producer/persistence contract must supply those proofs independently. Closed receipt flags stay false.
