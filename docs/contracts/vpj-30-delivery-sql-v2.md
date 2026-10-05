# #221 SQL delivery v2

Owned append: `20261005030000_reminder_delivery.sql`. The TS integration contract
is `vpj-30-delivery-v2.md`; this document describes private implementation and
local PostgreSQL evidence, not activated target capability.

All new tables use RLS with no public policies. All new private/public functions
and tables revoke PUBLIC, anon, authenticated and service_role. Settings start
disabled. No target roles, keys, GRANTs, environment edits, source fetches, Task
executors, APNs calls or export enrollment are created. An independently approved
operator configuration must set enabled/topic/environment and explicitly grant
the named ordinary and service RPCs. OS permission is a Native declaration.

Ordinary `travel_reminders_v2(uuid,text,jsonb)` requires existing authenticated,
nonanonymous Auth session plus exact native mobile session/attempt/epoch. Caller
owner is never input. Owner/mobile → Trip → sorted devices → reminders/watches →
outbox serialization covers execute, cancel and abandon. Source locks use NOWAIT
where upstream writer ordering differs; contention is unavailable. Ordinary
operations use strict closed schemas, calendar/offset timestamps, IANA Trip zone,
quiet minutes and explicit purpose consent. New user-set records also use the
original travel_reminders table, without altering the applied v1 migration.
Original v1 cancel/complete is checked again before handoff. Legacy records without
a new sidecar stay available through v1, cannot automatically send, and make v2
complete:false. Their original reasons are not copied into notification history.

The immutable operations ledger holds only full canonical request SHA256 and safe
7-key receipt, never request JSON or registration token. Canonical JSON recursively
sorts keys with C/ASCII ordering, emits compact UTF8 and preserves literal Unicode
and slash characters. Seven receipt keys are operationId/action/requestDigest/
resultId/revision/terminal/outcome. terminal:true means the operation ACK is final,
not that the result remains eligible. Replay returns that exact historical receipt
and a fresh view. Abandon hashes the original command under the same lock domain:
existing applied is retained, absent becomes cancelled revision 0. Later execute
returns the tombstone without effects. Source drift and expired intent do not
prevent abandoning; ordinary actor and Trip ownership still apply.

N1 derives current Trip snapshots, legacy user intents, actual result artifacts
and qualified item supports. Stable opaque UUID and dismissal use owner/Trip/source
semantic digest, not timestamps or revision alone. Reasons are generic except
user reminders. Bounded reads expose complete:false for truncation, unavailable
publication or unresolved authority; there is no fake exhaustive empty source.
New reasons and legacy selectors enforce the TS/Native 240 UTF16-unit bound.
Actual Task results use canonical result_state_v2, original request/consent/
Task/goal link and Memory/evidence basis. Canonical evidence locks original publications,
candidates and source revisions, rejects withdrawn sources and rechecks current
state after lock acquisition. Completed answered Tasks remain valid
result producers; cancelled/quarantined work or terminal goal does not qualify.

N3 new watches require current independently approved entity mapping, reviewed
publication, actual current Trip item, matched applicability and bounded expiry. The private
notification mapping predicate reads the original publication/mapping/source
relations and recipient mobile authority; it never invokes the ordinary-only
knowledge reader with a spoofed identity.
The semantic digest includes only status/scope/applicability/itemDigest and the
typed claimType/subjectId/value projection. It excludes typed_claim.asOf/evidence,
claim revisions, payload hashes, receipt UUID and clock/provenance fields. Those
revisions, hashes and exact source refs remain independent current-qualification
guards. Refreshing a receipt/publication expiry cannot extend the stored watch TTL.
Baseline availability is watch_available. Actual eligible watch events use
watch_changed. Source withdrawal or pending review alone cannot notify.
A recheck_required support is separately eligible only through an actual approved
current #207 source-impact set, exact acked delivery, impact claim and support
recheck receipt at the exact current support/provenance revision. This branch
returns generic metadata only, never revoked source payload. Its outbox retains
private exact recheck receipt and review digest, revalidated again at begin. The
watch stops with stop_reason=recheck; that one exact event may send until its
bounded TTL, while user unwatch, source/reviewer loss, head/session/epoch change,
end/archive/expiry or cancellation blocks it. No new observations are scheduled.

Service poll does one bounded reconciliation action or one due candidate. It
skips quiet-hour records so another owner can progress. Disabled poll is idle,
and disabled begin cannot read a token or create an attempt. Begin rechecks live
Auth/epoch, head, purpose/status, source/Memory, zone/quiet hours, end/archive,
expiry, active device revision, OS declaration, configured topic/environment.
The closed begin grant includes topic=d.topic from the validated server-bound
device, allowing the transport to compare its configured topic before provider
exchange. A configuration mismatch cannot become TOKEN_REVOKED. Exactly one
durable attempt exists per notification. Its lease is <=5 seconds;
begin replay never returns another token/send grant. Cancellation before begin
blocks send. After begin, cancellation closes future work but cannot recall a
handed-off request. Attempt outcome and reminder cancellation are independent.
Finish/read require exact attempt and original device revision. TOKEN_REVOKED
only disables the matching revision, not a rotated token, and does not invent an
OS permission change. Explicit device revoke retains the actual OS declaration
(including authorized) while setting active=false. Expired attempting is
truthfully shown/reconciled to unknown. No accepted/error/unknown record returns
to scheduled. A late exact known outcome may refine unknown without another send.
Accepted outcome has exactly kind/apnsId/acceptedAt and means APNs acceptance,
never proven device delivery. SQL performs no network request.

Opaque resolve returns exactly version/kind/notificationId/tripId/tripVersion/
source/expiresAt/current. Trip version/source/expiry remain bound to the original
notification. Current rechecks original identity/basis; false cannot open a stale
target. Unknown, foreign-owner or expired references raise SOURCE_UNAVAILABLE.

The separately versioned public default-revoked notification_metadata_export_v1
wraps the private metadata page. It binds existing live export job/request/lease/
generation/owner/mobile identity and policy snapshot, with stable sourceRevision
and exact cursor anchor. Five domains export safe reminders/watches/dismissals/
operations/device metadata. Token bytes, original request body, worker leases and
provider payload are omitted. Existing completed core-export-d2/1 packages and
module lists are unchanged; this unenrolled module and legacy v1 coverage remain
partial. Trip/account FKs cascade new records; an ungranted private handler is
available only to separately authorized original Trip deletion orchestration.
Rollback disables the flag and new RPC grants, preserves history/receipts and
never claims to recall a sent push.

## Local verification

`VP_NOTICE_DB_TEST=1 VP_NOTICE_TS_ROOT=<actual TS checkout> node
--experimental-strip-types --test tests/integration/notifications/delivery-postgres.test.mjs`
creates a disposable network-none PostgreSQL 17 cluster and replays all applied
migrations. Synthetic role/consent fixtures are explicitly granted only there.
Actual TS codec/scheduler/export adapters call that database through the fixture
callback. Synthetic transport acceptance is not APNs or device evidence.

Initial failures are retained as facts: duplicate snapshot fixture (existing
insert trigger), PostgreSQL token regex repetition limit, source fixture disabled
settings and missing cyclic Memory receipt. The actual service path exposed the
ordinary knowledge-reader dependency, repaired with the private qualification
predicate. An added populated-evidence fixture exposed a PL/pgSQL alias collision,
repaired without weakening source guards. Fixes preserve the original guards.
Final PASS/FAIL counts and source hashes are recorded in the accompanying evidence.
Target GoTrue/JWT, deployed role grants/configuration, target export enrollment,
real APNs/provider/phone delivery and production remain UNRUN.
