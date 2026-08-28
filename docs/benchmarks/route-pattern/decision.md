# RoutePattern spike decision: reject runtime adoption

**Status:** rejected for runtime adoption on 2026-08-28.

RoutePattern retrieval is not added to runtime. The retained baseline is POI/Fact/Guide hybrid
retrieval followed by current-evidence revalidation and the deterministic ConstraintEngine.
GraphRAG remains rejected as the baseline.

## Basis

1. No vetted or licensed RoutePattern/trajectory corpus is present.
2. The only executable fixture is self-authored synthetic data and is explicitly non-runtime.
3. The paired guardrail evaluation finds no final-state improvement; it proves that a suggested
   order cannot replace current route-matrix or Fact evidence.

## Reconsideration criteria

A future, separately reviewed Issue may reopen this decision only with all of the following:

1. A reviewed source-rights receipt and data-policy decision for a defined corpus.
2. A minimised frozen schema, revocation/expiry handling and no raw trajectory or actor data.
3. Stratified spatial and temporal paired evaluation against the POI/Fact/Guide baseline showing an
   improvement in final feasible state without degrading rights, freshness or constraint outcomes.
4. Explicit retained revalidation through current route matrix, Fact and ConstraintEngine, followed
   by the normal pending-Proposal path.

Rollback is a normal revert of this documentation and the synthetic eval. No runtime, schema,
migration, provider, cache or user data exists to roll back.
