# #221 notification delivery v2 closed wire

Native GET/POST `/api/trips/native/v2/:tripId/reminders/delivery` uses
`travel_reminders_v2(p_trip uuid,p_action text,p_input jsonb)` with ordinary
verified bearer/mobile session. Strict timestamps require valid calendar dates
and Z/explicit offset, never Date.parse normalization or implicit host timezone. GET is `list,{}`. POST is the closed
`NoticeCommand` union in `lib/server/notifications/wire.ts`. The returned
`NoticeView` has exactly its declared keys; all mutations return a fresh view and
`mutationReceipt:{operationId,action,requestDigest,resultId,revision,terminal,outcome}`.
GET list returns mutationReceipt:null. Mutation receipts are immutable historical
ACKs of the exact original operation; they do not assert current eligibility or
reactivate terminal records. requestDigest is SHA256 of the full {action,input}
using recursively ASCII-sorted object keys, compact UTF-8 JSON with literal
Unicode/slashes and standard JSON escaping. Native compares the submitted
operation/action/request digest and exact resultId before clearing its journal.
Receipt outcome is applied or cancelled (cancelled means the original mutation
was fenced before execution). Abandon POST is exactly
{action:'abandon',input:{command:the_original_mutation_command}}; it has no new
operationId and uses the original operation/action/requestDigest/resultId.
Owner/session/Trip and operation locks serialize execute versus abandon. Existing
applied returns the original receipt without undo. Absent creates a durable
cancelled-before-apply tombstone before returning the receipt. Late execution
returns that tombstone without effect, even if source/head changed. Matching
server fence may clear Native journal; missing/timeout/list never proves absence.
No original command/token body is stored in that tombstone.
The device operation ledger stores only digest and safe metadata, never token
bytes or a copied full registration request.
The old v1 endpoint and persisted reminders remain compatible.

Opaque tap resolution POST `/api/trips/native/v2/notifications/resolve` takes
exactly `{notificationRef:UUID}`. `resolve_travel_notification_v2(p_notification
uuid)` returns exactly `{version:2,kind:'resolved',notificationId,tripId,tripVersion,source,expiresAt,current}`.
Unknown/cross-owner/expired/deleted references return `SOURCE_UNAVAILABLE`.
The returned current boolean rechecks owner/mobile/epoch, head, consent, source,
memory, archive, Trip end and expiry. False never opens a stale notification
target. The authenticated route then rechecks the same mobile session.

Purpose consent is per scheduled reminder or explicit watch. The only purposes
are user_set_travel, accepted_task_result and qualified_watch. No marketing,
affiliate, location monitoring or Live Activity. Device registration uses an
operation UUID, stable installation UUID, variable-length lower-case hex token,
explicit OS authorized state, sandbox/production and current IANA zone. Topic is
server configuration, never user input; environment must match the explicit
server allow-configuration. OS permission is a current client system declaration,
not independently proven by SQL. Registration/rotation invalidates old
device revisions; revoke/actor/session changes disable previous recipients. No
token is returned in user views, exports, logs or errors. Client source DTOs are
selectors only: SQL recomputes and compares their exact current identity.

N1 next steps come from the actual current Trip, saved user reminder and current
task-linked result, using result_basis_state and existing owner/consent guards.
Each has an opaque stable UUID, generic reasonCode and source identity.
A qualified baseline uses watch_available; watch_changed requires an actual
meaningful change after explicit watch enrollment. Only user
reminders return the user's reason. Dismissal stores owner/Trip/source semantic
digest so a revision or timestamp-only refresh cannot resurrect the same step.
Meaningful changed content may form a new step. Sources must be bounded and
`complete:false` must describe truncation rather than imply exhaustive emptiness.

N3 watch selectors are actual current qualified trip_support_private.item_supports
with their existing mapping_basis/item/current-Trip checks and bounded source
expiry. Changed status/claim/item/payload/applicability is semantic content;
timestamps, source retrieval time and receipt UUID alone are not. Reuse #207's
reviewed recheck/support receipts. Never create a new source fetch/task runner.
Watching persists the exact qualified baseline and due checks; each distinct
meaningful digest forms at most one reminder. Missing, revoked, expired or
unqualified evidence stops observation; pending unreviewed data cannot notify.

## SQL lifecycle and scheduler port

New append-only migration owns private devices, per-reminder metadata/outbox,
watch baseline, dismissals and exact operation receipts. Reuse travel_reminders
for user records without rewriting its historical migration. All new tables and
RPCs default revoked for public/anon/authenticated/service_role; activation and
worker credentials are separate object/environment authorization. User RPCs use
existing native_session_v2, auth.sessions and mobile_accounts epoch. No caller
owner is trusted. Lock ordering is owner/mobile -> Trip -> device -> reminder ->
outbox; conflicting source locks fail closed. Operations bind full request digest
and existing cancellation/completion cannot be undone by replay.

