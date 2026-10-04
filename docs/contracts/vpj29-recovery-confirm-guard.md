# #220 SQL recovery confirmation guard

Owns additive `20261004030000_local_recovery_guard.sql`, scoped PostgreSQL tests,
and this contract. Ordinary confirmed Proposal remains the only Trip writer.

## Closed owner wire

`prepare_local_recovery_v1(p_trip_id uuid,p_input jsonb) returns jsonb`: exact
`{operationId,expectedHeadVersion,dayId,selectedItemIds,fixedItemIds,reservationBindings,
report:{source:"user_report",kind:"fatigue"|"delay"|"closure"|"high_risk_unwell",observedAt},locale}`.
Selected IDs 1..8 unique, fixed 0..64 unique, bindings 0..100 closed
`{referenceId,revision,dayId,itemId}`. Bounds/opaque IDs/UUIDs/number types strictly checked.
All items must exist at the exact owner Trip head, selected in the selected day,
and selected/fixed disjoint. User report cannot be future or older than five minutes.
High risk returns pending without a context.

Success exact `{kind:"local_recovery_context/1",contextId,contextDigest,tripId,
baseVersion,expiresAt,profileBasis:{travelPace,updatedAt},reservationBasis,input}`.
Lawful saved pace requires explicit consent state/notice; otherwise travelPace null.
Internal fingerprint additionally fences pace revision/state/notice and row absence.
Context expires at min(report+5min, preparation+5min), never extended by replay.
Fingerprint and snapshot derive from locked SQL sources, never caller hashes.

`submit_local_recovery_v1(p_trip_id uuid,p_input jsonb) returns jsonb`: exact
`{operationId,contextId,contextDigest,candidateId:"omit_one"|"omit_selected"}`.
Rechecks original basis, creates only original `delete_item` Proposal via
`create_trip_proposal_patch`, associates it in the same transaction, and sets expiry
to min(context expiry, server clock+30 seconds). It does not write Trip content.
Success exact `{kind:"local_recovery_proposal/1",operationId,contextId,contextDigest,
candidateId,proposalId,proposalRevision,baseVersion,expiresAt,reused}`.
Same owner operation + exact input/Trip returns the original receipt; changed body
or second operation on consumed context returns conflict. Expired pending proposals
are recovered as historical pending/expired state, never renewed.

`read_local_recovery_operation_v1(p_trip_id uuid,p_operation_id uuid) returns jsonb`:
exact `{kind:"local_recovery_operation/1",operationId,tripId,input,receipt,
state:"pending"|"applied"|"rejected"|"expired"|"stale",resultingVersion}`.
Applied derives only from the original exact proposal event/version. Receipt includes
`reused:true` on read. Unknown operation is unavailable; no fresh operation fallback.

All three use existing actor/live-session/current owner Trip lifecycle checks.
Non-success `{kind:"pending",reason}` for absent reader/unmapped order/high risk;
`{kind:"conflict"}` for body/head/scope/basis conflicts; `{kind:"stale"}` for expired
report/context; `{kind:"unavailable"}` for invisible owner/Trip or lock contention.
Malformed input raises INVALID_INPUT, actor errors propagate. No new grants.

## Actual authority and locks

Account/session gate -> owner account lock -> owned Trip -> context/operation ->
Profile -> actual reservation rows. Existing owner writer guards serialize
reservation/Profile creation/deletion and prevent empty-set phantoms. Reservation
reader installation is checked at runtime. At current main it is absent: pending
RESERVATION_READER_UNAVAILABLE with no executable context, never empty orders.
Once #646 is normally merged, its actual owner reader and current ledger rows are
read with locks and complete pagination. Reserved/amended references each require one exact current revision user binding to
an actual same-Trip day/item. Every bound item is fixed by preservation, even when
absent from fixedItemIds; selected/bound overlap, duplicate item bindings, missing
coverage, unknown status or incompatible dates return pending. Date-bearing references
without a timezone also return pending. Binding semantics are
`user_confirmed_preservation`: an explicit user intent for this context, never a
source-owned mapping or supplier proof. No reservation is changed or upgraded.
Cancelled references remain in the complete server basis and are fenced against
amendments. Every item outside the exact selected optional deletions stays identical.

