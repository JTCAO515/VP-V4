# External Evidence Resolver C0

AI-35/#37 introduces a pure, caller-supplied observation validator. It is not a provider client,
URL resolver, cache, durable receipt store, claim renderer, card, Proposal or Trip writer.

`resolveExternalEvidence` accepts exactly one closed `weather`, `flight` or `rail` need, each with
the sole C0 purpose `trip_recheck`; and an observation of the same kind. The observation contains
only timestamps and a compact PolicyReceipt projection: opaque policy ID plus an `allowed` boolean.
Provider names, URLs, raw payloads, arbitrary metadata and persistence intent are rejected before
any result. A denied receipt returns `DATA_POLICY_BLOCKED`; an expired observation returns
`STALE_OR_EXPIRED`. An accepted result contains only kind, timestamps and opaque policy ID.

RL-06 has two named deterministic negative categories: policy denial and forbidden transport/raw
input; the runtime invariant is closed-key validation before an outcome exists. Invalid calendar
timestamps, future observations, and inverted observation timelines also reject. This proves no
external data use, not a licence grant or live data quality.

No transport, storage, cache, feature flag, model/provider selection, database, RLS or public route
exists. Roll back by reverting this module, its tests, contract and evidence; no durable or external
state is created.
