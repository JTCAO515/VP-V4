# ALL1 owner coverage wire (in implementation)

Sole server/integrator worktree: `vpj58-data-coverage-server-20261006`.
Base469c02dc; normal dependency merge of662 exact13abbe2e. No dirty copies.
New catalog.ts is the first actual product write. Catalog entry registration is
not runtime success. No shared files, migrations, old worker or artifact formats changed.

Native pairing via Main relay only. Endpoint `/api/privacy/native/v1/coverage`:
GET authenticates current Native actor/session/epoch and returns
`{schemaVersion:"data-coverage/1",catalogVersion,actorId,sessionId,mobileEpoch,modules,allUserDataCompleted:false}`.
POST accepts exact keys:
`{schemaVersion:"data-coverage/1",catalogVersion,actorId,sessionId,mobileEpoch,moduleId,moduleVersion,operationId,action,phase,confirmed:true,tripId,commandBytes}`.
action=`export|delete`; phase=`execute|recover|preview`; tripId=null or selected UUID.
commandBytes is exact original owner command JSON, never rewritten on retry.
operationId matches original requestId/operationId where present; for recovery it
continues the same mutation, never a fresh auto-delete. Preview does not complete anything.
Wrapper validates the closed action/phase and original module parser, forwards
only the corresponding existing owner HTTP handler, re-proves actor/session/epoch
before and after. moduleVersion binds the original contract; catalog changes
invalidate an old aggregate and require a new review, not old-package promotion.

Response exact fields:
`{schemaVersion,catalogVersion,actorId,sessionId,mobileEpoch,moduleId,moduleVersion,operationId,action,phase,requestDigest,state,reason,result,allUserDataCompleted:false}`.
requestDigest=SHA256 of exact UTF8 outer POST bytes. state=`scoped_complete|queued|partial|unknown|unavailable|preview`.
result is original decoded handler JSON (no new download credential); reason
is NONE or honest failure/boundary code. A queued, absent, abandoned, expired,
malformed, unavailable or unknown ACK is never scoped_complete. Deleted scope
remains selected Case/Trip/Memory/Guide metadata; no all-account claim.
Native must bind every result to the exact outer digest, operation, selection,
actor/session/endpoint/epoch/catalog; pending same-operation recovery must survive
relaunch, and hide immediately on scope change. Preserve original handler journal
and clear old results on session/TTL/source denial. No automatic destructive retry.

Catalog server/device/external denominator stays present. Native device receipts
are local evidence, not accepted by a server POST as server-completed. Core receipt
may cover its nine original modules only, never automatically all newer modules.
Protected core download stays with its existing ticket/expiry/reader; this wrapper
does not replace it. Guide requires user-selected Trip/reference/version/locale;
Brief and Case delete require explicitly selected current grant/revision.

Server default configuration deny: DATA_COVERAGE_LOCAL=1 plus existing configured
local Native session, no Vercel/deployed environment. Original module flags,
reauthentication, ACL and credentials remain authoritative. Tests may use their own
isolated fixture permissions but do not imply target grants or enrollment.

## Main seam review input (no SQL authored)

Notifications notificationExportHandler requires an existing ExportLease and its
notification_metadata_export_v1 owner is derived from privacy_core_export lease.
Lifecycle lifecycleExportSource likewise requires existing lease plus enroll/page/proof.
The old worker fixed nine-module artifact is not extensible without a versioned
request seam. Proposed bounded addition: separate coverage module owner entry for
these two exact projections, using existing current Native owner/session+epoch,
explicit confirmed requestId and immutable scope/version, max100/50 pages respectively,
source revision proof and end-to-end continuation counts. Do not alter core artifacts
or let a client supply a service lease/owner. Full SQL wire/slot requires Main review
before a new SQL owner; until approved they remain unavailable, not completed.
Other genuinely missing modules remain in catalog (orders/PDF/financial/external).

ALL2 target concurrent creation/publication/notification, restore tombstones,
physical old-device/offline return and whole account acceptance remain UNRUN.

Current source alignment for Native relay: brief registry version/scope is
traveler-brief-data/1;case service-case-data/1;trip trip-core-v1;original protocols
remain their separate decoded contracts. Catalog now includes case_attachments
as an explicit unavailable server domain because Brief/Case bundles both omit
attachments;Native exact moduleIDs must include it. Catalog is currently30 entries.
Whole wrapper output hard cap1,000,000 bytes INCLUDING envelope; oversize becomes
unavailable/unknown, never silent truncation. Input remains192,000-byte hard ceiling.
Guide recover is rejected: existing forget lacks a durable immutable operation
receipt,so repeating it can erase new progress and cannot be called recovery.
Core ready_complete is always partial/PROTECTED_DOWNLOAD_REQUIRED here;only Native
original protected ticket/download and digest verification can establish delivery.
Current complete OWNER-SEAM.md is Main-reviewed export-only notification/lifecycle
proposal;SQL still belongs to a new sole owner. New progress metadata inventory
must be explicit in that owner's wire;do not silently export it as existing source.

