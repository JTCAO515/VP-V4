# VPJ-36 — Trip core deletion v1

Related to #228. This first slice deletes one unlinked Trip. It is separate from
#240 archive (archive retains content/services) and the existing all-user-data-v1
request (still requested/not_started). No overall privacy request advances.

## Request, execution and receipt

`POST /api/privacy/native/v1/trips` accepts exactly `requestId`, `tripId`,
`expectedVersion` and `confirmed: true`. UUIDs identify the request and Trip.
Native bearer verification and the existing mobile epoch guard apply. A matching
server-side auth session must have been created within five minutes; token refresh
is not identity re-verification. Sign in again when REAUTHENTICATION_REQUIRED is
returned. No password is accepted by this endpoint.

The owner and exact Trip head are checked atomically. Trips with existing chat or
Turn references return TRIP_HAS_CHAT_REFERENCES; coordinated chat erasure is outside
this slice. Admission creates an owner-bound durable queued receipt and fences
new content writes and chat/Turn links. HTTP 202 means queued only. Identical
request IDs replay the existing receipt; altered scope/version is rejected.

The separate service-only `execute_trip_deletion_v1(request_id)` transaction deletes
Trip events/audits, proposal-bound idempotency rows, proposal lineage, snapshots,
days/items, place/action references and archive receipt. Proposal memory-consumer
references cascade; source memories remain. An exception rolls back erasure and
completion together. Existing Proposal writers may acquire child locks first; the
worker bounds lock waits to 500 ms and its local runner retries concurrency errors
for at most three attempts. Failed transactions preserve queued state, but another
worker may complete concurrently: after an unavailable result, read the receipt
before retrying by request ID.
Repeated execution returns the original terminal receipt.
`next_trip_deletion_v1()` exposes only the oldest queued request ID to service
role. The bounded Staging worker polls that ID and calls the existing atomic
executor. Duplicate polling is safe because execution serializes on the receipt;
a crash leaves the request queued for a later poll. The worker is disabled by
default and requires an operator-owned, private Staging credential file.

`GET /api/privacy/native/v1/trips?requestId=UUID` requires a currently existing
owner session and returns the same receipt after the Trip is gone. Only a committed
`completed` receipt means this module has finished. Every receipt says
`allUserDataCompleted: false`, `backupErasure: not_verified` and
`providerErasure: not_performed`. It contains identifiers/timestamps, no Trip text.

## Retention and offline limits

The minimal tombstone retains request/owner/Trip IDs, expected version and timing.
It has no FK to erased data, and no application role has direct write access.
It prevents recreation of the same Trip ID, including from another owner or an
old device. Other Trips and creation of a new Trip remain supported.

This does not erase chat, materials, memory, Brief, profile, service/financial data,
provider copies, audit infrastructure, backups or already exported files. Historical
Trip idempotency rows without a proposal ID cannot be attributed and are retained.
No financial erasure or backup expiry is claimed. Tombstones must be preserved
outside a restored backup and reconciled before restored data is served; recovery
re-erasure tooling and backup retention verification remain #230/#239 work.

An offline phone cannot receive immediate revocation. The native Trip screen
stores an uncertain request ID in the device-only Keychain, hides that Trip's
in-memory plan, draft, proposal, archive, share sheet and screenshot inbox once
the user confirms the request, and reads the owner-bound receipt before loading
Trip content on its next authenticated opening. A queued receipt never displays
completion. The server tombstone blocks old writes when the device reconnects.
This does not prove a background purge of every app feature or an immediate wipe
of a phone that stays offline. Receipt `offlineRevocation: on_reconnect_only`
describes the earliest possible contact, not proof of local cache removal.
Exported files cannot be remotely recalled.

## Operator and rollback

No production/staging scheduler is enabled. The one-shot
`node lib/server/jobs/run-local-trip-deletion.mjs REQUEST_UUID` requires explicit
`VP_PRIVACY_LOCAL_DISPOSABLE=true`, loopback `VP_PRIVACY_LOCAL_URL` and a local
`VP_PRIVACY_LOCAL_SERVICE_KEY`. It is only for a separately provisioned disposable
stack with synthetic users. Never supply a shared local stack or real users.
`node lib/server/jobs/run-staging-trip-deletion.mjs` is a separate, bounded
consumer with `VP_PRIVACY_STAGING_WORKER=true`,
`VP_PRIVACY_STAGING_CYCLES=1..100` and an absolute 0600
`VP_PRIVACY_STAGING_DB_KEY_FILE`. It is hard-bound to the Staging project,
never enabled by a Vercel request or a Trip HTTP 202. Operator deployment,
shared Staging execution and production execution are separate gates.
Database integration tests create their own network-disabled container and apply
all migrations with synthetic auth/session SQL scaffolding (not live GoTrue proof).

Application rollback removes the entrypoint and stops the worker. Keep the migration,
tombstones and write fences; queued requests remain visibly queued. Never restore
erased content to roll back, disable fences to repair tests, or remove tombstones.
Repair forward if a queued job fails. Review pending requests before resuming workers.
