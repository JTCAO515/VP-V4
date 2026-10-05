# #239 selected material owner exit, closed wire /1

Main coordination is the only relay. TS sole writer/integrator:
`vpj58-material-reference-data-server-20261006`, rooted at
`/Users/jtsm5p/Documents/Codex/VP-V5-worktrees/vpj58-material-reference-data-server-20261006`.
First actual source write: `lib/server/privacy/material-references/contract.ts`.
Base `4d8d9417`; dependency #663 `a8af317d` normally fast-forward merged into
this branch, still OPEN/not claimed merged on main. Original dirty repo untouched.

## Main requests (no SQL written by TS)

Assign sole SQL writer after auditing this entire wire and unused candidate slot
`20261006020000` (rg over available worktrees currently no match). New private
schema `material_exit_private`, new ordinary-owner RPC
`public.privacy_material_reference_v1(p_action text,p_input_bytes text,p_expected_epoch bigint)`.
Main must recheck slot. Do not modify old D2 worker or accepted applied migrations.
Native sole writer can consume owned API/protocol/fixtures via Main relay.
Shared coverage catalog/contract/registry/outcome and Native existing entry/session
need precise Main leases before edits. New TS files are the only present writes.

Current immutable TS checkpoint `77e132c8` includes HTTP+collector+closed rows,
original PDF confirmed receipt proof, post-TTL immutable erase receipt recovery,
and source-free operation fence list (`referenceOperationIds`) in progress rows.
Native fixture: `tests/fixtures/privacy/material-references/producer.json`, one
synthetic protocol dictionary with three scopes, preview/bundle/erase receipt,
exact original request bytes and a fixed `now` for independent decoding.
Owned semantic contracts5 and injected HTTP consumer3 PASS; typecheck/lint/docs
PASS. These are not SQL/GoTrue/Native execution or target acceptance.

Precise TS shared lease requested: coverage/catalog.ts version `.3`, replace only
order_references/pdf_intake entries with version `material-reference-data/1`,
closed respective selected scopes and add `material_exit_progress`; add selection
`material_records`. coverage/contract.ts one `materials` closed parser branch
binding exact Trip/scope/request and preview/export/erase/original-bytes recovery.
coverage/registry.ts append `materials` direct owner HTTP and fixed route plus
recover original-byte wrapper. coverage/outcomes.ts append the independent typed
material preview/bundle/receipt classifiers, preserving all original branches.
CI db registry only append own future PG/actualHTTP lane switches/paths after
their actual implementation. No old branch/oracle/handler/module privilege changes.

Shared four coverage bridge paths now implemented under Main's explicit lease.
Actual affected check found one obsolete assertion at
`tests/integration/privacy/coverage/dispatch.test.mjs:67-68`: the missing-handler
case selects order_references+empty command and expects unavailable, but this
module now has a real selected-object handler so the command correctly fails400.
Request precise two-line test lease to select still-missing `case_attachments`
and expect `ATTACHMENT_HANDLER_UNAVAILABLE`, preserving every denial/all-data/
device/denominator assertion. No original runtime/permission change is proposed.
Old Native coverage producer fixtures also carry catalog `.2`; Native sole owner
needs to preserve valid previous module assertions while revising only catalog
metadata/version for `.3` and the added denominator, with opaque request digest
recomputed from the revised fixture bytes. No production oracle weakening.

## Remaining source-backed discovery gap and narrow closure (03:29 CST)

Actual source audit: original Native Trip list/detail follows current Trip RLS
(`user-data-adapter.ts:599/655`, lifecycle migration `040000:118` hides archives).
New SQL retains requests/fences across physical Trip deletion (`020000:6-40`,
PG root-cascade case), but list/preview/export still requires a live `public.trips`
row. Thus retained own progress/fences would become undiscoverable/unexportable,
and archived PDF metadata would have no real Native selection entry. This is a
remaining implementation gap, not a request for all-owner bulk erase or a rewrite
of original Trip readers. Main relay to the existing sole SQL/Native owners:

