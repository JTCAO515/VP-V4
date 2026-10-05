# VPJ-61 — Trip archive and explicit lifecycle

Issue #240, S4. The original v1 archive contract below remains compatible.
A1/A2 now add explicit three-draft/one-Active capacity, legacy reconciliation,
per-preference review, original-byte terminal receipts and unknown-ACK recovery.
See [lifecycle wire](vpj-61-lifecycle-v1.md) and
[SQL/deletion/export contract](vpj-61-lifecycle-sql-v1.md).

The new lifecycle RPC is default-denied. Local qualification uses an explicitly
authorized disposable-only grant; target ACL/schema activation remains UNRUN.
No privileged fallback changes the normal user authority.

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
service rows are copied or saved. The lifecycle archive review now reads the original #199 Memory management
authority and lets the user choose each eligible preference or skip. SQL rechecks
owner, revision, original source and granted consent before recording that choice.
It does not resave or copy Memory; skip does not revoke prior global preferences.

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

## Current evidence and remaining environment acceptance

The lifecycle code adds owner-serialized capacity with an explicit confirmed Active
swap, legacy reconciliation to draft/retained, and transactional reuse of the
original archive writer. No date or old confirmed snapshot automatically becomes
Active. Creation through original Native/Web/Data API insertion also meets the
same capacity guard. A fresh Trip remains an empty original snapshot.

New source rows and byte-bound receipts have Trip/Memory erasure hooks and a
versioned export seam. Old completed export bundles are unchanged; a job that has
not explicitly enrolled lifecycle v2 does not gain lifecycle coverage. The new
source traversal proof is distinct from an assembled/downloaded artifact.

#224 still lacks a Trip-bound human-service status reader; `serviceStatus` remains
`unavailable` and actual service rows are retained. Existing requested/grant state
is not queued/accepted/assigned evidence. This limitation stays explicit.

See [current Native evidence](../../artifacts/VPJ-61/native-lifecycle-20261005/verification.md),
[original archive verification](../../artifacts/VPJ-61/verification.md) and
[original unrun boundaries](../../artifacts/VPJ-61/unrun.md). Target ACL/schema
activation, real human-service delivery, complete export artifact delivery,
Pass-expiry target readback, real user rights actions, physical-device/
accessibility and user acceptance remain separate UNRUN facts. Local SQL claims
and disposable grants do not prove those outcomes.
