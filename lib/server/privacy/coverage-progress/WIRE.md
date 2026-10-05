# Coverage progress owner exit — single producer contract

Task #239 ALL1, fixed base960f1ed761d0635769ce2a9a486b56efc94139f2. Sole TS
coverage-progress owner, separate Native owner. No SQL authored; Main reviews this
complete contract and checks an unused append-only slot before a new SQL session.
Proposed slot20261006040000_coverage_progress_data.sql (not reserved/created).
No old010000/020000/030000 migration or D2 worker/artifact/source business rewrite.

## Original inventory and closed ownership

010000 coverage_export_private.requests_v1/sections_v1/request_fences_v1: all
actual owner rows, including other historical sessions while their original session
exists. Requests/sections may be expired; safe owner privacy metadata does not
require original business-source liveness. Fences survive transient erasure and
block old start/page/proof/replay; their original auth.users/auth.sessions CASCADE
is unchanged. No full-account completion. Notification/lifecycle data remains in
its separate accepted scopes.

New coverage_progress_private.requests_v1 stores only immutable minimal exit
binding/selected UUIDs/digests/timestamps + decision/requestDigest/decidedAt/effects.
New pages_v1 stores source-free page cursors/counters. Both owner/session CASCADE;
no source rows, previous row bundles, raw request bytes, filenames/tokens. New
requests themselves are discoverable/exportable and their pages selectable for
cleanup through this SAME module. Flat selected UUIDs are fences, not recursively
embedded source snapshots/receipts. List is read-only and never creates new state.
Preview creates one minimal request; export initializes its page state; erase only
updates that same request decision/receipt. No extra operation/receipt table.

## Authority and lock order

POST /api/privacy/native/v1/coverage-progress, ordinary existing Native signed
credentials; DATA_COVERAGE_PROGRESS_LOCAL=1, configured local/no deployed Vercel.
Private/no-store. New public RPC privacy_coverage_progress_v1(p_action text,
p_input_bytes text,p_expected_epoch bigint) DEFAULT EXECUTE REVOKED from
PUBLIC/anon/authenticated/service_role; private tables/schema fully revoked+RLS.
Owned disposable fixture-only grant is distinct from target enrollment (UNRUN).

Reuse010000 owner hashtextextended(owner,34), auth.users key share, existing
mobile_accounts/session/current mobile_attempt epoch + guard/mobile_access and
original5-minute reauth BEFORE candidate lookup, source/CAS feedback, cleanup or
writes. Expected epoch equals SQL actual current epoch. HTTP reproves actual
owner/session/epoch before and after each RPC and delivery; timeout/abort after
erase dispatch => ACK_UNKNOWN, never inferred success/automatic retry.

Order: owner advisory -> auth user -> mobile account/session -> request advisory
keys (ALL selected UUIDs plus own request, sorted, prefix coverage-request: SAME
as010000) -> original fences then original requests/sections sorted -> new
requests/pages sorted. NOWAIT/fail closed; no wait-based reversal of010000's owner
and request lock order. No old source locks required: pure metadata. All selected
rows owned; foreign recovery owner-filtered lookup returns EXACT absent unknown,
never a foreign-existence error/timing row-lock. Other selected foreign/absent IDs
same typed unavailable with zero writes. Global own request-ID collision with old
or foreign new requests fails before insert, no overwrite. Own ID cannot occur
in selected IDs. Root/source/replay denied before any cleanup; no sweeping of
unselected expired records.

## Exact command schemas

schemaVersion=scope=coverage-progress-data/1. User DTO has no actor/session/role,
service lease, RPC name or endpoint. objectIds canonical lowercase UUIDs sorted
ascending, unique,1..20. requestId lowercase UUID, not selected.

- list {action:list,scope,cursor:null|{sourceDigest,afterId},limit:20}.
- preview {action:preview,scope,requestId,objectIds}.
- export/erase {action:export|erase,scope,requestId,objectIds,previewDigest:sha256,confirmed:true}.
- recover {action:recover,scope,requestId,objectIds,mutationBytes:EXACT original erase UTF8 string}.
  Validate nested exact erase and same selection. 8192 bytes mutation ceiling,
  16384 recovery ceiling. Hash ORIGINAL bytes, never JSON reserialization.
- Internal p_action export_start receives exact original export bytes (action:export).
- page {action:page,scope,requestId,objectIds,sourceDigest,previewDigest,cursor:null|{sourceDigest,afterId},limit:5}.
- proof {action:proof,scope,requestId,objectIds,sourceDigest,previewDigest}.

Unknown keys/JSON-null enums/actions/invalid IDs rejected before effects. recover
may return known immutable erase receipt after preview TTL ONLY under current
owner/session/epoch/reauth with same original bytes. Unknown never starts/renews.
Changed bytes/selection/scope/preview conflicts on an ACTUALLY OWNED request.
Preview retries preserve original capturedAt/expiresAt. Expired undecided request
cannot revive. An old collector request with erased transients remains fenced
forever until its original session/account revocation; no same-ID renewal.

## Projection (camelCase; every column inventoried)

