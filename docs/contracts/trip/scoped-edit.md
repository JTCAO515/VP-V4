# Scoped Trip editing (#198)

Both POST `/api/trips/native/v2/[tripId]/scoped-edit` (bearer, active native session)
and POST `/api/trips/[tripId]/scoped-edit` (same-origin cookie) return `{data}` with
private/no-store caching. The executable closed inputs and outputs are
`lib/server/trip/scoped-edit/contract.ts` and `wire.ts`.

`context` binds an explicit day/item scope to the owner's current Trip head. The
server supplies the entire before snapshot, real ordering, user locks, explicit
reservation bindings, source/profile/Memory basis and bounded expiry. A current
reservation lacking a same-Trip item binding returns `scoped_edit_binding_required/1`
with current reservation references. The user can provide `reservationBindings`
and prepare again; titles are never used to infer associations. A binding means
preserve the user's confirmed report, not supplier verification.

`manual` supports move, time change/removal, and ordering. `ask` records the user's
current instruction for the existing durable worker; missing provider qualification
returns pending and sends nothing. One validated candidate becomes one original
TripProposal. The API never invokes a provider or confirms a Proposal.

The candidate receipt names the exact original Proposal id/revision/digest/base and
its expiry, return scope and full item diff. Callers explicitly open and review that
reference through the existing Proposal reader/confirmation path. Transfer impact
stays pending and walking improvement unverified until the independent qualified
feasibility evidence exists. Trip changes and undo do not cancel external orders.

Reordering permutes movable selected items in their slots. Unselected and locked
slots and fields stay unchanged. Sparse `manualOrder` values persist only actual
moves; a conflict that cannot express the requested order fails. `move_item` preserves
unselected fields and relative order; removing a selected item can naturally shift
indices. Locks and reservation-fixed items cannot themselves move. Time edits retain
manual ordering. Legacy snapshots without ordering retain their original id order.

`lock` is a separate explicit CAS action. It is not inferred from manual editing.
Each mutation has an immutable operation id and complete input. Retry/read resolves
that original mutation; an absent receipt remains unknown. `abandon` fences only an
unsubmitted mutation; an already committed operation returns its original receipt,
without rejecting a Proposal or undoing a Trip. Refusal and closing a sheet cannot
confirm anything.

SQL owns atomic actor/session/RLS, context/source/profile/Memory/lock/reservation
freshness and exact patch checks before the original confirm writer's first Trip
write and again in the same transaction. Marked proposal successors/revisions are
rejected: prepare a fresh context and candidate. Lifecycle cleanup, lease-scoped
export metadata, worker authorization and accounting remain part of the complete
SQL/executor implementation. Target activation and new runtime roles are not
implied by this contract.
