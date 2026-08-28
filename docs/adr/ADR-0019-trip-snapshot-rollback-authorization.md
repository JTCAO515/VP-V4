# ADR-0019: Trip snapshot and rollback authorization boundary

Status: accepted for V4-10/#95 under the operator's direct-execution instruction on 2026-08-28.

## Context

Trip rollback must restore an owner-visible prior version only by creating and explicitly confirming a new immutable Proposal. The implementation also needs to capture the initial and each confirmed title snapshot atomically, while preventing authenticated clients from directly updating `trips` or inserting arbitrary snapshots.

The general `UserDataAdapter` rule in the actor model remains user-JWT plus RLS and `security invoker` RPC. That alone cannot both revoke direct `trips` updates and make the existing multi-table confirmation transaction write the owner snapshot. This narrow transaction needs an explicit exception rather than an implicit RLS bypass.

## Decision

`confirm_and_apply_trip_proposal(uuid, text, text)` and `create_trip_rollback_proposal(uuid, integer)` are the only V4-10 `security definer` user-JWT RPC exceptions. They are not worker or service-key paths.

Each exception must:

1. require a non-null `auth.uid()` and select the Trip/Proposal by that owner before any mutation;
2. lock the owner Trip during the transaction and enforce pending/expiry/base-version/idempotency checks;
3. use a fixed `search_path = public`, revoke `PUBLIC` execution, and grant execution only to `authenticated`;
4. write only the atomic Trip head, append-only event/audit/idempotency records, and owner-matching immutable snapshot;
5. expose snapshot reads only through owner RLS; no authenticated direct snapshot insert/update/delete is granted;
6. keep the Next route authenticated through `UserDataAdapter`, validate exact input, and require same-origin POST;
7. retain cross-user denial/no-side-effect integration evidence and response-loss retry convergence evidence.

`trips` direct `UPDATE` is revoked from `authenticated` and its direct update policy is removed. The user cannot use the exception to select another owner, execute arbitrary SQL, invoke a service credential, rewrite history, or bypass the visible Proposal confirmation step.

## Consequences

The authorization final check for these two fixed functions is their database-side `auth.uid()` plus explicit owner predicates and row locks, not a general-purpose RLS policy. This exception is intentionally smaller than a server/service-key transaction and does not change public, Ops, or worker credentials.

Historic Trip titles that predate snapshot storage are not reconstructed. Only snapshots that exist and precede the current head can be selected for a rollback Proposal.

## Acceptance and rollback

- Cross-owner calls must not see snapshots/events, create a rollback Proposal, confirm another owner's Proposal, or change the owner head.
- A response-loss retry reuses the same confirmation idempotency key and reloads the canonical head before showing an error state.
- Rollback creates a new event/version and preserves every prior event/snapshot.

Before migration execution, revert the V4-10 merge. After migration execution, use a reviewed forward migration; never drop Trip history or snapshots to undo a restore.
