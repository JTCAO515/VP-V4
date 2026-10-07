# Frozen C signed Auth finding: progress page uses the wrong identity

Integrated SQL c645820c / SHA256034af8b6… source, integrator1137baa5.
Signed GoTrue/JWT and actual registered HTTP test r1/r2 both FAIL; each owned
fixture cleanup PASS. Actual erase/exact-byte recovery/progress erasure and
whole confirmed Trip/explicit Memory retention had already passed before failure.
Final progress HTTP returns503 CONVERSATION_SOURCE_UNAVAILABLE. Direct signed RPC
returns both original-sensitive and progress operation rows, each independently
validOperationRow=true, no RPC error. A row validity check is not a list PASS.

Concrete source: 060000 lines953–957 use
coalesce(value->>'rootId',value->>'requestId') for the list page key (and actual
for anchor membership). Progress inventory rows can retain a NONNULL original
conversation rootId. Thus the server sorts one row by its conversation UUID and
another by its operation UUID, while TS/Native require monotonically increasing
requestId. Continuation membership/filter/last cursor/hasMore are likewise wrong
and can skip/repeat multiple operations of the same original root.

Minimal sole-SQL correction: choose key by the OUTER requested inventory scope:
- conversation-delete-progress/1 -> row.requestId;
- conversation-sensitive-data/1 -> row.rootId.
Use the same explicit CASE for anchor existence, page predicate/order/aggregation,
last_n, hasMore and nextCursor. Keep owner qualification, original source digest,
existing-anchor membership, bounds, TTL, authorities and immutable decisions.
Never client-sort the wrong page, relax decoder/assertions, or alter other domains.

This is handed to current sole SQL01a1154f; TS does NOT edit migration in parallel.
Existing Auth test will choose low operation/high original root/middle progress
operation UUIDs so the regression cannot pass by random UUID coincidence. Only
the affected original Auth/PG consumer is rerun after fixed source is returned.
No new scope, target GRANT, real user erase, reporting matrix or new writer.

Resolved by sole SQL39684776 (integrator18937e95), exact scope-selected key in
all five changed source lines. Its focused PG3 PASS/zeroSkip proves25 actual
preview operations,20+5 pages/repeated roots/interleaved progress, no skip or
duplicate, exact cursor and invalid root/absent/digest anchors. Original Auth r3
then PASS1/zeroSkip with deterministic low request/high root/middle progress IDs,
actual PG+TS+registered HTTP, and owned cleanup3634d70c PASS. R1/r2 FAIL retained.