- Add read-only `trip_list`: exact `{action:"trip_list",scope,cursor,limit:20}`;
  cursor null or same `{sourceDigest,afterId}`. Actual candidates are scoped
  owned reservation/PDF records joined to their owned undeleted Trip, or own
  retained exit requests with their historical bound Trip ID. Current ordinary
  owner/session/reauth before lookup; cap10000+sentinel/no source body; source
  digest covers actual candidate Trip/source metadata and current source changes.
  Output exact `{schemaVersion,kind:"trip_list",scope,ownerId,sessionId,
  mobileEpoch,sourceDigest,capturedAt,expiresAt,items,hasMore,nextCursor,
  allUserDataCompleted:false}`. Item exact `{tripId,tripVersion,label,state}`;
  states active/archived/deleted/retained. Actual current owned title only; missing
  historical title null, historical version from owned retained request metadata,
  never guess or revive a deleted Trip. Fixed30s cursor/disclosure rules.
- For `material-exit-progress/1` list/preview/export/erase only, if original Trip
  is deleted/deleting, derive historical selection context from the actual own
  retained request records (exact Trip ID, all selected request IDs owned and bound
  there, retained Trip version). No original Trip/body/table write. Source-free
  metadata and transient progress cleanup remain owner callable; reference/request/
  operation replay fences remain immutable, complete owner inventory survives.
  Reservation/PDF active source erasure still uses owned actual undeleted Trip;
  old business reader/confirmation/RLS/deletion semantics remain intact.
- Native uses this safe source-specific `trip_list` then exact object list.
  It does not require old live-body Trip detail to qualify archived or historical
  progress. Selecting a listed ID grants no write to Trip content. TS closed
  parser/independent trip-list decoder/HTTP branch already implemented as owned
  files; awaiting this narrow SQL/Native closure, no second writer or target action.

Recovery privacy note for sole SQL: query retained requests by actual owner plus
requestId (after current authority), not globally by requestId with a different
foreign-existing error from absent. A foreign request is owner-absent/unknown;
changed bytes/scope for an actual owned request still conflicts. HTTP/coverage
already understand unknown as non-completion. The signed Auth test now permits
only unavailable or actor-bound unknown for foreign recovery, never an erased
receipt; do not disclose foreign source/fence existence through a success receipt.

## Current combined source and remaining closure

Combined runtime `df207c30` normally includes sole SQL `40a1fc55` (its evidence/
tests `d09bb269`) and Native product `2751682a`/normal dependency merge `03ac55e0`.
Actual git diff against Native `03ac55e0` is empty for MaterialReferenceData,
NativeSession and its DataCoverage caller changes; not merely the fixture ancestor.
Actual signed GoTrue/HTTP r4: 1PASS0FAIL0SKIP, owned project
`vp-native-ask-806da5f8` removed successfully. Ordinary new RPC default deny was
proved before disposable-only GRANT. Original owner business source writers,
current export page/proof, coverage wrapper independent consumer, selected erase/
fences/exact-byte recovery, applied Trip preservation, unselected progress
preservation, retained metadata after physical Trip loss and logout were observed.
Earlier r1/r2/r3 preserve three fixture-oracle failures, corrected only in this
owned test: original stale-head typed conflict, no transient row for erase-only
requests, and missing original deletion tombstone means `retained` not `deleted`.
No production error allowance or original assertion was weakened.

Only scoped closure remains: Main's precise obsolete original dispatch-test/
catalog fixture metadata alignment lease; Native final intended test/PBX/fixture
freeze (product already merged); final affected checks/source audit/one PR.
No new test matrix requested. #663 final `bda241be` protected normal main merge/
fresh final-head CI remains an independent dependency gate, not a core handler gap.
Whole #239 missing modules/ALL2 and target/user/device/provider/Storage/fees remain
OPEN/UNRUN; the selected three scopes never claim all-user-data completion.

## Actual sources and copy inventory

