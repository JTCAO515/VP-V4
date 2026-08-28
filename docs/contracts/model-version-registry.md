# Model version registry C0

AI-47 records only queryable metadata for a fixture attempt: the prompt, schema, route-policy and
safe-phrase version/digest pairs. Stable system/tool/schema metadata is separate from the variable
Trip, evidence and message version descriptors. External text is always labelled `untrusted`.

The registry rejects unknown fields and never accepts raw prompt, response, reasoning, media or
message content. It does not persist an attempt, invoke a provider, or change a route.

When `requestedModel` differs from `returnedModel`, or `expectedObservedVersion` differs from
`observedVersion`, the result is `drift_detected` with the fixed checks `conformance` and `eval`.
Both a stable record and a drift result set promotion to `hold`; a later operator-approved route
decision is outside this contract.

Rollback is removal of this C0-only metadata boundary; existing fixture routing stays unchanged.