list: {schemaVersion,kind:list,scope,ownerId,sessionId,mobileEpoch,sourceDigest,
capturedAt,expiresAt,items,hasMore,nextCursor,allUserDataCompleted:false}.
items {objectId,domain:collector|exit,state:active|retained|erased,rows:0..3}.
Candidate union original request_fences_v1 + new requests_v1, all own/current or
historical session. Original rows=existing sections count; new rows=page count.
state active if transients exist (expiry doesn't erase), new erase decision erased,
otherwise retained. Sorted union UUIDs,10000+sentinel owner inventory ceiling,
sourceDigest complete actual inventory projection + actor/session/epoch/version;
source change invalidates cursor, anchor must exist, no silently truncated count.
List captures fresh30s disclosure window; no persisted list/cursor state.

selected collector item exact {objectId,domain:collector,request:null|{requestId,
ownerId,sessionId,mobileEpoch,scope,sourceDigest,capturedAt,expiresAt},sections:[
{requestId,section,lastCursor,nextCursor,lastLimit,pages,rows,bytes,terminal}],
fence:{requestId,ownerId,sessionId,scope,expiresAt}}. sections ordered by section
(operations,trips or notifications); nullable request implies no sections.
All historical metadata allowed, no source body renewal.

selected exit item exact {objectId,domain:exit,request:{requestId,ownerId,sessionId,
mobileEpoch,scope,objectIds,sourceDigest,previewDigest,capturedAt,expiresAt,
decision:null|export|erase,requestDigest:null|sha256,decidedAt:null|epochMS,
effects:null|effects},progress:null|{requestId,lastCursor,nextCursor,lastLimit,
pages,rows,bytes,terminal}}. No nested receipt/bundle or indirect source traversal.

Binding exact {schemaVersion,scope,requestId,objectIds,ownerId,sessionId,mobileEpoch,
sourceDigest,previewDigest,capturedAt,expiresAt,boundaries,allUserDataCompleted:false}.
Fixed expiresAt=capturedAt+30000, capturedAt<=now<expiresAt for all live reads;
one SQL clock capture per call. sourceDigest hashes selected current item array +
actor/session/epoch/schema/selection, excluding OWN new operation row. previewDigest
hashes binding/source/selection/capturedAt/expiresAt/boundaries. No clock-derived
selected row state; source changes including original page advance/cleanup or
selected new page advance invalidate source CAS. Sentinels/caps before hash/return.
Boundaries EXACT constant in contract.ts, independent TS+Native decoding required.

preview binding+{kind:preview,items,requiresExplicitConfirmation:true}. Entire
selected metadata + retained fences visible BEFORE exact consent.
started binding+{kind:started,requestDigest:SHA256 exact export bytes,limits:
{pageSize:5,maxPages:4,maxRows:20,maxBytes:1000000}}.
page binding+{kind:page,requestDigest,items,hasMore,nextCursor,sectionComplete,
pageNumber}; last page retry identical projection/no recount, cannot skip/rewind
other cursors/change limit. page counts1..4, exact selected ordered IDs, no duplicates.
proof binding+{kind:proof,requestDigest,coverage:complete|partial,pages,rows}.
TS traverses from null to terminal and independently checks rows/cursors/counts/
binding/current authority before/after each call, then exact proof. Bundle binding+
{kind:bundle,requestDigest,items,proof:{coverage:complete,pages,rows}}. Complete
only selected1..20 metadata; max1MB WHOLE final bundle/wrapper, no truncation.
Native private file creation/verification/delivery belongs to separate sole owner;
server bundle isn't a delivered file. No Storage credential/ticket/provider.

Erase deletes ONLY selected original requests (sections cascade) and selected new
pages. Old request_fences untouched. New request bindings/digests/receipt retained.
receipt binding+{kind:receipt,state:erased,requestDigest:SHA256 original bytes,
committedAt,decidedAt,effects:{collectorRequests,collectorSections,exitPages,
retainedFences,sourceData:not_modified,sessionAccountFences:retained,
externalCopies:not_erased}}. Counts actual mutations; retainedFences=selected
root fences count (each original fence or new request, <=20). All atomic, decision
committed within original TTL, decidedAt=committedAt in this scope; immutable
recovery after TTL. No minimum-row-count means deletion if effects are0? It means
selected transient absence already verified and retained fences are real, same
selected complete receipt. SQL never promotes original source deletion.
unknown exact {schemaVersion,kind:unknown,scope,requestId,objectIds,ownerId,
sessionId,mobileEpoch,requestDigest,allUserDataCompleted:false}, same foreign/absent.
Typed errors COVERAGE_PROGRESS_{CAPACITY,SOURCE_CHANGED,REQUEST_CONFLICT,
CURSOR_CONFLICT,EXPIRED,LOCK_CONFLICT,SOURCE_UNAVAILABLE}, standard authority errors.

## Coverage and ownership integration

Existing module coverage_progress upgraded version/scope=coverage-progress-data/1,
handler coverage_progress, selection coverage_records; same34 IDs, catalog .5
(not old .4 promotion). Own coverage.ts validates closed selection/outcome/recovery.
Needed Main precise shared lease: coverage/{catalog,contract,registry,outcomes}.ts
only import/replace existing coverage_progress descriptor/selection/delegate/new
path; CI-REGISTRY own3 entries; fixture catalog metadata/version update ONLY after
original sole owner explicit release. Native Session/PBX/entry leases belong solely
to separate Native owner. Old notification/material business source/handlers stay.

Necessary permission/data negatives plus full owned affected contract: authentic
ordinary GoTrue HTTP→RPC→DB→strict TS→coverage→consumer; default revoke then owned
fixture grant; cross-owner/sourceCAS/expiry/session/reauth/epoch/cursor/partial proof/
capacity/rollback/exact bytes/recovery/retained inventory after selected erase and
old request nonrenewal. SQL fixture evidence separate from actual signed Auth.
Full239/ALL2/restore/old offline device/account acceptance remain OPEN/UNRUN.