- Orders: `reservation_private.current_v1` sensitive corrected fields + source
  locator/local-material IDs/hash; `events_v1` metadata, `operations_v1` metadata.
  Events/ops FK CASCADE from selected current rows. `export_metadata_v1` is
  service-role + original live core-job lease only; its restricted projection is
  reusable inside a new private helper. `current_wire_v1` can be reused. No
  authoritative server original material bytes or provider-qualified source exists.
  Deleting a reference must not change Trip content, cancel/refund/contact orders,
  modify financial ledgers or reinterpret `user_reported` as verified.
- PDF: `pdf_intake_private.operations_v1` temporary exact POST bytes/command;
  `public.trip_proposals` unapplied corrected patches; `confirm_proofs_v1` and
  original Trip applied proposals/events/snapshots/idempotency; source revisions;
  old service export progress/version. No original PDF/full text persisted.
  Reuse `pdf_intake_private.erase_v1(owner,operation,true)`; it retains replay
  denial and never erases an applied patch or undoes a confirmed Trip. Expired,
  replaced-session and cancelled fields never become live again. Old service
  export progress is source-free and remains inventoried in original D2 scope.
- Device originals/AppGroup/share temp files and external downloaded copies are
  explicit missing boundaries, not remotely erased by either server handler.
- New state: source-free request preview bindings, cursor/page counters, exact
  original mutation digest and minimal terminal receipt; immutable selected
  reference+operation/request fences. No source body, raw input bytes, file path,
  corrected fields, title, provider/token in new tables. New state has its own
  `material-exit-progress/1` list/preview/export/erase scope; selected transient
  page progress can be cleared, immutable replay fences are explicitly retained
  and exported. No unexplained new owner data denominator is introduced.

## User command and authority

Owned HTTP `POST /api/privacy/native/v1/material-references`. Private/no-store,
native signed credentials, local default disabled; schema/RPC default revoke
PUBLIC/anon/authenticated/service_role. Fixture-only grants never target enrollment.
Reuse actual Auth user/session row locks, enrolled native actor/session/epoch,
original 5-minute reauth, account/Trip deletion fences before lookup,
cleanup, source feedback or mutation. Account → native session → owned Trip →
proposal/selected source → request locks with NOWAIT. The new ordinary RPC derives
owner/session from auth; body has no actor, role, JWT, lease or provider fields.
`p_expected_epoch` must equal current actual mobile epoch. HTTP reproves it before
and after every RPC, and at delivery. Abort/unknown ACK is never completion.
Main accepted review `655b3f`: a retained owned archived Trip or expired/cancelled
material must not be refused by unrelated live-business admission. Derive owned
undeleted Trip directly with privacy-appropriate locks; do not blindly reuse
`reservation_private.trip_v1` or other unarchived business guard. Preserve original
confirm/proposal lock order and semantics. Expired live fields remain null; safe
metadata export and actual sensitive cleanup still work. Existing committed
receipt read is separate from preview/source/body freshness and accepts
`decidedAt <= original expiresAt` after preview TTL without new mutation rights.

Scopes exactly `reservation-reference-data/1`, `pdf-intake-data/1`,
`material-exit-progress/1`. Selected object IDs are sorted unique lowercase UUIDs,
1..20, one exact owner Trip. Reference IDs / PDF operation IDs / exit request IDs
respectively. Progress selection cannot contain the currently executing requestId
(no self-referential preview/proof/erase). No all-owner delete or nullable Trip selection. IDs must all exist
and belong to actual selected source+Trip; subset omission fails the whole call.

RPC action values are separate `p_action` strings; `p_input_bytes` preserves
the original UTF-8 HTTP body (max8192; recover wrapper max16384 enclosing original
mutationBytes max8192). JSON `action` must match except internal
`export_start` accepts original `action:export`. Original byte digest SHA256
must be independently returned and verified; changed whitespace is changed bytes.

