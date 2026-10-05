# VPJ-58 archive data: complete owner wire v1

Base `31e8db3110c05cb156d3d6f37595818efccbff9d`. Sole TS owns
`privacy/archive-data/**`, new API, contract and integration after explicit lease.
Candidate new SQL slot `20261006050000` has no match across available worktrees;
Main must review this complete wire and assign a NEW sole SQL session before SQL.
No runtime SQL is authored here. No target grant, credentials, Storage or deploy.

## Actual producer audit and reuse

`privacy_core_export_v1('trip_page')` (20261003170000:234) joins owned trips/head
snapshots and proves confirmation through original event/proposal/idempotency.
Its private `export_private.trip_content_v1` (120) is the accepted safe projection:
days{id,date,items,timeZone?}, items{id,dayId,title,startsAt?,endsAt?}. Reuse this
helper and the exact confirmation query; do not use a client service lease or
enroll/replace old D2 artifacts. The accepted projection intentionally omits
other snapshot JSON fields. Its limitations are in preview/file boundaries.

`trip_lifecycle_private.trips_v1` (20261005040000:287) is the actual lifecycle
projection, filtered owner/no queued deletion. `trip_lifecycle_export_v2` (431)
adds that projection but requires service/current core lease and explicit enroll;
no existing ordinary owner full file caller was found. `010000` only exports
lifecycle metadata, not original content. `archive_read` only returns archive
version/time. Existing archived exact result references permit historical reads,
not archive restoration or exporting all other data domains by reference.

Snapshot history already exists in `public.trip_version_snapshots`, with original
owner RLS and immutable confirmed writer; missing legacy versions cannot be
fabricated. Export every AVAILABLE selected Trip snapshot using the same safe
projection (0..archived head), bound/sentinel10000. Report missing version count
in preview. Head snapshot/title/owner/archive version must match or fail closed.
Lifecycle operations are original rows where owner matches AND trip_id is the selected Trip; exact receipt projection is
operationId/sessionId/receipt/erasedReason from v2. Do not export request_bytes.
Source-free erased operations without Trip linkage remain in lifecycle domain.

Independent results/conversation/Memory/Profile/Turn/user-artifact/entitlements,
Brief/Case/UGC/safety/publication/Guide/notification/order/PDF producers keep their
existing handlers, ownership and missing entries. No new attachment domain.
Archive file is all selected archive safe Trip content/available snapshots and
lifecycle operation receipts, with these explicit omissions, never all user data.
Original `tripDeletionHTTP` / linked Trip preview-confirm-read remains sole Trip
deletion. Native injects the existing selectedTrip Store using selected tripId/
tripVersion. Export endpoint accepts NO archived-trip erase command.

## Transport and commands (closed; no additional keys)

POST `/api/privacy/native/v1/archive-data`, application/json, bearer/current
Native session. Reject cookies/origin/query/method mismatch. Response JSON
`{data:<payload>}` or `{error:{code}}`; private,no-store; Vary:Authorization;
nosniff. SQL RPC `privacy_archive_data_v1(p_action text,p_input_bytes text,
p_expected_epoch bigint)` carries ORIGINAL command bytes; normal owner client.
All target API roles default denied. Local auth fixture grant is separate.
Flag `DATA_ARCHIVE_DATA_LOCAL=1`, config.environment absent AND VERCEL_ENV absent.
No new key/provider/service-role endpoint. Native does not fetch a public URL.

Scopes `archived-trip-data/1` and `archive-export-progress/1`.
Selection S={scope,requestId,tripId,tripVersion,objectIds}:
archive has one explicit lower-case trip UUID, version1..2147483647,objectIds=[];
progress has tripId/tripVersion=null and1..20 strictly sorted unique lower-case
request UUIDs, excluding current requestId. UUIDs/source version derive from list.

Commands:
- list: {action:"list",scope,cursor:null|{sourceDigest,afterId},limit:20}.
- preview: {action:"preview",...S}.
- export: {action:"export",...S,previewDigest,confirmed:true}.
- validate: {action:"validate",...S,previewDigest,confirmed:true}; no file bytes.
- erase: {action:"erase",...S,previewDigest,confirmed:true}; PROGRESS SCOPE ONLY.
- recover: {action:"recover",...S,mutationBytes:<exact original erase bytes>}.
Recover accepts only the original erase operation/selection/raw bytes; never new
operation, rebuilt bytes or converted export. Maximum command8192 UTF8 bytes;
recover outer16384. Absent/uncertain ACK remains same pending operation.