## Mandatory original-confirm guard

Private context, selection-operation and proposal-lineage rows hold server-owned
snapshot/basis digest, exact patch, proposal identity/digest and short expiry.
BEFORE INSERT lineage trigger rejects every child of a marked Proposal, including
same-patch revisions. A new revision must reject the old Proposal and create a fresh
context/selection; the original operation ACK cannot name an unrelated child event.
Title/patch/rollback successors reject before the child can exist. Immutable proposal
binding prevents changing a marked existing proposal into an ordinary one.

An independent deferred constraint trigger on original `trip_events` checks every
marked proposal without an optional proof bypass: exact owner/Trip/revision/digest,
short clock expiry, live lifecycle, current lawful Profile + complete reservation
basis, base+1 version, and actual current Trip content equal to the original
snapshot with exactly the candidate deletions. Stored patch allows only selected
optional deletions, with every fixed/unselected item untouched. It uses the original
proposal event and writer; direct old confirm and supported confirm must pass it; revisions reject. Failure raises RECOVERY_CONFIRM_GUARD and rolls the entire
transaction back, including Trip/head/event/snapshot/idempotency/audit. Ordinary
unmarked proposals retain existing behavior. A successful historical same-key retry
uses the original idempotency receipt and does not require a new live basis.

## Lifecycle and private export

Personal rows cascade on owner and Trip deletion. Archive/deletion-request clears
contexts/operations/bindings; expired unused contexts have bounded private cleanup.
No raw health narrative or Profile summary is stored: only report enum/time,
selection, saved pace metadata, original bounded Trip snapshot and hashes.
Private service export uses the original exact D2 job/lease/generation and bounded
cursor; returns minimum report/selection/receipt metadata, explicitly unenrolled,
inventory partial. No export registration/recipient privilege is added. Tables have
RLS with no ordinary policies; all new public/private EXECUTE/schema/table grants
are revoked from public/anon/authenticated/service_role. Target deployment and real
user export/delete remain UNRUN.

## Validation

Disposable network-none PostgreSQL: absent dependency, exact body/idempotency,
owner/source/Profile/head/expiry/fixed/revision/alternate-confirm negatives,
original-confirm single event and concurrent replay, transaction rollback, lifecycle
and default ACL; exact lease export. Integration registry remains Main-owned.
This package is integrated into the single complete #220 result; no micro PR.

## R2 exact transport branch and source proof

`public.prepare_transport_recovery_v1(p_trip_id uuid,p_input jsonb) returns jsonb`
takes exactly `{operationId,expectedHeadVersion,dayId,selectedItemIds,fixedItemIds,
reservationBindings,receiptId,scope,locale}`. Scope exactly matches #366:
`{tripId,expectedHeadVersion,dayId,itemId,originPlaceReferenceId,
destinationPlaceReferenceId,mode:"walking"|"transit"|"driving",departure:"now"}`.
Top head/day equal scope head/day, scope Trip equals path, and all item selections
are actual current owner/day items. Reference IDs and mode must match the original
SQL-owned receipt. Same owner/operation namespace is shared with R1; changed type
or body conflicts. No caller policy/stop/source/hash or arbitrary proof is accepted.

SQL invokes installed `read_foreground_traffic_v1(receiptId,scope)` and derives
policy/revision/stop from that actual immutable receipt; it then calls the private
`traffic_private.qualify_recovery_v1(uuid,jsonb,uuid,bigint,bigint)`. Both a current
`r2Qualified:true` and a route_estimate_changed/route_condition_changed receipt are
required. Qualification additionally returns server-only `proofBasis:object`.
Missing reader/qualifier/deferred callback or qualification returns pending
TRANSPORT_RECEIPT_UNAVAILABLE, no context/proposal/provider call. No process-memory
receipt, caller intent or local fingerprint becomes provider origin qualification.

