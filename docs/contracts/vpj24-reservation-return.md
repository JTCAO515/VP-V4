# #214 reservation return: proposed persistence and consumer contract

Base actual main8d30d0ba. Root TS owner owns lib/server/reservations and Native/Web APIs. Proposed append-only private SQL scope must be assigned by Main before implementation; no target permission, provider, account, cancellation or payment action is authorized by this document.

## Current source facts

Screenshot inbox and correction are device-private drafts and local locators/hash. The screenshot draft only reaches the original Proposal/diff path. C2 persist receipts authorize data retention, not third-party order facts. VP79 comparison/journey artifacts are not supplier reservation evidence. No currently installed trusted third-party reservation-artifact or provider-verification reader was found.

Therefore this batch accepts explicit user reports only. Caller evidenceTier/current/provider flags are rejected. An artifact_reference request must be unavailable/rejected until an existing independently authorized source reader can bind exact owner, Trip, material, receipt, revision, fields, rights and revocation. A local hash cannot upgrade evidence. Provider_verified requires a genuine adapter and is not constructible by caller or fixture. Future proof interfaces remain separate from current availability; no fake source receipt is seeded as real authority.

## Closed corrected reference

ReservationCommand exactly operationId,referenceId,expectedTripVersion,expectedRevision,fields,source,explicitlyConfirmed:true.
fields exactly kind(lodging|transport|activity|other),supplier(booking|trip|official|other),externalReference:null|string120,title:string160,startsAt:null|offsetRFC3339,endsAt:null|offsetRFC3339,timeZone:null|IANA,address:null|string500,terms:null|string2000,status(reserved|amended|cancelled|unknown).
source user_reported exactly kind,localMaterialId:null|UUID,localContentHash:null|hash64,locator:null|string500. These are user metadata, not evidence authority. No raw image, source-file upload, document number capture or credential field. Local original-text positions are preserved without copying source bytes. Source artifact_reference closed shape is described in contract.ts but not currently confirmable.

## Minimal owner SQL surface

- confirm_reservation_reference_v1(p_trip_id UUID,p_input JSONB). Ordinary authenticated, nonanonymous, actual current session and own nonarchived/nondeleted exact Trip/head. Current referenceId belongs to owner+Trip. expectedRevision0 creates; positive exact current revision updates. operationId is immutable exact-input/scope idempotency under the owner; current authority must precede replay. Unknown previous response must read its operation before retrying the original bytes/operation.
- read_reservation_references_v1(p_trip_id UUID,p_expected_trip_version integer,p_after_reference_id UUID|null,p_limit integer<=20). Current owner/head, bounded deterministic cursor; personal metadata absent/foreign/inaccessible never falls back to another Trip or global latest. Returns current references and source-qualified planning references; reads recheck source availability rather than cache success.
- read_reservation_operation_v1(p_trip_id UUID,p_operation_id UUID). Same owner/Trip/current authority; exact operation receipt, unknown or unavailable. Never infers a persisted write from a local draft or new ID.

Current success is reservation_reference/1 exactly referenceId,tripId,tripVersion,revision,fields,evidenceTier,source,sourceQualification,confirmedBy:explicit_user,confirmedAt,contentDigest,sourceVersion:null|positive,planningUse:confirmed_reference_only,tripMutation:none plus kind. This batch evidenceTier=user_reported and sourceQualification=untrusted/sourceVersion=null. Receipt may return the historical operation only as historical; it cannot promote superseded fields to current. Conflict/unavailable and actual Source errors remain closed and distinguish uncertain delivery from confirmed persistence.

## Version and duplicate semantics

One immutable corrected-fields/event version per accepted explicit confirmation. Amend/cancel is a new user report of an external event, not a supplier API action or rewrite of earlier evidence. Old/superseded revision cannot be current or block planning as the latest evidence. Unknown status remains pending. User-reported cancellation is not supplier-verified cancellation; planning may respect the explicit report without claiming supplier fulfillment.

Deduplicate only inside the same owner and Trip with an explicit supplier/reference identity or a future qualified source identity. Local hashes/labels are advisory and never cross-owner keys. Exact normalized confirmed-field digest may detect a repeated same-owner payload. Same identity with changed fields is a conflict/change preview, requiring explicit confirmation and current revision CAS; never silently replaces a prior record. Keep original locators and differences for dates/address/terms/status. Stronger material/provider tiers require supported field digest alignment; user corrections do not make unmatched bytes artifact-confirmed.

## Privacy lifecycle and rollback

New private current-reference/version/operation rows cascade on owner and Trip deletion, including actual D1 deletion with retained accounting/task records. Removal/revocation of a trusted source clears private retained source metadata or makes its qualification unavailable; no inaccessible source is served from an old cache. Source notes and personal references are never logged or sent to a model/provider. Local-material deletion cannot invent a server-owned source link; user-reported confirmed fields remain exactly the user's own report, with raw material unavailable.

D2 export: new private default-revoked exact current export-job/request/lease/generation derived metadata projection only, owner not caller-selected, bounded cursor and explicit domain/section/count. Do not extend already granted old service export entry points or claim full export coverage before exact-domain enrollment. Inventory stays partial until accepted enrollment. Default ACL closed, RLS, no roles/new grants/target activation or old migration edit. Proposed domain is order-reference metadata, not a second Task, queue or Trip writer.

Necessary proof once implemented: real two-session CAS/replay/read-before-retry, owner isolation, duplicate vs correction conflict, amended/cancelled revision order, real Trip date/head/deletion/archive, source-tier rejection and unavailable artifacts, lifecycle cleanup, exact-job/lease export/default ACL. Fixture source tiers are not real material/provider verification. User skipping return causes no write. Trip changes continue through the existing explicit Proposal/diff/atomic Patch only.