## Payload common binding

B exact={schemaVersion:"archive-data/1",...S,ownerId,sessionId,mobileEpoch,
sourceDigest,previewDigest,capturedAt,expiresAt,boundaries,allUserDataCompleted:false}.
All digests lowercase64hex; timestamps epoch milliseconds; clock absolute30s,
expiresAt=capturedAt+30000, never renewed on retry. Owner/session/epoch derive
from SQL live authority, never S. Current mobile guard + original reauth <=5min,
auth.users/auth.sessions locks and source checks precede effects/cleanup.
Every source row/session deletion/queued Trip deletion/revocation invalidates
pages/proof/validate; no archived guard bypass for writes. Fresh clock after
source hashing, after effects and at final return; late work rolls back.

Boundaries exact arrays are `ARCHIVE_BOUNDARIES` in contract.ts (same wire),
included in preview/start/page/proof/bundle/validate/erase receipt. UI renders all
exportFields,eraseFields,retained,missing; no completion badge for omitted domains.

List exact={schemaVersion,kind:"list",scope,ownerId,sessionId,mobileEpoch,
sourceDigest,capturedAt,expiresAt,items,hasMore,nextCursor,allUserDataCompleted:false}.
Archive items exact original lifecycle row={tripId,title,headVersion,state:"archived",
archivedVersion,archivedAt}; headVersion=archivedVersion, >=1. Progress items
exact={objectId,originalScope,tripId,tripVersion,state,progressErased}, no source
body or private titles; includes all retained expired/exported/erased fences.
List digest covers complete owner scoped inventory (10000+sentinel;1MB), selection
afterId must exist; pagination20, monotonic UUIDs, digest changes reject continuation.
TTL is fresh for stateless list pages; preview clock is stored separately.

Preview exact={...B,kind:"preview",counts:{trip,snapshots,operations,progress},
snapshotVersionGaps}. Archive trip count1, snapshots1..10000, operations0..10000,
progress0. Snapshot gaps=headVersion+1-available snapshot count, >=0. Progress
trip/snapshots/operations0, progress=objectIds.length and gaps0. NO source bytes
or deletion before confirmation. New preview request stores no source body.

## Source collection; SQL internal commands

export HTTP invokes `export_start` with EXACT original export bytes. Result
exact={...B,kind:"started",requestDigest:sha256(originalBytes),sections,limits}.
sections archive=["trip","snapshots","operations"], progress=["progress"].
limits exact={pageSize:50,maxPages:402,maxRows:20001,maxBytes:1000000}.
Only chosen selected rows; no global/account sweep. Per-section sentinel10000,
max20001 source rows, whole wrapper1MB including UTF8 and no partial truncation.

Internal page: {action:"page",...S,sourceDigest,previewDigest,section,
cursor:null|{sourceDigest,afterKey},limit:50}. Proof: {action:"proof",...S,
sourceDigest,previewDigest}. All SQL keys closed. Ordered section keys: trip=trip
UUID, snapshots=version decimal LEFT-PAD10, operations=operation UUID,
progress=object UUID. Require actual current-owner anchor and same sourceDigest;
first cursor null. Replay exact last cursor/limit only (no double count), no
skip/reorder/restart after terminal. Zero-row operations still emits terminal page.

Page exact={...B,kind:"page",requestDigest,section,items,hasMore,nextCursor,
sectionComplete,pageNumber}. pageNumber per section starts1. hasMore requires
50 rows and nextCursor exact digest,last key; terminal nextCursor=null.
Proof exact={...B,kind:"proof",requestDigest,coverage:"complete"|"partial",pages,rows}.
Complete only after all independent section traversals from null to terminal,
with exact counts and unchanged source/clock. TS independently validates each
closed source row, all page counts/keys and terminal proof, then assembles:
Bundle exact={...B,kind:"bundle",requestDigest,sections:[{section,items}],
proof:{coverage:"complete",pages,rows}}. Whole final JSON wrapper <=1MB.
Bundle/source proof is not file delivery. Native validates binding/raw digest,
creates protected private JSON bytes, checks exact hash/bytes/expiry and current
actor/session/epoch/foreground fence, and proves local actual file delivery.