Success uses the same closed local_recovery_context/1 keys with `input` a closed
UserReportInput | TransportInput union. No report is synthesized. R2 context expiry
is min(original qualified source deadline, server+5min), replay requalifies the same
source and does not renew. Selected proposal expiry remains min(context,30sec).
Selection and exact original operation receipt DTOs are unchanged. The public
TS/Native preview branch uses `report:null`,
`sourceSemantics:"qualified_foreground_transport"`, and
`transportReference:{receiptId,scope}` solely to locate the original Maps read.
That reader supplies actual fetchedAt/source/tier; route estimates are never
arrival, closure or supplier cancellation claims. R1 wire remains unchanged;
legacy flat transport input may only return pending compatibility behavior.

The original writer's current definition is
20260910002858_vpj_05_confirm_intent_authority.sql. `next_content` on line57 is
memory JSON. Before its FIRST mutation on line60 (`update public.trips ...`),
030000 inserts exactly
`PERFORM recovery_private.prewrite_transport_v1(proposal.id,expected_digest);`.
The additive migration loads the actual function definition, requires one exact
anchor before day/item changes, and proves removing only this instruction restores
the original body bytes and ACL. Drift aborts migration. The supported-confirm
wrapper calls this same original function; Web/Native/direct legacy confirms all
pass it. No separate Trip/head trigger or second writer. Ordinary and R1 return
without a traffic dependency; already_applied exact same-key return stays before
this hook and produces no new write/source request.

Prewrite qualifies against old head/address ItemSupport BEFORE ANY Trip mutation,
holding source/owner/session/epoch/policy/stop/reference/mapping/support locks until
commit. It alone inserts a private proof with current transaction ID, actual actor
and session/account epoch, exact root proposal/revision/base/digest/context,
SQL-produced traffic tuple/proofBasis, checkedAt and min(all actual deadlines).
Default revoked private schema/EXECUTE/table/RLS prevent client proof minting; no
GUC or public proof RPC. The original deferred event guard requires exact proof,
current actor tuple and confirmation-time clock. It calls the private
`traffic_private.validate_recovery_proof_v1(receipt,scope,policyId,policyRevision,
stopEpoch,proofBasis) returns boolean` to recheck raw receipt/policy/source/stop/
reference/member/support-source tuples including same-transaction changes. This
callback must ignore the legitimate new Trip head/derived item state; it does not
reuse the old-head qualifier after mutation. Absent/NULL/false rejects and rolls
back the entire original writer. Successful deferred validation removes the proof.
Private proof rows also cascade on original lifecycle cleanup. UI/export never
receive proofBasis or actor/session proof data.

## Observed local evidence, 2026-10-04

At main `8d30d0ba`, #646 is still unmerged. Disposable network-none PostgreSQL:
DDL transaction rollback, full migration compilation, default ACL/RLS, ordinary
original writer, absent real reader/no write, typed/owner/fixed inputs, and permanent
unbound marker confirmation/revision rollback passed (5 tests, zero skipped).
Archive, actual deletion-request, account/Trip cascade and exact original D2 export
lease/cursor/owner isolation passed (2 tests, zero skipped). Those lifecycle/export
tests use explicitly unqualified admin seed rows; they do not assert recovery
preparation succeeded without its source authority. The first export fixture failed
because its synthetic JWT lacked role; adding that claim fixed the fixture, without
changing runtime permissions or guards.

Successful real-reader context/selection/confirmation, source/Profile drift,
concurrent operation/confirmation, short-expiry commit rollback and bound-order
scope tests are written but UNRUN until #646 normally reaches main. No unmerged
migration/reader was installed or treated as current capability. Staging, real JWT,
provider, device, export delivery, role activation and whole #220 acceptance UNRUN.
The integration registry belongs to Main/TS integrator and is not edited here.

## R2 source integration evidence

030000 source `e0678c31` compiled and passed rollback/original body+ACL equivalence
and the closed transport/missing installed qualification probe (2 tests, zero skip).
A separate prewrite negative proved unqualified traffic rejects BEFORE the first
Trip update and ordinary clients cannot mint a proof (1 test, zero skip).

