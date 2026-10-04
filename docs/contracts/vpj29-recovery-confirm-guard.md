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
AFTER INSERT revision lineage trigger copies the root context/operation only for
the exact original candidate patch/base/Trip/owner/expiry; changed patch, rollback,
or lifetime extension rejects before the child can exist. Immutable proposal
binding prevents changing a marked existing proposal into an ordinary one.

An independent deferred constraint trigger on original `trip_events` checks every
marked proposal without an optional proof bypass: exact owner/Trip/revision/digest,
short clock expiry, live lifecycle, current lawful Profile + complete reservation
basis, base+1 version, and actual current Trip content equal to the original
snapshot with exactly the candidate deletions. Stored patch allows only selected
optional deletions, with every fixed/unselected item untouched. It uses the original
proposal event and writer; direct old confirm, supported confirm and same-patch
revision must pass it. Failure raises RECOVERY_CONFIRM_GUARD and rolls the entire
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