Trip section row exact={tripId,title,headVersion,confirmationState,content,lifecycle}:
same old confirmation enum initial|confirmed|unknown, exact original safe content,
original isLifecycleTrip with state archived and same trip/title/version.
Snapshot row exact={tripId,version,title,createdAt,content}, same safe projection;
head title/content must match trip row, no unknown hidden JSON fields. Every
stored snapshot has non-null content under the actual original schema; missing
historical versions use the preview gap count, never a fabricated null row.
Operation row exact={operationId,sessionId,receipt,erasedReason}; original
isLifecycleReceipt match owner/op/session; erased reason FORBIDDEN|MEMORY_CONFLICT
requires null session/receipt, no request bytes. Valid original receipt must refer
to selected Trip via receipt.tripId; previous-active-only operations stay in lifecycle domain.

## New metadata inventory and erase closure (one domain)

New private request table holds ONLY binding/fences/section progress/minimal
decision, no Trip content/file. Owner+session FK cascades original semantics,
RLS and all API table privileges denied. Bounds10000 retained requests before
insertion, posthash whole scope1MB; expired key cannot restart or renew.
Current own preview/export record never included in selected progress digest.
All retained records, including requests whose Trip was deleted, are discoverable
via progress list; no live business Trip body required for progress privacy exit.

Progress row exact={objectId,ownerId,sessionId,mobileEpoch,originalScope,tripId,
tripVersion,objectIds,sourceDigest,previewDigest,requestDigest,state,capturedAt,
expiresAt,decidedAt,progressErased,progress,receipt}. All stored fields mapped;
requestDigest nullable before export/erase. state previewed|exporting|exported|erased;
expiry is clock-derived (no persistence change from just listing). Original
archive selection or original progress selection rules hold. progress array
ordered by original sections; entry exact={section,pages,rows,lastCursor,
nextCursor,lastLimit,terminal}, cursors null|{sourceDigest,afterKey}, lastLimit
null|50. No raw bytes. receipt null except immutable original progress erase:
{requestDigest,decidedAt,clearedProgress,sourceTrip:"not_modified",externalCopies:"not_erased"}.
This finite receipt does not recursively embed bindings/other receipts.

Erase atomically clears selected transient progress, sets selected progressErased
true; keeps minimal binding/source/time/selection/nonrenewal fences and existing
immutable receipts. It also stores own immutable minimal decision. Source Trip,
old D2 job, archived business state, session fences and external files untouched.
Receipt exact={...B,kind:"receipt",requestDigest,state:"erased",decidedAt,
effects:{clearedProgress,retainedFences,sourceTrip:"not_modified",externalCopies:"not_erased"}}.
retainedFences=selected count; clearedProgress0..20*3. Confirmation preview digest
and original bytes/CAS must match; an already committed same-byte decision may
recover across preview TTL with ORIGINAL decidedAt before expiry, current owner/
session/epoch+reauth and immutable original selection/digests. Never current source
recomputed into old receipt. Receipt is metadata erase only, not selected Trip delete.
Unknown exact={schemaVersion,kind:"unknown",...S,ownerId,sessionId,mobileEpoch,
requestDigest,allUserDataCompleted:false}. Unknown is not erased/completed.

Validate exact={...B,kind:"validated",requestDigest,current:true}. Requires original
exported request whose progress has not been erased, exact export byte digest stored, live source/absolute TTL/session;
does not create new metadata or return file content. Native calls before reopening
or sharing private file, clears own file/references on change/background/session/
expiry/deletion. Old server URL has no read/download route or reusable authority;
retained original archived result references remain controlled by original readers.

Errors allowlist ARCHIVE_DISABLED/UNAVAILABLE/CAPACITY/SOURCE_UNAVAILABLE/
SOURCE_CHANGED/EXPIRED/CONFLICT/ACK_UNKNOWN (ARCHIVE_ prefix), plus
UNAUTHENTICATED,SESSION_REPLACED,REAUTHENTICATION_REQUIRED,FORBIDDEN,INVALID_INPUT,
STALE_TRIP_VERSION. Auth/session/reauth401, forbidden403,input400,other503.
Dispatched erase + lost/malformed/mismatched ACK -> ARCHIVE_ACK_UNKNOWN503,
retain EXACT bytes. Export interruption -> unavailable; cannot fabricate completed
delivery or re-export automatically. All-user-data-completed always false.

Rollback only new RPC/private schema/API/registration/consumer; original source
tables/ACLs/Trip and confirmation/archive/deletion/old core artifact unchanged.
Owned fixture source/security/proof/file tests remain separate from target Auth,
target GRANT/deploy/provider/real user/device/ALL2, all UNRUN unless separately run.
