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
that receipt. A private trigger permits only one-way erasure of existing operations;
all other receipt/bytes/digest updates are rejected. Business declines are terminal; auth/schema/internal/lock errors
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
deletion erase selected edges and associated raw operations. A minimal owner/op/reason tombstone remains to prevent replay. Recovery returns FORBIDDEN or
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

Run `VP_ARCHIVE_DB_TEST=1 node --test tests/integration/trip/lifecycle-postgres.test.mjs` from repository
root. Main approved moving the existing test into the required integration tree after
the actual classifier rejected its preparation path. The sole integrator registers
this path in the PostgreSQL lane, which already supplies `VP_ARCHIVE_DB_TEST=1`.
Main approved reusing that existing gate after the generic integration job was
found to run without the pinned Docker image. Generic integration explicitly skips
this DB test (UNRUN); the mandatory PostgreSQL lane must execute with zero skips.
No new flag, duplicated test, EXCLUDED entry or workflow change is introduced. It creates one isolated, network-disabled PostgreSQL
17.6.1.159 container per invocation, replays the accepted full migration chain,
then tests ACL/RLS, upgrade legacy, exact bytes/rejection/abandon, original create/
confirm/archive, capacity/swap/rollback, Memory erasure, pagination/head/delete,
real locks/replacement, service preservation, and new export enrollment/source
fences. It uses synthetic Auth tables and administrator claims; that is PostgreSQL
behavior evidence, not signed Auth/RLS HTTP or target acceptance.

PASS: earlier lifecycle-only targeted PG 9/9, zero skipped; migration replay; old archive/export
body hashes preserved; default-denied functions and private RLS; diff whitespace.
Initial SQL syntax/operator failures were fixed before this PASS. An added old
confirm replay test initially expected `applied` rather than the accepted
`already_applied`; its expectation was corrected without changing that writer. The successful
run took about 19 seconds. Actual old create/confirm/archive/deletion request/
worker/mobile replacement transactions race the new entry under observed lock
barriers; zero database deadlocks were recorded in this bounded matrix. Target schema/ACL activation, combined signed Auth/HTTP,
all existing DB lanes, unified Native/device, provider and real user rights actions
are UNRUN in this SQL checkout. TS owns combined integration and final one-PR
assembly; Main owns independent high-risk review and target enablement.

## Archive result reference proof

Main authorized only append-local CREATE OR REPLACE of the original v1 and v2
Trip result reference functions. Their original owner/deletion guards and
nonarchive bodies remain unchanged. Original ACLs survive replacement; no GRANT
is added. Common basis, artifact readers, publishers and action writers remain
unchanged. The two-step exact read is still required after receiving a reference.

The archive-only branch requires a real owner archive and the original exact
reader returning that artifact ID/revision, same Trip, historicalReadable=true
and current=false. It returns the original reference shape plus exactly
archiveHistorical:true. This proof permits read-only history on that Trip surface;
it does not turn the original current=false into execution authority. If saved
candidates are inaccessible, including withdrawn artifacts, return unavailable;
only absence of any saved candidate returns empty. The original bounded 64 plus
sentinel traversal remains.

v1 permits only validated comparison content under its original legacy reader.
v2 permits comparison, decision, practical, and journey drafts from task_output
or trip_snapshot when the original typed reader allows them. Proposal references
and proposal previews are excluded, including readable but unconfirmed previews.
No schema is granted a generic historical execution path. Existing decision and
TripProposal execution checks still reject an archived basis.

The added PG case uses the original task/message/goal-link and result publisher
to store real synthetic results before archive. It checks original nonarchive
responses, before/after identity, current=false, original body/ACL preservation,
Memory/consent/source withdrawal, deletion, artifact withdrawal, wrong owner/ID/
revision and pending proposal exclusion. It is local PostgreSQL evidence; it makes
no signed Auth, target deployment or phone claim. The first fixture attempt used
a planning-policy ID where the original intake requires a text-policy ID; the
next deletion fixture omitted its current session claim. These fixture failures
were corrected without weakening product guards. New-case results are recorded
in the accompanying archive-reader evidence, separate from the earlier 9/9 run.

Archive delta validation: PASS original reference ACLs and exact nonarchive body
restoration; PASS unchanged common basis/typed state/exact reader/publisher bodies.
A full local run including the new archive case passed 10/10 with zero skips.
The final candidate-count refinement scans the original owner/Trip/active 65-row
bound without filtering proposal IDs. Only success qualification excludes
proposal/preview. A separate owner/Trip stored-row presence check distinguishes
withdrawn-only history from actual absence and never returns an archive proof.
This last refinement was verified by running only the added archive case on one
new disposable PostgreSQL: selected case PASS, parent PASS, eight unchanged cases
explicitly skipped with their earlier evidence reused. It is not reported as a
new zero-skip full-matrix run. The committed mandatory DB-lane test retains all
cases with the existing VP_ARCHIVE_DB_TEST gate and no per-case skips. Temporary
focused registration and its container were removed. The actual stored publisher
case also covers practical translations and task-output drafts, pending-only
references/previews, exact ID/revision/Trip mismatches and historical decision
execution rejection. Evidence: archive-reader.txt next to the earlier pg.txt.

## Atomic bulk creation correction

PR #653 PostgreSQL CI observed 430 cases: 418 PASS, 12 FAIL, zero skips. The
12 failures in unchanged travel-pace/linked-trip-delete/trip-delete fixtures all
exposed the same product bug: in a multirow INSERT, BEFORE ROW inspected the
first inserted Trip before its queued AFTER ROW state registration and wrongly
classified that same-statement row as an existing legacy Trip.

The correction keeps BEFORE ROW owner prelocks and the original actual-row draft
registration/snapshot behavior. AFTER INSERT STATEMENT uses PostgreSQL's actual
NEW TABLE transition relation to validate the full set of owners after all actual
new rows have been registered as drafts. True pre-existing legacy rows still
block creation; final owner draft count must be at most three. Any capacity,
legacy, RLS or FK error rolls back the entire statement, including all owners'
Trips, snapshots, state rows and revisions. Only successful actual inserts bump
the owner revision once per transaction. ON CONFLICT DO NOTHING has no inserted
transition rows and cannot fabricate a new capacity mutation/revision.

No pending table, deferred FK, caller-controlled flag, mutable GUC/JWT marker,
role bypass or historical backfill was introduced. New private helper ACLs are
covered by the existing revoke inventory. The three failed CI test files and
their assertions remain unchanged. The SQL-owned pagination upgrade fixture now
seeds its history before this migration instead of disabling creation triggers
afterwards; it neither bypasses nor weakens the new statement guard.

The new owned bulk case checks ordinary authenticated 2/3-row creation, atomic
4-row rejection, true legacy rejection, mixed-owner success and full rollback,
foreign-owner RLS rollback, and concurrent 2+2 statements without false legacy
or capacity overflow. Actual affected results are recorded in bulk-insert.txt;
this scoped repair does not claim a new full 430-case PostgreSQL lane result.

Bulk repair observed results: owned lifecycle PostgreSQL 11/11 PASS, zero skips;
unchanged CI-failing travel-pace/linked-trip-delete/trip-delete regressions 12/12
PASS, zero skips. The regressions ran sequentially to avoid simultaneous stacks.
The first owned repair run exposed the old post-migration pagination seed; its
historical setup moved before migration, leaving the failing CI modules and all
assertions untouched. Original 430-case CI failure remains recorded as FAIL; its
repaired rerun belongs to the sole integrator. Target/phone/provider and actual
user rights actions remain UNRUN. No additional product changes remain here.
