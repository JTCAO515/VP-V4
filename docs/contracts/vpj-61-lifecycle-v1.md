# VPJ-61 complete A1/A2 lifecycle wire

Issue #240; `lib/server/trip/lifecycle/contract.ts` is the executable closed wire.
This document is a development contract, not a target-environment result.

## HTTP

Native bearer: `GET/POST /api/trips/native/v2/lifecycle` and
`GET /api/trips/native/v2/lifecycle/operations/:operationId`.
`POST /api/trips/native/v2/lifecycle/operations/:operationId/abandon` sends the
same original command bytes to fence an unresolved operation. Web mirrors it.
Web same-origin cookie: identical paths under `/api/trips/lifecycle`.
All replies are private/no-store. Native rejects Cookie/Origin; Web rejects bearer,
checks same-origin mutations and uses the existing ordinary cookie client.
No service-role client, entitlement, provider or Trip content patch is introduced.

GET accepts no query for the first page. Subsequent pages accept exactly
`afterTripId=<UUID>&expectedRevision=<safe integer>`. Rows are sorted by Trip UUID,
at most 50 per page, with `nextTripId` equal to the last emitted ID when more exist.
The revision must remain equal across pages. Owner-wide capacity is never computed
from a page. A changed page/source/head fails with `LIFECYCLE_CONFLICT`.

Snapshot exact fields: `version:'trip-lifecycle/1',ownerId,sessionId,revision,
capacity,trips,nextTripId,serviceStatus:'unavailable'`. Capacity exact fields:
`draftCount,draftLimit:3,activeTripId,activeLimit:1,legacyCount`. Trip exact fields:
`tripId,title,headVersion,state,archivedVersion,archivedAt`; archive fields are null
except archived rows. States: `legacy,draft,active,retained,archived`.

POST common exact fields: `action,operationId,expectedRevision,
expectedActiveTripId,expectedSessionId,confirmed:true,tripId`. Create adds `title`
(trimmed, 1..160 UTF-16 units); activate adds `expectedHeadVersion`; reconcile adds
`expectedHeadVersion,state:'draft'|'retained'`; archive adds `expectedHeadVersion,
preference`. Head is 0..2147483647 (archive requires >=1); revisions are safe
integers 0..9007199254740990. UUID spelling is lowercase canonical. HTTP and SQL
both reject extra fields. POST body is bounded to 32 KiB original UTF-8 bytes.

Archive preference: exactly `{action:'skip'}` or
`{action:'keep',memoryRefs:[{memoryId,revision,sourceReceiptId,consentId}]}` (1..100
unique refs). Candidates use the existing `/api/memory/native/v1/profiles` read,
only preference + explicit/confirmed + granted. The server locks/revalidates owner,
current revision, source receipt and consent. This records this archive's selection;
it does not copy a preference or call the original Memory writer to manufacture a
new consent. Skip does not withdraw an already-global Memory. New/changed Memory
continues to use the original #199 writer and qualification projection.

POST returns one immutable receipt, exact fields:
`status:'applied',version,ownerId,sessionId,operationId,requestDigest,action,revision,tripId,state,
capacity,archivedVersion,archivedAt,preference,memoryRefs`. `requestDigest` is
lowercase SHA256 of the **original POST UTF-8 bytes**, including whitespace/key order.
Preference is `kept|skipped` for archive, `not_requested` otherwise; non-archive refs
are empty. No `reused` toggle changes a replayed receipt. Revision is commit-time
owner revision, not current authority. Recovery exact envelope:
`version,ownerId,sessionId,operationId,receipt` where null means no committed op.
An erased/invalidated operation is `MEMORY_CONFLICT`/`FORBIDDEN`, never a null
encouraging a new write. Same-op replay compares original bytes, not reserialized JSON.

Business rejection is a durable `status:'declined'` receipt returned HTTP 200,
exact fields `version,ownerId,sessionId,operationId,requestDigest,action,tripId,
status,reason,revision`. Reasons: `LIFECYCLE_CONFLICT,TRIP_CAPACITY,
LEGACY_RECONCILIATION_REQUIRED,STALE_TRIP_VERSION,PROPOSAL_NOT_CONFIRMABLE,
MEMORY_CONFLICT,IDEMPOTENCY_KEY_REUSE,USER_ABANDONED`. The first seven are checked
under the owner/session lock and recorded without product mutation; a retry cannot
later apply that declined op. Abandon serializes on the same op and records
USER_ABANDONED when absent, or returns the exact existing applied/declined receipt.
It fences a late original POST and does not undo an already-applied transition.
Path op must equal body op. Receipt null alone never clears a pending journal.

Native must journal the exact bytes and endpoint, owner/session/op/Trip/head/CAS,
keep one pending write, recover by op after unknown ACK, and accept a receipt only
if digest/action/target/session match. Cancellation/timeout/503 is unknown, not
proof of rollback. After receipt, refresh current snapshot; historical receipt does
not authorize editing, Memory use or restore an old Active. Account/host/session
change fences late results and detaches that scope. Preserve unresolved durable
journals under the existing NativeSession denied/unknown-ACK policy; only an
explicit successful erase clears them. Never replay an old session journal. Reuse of an op with
different bytes is `LIFECYCLE_OPERATION_REUSE` (409); no automatic new op retry.