1. `list`: exact `{action:"list",scope,tripId,cursor,limit:20}`. cursor null or
   `{sourceDigest,afterId}`. Current owner list sourceDigest covers bounded real
   candidates and changes when source changes; foreign/removed cursor fails.
   cap10000+sentinel before hash; fixed30s list disclosure expiry, no persistent
   lease/state. Result exact `{schemaVersion,kind:"list",scope,tripId,ownerId,
   sessionId,mobileEpoch,sourceDigest,capturedAt,expiresAt,items,hasMore,nextCursor,
   allUserDataCompleted:false}`. Item exact `{objectId,revision,label,
   materialExpiresAt,sourceState}`. Source state active/pending/confirmed/rejected/
   cancelled/expired/erased/retained/unknown;
   unknown label/revision/material expiry null. Only order current label/revision
   are actual data. Never fabricate filename or source verification.
2. `preview`: exact `{action:"preview",scope,requestId,tripId,objectIds}`. Result
   exact binding below + `{kind:"preview",items,requiresExplicitConfirmation:true}`.
   Preview contains the exact selected restricted export projection and field/
   erasure/retention/missing names. Capture digest from *all selected source*,
   current Trip head, original raw-material erasure state/patch and replay state,
   source revisions where available, current actor/session/epoch. Do not hash
   only exported metadata if that omits the actual sensitive source being erased.
   Missing selected source rejects. Preview CAS is immutable by request ID;
   retries never extend TTL or change selection. Store no source bytes. No write
   to business data before explicit confirm.
3. `export_start`: accepts exact original `{action:"export",scope,requestId,
   tripId,objectIds,previewDigest,confirmed:true}`. Same preview/current source/
   original actor/Trip/head required. Result binding + `{kind:"started",
   requestDigest,limits:{pageSize:5,maxPages:4,maxRows:20,maxBytes:1000000}}`.
   Limits are exact. Do not store artifact or deliver started as completed.
4. `page`: exact `{action:"page",scope,requestId,tripId,objectIds,sourceDigest,
   previewDigest,cursor,limit:5}`. Cursor null or `{sourceDigest,afterId}`.
   Result binding + `{kind:"page",requestDigest,items,hasMore,nextCursor,
   sectionComplete,pageNumber}`. Keyset ascending selected IDs, 5+sentinel;
   progress actual from null to terminal; exact last-page replay idempotent,
   skipped/foreign/deleted cursor rejects. source/head/session/absolute TTL
   re-proved each call; pages/rows/whole bytes cap fails without truncation.
5. `proof`: exact `{action:"proof",scope,requestId,tripId,objectIds,sourceDigest,
   previewDigest}`. Result binding + `{kind:"proof",requestDigest,
   coverage:"complete"|"partial",pages,rows}`. Complete only all selected rows
   actually traversed current source. TS independently validates every selected
   row/ID/count/cursor/byte cap, requests proof last, then sends binding +
   `{kind:"bundle",requestDigest,items,proof:{coverage:"complete",pages,rows}}`.
   Native independently validates actor/epoch/digest/expiry/rows and writes
   file-protected local export, removing it on logout/source/session/TTL loss.
6. `erase`: exact `{action:"erase",scope,requestId,tripId,objectIds,
   previewDigest,confirmed:true}`. Actual exact preview CAS/TTL/current actor/
   Trip head/all source check before effects. Reservation delete selected
   `current_v1` and cascading selected events/ops; persist nonreplayable reference
   AND original operation ID fences first. New append-only before-write triggers
   deny recreation/replay of erased IDs; do not change original confirm handler
   or revive old IDs. New material with new ID remains ordinary explicit business
   semantics (ALL2 whole-account/restore not claimed). PDF reuse original eraser
   and proposal lock/order, clear sensitive bytes/command and unapplied patch,
   retain minimal original operation fence/applied proof. Progress scope clear
   selected transient page progress only, retains exported minimum fence/receipt.
   All selected effects in one transaction, late failure rolls all back.
7. `recover`: exact `{action:"recover",scope,requestId,tripId,objectIds,
   mutationBytes}`; `mutationBytes` exact original erase HTTP body, parsed again
   closed/bound. Reprove original current actor/session/epoch first, then match
   SHA256 of original bytes. Terminal receipt survives original preview TTL and
   has immutable decision time before that deadline. Missing decision returns
   `{kind:"unknown",schemaVersion,scope,requestId,tripId,objectIds,ownerId,
   sessionId,mobileEpoch,requestDigest,allUserDataCompleted:false}`; it grants no
   new operation ID/retry permission. Unknown requires read-first exact bytes.
   Do not turn cancel/expiry/absent/abandoned into erased.