`poll_travel_notifications_v2(p_limit:1)` does one bounded scheduler action:
revalidate/reconcile watches, persist meaningful new reminders, suppress stale
queued rows, and return `{kind:'idle'}` or `{kind:'candidate',notificationId}`.
Transport disabled means no poll, token read or lease. No original Task/job runner
changes. The notification-only port is `dispatch_travel_notification_v2` with
`p_notification`, `p_action` (`begin`/`finish`/`read`), `p_input` JSON:

- begin takes `{attemptId:UUID}`. It atomically validates current scope, owner,
  current session+epoch, head, consent, current timezone, quiet hours, OS state,
  expiry, archive/end and source/Memory basis, plus device revision. Terminal or
  concurrently cancelled records return `{kind:'blocked'}`. Quiet/not due stays
  scheduled. Exactly one durable attempt enters attempting; replays never return
  a new send grant. Reply `{kind:'attempt',notificationId,attemptId,deviceRevision,
  token,environment,expiresAt,authorizedAt,leaseExpiresAt}`. Lease <=5 seconds.
- finish takes `{attemptId,deviceRevision,outcome}` with exact DeliveryOutcome.
  It updates only that attempt, preserving cancellation and known provider
  outcome independently. TOKEN_REVOKED revokes only the matching device revision.
  Reply `{kind:'receipt',notificationId,attemptId,state,outcome}`.
- read takes `{attemptId}` and returns the same receipt or `{kind:'blocked'}`.
  Expired/crashed attempting transitions to unknown; no second attempt or blind
  retry. Failed/unknown/accepted rows never become scheduled by polling.

Begin is the serialized irreversible handoff boundary. Cancellation committed
before begin prevents send. Cancellation after begin closes future work and
retains last-known outcome; an already handed-off APNs request cannot be recalled.
The TS consumer checks the short lease immediately before one transport call.
APNs payload contains only generic aps alert + notificationRef UUID; apns-id is
the persisted attemptId. APNs expiration is zero (no offline storage), priority
10, push-type alert. Acceptance does not prove device delivery. Provider 200
requires matching apns-id; missing/uncertain ACK becomes unknown, not success.

New notification export page/version and delete handler include user reminder
intent, purposes, watch/dismissal metadata and delivery outcomes. Token bytes and
worker leases are omitted. Owner/Trip deletion cascades remove dependent rows;
session/epoch change revokes devices and queued work, token rotation fences stale
outcomes. Existing completed core export packages remain unchanged/partial;
new notification handler is available through an independently versioned export
seam and is currently unenrolled. Legacy v1-only intent remains explicitly partial.
No retroactive completeness claim, runtime GRANT or actual user
delete/export is authorized.

API errors are exactly the noticeErrorCodes union in wire.ts. HTTP401 only for
actual credential rejection; session/head conflicts HTTP409; Trip missing 404;
invalid input 400; source unavailable 409; unknown infrastructure 503. A timeout
never proves a mutation did not occur. Explicit replay uses the same operation
and request; list/receipt recovery must precede further scheduling.

## Formal finite host

`lib/server/jobs/run-notification-worker.mjs` composes the actual runtime through
`notifications/hosted.ts`. It accepts only paired flags `--profile` (disabled,
local, staging, production), `--ticks` (1–8), `--max-ms` (1000–60000), and
`--interval-ms` (0–5000). Defaults are disabled, one tick, 25000ms and no interval.
Duplicate/unknown flags fail without network. Disabled exits before reading any
endpoint/key or constructing the RPC/APNs factories. It prints only content-free
profile/reason/counters. The durable SQL attempt is the authoritative journal;
the host creates no token/Trip/provider-content journal and no daemon.

Enabled requires `VISEPANDA_REMINDER_DELIVERY_ENABLED=true`, matching explicit
`VISEPANDA_REMINDER_HOST_PROFILE`, operator-selected
`VISEPANDA_REMINDER_DATABASE_URL`, injected `VISEPANDA_REMINDER_WORKER_KEY`, and
explicit APNs environment/topic. Credentials use the existing safe Supabase
worker header utility exclusively on the dedicated two-RPC port. Cloud profiles
require the exact approved database URL plus sandbox for staging or production
for production; team/key/private key enter only the dedicated APNs factory.
These configuration field names are code, not installed configuration or grants.

Local profile requires loopback HTTP database and HTTP2 synthetic APNs URLs plus
`VISEPANDA_REMINDER_LOCAL_SYNTHETIC=true`. It generates only an ephemeral synthetic
signing key, omits the JWT on the mock exchange, reads no real APNs private key,
and cannot contact Apple. Its accepted counter is a synthetic endpoint result.
The time budget/SIGINT/SIGTERM abort new polls and active handoff waits; the
current SQL finish/read cleanup remains bounded to at most 10 seconds afterward.
Unknown/error/blocked ends the batch; no attempt is retried. No entrypoint was
started against any real target, and production profile existence authorizes no
production enablement or send.

Manual device travel-purpose revoke accepts the current client's supported OS
declaration including authorized, and always makes active=false. A user purpose
withdrawal is never written as invented OS denied permission.
