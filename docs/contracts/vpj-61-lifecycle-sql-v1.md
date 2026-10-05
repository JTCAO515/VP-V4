# VPJ-61 lifecycle SQL integration

Issue #240. Sole migration: `20261005040000_vpj61_trip_lifecycle.sql`.
Runtime wire follows `lib/server/trip/lifecycle/contract.ts` at `d6925af1` in the
TS integration branch. This SQL checkout contains no TS or Native changes.

## RPC and authority

`trip_lifecycle_v1(p_action text,p_input jsonb,p_request_bytes text default null)`
accepts `read`, `execute`, `recover`, `abandon`. Read/recover reject raw bytes;
execute/abandon require the original UTF-8 text, at most 32 KiB, parsing equal to
input. UUIDs are canonical lowercase RFC versions 1–5, variant 8/9/a/b. Input
objects reject extra keys. Create title is trimmed and bounded in UTF-16 units.

Private owner heads, states, operations, Memory edges and export progress have
RLS and no ordinary table grants. All new functions, including public RPCs,
explicitly revoke default execute from PUBLIC/anon/authenticated/service_role.
Target qualification, EXECUTE activation and role inventories belong to Main and
the TS integrator. This migration provides no activation grant.

Actor validation requires a current Auth user/session and an authenticated,
non-anonymous claim. Account locking and the existing `mobile_access_v2` distinguish
mobile epochs from ordinary Web sessions; a Web session need not be the current
mobile session. CAS binds JWT session, owner revision, previous Active and target
head. Replay checks exact bytes before CAS and returns the original applied or
declined receipt. Different bytes produce `LIFECYCLE_OPERATION_REUSE`, preserving
that receipt. Business declines are terminal; auth/schema/internal/lock errors
remain unknown. Abandon returns the committed receipt or fences the same bytes
with `USER_ABANDONED`; it never undoes a committed operation.

## Original writers and locking

New Trip INSERTs, including direct old Native/Web adapter insertion, become drafts
through one trigger. Capacity is owner-wide: three drafts and one Active. Legacy
rows are not backfilled; creation requires explicit reconciliation first. Retained
is only available when reconciling a legacy confirmed head. Activation validates
snapshot plus `proposal_applied`, swaps the old Active to draft atomically and
checks resulting capacity. No dates infer state, and new drafts cannot become
retained to bypass the limit.

Archive calls the unmodified `archive_trip_v1`; a trigger releases capacity for
both original and new callers. Existing confirmed writers and archive guards keep
their bodies and replay semantics. The new ledger records Memory keep/skip intent
only: lock and qualify original consent/profile/source receipt, requiring same
owner, exact revision, preference, explicit/confirmed and granted. It creates no
consent, summary, Profile, content or service row. Existing services remain intact;
`serviceStatus` is `unavailable` because #224 supplies no Trip status authority.

New RPC locks are owner privacy advisory seed 34 (try), Auth user KEY SHARE NOWAIT,
mobile account UPDATE NOWAIT, owner ledger UPDATE NOWAIT, session KEY SHARE NOWAIT,
then sorted Trip rows and consent/profile/receipt sources NOWAIT. A statement
trigger prelocks actor-owned direct Trip mutations before tuple locks. Old confirm
already holds account/proposal; old archive holds account/archive advisory; old
worker deletion can hold Trip first. All additional inverse edges use try/NOWAIT,
so contention raises SQLSTATE 55P03 rather than waiting through a cycle. It maps
to an unknown/retryable transport result, never a durable business decline. There
is no caller-controlled GUC, JWT tag or transaction flag to authorize a bypass.

One owner revision bump per transaction uses private `last_xid`, not a client flag.
Create/archive triggers and head/title mutations invalidate paginated reads.
Read pages are sorted by UUID, at most 50; continuation binds the same revision.
Trip deletion admission and physical deletion invalidate the revision. Admission
releases the deleted Trip state and hides it from lifecycle pages; original
content/deletion workers still own their graph and cleanup.

## Erasure and rollback

Trip deletion admission or physical deletion erases raw operation bytes, digest,
receipt, target and previous Active references, including operations whose target
is another Trip. Memory delete/forget/reject and consent revocation/source-receipt
deletion erase selected edges and associated raw operations. A minimal owner/op/
session/reason tombstone remains to prevent replay. Recovery returns FORBIDDEN or
MEMORY_CONFLICT, never a null suggesting a new operation. Root account deletion
cascades all new rows without recreating a ledger. Product faults roll back state,
archive, selections, counters and operation insertion together.

Rollback is a forward operational disable of the new RPC before migration-specific
removal, preserving existing Trips, archive receipts, Memory history and applied
operation outcomes. Do not delete historical receipts or edit applied migrations.
Removing enforcement while a new writer remains active is not an accepted rollback.
No target rollback or schema operation was performed here.

## New export version

`trip_lifecycle_export_v2(p_action,p_input)` is a default-denied worker seam.
Every action binds exactly `{requestId,leaseId,generation}` to a current original
core job, accepted executor lease and source revisions. `enroll` explicitly enrolls
a running lease; completed jobs cannot be enrolled or retrofitted. `page` adds
`section:'trips'|'operations',cursor:null|UUID,limit:1..50` and follows strict
continuation/replay progress; page counters are server-owned. The trips section
calls the original core Trip projection and adds lifecycle under the new
`trip-lifecycle-export/2` version. Operations include receipts and erasure reasons,
excluding private original request bytes/digests as internal recovery material.
No content/Memory body is cached in progress; page replay reprojects a frozen source.

`proof` returns `trip-lifecycle-export-proof/2` with exact job/lease/generation and
complete coverage only after both sections are terminal and source revision is
still current. Unenrolled/source-changed jobs return partial; wrong/stale leases
are unavailable. This proof describes the new source traversal, not an already
committed/downloaded artifact. A new executor/decoder must consume the v2 seam and
retain proof when assembling its new artifact; absent enrollment it must report
partial lifecycle coverage. Existing `privacy_core_export_v1` and
`trip-core-export/1` decoder/body are unchanged and claim their original scope only.
TS decoder/executor integration requires Main's shared-file lease. No real user
export/deletion or completed artifact retrofit is authorized by this change.

## Validation

Run `node --test tests/preparation/vpj61-trip-lifecycle/pg.test.mjs` from repository
root. This intentionally stays in preparation until the sole integrator leases the
shared DB-lane registry. It creates one isolated, network-disabled PostgreSQL
17.6.1.159 container per invocation, replays the accepted full migration chain,
then tests ACL/RLS, upgrade legacy, exact bytes/rejection/abandon, original create/
confirm/archive, capacity/swap/rollback, Memory erasure, pagination/head/delete,
real locks/replacement, service preservation, and new export enrollment/source
fences. It uses synthetic Auth tables and administrator claims; that is PostgreSQL
behavior evidence, not signed Auth/RLS HTTP or target acceptance.

PASS: current targeted PG 8/8, zero skipped; migration replay; old archive/export
body hashes preserved; default-denied functions and private RLS; diff whitespace.
Initial SQL syntax/operator failures were fixed before this PASS. The successful
run took about 14 seconds. Target schema/ACL activation, combined signed Auth/HTTP,
all existing DB lanes, unified Native/device, provider and real user rights actions
are UNRUN in this SQL checkout. TS owns combined integration and final one-PR
assembly; Main owns independent high-risk review and target enablement.
