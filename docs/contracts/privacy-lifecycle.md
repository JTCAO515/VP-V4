# Privacy lifecycle request contract v1

V4-17 owns the owner-scoped request and receipt boundary for an all-data
privacy export or deletion request. A request covers exactly `profile`,
`memory`, `trip`, `turn`, and `user_artifact`; it cannot select a partial,
reordered, unknown, provider, or raw-payload scope.

`POST /api/privacy` accepts only a same-origin, authenticated request with a
new UUID and returns `202` with `requested` and `not_started`. A repeated UUID
with the same action returns its existing request; a UUID owned by another user
is forbidden. `GET /api/privacy` returns only the requesting owner's request
receipts and is `private, no-store`.

This contract records intent only. It does not export data, erase Profile,
Memory, Trip, Turn, or artifacts, purge a backup, contact a provider, or claim
retention completion. A later separately accepted executor must define the
source reads, encrypted delivery, deletion order, backup expiry, retry and
final immutable completion receipt before changing `not_started`.

Rollback: revert the V4-17 route, adapter, pure contract, migration, tests and
runbook. No existing product data is modified by a request.