Errors: `INVALID_INPUT`400; `UNAUTHENTICATED|SESSION_REPLACED`401; `FORBIDDEN`403;
`LIFECYCLE_CONFLICT|LIFECYCLE_OPERATION_REUSE|TRIP_CAPACITY|
LEGACY_RECONCILIATION_REQUIRED|STALE_TRIP_VERSION|PROPOSAL_NOT_CONFIRMABLE|
IDEMPOTENCY_KEY_REUSE|MEMORY_CONFLICT`409; `UNAVAILABLE`503. Transport/schema errors
never become an empty list, zero capacity or an authentication rejection.

## One append-only SQL integration

Requested slot: `20261005040000_vpj61_trip_lifecycle.sql`, one independent SQL
owner appointed by Main. No old migration edits. RPC:
`trip_lifecycle_v1(p_action text,p_input jsonb,p_request_bytes text default null)`.
Abandon uses execute input/raw bytes. Owner/session and operation-byte checks
precede replay/decline; only confirmed business declines are terminal. Unknown
schema/transport/internal/auth failures are not converted to declines. If archive
or source validation needs an exception, use a subtransaction to roll back all
product writes before persisting the decline while retaining the outer owner lock.
Read input exactly `{}` or `{afterTripId,expectedRevision}`; execute `p_input` is
the parsed POST command and `p_request_bytes` is its unmodified text (must parse
equal to input). Recover input exactly `{operationId}`; no raw bytes for reads.

Private owner heads serialize all capacity mutations and keep a safe revision.
Private lifecycle rows have Trip+owner FKs, one Active partial unique index per
owner, server-only transitions and owner/session-gated reads. Private operation
receipts key `(owner,operationId)`, store bound session, raw bytes, digest, target,
original receipt and source-edge metadata. No ordinary table write grants.
Actor checks existing Auth user/session, active mobile epoch for mobile JWT, Web
sessions using the accepted mobile guard policy; lock account/session before owner
ledger, Trip rows (deterministic order) and Memory sources. CAS covers owner revision,
current Active ID, exact JWT session and target head. Check op replay after session
gate before CAS so a committed operation survives later state changes.

Migration does not classify all existing Trips. Old archived rows stay archived;
untracked rows read as legacy. User explicitly reconciles legacy to draft (capacity)
or retained (only verified confirmed head+snapshot+proposal_applied event), or
explicitly activates it. Retained is a saved historical Trip, readable via the same
Trip/result pipeline; it cannot hide a newly created draft. Create is disabled while
any legacy remains, with a direct reconciliation choice. No date infers state.
Activation requires a confirmed head; a previous Active becomes draft in the SAME
transaction, checking resulting count <=3 (draft target swaps one-for-one). Existing
Active is unchanged if head/CAS/capacity/Memory/archive validation fails.

Create uses the existing empty Trip insertion/snapshot mechanism. A Trip INSERT
trigger takes the same owner capacity lock, rejects legacy/over-capacity, and assigns
draft so legacy Native/Web/direct Data API creation cannot bypass capacity. There
is no copy of old title/dates/items/temporary constraints/Memory/service rows. New
RPC create and old adapter insert share this one enforcement point, with exactly
one owner-revision increment. Existing idempotent create retry remains readable.

Archive calls `archive_trip_v1` (existing sole archive writer) in the same transaction
as validation and ledger/selection receipt. A trigger on `trip_archives` advances
capacity state/revision even when an old client calls v1, releasing Active/draft.
Do not rewrite v1 or build a second archive content writer. Archive keeps all
Trips/snapshots/results/unfinished Turn/service rows. Errors roll back selection,
archive and ledger together. Existing archive state is terminal; no unarchive.
Old confirmed writers retain original replay and archive guard semantics.

Creation/deletion and Trip head changes invalidate owner read revision so paginated
snapshots cannot quietly mix heads or reuse a stale target. Avoid double increments
from one lifecycle transaction. Define/test one lock order with old confirm/archive,
mobile replacement and deletion; retain conflict outcomes, do not hide deadlocks.

## Data rights and source limits

New source rows must join the accepted Trip export/delete graph. Trip deletion
cascades lifecycle rows and erases raw op bytes/receipts referencing that Trip
(including the previous Active), increments owner revision, and leaves a minimal
non-replayable op tombstone if required to prevent reuse. Memory deletion/forget
erases selected references and raw bytes/receipts carrying them; subsequent recovery
cannot revive them. No summary/index/second Memory store exists. SQL owner supplies
bounded owner-scoped export page RPC with a new version and exact live-job
lease/enrollment seam. Do not retrofit already-completed core exports or claim a
legacy job enrolled this source. Preserve old schemas; new-job support is explicit
and unenrolled coverage is partial. A wrapper, if used, branches by new job/version,
retaining existing executor/lease/source-revision proof. TS exact decoder changes
require a Main lease. No real user export/delete runs are authorized here.

#224's current `service_case_v1` only has requested/grant state and no Trip binding
or queued/accepted/assigned authority. Report `serviceStatus:'unavailable'`, preserve
all actual service rows, and link existing service access; never show “no unfinished
services” as a fabricated empty result. This dependency remains an explicit fact.
Pass expiry introduces no new read/export gate; test with denied new paid actions
while saved Trip/result reads remain. Target schema/deployment, provider cost,
real user export/delete, external service operation and phone are UNRUN boundaries.
