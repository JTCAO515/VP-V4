# Main review fixes — 2026-10-15

Tested source: `dca24127bf152107508d05f75c353bcd3a4fe085`.
Same owner/WT/PR704; only contract/tests and this existing artifact scope changed.
No shared CI or production port edits; no live provider/data/fee operations.

Original Main review on source equivalent to e264132a: Standards 2 P2,
Spec 1 P2 duplicating the enum issue. These failures remain historical and are
not relabelled as review PASS; Main must review the exact new source delta.

1. `scenario/mode/action` now require primitive strings before closed enum
   comparison. No `String(...)` coercion is performed by invocation validation.
2. `ownExact` requires enumerable own data descriptors, rejecting hidden
   required fields before `structuredClone` can discard resource/identity bounds.
   Existing Symbol/unknown/accessor denial remains. The same helper is used by
   the shipped native bridge, whose existing valid invocations still pass.

Reproduction before the source fix: the two new targeted tests both FAIL.
The enum negative observed one custom coercion invocation (expected zero).
The hidden required-field negative observed `root/scenario` accepted with null
error rather than INVALID_INPUT. Command:
`node --test --test-name-pattern='enum fields|nonenumerable required' tests/contract/harness-runtime-recovery/runtime.test.ts`.

After the fix: 27 direct tests PASS, 0 FAIL/SKIP/CANCEL; typecheck PASS;
diff whitespace check PASS. Log: `review-fix-checks.log.gz`.
New negatives cover each enum with arrays, boxed strings, objects, custom
toString arrays, Symbol.toPrimitive getters and required-field getters; every
required root/context/source/operation field is also tested nonenumerable,
including explicit `maxRequests: 1`. Assertions require INVALID_INPUT, mode and
outcome NOT_RUN, zero transport requests, zero coercions and zero getter calls.
Existing H09/H10, unknown/cancel, request/deadline/stream bounds remain passing.

Earlier lint/docs/CI selector evidence is retained; no shared or lint-scanned
production paths changed in this delta. Remote exact-head CI and Main delta
review remain pending. Actual Staging/provider, persistence/restart, fees,
Task→Trip/key/accounting authority and full #264 acceptance remain NOT_RUN or
unknown as previously documented. No parent closure or merge claim.
