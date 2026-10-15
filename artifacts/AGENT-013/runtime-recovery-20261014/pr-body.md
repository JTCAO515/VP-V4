## Summary

Related to #264 / AGENT-013. Harness can now invoke existing authenticated
cancellation, immutable confirmation and source-bound recovery/readback ports.

```text
H09: exact confirmation once → lost ACK → original operation/receipt/Trip reload
H10: current task cancel → bounded replay → unchanged Trip or applied/unknown
```

Adds a concrete injected-fetch bridge and same-source bounded JSON/Markdown
reports. No implicit live fetch, blind confirmation retry, second writer or
accounting authority. Unknown usage/quota/count/source attestation and
Task→Trip/key readback stay unknown; full acceptance remains NOT_RUN.

Includes Main's exact authorized CI prerequisite ec29bdf9 (cherry-pick ce4e024c),
which selects build whenever static-output tests are selected. Original shared
bytes are preserved; original cases/grader/registry/CLI/package/DB remain untouched.

## Evidence

- **Before:** no runtime-recovery directory/callable adapter in the clean f702d71a base.
  **After:** 27 controlled tests drive the shipped adapter/endpoint bridge and
  existing production durable-worker semantics: ACK loss, restart reconciliation,
  cancellation/late effects, identity/source/receipt conflicts, no retry/debit,
  monotonic deadline, request/read/byte/empty-chunk bounds and hidden own fields.
- Main's original Std2P2/Spec1P2 review remains recorded. The two input defects
  are fixed: primitive-string enums without coercion, and enumerable data-only
  required fields before cloning. Added negatives reject arrays/boxed/coercion
  objects, getters and hidden required bounds/context fields before transport.
- PASS: typecheck, lint, docs check, diff check; unchanged CI selector tests pass.
- Actual Staging/provider, persistence restart, DB/data/fee/production and
  Native/Web target consumers NOT_RUN. No whole #264 closure claim.
- Scoped evidence: artifacts/AGENT-013/runtime-recovery-20261014/verification.md.

## Merge Danger

**Door:** two-way. New module remains explicitly invoked; Main owns shared hookup.

**Blast Radius:** Harness. Confirmation/cancellation can call existing mutation
ports only through supplied authorized transport; callers must preserve visible
diff/explicit confirmation and ordinary-user auth. CI prerequisite broadens build
selection without skipping or weakening checks.