The fixed #366 `b58ae380` source was joined with 030000 and current main in an
isolated network-none source overlay. No #646 migration was copied or installed.
Only one new protocol case ran; the unchanged #366 matrix was reused, not rerun.
The actual local review/address mapping/ItemSupport chain produced source metadata
readable by 030000, exact tx/root/revision/base/actor/session/context proof, and a raw
source proof that stayed current through a legitimate Trip head/item change and
became false after same-transaction receipt metadata mutation. Public preparation
still returned RESERVATION_READER_UNAVAILABLE; the original confirmation wholly
rolled back because real reservation authority was absent. Protocol case PASS1,
zero skipped. Its first fixture used a 60-second delta (below max120sec/20%) and
correctly remained unchanged; that FAIL is retained, corrected fixture delta150sec
passed. No runtime guard or qualification threshold was relaxed.

Archive/reproduction facts and synthetic-environment boundaries are in
`artifacts/VPJ-29/sql-confirm-guard-20261004/evidence.json`. The admin context seed in
this protocol is deliberately unqualified; it never claims public preparation or
complete Trip confirmation success. Synthetic role/policy/source rows prove code
relationships, not real external provider origin or licence rights. Successful
public preparation/selection/confirmation with actual #646, full stop/revoke/expiry
races through the original event, target grants, signed Auth, device/provider flows
remain UNRUN. No changes to the ordinary caller/producer ACL or old export egress.

## Final current-main integration and SQL freeze

#646 was normally merged at main `e93e61aa`. This SQL worktree merged that actual
main before running the earlier UNRUN paths. Its real current reference reader and
reservation writer were used; no unmerged #646 migration or fake empty-order seam.

The first run exposed PL/pgSQL local variable/query alias `b` ambiguity. The exact
query alias was qualified. Eight cases passed; two actual order tests then exposed
JSON operator precedence in `items||page->'items'`: the concatenation became NULL,
and a NULL length comparison failed to reject incomplete scope. The fix is
`items||(page->'items')` plus explicit array type/IS DISTINCT count validation.
No guard, assertion, source tier or mandatory check was weakened. Original FAIL
logs and the synthetic thin observation (tableCount1, recordsNULL) are retained.
Only the two failed order cases and the necessary original same-key concurrent
confirmation case reran: PASS3, zero skip. Together with the unchanged eight
current-reader cases, the required R1 scope has 11 distinct passing cases.

On actual main e93 + fixed 030000 `af41d7ee` + #366 fixed source `b58ae380`,
`tests/integration/trip/local-recovery-transport.test.mjs` passed four scoped
integration cases, zero failures/skips. The public preparation/selection/original
concurrent confirmation succeeded with the real current reservation basis and
original reviewed address ItemSupport chain. The immutable original operation read
returned applied at the exact original proposal/event/version; two same-key calls
produced one Trip version/event. Fixed reservation and all unselected scope stayed
unchanged. Confirmation/source reads did not consume another provider request.

The same original writer rolled back Trip/content/snapshot/event/idempotency/audit
and proof after same-transaction stop (original stop RPC with actual updated head),
policy/member/source withdrawal, receipt mutation, shortest source deadline expiry,
and mobile epoch change. Concurrent reservation creation and confirmation either
committed the qualified original version or rejected confirmation/metadata CAS;
never an unchecked fixed-order write. Successful deferred proof validation erases
its temporary proof. These are actual database behaviors with synthetic admin
Auth/producer/licence fixtures, not signed Auth or real external provider facts.

The evidence manifest distinguishes prior source-only and final current-main
results. Earlier UNRUN labels are retained as historical facts and superseded only
for these observed SQL paths. Source/target activation, actual signed Auth/provider
origin/rights, Native/device/human and broader #220 acceptance remain UNRUN under
their owners. SQL implementation and required local integration are now complete;
freeze this task after handing the fixed source/test/evidence to the sole #220
integrator. No new task, runtime grant, target change or independent PR.