## Closed bindings, rows, boundaries and receipt

Binding exact fields implemented in `contract.ts`: schemaVersion
`material-reference-data/1`,scope,requestId,tripId,objectIds,ownerId,sessionId,
mobileEpoch,sourceDigest,previewDigest,capturedAt,expiresAt,tripVersion,boundaries,
allUserDataCompleted:false. Times epoch milliseconds. Capture once, expiry
`min(capturedAt+30000, earliest live selected PDF material expiry)`; never extend
original material TTL. previewDigest covers binding/selected projection/declared
boundaries; SQL-native canonical serialization need not equal JS hash, but every
consumer compares the exact authoritative preview digest and source data.

Reservation row = exact old export item `{current,events,operations,historical:true}`;
reuse current wire projection and original metadata lists; no command digest or
historical field/source payload. Old max100 per-reference histories must not be
silently truncated: overflow rejects preview/export before complete proof. PDF
row = exact original service export projection (18 keys) plus `operation`:
the exact original `pdf_intake_private.receipt_v1(o,t)` projected via
`parsePdfOperation` (19 keys in `rows.ts`). Only its installed real confirmation
proof admits confirmed; proposalId/head/absence of fields never invent state.
`fields`
and `contentHash` only while live in this actual session; otherwise both null.
Original hashes/locator are metadata, never source/provider verification.
Progress row = exact16-key `rows.ts` shape, only IDs/hashes/counters/times; no
source body. Include immutable terminal receipt/fences even after progress erase.
`referenceOperationIds` is the sorted unique actual old operation-ID fence list
(empty for no reservation erasure; bounded2000=20*100). This exports the actual
retained operation fence inventory, not merely reference IDs or a count.
Authoritative internal projection/state changes invalidate preview/proof, including
source changes that don't alter exported fields, PDF patch/state/expiry changes,
and erasure state. Lock source revision before projection; no drifting double read.

`MATERIAL_BOUNDARIES` exact closed four arrays in `contract.ts`; every result
uses them. No unexplained financial/legal field claims: original financial tables
are untouched and separately covered. Raw body/device/original source exports
missing remain explicit. Server order erase ≠ external cancel/refund. PDF erase
≠ original confirmed Proposal undo.

Erasure receipt exact binding + `{kind:"receipt",state:"erased",requestDigest,
decidedAt,effects:{objects,temporaryRecords,unappliedProposals,tripMutation:"none",
externalOrders:"not_contacted",financialRecords:"not_modified"}}`.
objects equals selected count; temporaryRecords/unappliedProposals actual affected
counts0..selected count; original already erased PDF may count0 but only actual
successful source erasure verification yields a receipt. Retained decisions are
source-free and exportable through progress scope, expire/prune transient cursor
rows only; request/reference/operation fences cannot be removed to revive IDs.
Original session/account cascades governed by original contracts; source object
anti-replay fences survive current row deletion, source-free request metadata
remains ordinary owner-only. No target roles/grants/enrollment/config/credentials/
Storage/provider/deployment/phone/user-data authorization in this work.

## Necessary evidence and integration

SQL owned disposable PG: default deny vs explicit fixture grants, actual synthetic
owner/epoch/reauth, exact source selection/CAS/TTL, nested history overflow,
list/pages/proof/replay/cursors/caps, concurrent source change and late rollback,
receipt exact-byte recovery/missing ACK, original reservation-ID/operation replay
denial, PDF unapplied patch erasure/applied proof preservation/session expiry,
progress inventory/export/erasure+retained fences, unchanged original Trip and
financial rows. TS actual signed GoTrue/HTTP separately; Native actual typed
consumer/export-file/unknown ACK/account switch separately. Fixture is not target
runtime. One combined PR by this TS integrator; #239 whole missing/ALL2 OPEN.
