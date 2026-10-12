# Stable private SQL / Server reconciliation snapshot

Sole SQL owner 01a12e77-c953-7313-923e-164c863a37c0; current sole Main V8
01a12f81-dd0f-752f-a6ff-869b2887400d. Existing #203 scope, no new task/engine.
Base daa7bae44a660381fb3295d0d2afc327ea98d3ba / ordered154. Product append and
shared writes NOT_GRANTED. All SQL below is artifact-only.

## Closed protected receive and original acceptance

native_journey_measurement_v1(p_action text,p_input_bytes text,p_expected_epoch
bigint) derives current owner/session/epoch using original Native authority.
Strict recursive JSON duplicate-key rejection precedes jsonb conversion.
8192 input bytes; <=10000 owner source rows/1MB. Private tables/functions have
no role grants; public gateway authenticated only, purge service only.
Fixed schema journey-experience-measurement/1, purpose journey_experience_measurement,
notice journey-experience-measurement/2026-10-12. All old users unjoined.

E1 source {kind:service_task,id,revision:null}; original qualified Task.created_at
and full original source acceptance, including cancelled/failed/uncompleted work,
without result/success joins. Aggregate independently enumerates original Tasks
missing any telemetry; unknown/uncompleted remains in denominator.
E2 source {kind:native_entry,logicalId,entry:e2,anchor:{kind:trip,tripId,tripVersion,
medium:pdf|screenshot}}. Current same-owner readable Trip before extraction;
no local_import/no-Trip branch, fake Task or successful-operation denominator.
E3 source {kind:native_entry,logicalId,entry:e3,anchor:{kind:goal,conversationId,
goalId,goalVersion,parentMessageId,inputSequence}}; logicalId==goalId and latest
whole current input tuple, before GET. Native acceptedAt null, authority label
is authenticated_native_acceptance_report, not business authority/time.
clockOrigin is unknown or native_monotonic(processId); local_elapsed reports
must match the immutable ticket process. Server receive is never render time.
Report expiry=min(original admission/consent expiry, report receive+30d).
Body metadata digests enforce exact original bytes; no content/raw-text hash.

Directions selected/save and decision choice use original owned immutable writer
receipts/revisions and exact-current readback; union distinct Task once.
E3 result also matches full original Goal/input tuple. E2 result selection/handoff
association remains unavailable: Trip equality cannot fabricate an artifact or
prove the selected PDF belongs to that result. Late first-ever/retention gaps
remain unknown. Question opportunity authority remains unknown; zero_questions
is rejected until real original source observability is supplied.

## Actual storage, D2 and bounded controls

Eight tables: configuration, consents, admissions, reports, erasure_receipts,
recovery_controls, journals, copy_obligations. Seven exported inventory groups
match Server CONTROL_ROWS: consents/admissions/reports/erasureReceipts/
recoveryControls/journals/copyObligations. All owner data bounded by rows/bytes,
original <=30d authority origin, account FK and expiry purge. No permanent totals,
activation ledger, queue, second D2 or financial table.

Per-request private Profile overload preserves original nine-module index3,
one-snapshot/sourceRows/canonical digest/encrypted artifact and managed provenance.
journeyMeasurement is an explicit typed suffix; combined Profile+measurement
source count<=10000/canonical bytes<=1MB. The original Core four helper candidates
use request-bound suffix projection, excluding ONLY that snapshot's own new copy
registration to avoid circular source invalidation. Earlier obligations remain
in the typed inventory. Core copy registration checks actual committed job,
artifact, original provenance and parent expiry; making a copy cannot extend TTL.
All shared functions remain full before/after candidates, no product writes.

Explicit new-domain erasure revokes consent and removes admissions/reports;
managed copies use original Core expiry effect/guards and known provenance.
Guard failure or unavailable external executor/ACK stays incomplete; no old
Profile receipt is borrowed as this scope proof. Scoped ACK carries exact request
metadata digest, original decision/expiry and lifecycle controls/copy status;
allUserDataCompleted is always false. Bounded minimal journal/control receipts
are disclosed. Source-copy positive encrypted chain is still UNRUN.
Purge drains one total metadata-row budget and marks cleanup fresh only when
caught up. Expired unknown external inventory does not certify erasure: lifecycle
configuration is invalidated, and independently protected reconciliation remains
required. No existing maintenance registration or target purge execution claimed.

## Original Core K1 recovery

recovery.candidate.sql provides private original-authority floor/issuer/reconciler;
no public or blanket service execute grants. Matches Server recovery.ts closed
IssueRequest/context/frame/target ACK and all seven inventory groups.
Issuer validates actual original Core row+live lease; this alone NEVER grants
K1 restore authority. Required original protected Core acquisition/seal hooks
must prove separate operator recovery authorization, authenticated still-live
source outside restore payload/instance, complete retained post-cutoff coverage,
writer barrier, layout/pins/challenge/currentness and absolute freshness.
Those hooks/real adapter are NOT INSTALLED on this base. Same-DB controls,
caller latest/floor/status, hashes, placeholder names and old backups are not
independence proof. WholeDB/missing/stale/foreign/wrong-layout deny before writes.
Collection remains default denied, whole lifecycle INCOMPLETE.

## Evidence and remaining work

Own PG17.6 ordered154 replay PASS. Twelve actual primitive proofs, six actual
pre-result Trip/source negatives/qualifications and ten actual recovery negatives
PASS. Original four schema guards, Turn runtime and new module exact pins return
t|t|t|t|t|t. Old265 tables unchanged; all1083 old function attributes preserved;
only exact ten old function body candidates change. Full actual catalogs/source
pins retained. No unknown runtime schema/hash adoption or namespace exclusion.
History FAILs remain in auth-defaults.json, primitive-r1-fail.json and
composition-r1-fail.json. These are narrow fixture proofs, not whole lifecycle,
GoTrue/HTTP, target migration, Native UI, user comprehension, CI or formal review.

Still missing: exact E2 result association/typed question opportunity source;
complete managed encrypted-copy positive fixtures; protected original K1 adapter
implementation/actual independent live source; exact maintenance registration;
Server typed seven-group/column projection reconciliation and shared-holder
release/Main exact lease. Original scope continues; #203 remains OPEN.