Owned checks so far: typecheck PASS;9 dispatch tests PASS0skip using actual existing
UGC/Safety/Publication/Brief/Case HTTP contract code and original Guide service with
synthetic SQL-facing RPC responses. This is fixture contract evidence, NOT actual
GoTrue/SQL/RLS/target grant/source exports/real user deletion/physical evidence.

New bounded actual Auth runner/test own path tests/integration/privacy/coverage/
run-http.mjs + auth-http.test.mjs,port63400 preflighted by existing harness helper.
Shared registry lease requested: add only coverage Auth HTTP lane invoking this
runner --port-base63400 and this exact gated test;SQL owner supplies own PG/contract
entries later. Existing auto-discovered dispatch.test.mjs requires no shared edit.
No registry write has been made. First actual Auth-r1 FAILED at incorrect fixture
expectation of community_workspace authenticated EXECUTE=false;actual accepted
014000 gives true and later J1/J2/J3 preserve it. This is no runtime finding.
Default internal settings=false still allows original owner cleanup/export;fixture
now checks that exact preserved ACL/source behavior instead of claiming a new grant.
Original fail retained,stack58e7793d cleanup PASS;r2 necessary corrected test running.

NEW source wire (Native/Main relay): notifications/lifecycle are now wired to the
new independent owner collector,not old core lease. Module registry version for
both=coverage-module-export/1;scope respectively notification-metadata/1 and
trip-lifecycle-metadata/1;exportHandler respectively notifications/lifecycle.
Native original command exact {action:export,requestId:operationId,confirmed:true},
outerphase execute/Trip=null;no destructive recovery or user-supplied lease.
Original result body {data:bundle};bundle exact keys schemaVersion,kind=bundle,
requestId,scope,ownerId,sessionId,mobileEpoch,sourceDigest,capturedAt,expiresAt,
allUserDataCompleted=false,sections,limits,proof. sections exact notifications:[]
or trips:[],operations:[];row schemas original notification-metadata/1 and
isLifecycleTrip/original lifecycle operation metadata. limits exact100/100/10000/1MB
or50/400/20000/1MB;proof exact{coverage:complete,pages,rows},counts independently
validated against complete from-null traversal. expiresAt=capturedAt+30000,absolute.
New coverage_progress module ID added (catalog now31 entries):source-free
requests_v1/sections_v1 and immutable request_fences_v1 metadata. Owner-only
single-request metadata travels start/proof/bundle; full owner-progress inventory
exit unavailable,never hidden or counted full account. Fences persist only until
original session/account revocation;cannot resetTTL by same expired request.
Native exact module IDs must include coverage_progress. Bundle ready is not actual
file delivery;use own protected file/consent/cleanup and independent row decoder.

Current SQLsource consumed READONLY for DTO alignment;no dirty source integrated.
Wait fixed normal commit,then one integratorPR. Auth-r2 actual1PASS0skip +cleanup
b47d8661PASS for unchanged registered original modules; r1 wrongACL FAIL retained.

CATALOG_VERSION now data-coverage-catalog/2026-10-06.2 after new module/protocol
registration. Old .1 aggregate/requests cannot be upgraded to .2. Native schema
constant must align; original data-coverage/1 response shape stays unchanged.

Early fixed own TS source1af756b0 (partial before SQL integration); current semantic
linked-selection ordering fix+affected15PASS0skip follows same task. Canonical Native
fixture tests/fixtures/privacy/coverage/producer.json now contains exact current31
entries/catalog.2,requestBytes and bound UGC original result; synthetic only.
SQL own fixed-wire now reports17PG/3contract with source data+oldACL unchanged;
await immutable normal source commit before actual Auth-r3 union. Precise registry
lease still pending; own protected restore cleanup leavesAGENTS/next-env original.

Current fixed own package908665da CLEAN: actual SQL normal merged7fe2505d,Auth-r3
1PASS0skip cleanup1a94152c,affected15PASS0skip,build/typecheck/lint/docs PASS.
Main precise shared registry append already committed6a1dbbb8,actual list PASS.
No further planned server/SQL product change. Native fixed handoff/integration/
affected app check and final one PR remain. SQL source5b exactly preserved.

## Concrete Native consumer finding for Main relay (same task, before fixed)

Read-only current NativeDataCoverageOriginal.swift terminalResult lines103-107
only requires `reply.state != .scopedComplete || terminal`. Publication recovery
sets terminal=state!=absent at lines60-66,so abandoned=true. Case/Brief receipt
decoders accept cancelled receipts and feed terminal=true at lines69-79. A valid
original cancelled/abandoned terminal result with tampered outerstate
scoped_complete/reasonNONE therefore passes this gate and can show deletion
completion. The canonical TS classifier/consumer returns partial/
ORIGINAL_OPERATION_CANCELLED for those exact original results and rejects such
promotion. Terminal means ACK known,not source deletion applied. Required own
Native correction: derive original applied/committed-versus-cancelled state
independently before accepting outer completion; retain genuine unknown/absent
pending bytes and allow legitimate cancelled cleanup as partial. No old module
decoder/receipt/authority weakening. New own TS cancelled negative/fixture records
this precisely;Main relay soleNative for its own consumer fix/affected proof.
