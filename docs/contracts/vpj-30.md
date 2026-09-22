# VPJ-30 user-set travel reminders — development slice

Related to #221, stage S4. This slice retains a user's chosen time, IANA zone,
reason and purpose consent, lets the same owner list, close or complete it, and
projects delivery eligibility from the current Trip. It does not schedule or send
push notifications. The UI says this before saving and on every saved record.

## Storage and consumer

`travel_reminders_v1(trip, action, input)` owns all writes. The native
`/api/trips/native/v2/:tripId/reminders` GET/POST route uses the existing verified
bearer and mobile-session authority. No owner supplied by a caller is trusted.
Create inputs: UUID id (retry key), baseVersion, reason, dueAt, expiresAt,
timeZone, purpose=`user_set_travel`, consent=true. Consent is for this reminder;
it neither requests nor grants OS notification permission. Cancel/complete take
only id. Terminal records cannot be reactivated by retries. Duplicate content
under another id is explicitly rejected. At most 50 open records per Trip;
reads prioritize all open records and then recent terminal history (100 total).

The reason is user text, never a provider/watch claim. Returned `watch=not_enabled`
and `delivery=unavailable` are explicit. No tokens are uploaded, no notification
permission requested, no marketing/affiliate channel or local iOS timer is added.
Reason/time/consent are frozen while a write outcome is unknown; deterministic
rejections unlock editing with a new key. Refresh does not imply delivery.

`reminderDecision` is consumed by the native API using fresh RPC state. A
future dispatch must reread and serialize current owner/mobile generation,
Trip version, reminder terminal state, purpose consent, current timezone,
expiry and Trip end, archive and OS authorization at its actual send boundary.
The current projection cannot authorize a later send. #240's `trip_archives`
relation is consumed only if present; absent relation means unknown. All Trip
days need known IANA zones for an authoritative end. No eligible result bypasses
the unavailable transport. Lock-screen payload contract contains only generic
VisePanda text, never the reason, Trip title, address or account.

## Remaining capability work

A real, permissioned APNs/device registration and durable outbox/dispatch receipt
implementation is still needed, including concurrent cancellation, at-most-once
attempts, uncertain provider acknowledgements and immediate-before-send checks.
APNs acceptance is not device delivery; queued/offline OS delivery cannot promise
another server check after handoff. That limitation must remain explicit in the
final delivery design and acceptance, not replaced by a local timer. No fake
scheduler or sent status is implemented here. #207 watch events and #215 Next
Step/foreground continuation are separate outstanding integration work.

## Scope, privacy and rollback

Primary files are notifications, native Trip reminder view, and one append-only
migration. Adjacent API route is necessary for the real native consumer;
NativeTripView has two-line wiring and project.pbxproj registers the new source.
Map and archive owners confirmed no active edits at these locations; unique
project IDs avoid other in-flight registrations. No global handoff or jobs change.

The table denies direct writes and has owner/mobile RLS reads. Definer RPC has
explicit owner and current-session checks and no anonymous grant. Account and
Trip deletion cascade reminder rows; no device cache is created. Full privacy
export/delete registry integration and restore-tombstone acceptance remain UNRUN
with #228/#239; do not enable a real sender before those contracts are complete.
Rollback the client/API PR to remove the entrypoint; retain the append-only schema
and user records. Disable RPC execute in a reviewed forward migration if needed;
do not delete historical reminders or rewrite applied migrations. No remote
migration, account configuration, production delivery or automatic merge authorized.
