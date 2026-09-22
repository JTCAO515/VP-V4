# VPJ-61 — explicit Trip archive, first slice

Related to #240. S4; native consumer + ordinary-actor API + database migration.
This increment does not close the whole Issue.

`GET /api/trips/native/v2/:tripId/archive` returns `version: 1` and a nullable
`archive: { tripId, archivedVersion, archivedAt }`. A null archive is distinct from
an unavailable API/schema. The native consumer retains saved read/share access on
failure, preserves any known receipt for that exact Trip/version, and disables
editing until archive state is known.

`POST` to that route accepts exactly `expectedVersion`, UUID `idempotencyKey`, and
`confirmed: true`. The native dialog binds the selected confirmed Trip and its
version, with an explicit cancel action. The adapter uses the existing bearer,
mobile-session epoch, bounded IO, no-cookie/no-origin and ordinary JWT path.

The `archive_trip_v1` RPC locks the owner operation and Trip row, requires the
current confirmed snapshot/event, writes a server-only archive receipt and private
audit atomically, and replays repeated archives without another audit. A stale
version or foreign owner is rejected. No dates mark completion automatically.
Existing Trip writers retain their signatures; a trigger rejects content/head
changes after archive. Existing confirmed-operation retries still return their
original receipt. This is not account deletion or service cancellation.

The archive table has owner RLS, mobile access restriction, no ordinary write
privileges, and an explicitly restricted writer RPC. Existing delete handlers may
remove the receipt through the Trip FK cascade; archiving itself never deletes a
row. The existing Trip snapshot and sharing pipeline remain the readable/exportable
result. No entitlement check is introduced on result reads.

Creating the next Trip uses the existing title + new UUID producer, which creates
an empty version-zero snapshot. The native outline inputs are cleared at explicit
new-Trip creation. No old dates, places, timing, temporary constraints, memory or
service rows are copied or saved. Profile manages already-explicit preferences;
this slice only explains that review may be skipped. A real per-preference
selection/consent consumer remains #199 integration work.

## Rollout and rollback

No remote migration or user operation was run. Review and authorize the migration
for the named environment before enabling this client there. Apply database first,
then server route, then native client. Old clients can still read archived Trips;
a new content confirmation is rejected by the database. New clients against an
older database show archive unavailable and keep read/share access; editing stays
unavailable until the migration is present.

Rollback the client/API to the prior supported version while retaining the archive
table and guard. Do not drop archive records or the guard: doing so would silently
reopen archived Trips. Any later unarchive requires a separately reviewed explicit
user action; there is no unarchive endpoint in this slice. No applied migration is
rewritten and no remote schema change is authorized by this document.

## Remaining whole-Issue acceptance

- The maximum-three-drafts + one-active rule needs an explicit persisted Active
  transition and legacy reconciliation; the current Trip model has neither. This
  slice does not invent Active from dates or silently classify existing Trips.
- Per-preference selection/rejection/skip through #199, and #224's human-service
  lifecycle/readback, remain integration dependencies. Existing record-only
  ServiceTask (currently unbound to a Trip) and Trip-linked unfinished Turn
  preservation can be tested independently; neither substitutes for #224.
- Target-environment account/native/API/database/read/share flow, Pass-expiry
  readback, physical-device/accessibility behavior and user acceptance remain
  required. SQL claims fixtures are not GoTrue/JWT acceptance.

See [verification](../../artifacts/VPJ-61/verification.md) and
[unrun boundaries](../../artifacts/VPJ-61/unrun.md).
