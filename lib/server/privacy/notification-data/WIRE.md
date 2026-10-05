# #239 ALL1 notification data exit — closed wire v2 (monotonic drain)

Owner: sole TS/API/contracts/integrator. Base immutable material-server HEAD
f1f065c8c6e79c6c0c380d3cd961939e1e57ba01. Whole #239/full ALL1/ALL2 remain OPEN.
Own production files are lib/server/privacy/notification-data/** and the new
POST /api/privacy/native/v1/notification-data route; own tests only. No runtime SQL
is written by this session. New SQL requires Main review, unused-slot readback,
and a new official SQL session. Shared original notifications, coverage, Session,
PBX and registry require exact release/lease before edits. All targets default OFF.

## Scope and actual source inventory

notification-trip-data/1 selects 1..20 sorted unique owned Trip UUIDs, each covering
ALL existing personal notification rows for that Trip (including archived Trip
and retained fences after Trip deletion). It never deletes Trip/business results.
notification-device-data/1 selects 1..20 sorted unique owned installation UUIDs;
preview includes every associated outbox/attempt across the owner's Trips, so
its cascades are explicit. It leaves reminder/watch/source business rows intact.
notification-exit-progress/1 selects 1..20 own exit request UUIDs; transient page
progress erase retains immutable receipts and all nonreplayable fences. No implicit
all-user/all-account scope and no DTO owner/epoch/service lease/endpoint/role.

Source 20261005030000_vpj30_reminder_delivery.sql has settings (global runtime
configuration, no owner data), devices, reminders, watches, dismissals, outbox,
attempts and operations. public.travel_reminders (legacy v1 and v2 producer) is
also actual sensitive reminder storage and INCLUDED. The existing metadata export
omits tokens, many original columns, outbox/attempt rows and new exit state; it is
not proof of this full scope. No original export or cancellation is called erase.

New private schema must inventory settings(default disabled/nonpersonal), requests
(minimal immutable binding+decisions), pages(transient hashes/counters/cursors; no
source projection or command bytes), fences(minimal permanently nonreplayable
identities). No captured source body is persisted for preview/export. Every new
owner table RLS/default denied; explicit RPC grants only disposable fixture until
separate target authority. No original ACL/grant expansion or provider activation.

Each trip export object exact {objectId,reminders,watches,dismissals,outbox,attempts,
operations,travelReminders,fences}; every table row is direct snake_case mirror of
ALL original columns, strict type/key validators in rows.ts. Timestamps canonical
ISO UTC milliseconds using original stamp; SQL epochs converted to safe integers.
Arrays sorted by PK, no limit truncation. Dismissal PK ordering is
source_kind:source_id:semantic_digest, NOT next_step_id (which can duplicate).
Outbox and attempts only via owner qualified parent joins; reject corrupt cross-
owner edges rather than export them. Include expired/terminal rows as owned data,
without implying source qualification or granting renewed delivery rights.

Device object exact {objectId,device,outbox,attempts,fences}; device may be null
only for retained device fences; every original device column including private
push token goes to explicit owner preview/private export only (no general logs,
trace, analytics, storage artifact or raw response logging). Device erase deletes
selected binding AND associated attempt/outbox records; no implicit reminder delete.
Trip erase deletes all selected notification and public.travel_reminders rows and
all selected operations; opaque ID/digest fences replace the replay inventory.

Fence exact {kind,objectId,tripId,requestId,requestDigest,erasedAt}, sorted kind:id,
kind reminder|watch|dismissal|operation|outbox|outbox_parent|watch_semantic|attempt|device|exit_request. Nullable
tripId for global device/request and nullable requestDigest when none exists.
Every fence belongs to the current actor; trip-group fences have that Trip ID.
Dismissal objectId = original opaque(hash(canonical [owner,trip,sourceKind,sourceId,
semanticDigest])) to represent full composite PK; retaining next_step_id alone is
insufficient. Operation fences include original operation ID/request_digest.
Attempt fences use attempt_id; outbox fences use notification id. Every erased
outbox ALSO fences outbox_parent objectId=reminder_id (new notification UUID cannot
requeue old reminder); for watch delivery additionally watch_semantic objectId=
opaque(hash(canonical [owner,watch_id,semantic_digest])). Original unique pair
watch_id+semantic_digest must survive row removal via this permanent fence, so
poll cannot regenerate old payload with a fresh random reminder/notification ID.
Device erase preserves watch/source rows and original fresh semantic consent,
but rejects old erased delivery parent/pair. Poll skips fenced pairs before it
writes candidate rows; default old poll business/source qualification unchanged. Device exit
also fences old register/revoke operation IDs from any owned Trip whose immutable
receipt.resultId is selected device ID; those source-free operation receipts may
remain in the original operation table, but replay cannot return original success
or recreate old binding. Include these actual fences in all relevant inventories.

Progress object exact {objectId,scope,objectIds,originalSessionId,originalMobileEpoch,
sourceDigest,previewDigest,requestDigest,state,capturedAt,expiresAt,committedAt,
decidedAt,pages,rows,progressErased,pageProgress,effects,drain,receipt,fences}.
pageProgress direct full mirrors {request_id,owner_id,page_number,after_id,rows,
request_digest,source_digest,created_at}, sorted page_number <=4. Effects null
before erase, full actual effects at fenced/erased. Drain metadata exact
{state:none|pending|complete,generation,waitMs:0|5000,finishedAt:null|epochMs};
nonce is service-control secret, explicitly excluded from owner data export;
all other actual request/page/fence columns covered by this projection. receipt null unless authoritative terminal erasure, otherwise full exact
original receipt. Source/session bound ownership for access; historical receipt
records keep original session/epoch (outer listing/binding uses current session).
state previewed|exporting|exported|fenced|erased|expired. Transient pages erased sets true;
receipt/request metadata and object/operation/device/dispatch fences survive. Old
fences survive original row deletion and cannot be pruned by progress erase.

Limits selected20, list20, pageSize5, maxPages4, maxRows20 GROUPS, total source/fence
rows <=10000 per group, total serialized wrapper <=1,000,000 UTF8 bytes including
binding and proof. Sentinel/capacity rejection BEFORE complete proof/erase; no
truncation, silent omission or oversized retained inventory. Own counts literal
rows from actual effects, not selected count or planned counts.

## Authority, lock hierarchy, source CAS, retention

Ordinary verified nonanonymous authenticated owner JWT; native_session_v2 current
owner/session/mobile epoch, expected epoch rechecked inside every SQL RPC, original
mobile guard/access + created_at within last five minutes (future rejected).
Authentication/session/reauth and expected epoch precede ANY lookup feedback,
cleanup, cursor mutation, source effect or UUID conflict. Recovery lookup filtered
by owner first; foreign request ID and absent request ID are identical unknown.
Own ID reused with different original mutation digest is conflict.

Retain original roots: auth.users KEY SHARE -> mobile_accounts UPDATE ->
auth.sessions SHARE -> selected/affected public.trips UPDATE in UUID order ->
owner devices UPDATE in UUID order -> reminders UPDATE -> watches UPDATE ->
outbox UPDATE -> attempts UPDATE -> dismissals/operations/public.travel_reminders
stable PK order -> new request/page/fence rows. Old worker/service and old owner
producer serialize on mobile_accounts before Trip/device roots. For device erase,
discover owner-qualified affected Trip IDs first and acquire those Trip roots in
order before devices. No root inversion, new lock-first current_actor, FK deadlock
escape, error whitelist, role substitution or NOWAIT weakening. New advisory root
must follow existing appropriate owner guard, never alter old function roots.

SourceDigest includes ALL original internal columns + existing relevant fence
metadata + Trip head/archive/delete state + selected device-referenced operations
and affected outbox/attempt rows. Digest under locked consistent source snapshot.
PreviewDigest covers exact authoritative binding, selection, complete projection
and exact closed boundaries. JS/native compare authoritative hash; they do not
reimplement SQL canonical digest. Request bytes digest SHA256 original UTF8,
never parsed/reformatted bytes. Each page/proof/mutation rechecks current source
CAS, original preview digest and original immutable captured expiry; fixed30s
with one floor(ms) capture, no renewal. Date/lease expiry affects capability checks
without inventing delivery outcomes or mutating auth-failed source.

## Permanent producer and dispatch fences (requires SQL + shared worker lease)

Row deletion alone is INSUFFICIENT. Fence original v1 public.travel_reminders
INSERT and v2 reminders/watches/devices/dismissals/operations/outbox/attempts writes
with append-only guards. All guards serialize through original owner/mobile root
or run within old root-locked producer; reject old fenced identities before any
insert/upsert/replay result. Old travel_reminders_v2 receipt-return branch must
check erased operation/result fence BEFORE returning a success receipt, via narrow
new migration replacement/seam approved by Main. v1 schedule uses reminder UUID
and must reject that UUID after erase. register_device old command reusing original
operation or device ID cannot reinsert. Do not keep raw token/body as tombstones.
Poll copied candidates and finish/read old attempt cannot restore deleted rows;
new dispatch checks exact notification/attempt/device/operation fence. SQL original
eligibility/source/session/baseVersion/TTL/revision/quiet hours stay in force.

### Executable monotonic sender bound and authoritative drain

No admitted clock uncertainty or guessed clock-skew allowance exists in v2.
Original notification_private.attempts constraint gives <=5000ms server grant
interval. New begin_fenced action returns exact old attempt DTO plus integer
leaseBudgetMs: floor(min(lease_expires_at,material_expires_at)-single captured
server authorized_at) in (0,5000]. Store/return the same original bound, no renewal.
The v2 proof covers only senders using this process-local permit. Already-running
old sender processes holding unfenced grants remain outside that proof. Target
rollout must stop/drain those old senders before enabling the upgraded capability;
that target/old-process gate is explicitly UNRUN, never inferred from these fixtures.
Original begin action MUST fail blocked and disclose no token: a still-running
old wall-clock sender cannot receive a new unfenced grant. finish/read retain
original shapes and original qualification, additionally reject erased IDs.
No new queue, periodic worker or automatic resend. Existing poll unchanged.

Minimal shared production hunks required (leased Main before edits):
- notifications/scheduler.ts runNotificationScheduler: use owned sender.ts
  beginNotificationSend (strict DTO+permit) which captures hrtime.bigint()
  immediately BEFORE begin_fenced RPC invocation; parse exactly old attempt keys+
  leaseBudgetMs and reject budget over original absolute interval/5000. Remove
  Date.now / injected options.now from SEND authorization. Mint own in-process
  permit with createNotificationSendPermit(originalStartNs,leaseBudgetMs,signal).
  Callback construction/RPC transit consumes original budget. No remint from
  received DTO, restart, serialized bytes or new start time. Finish/read retained.
- notifications/delivery-contract.ts send input adds mandatory sendPermit of type
  NotificationSendPermit (internal only, never a serialized API grant). The owned
  WeakSet authenticates permits; copied/JSON/fake callbacks fail. Timer abort and
  monotonic guard bound the permit; backward monotonic anomaly fails closed.
- notifications/apns.ts createApnsTransport.send rejects absent/non-genuine permit,
  checks it before signing/exchange, closes it in finally. apnsExchange input
  adds same original permit. Actual production exchange checks canWrite before
  connect, and beginNetworkWrite ONCE immediately BEFORE session.request in the
  connect callback; checks canWrite immediately BEFORE stream.end. Delayed
  connection/early timer/event loop resumption cannot write after deadline.
  timeout = min(original3000,remainingMs()) and original permit.signal destroys
  session/stream, removes listeners on finish. No await between leaf guard/write.
  Bytes already initiated before expiry are in-flight external unknown/accepted,
  explicitly never recalled; stream destruction stops new local writes, cannot
  revoke provider-received bytes. Injected exchange tests are labelled synthetic.

The sender proof is elapsed duration: beginStartNs occurs before SQL grant commit;
startNs+budgetMs <= startNs+5000ms. Calendar changes at either client/worker cannot
extend that process-local deadline. Server wall time determines source authority
as before, but DOES NOT prove drain completion. In particular a SQL wall clock
jump forward cannot turn issued sender bytes into expired proof. Plain pg_sleep/
clock_timestamp comparisons are not selected as monotonic drain evidence (the
REL_17 pg_sleep implementation itself uses GetCurrentTimestamp).

Erase now has a narrow two-transaction finalization seam in the existing new
request record, NO queue or new privacy engine:
1. Current ordinary-owner erase rechecks original preview/TTL/CAS under unchanged
   roots, writes PERMANENT producer/dispatch fences and deletes actual sensitive
   rows atomically. committedAt is captured inside original 30s authority window.
   For BOTH trip/device data scopes ALWAYS commit state fenced with captured
   actual effects, NO erased success yet, even when present attempt count is zero.
   Earlier Trip/device cascades may have removed an issued attempt before this
   preview; absence of current rows is not proof of no outstanding grant. Progress
   erase alone cannot affect dispatch and uses immediate receipt with null proof. Any attempt outcome
   accepted/error/unknown/attempting may have old granted bytes; clock/state is not
   used to skip barrier. Existing/old v2 owner producers, poll and begin_fenced
   must reject those fences. Future new IDs require new explicit consent; old IDs
   cannot replay. Body erase never rolls back after commit because ACK is lost.
2. Owner erase/recover returns internal binding+{kind:draining,state:fenced,
   requestDigest,committedAt}, exact no extra fields. HTTP never presents this as
   success. The existing native selected LOCAL service credential (NativeConfig
   serviceRoleKey; no credential discovery/creation) optionally composes owned
   drain.ts. If unavailable, ACK_UNKNOWN and preserved exact operation journal;
   durable fence/body erasure remains and same-op recovery can finish later.
3. Service-only public.privacy_notification_data_drain_v1(p_action text,p_input
   jsonb), default OFF/ungranted. Service begin exact input {ownerId,sessionId,
   mobileEpoch,requestId,scope,objectIds,requestDigest}; all from verified CURRENT
   owner context/exact bytes, never separate client DTO. Lock original roots and
   same fenced request; validate record owner/session/epoch/source decision,
   CURRENT mobile session/attempt and original 5-minute reauth before any feedback.
   Generate fresh cryptographic nonce and increasing generation, replacing old
   challenge; output exact {kind:drain_challenge,protocol:monotonic-drain/1,ownerId,
   sessionId,mobileEpoch,requestId,requestDigest,generation,nonce,waitMs:5000}.
   This response proves permanent fence has committed; no source bodies/tokens.
   Owner/anon cannot call it or supply elapsed proof. If already complete return
   original immutable receipt. Service credentials are existing server authority;
   target role/grant activation remains separately unapproved, fixture only.
4. After fully receiving/validating challenge, trusted server controller waits
   >=5000ms using hrtime.bigint elapsed duration, checking abort and monotonic
   rollback. Early timers recheck, delayed timer increases wait. Time spent in
   network/pause can only add to the conservative barrier; no wall time used.
   ALL pre-fence permits began before first fence commit; waiting one FULL proven
   maximum from AFTER committed-fence response drains every old send start.
5. Only AFTER actual minimum wait and fresh owner/session check, service finish
   exact input above+{generation,nonce}; no elapsedMs/wall-clock claim accepted.
   SQL validates service auth, default-off policy, original roots, same immutable
   committed request/effects/CURRENT session, nonce/generation CAS before terminal
   mutation. SQL does not independently measure elapsed: authenticated narrowly
   scoped server controller is the duration authority (same trust class as existing
   service worker). A service credential is not a capability granted to owner.
   Finish records authoritative current timestamp once as decidedAt/drainedThrough
   and drainProof {protocol:monotonic-drain/1,generation,waitMs:5000,finishedAt}.
   Success is impossible on missing controller/abort/lost ACK/stale nonce/source
   record or fake owner elapsed value. Minimal receipt bound visible and exportable.
   Caller receives erased receipt only after SQL finalized, not after a timer alone.

drainedThrough is a SQL stamped audit time of the completed trusted barrier,
NOT an expiry comparison. The exact stored drainProof is ALWAYS required for trip/device data erasure;
progress-only erase has null proof and zero drainedThrough. Service restart/missing ACK restarts a conservative
full5s barrier with new generation, or reads committed terminal receipt; it NEVER
resends a notification. An interrupted barrier remains fenced/unknown. Preview
cannot be renewed; original erasure authorization committed before original TTL.
Finalization/recovery may occur after TTL with same exact op and current reauth,
so receipt has committedAt within original TTL, decidedAt >=committedAt; no new
source mutation or old delivery authority follows from late finalization.

Primary technical sources checked while closing the wire:
[Node hrtime.bigint](https://nodejs.org/api/process.html#processhrtimebigint) for
process-local elapsed duration; [PostgreSQL REL17 pg_sleep source](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/utils/adt/misc.c)
for rejecting wall-clock sleep as independent drain proof. Own send-budget.ts and
drain.ts implement this duration/controller contract. Main c78355/ca59d1/415c53
approved this wire and dispatched a new independent SQL session for unused030000.
Main has now granted the original sender owner3673c342 explicit release: this
sole TS consumed scheduler/delivery-contract/APNs minimal hunks, no other sender
file. Source and local synthetic/loopback verification are recorded in MAIN.md. No target or provider activated.

## Closed ordinary-owner API

POST /api/privacy/native/v1/notification-data, JSON, no cookie/origin/query, bearer
native credentials. Local-only DATA_NOTIFICATION_DATA_LOCAL=1 AND accepted native
config local environment, no VERCEL_ENV. Otherwise disabled. Public SQL RPC
privacy_notification_data_v1(p_action text,p_input_bytes text,p_expected_epoch bigint)
all defaults disabled/ungranted except explicit fixture; no service authority exposed.

List exact {action:"list",scope,cursor:null|{sourceDigest,afterId},limit:20}; returns
schemaVersion,kind:list,scope,ownerId,sessionId,mobileEpoch,sourceDigest,capturedAt,
expiresAt,items,hasMore,nextCursor,allUserDataCompleted:false. Item exact
{objectId,label:null|Trip title,state:active|archived|retained|erased,rows}. Retained/
erased labels null; device/progress all labels null. Discovery includes owned
archived/retained Trip data and own historical request metadata/fences, no global
request-ID existence oracle. Cursor source change fails closed.

Selection {scope,requestId,objectIds}; preview adds action:preview. Export/erase
add action,previewDigest,confirmed:true. Each request <=8192 UTF8 bytes. Before erase dispatch also require its exact
recover-wrapper serialization <=16384, so accepted bytes always remain recoverable. Recover
adds action:recover,mutationBytes <=8192 exact original erase JSON bytes, outer
max16384, embedded operation/selection exactly match, no nested recover. Native
persists those exact bytes BEFORE sending; no regenerate/retry with new op ID.

Binding exact keys in contract.ts: schemaVersion notification-data/1,scope,
requestId,objectIds,ownerId,sessionId,mobileEpoch,sourceDigest,previewDigest,
capturedAt,expiresAt,boundaries,allUserDataCompleted:false. Epoch ms expiry exactly
capturedAt+30000. Preview binding+{kind:preview,items,requiresExplicitConfirmation:true}.
Start binding+{kind:started,requestDigest,limits:{pageSize:5,maxPages:4,maxRows:20,
maxBytes:1000000}}. HTTP exports using SQL export_start(original exact command),
page exact {action:page,scope,requestId,objectIds,sourceDigest,previewDigest,
cursor:null|{sourceDigest,afterId},limit:5}, and proof exact
{action:proof,scope,requestId,objectIds,sourceDigest,previewDigest}.
Page binding+{kind:page,requestDigest,items,hasMore,nextCursor,sectionComplete,
pageNumber}; SQL records unique original page progress, proof only after actual
complete ordered pages (no missing/duplicate pages). Proof binding+
{kind:proof,requestDigest,coverage:complete,pages,rows}. Bundle binding+
{kind:bundle,requestDigest,items,proof:{coverage:complete,pages,rows}}. HTTP rechecks
current actor before/after EVERY RPC, verifies exact binding/keys/order/row FK
projection/caps, and exposes bundle only after real SQL complete proof.

Erase receipt binding+{kind:receipt,state:erased,requestDigest,committedAt,decidedAt,effects}.
Effects exact count keys reminders,watches,dismissals,outbox,attempts,operations,
travelReminders,devices,pageProgress,fences,providerAccepted,providerUnknown,
activeGrants plus drainedThrough,drainProof:null|{protocol:monotonic-drain/1,
generation,waitMs:5000,finishedAt},tripMutation:none,businessResults:not_modified,
providerCopies:not_recalled,deviceCopies:not_erased. providerAccepted/Unknown are
actual prior attempt records (unknown includes attempting); no fabricated device
delivery. committedAt >=capturedAt and <original expiry; decidedAt>=committedAt.
Proof finishedAt=drainedThrough=decidedAt when barrier required, for progress-only erase proof
null and drainedThrough=0; no client timestamp accepted as a drain proof.
Counts reflect actual deleted/fenced rows only. Progress erase counts all source
fields zero except pageProgress/fences. Never include selected counts as deletion
counts. ACK unknown emits NOTIFICATION_DATA_ACK_UNKNOWN and native preserves
exact op. recover returns original immutable receipt (even expired) only after
CURRENT actor/session/reauth check; outer original selection session/epoch must
match original operation. Known old-session journal must fail current actor.
Absent/foreign request returns exact schemaVersion,kind:unknown,scope,requestId,
objectIds,ownerId,sessionId,mobileEpoch,requestDigest,allUserDataCompleted:false.

## Native and coverage integration

Native sole owner implements authenticated discover/select -> complete private
fields/boundary preview -> explicit export/private file or erase confirmation ->
exact byte journal -> real typed outcome, unknown original-op recovery. Clear
visible state/files on session/scope/lifecycle expiry; inherited originals unchanged.
New independent session RPC/cleanup/PBX/coverage entries wait precise Main lease.
Own catalogs must count actual new source/progress inventory; old notifications
metadata-only entry cannot claim delete/full columns until caller uses this handler.
Provider/device/local/external/backup gaps stay named; allUserDataCompleted false.

## Necessary affected checks / current state

TS contract/adversarial checks, auth-before-effect/late-session/byte recovery,
strict full table rows, page/proof/source drift/caps. SQL new sole owner disposable
PG: real current actor/epoch/reauth, RLS/ACL, source CAS/expired/overflow, atomic
rollback, v1/v2 oldbytes/operation/device/dismissal replay denial, poll/begin/finish/
read claimed-worker race + drained grants, original root ordering/concurrency,
actual full inventory/retained export/progress erase, unaffected Trip/result/source
rows. Narrow worker exchange synthetic delayed connect/expired lease/no network
and missing ACK cases. Actual signed GoTrue/HTTP separately; native typed consumer,
file output/account switch/unknown ACK separately. Target APNs/phone/userdata/
deploy/grants/storage/provider costs and ALL2 acceptance UNRUN/unauthed here.
