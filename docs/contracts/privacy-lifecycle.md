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

VPJ-36 adds a separate, explicitly bounded [Trip core deletion](vpj-36.md).
It does not execute or complete any existing all-user-data-v1 request.

## Conversation module export preparation (VPJ-78)

`assistant_conversation_export_owner_v1(owner, section, afterId, limit)` is a
service-role-only module helper with schema `assistant-conversation-export/1`.
The closed sections are `conversations`, `goals`, `messages`, `goalTripLinks`
and `goalTripReceipts`. Each page returns at most 100 `items`, `hasMore`,
`nextCursor` and `sectionComplete`. Rows use ascending source UUID keysets;
message sequence reconstructs conversation order. A section is exhausted only
when `hasMore=false`, `nextCursor=null` and `sectionComplete=true`. This is a
terminal-page marker, not proof that a caller collected earlier pages or all
five sections. The executor must collect every page of every section and
verify completeness before reporting module completion.

The helper exports retained policy/consent references, goal scope versions,
message text/sequence and Task/Turn/parent references. It does not reuse the
presentation reader's latest-conversation or 50-message limits. The link and
receipt items preserve the existing `assistant-goal-trip-export/1` manifest
fields. Cursors must identify an existing row in the requested owner/section;
unknown, foreign or deleted anchors uniformly require restart. Concurrent
changes can shift this live traversal; the future executor must define a
consistent snapshot/retry contract. No snapshot or full-download claim is
made by this helper.

Processing-consent withdrawal hides ordinary assistant content but does not
erase retained records; the privacy helper can still export those owned
records. It exposes no session credential, idempotency key or request digest.
Task/Turn and result content, Trip content, Memory and model financial records
are separate module responsibilities and are not copied into these pages.
This helper grants neither authenticated/anonymous EXECUTE nor direct private
table access, and does not change `/api/privacy`, request states or scopes.
The future executor must bind the owner to the reauthenticated request,
collect all modules and implement protected delivery before claiming export
completion.

Existing account deletion cascades conversation/goal/message, goal–Trip links
and receipts, and result artifact/revision/event rows. Retained text remains
under its existing permanent-hiding policy; this slice does not expand erasure
or retention. The disposable PostgreSQL test exercises database cascades and
old-identity read/write rejection, not an operational account-deletion worker.

Migration rollback is tested with transactional apply/rollback before forward
application. Operational rollback disables this new helper through an
append-only compensating migration revoking service-role EXECUTE; existing
readers, retained data and deletion behavior remain available.
