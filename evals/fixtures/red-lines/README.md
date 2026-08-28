# AI-42 red-line registry fixtures

This registry declares deterministic C0 fixture counts only. A count means the named test cases in
the registry contract, not an unbounded production safety claim. Each suite keeps its runtime
fail-closed invariant in `evals/quality/ai-42-corpus.ts` and in the Issue execution contract.

| Suite | C0 fixtures | Runtime failure result |
| --- | ---: | --- |
| RL-01 | 2 | Reject an unconfirmed Trip patch. |
| RL-02 | 3 | Reject a read without actor-scoped eligibility. |
| RL-03 | 2 | Reject a patch outside the closed operation union. |
| RL-04 | 3 | Return `NO_ELIGIBLE_EVIDENCE`. |
| RL-05 | 2 | Reject a claim without a current typed receipt. |
| RL-06 | 2 | Return `DATA_POLICY_BLOCKED` before a provider call. |
| RL-07 | 2 | Reject traces with non-allowlisted fields. |
| RL-08 | 3 | Keep candidate/importer rows behind eligibility and RLS. |
| RL-09 | 2 | Hide an expired Explore capability badge. |
