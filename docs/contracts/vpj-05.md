# VPJ-05 — local same-Trip v2

This slice connects the existing Trip store across native iOS and the local Web Planning Studio. It requires explicit local activation, the current native mobile authority and ordinary owner JWT/RLS. No second Trip database, provider call, booking state, user hard-lock system or remote activation is introduced.

## Native HTTP DTO

Base `/api/trips/native/v2`. All calls use only `Authorization: Bearer <ordinary access JWT>`. Any Cookie or Origin is rejected. Responses use `Cache-Control: private, no-store`; errors are `{error:{code}}`. `version:2` is the envelope version, while `headVersion` / `expectedVersion` are the confirmed Trip revision.

`Trip = {id:UUID,title:string,headVersion:number,updatedAt:string}`. `Content = {days:[{id:string,date:YYYY-MM-DD,timeZone?:string,items:[{id:string,dayId:string,title:string,startsAt?:ISO8601,endsAt?:ISO8601}]}]}`. Day/item IDs and operations reuse `lib/server/trip/patch/contract.ts` exactly.

| Method/path | Request | Success |
| --- | --- | --- |
| GET base | optional `?limit=1..50` | 200 `{version:2,trips:Trip[],currentTripId:UUID|null}` |
| POST base | `{tripId:UUID,title:string}` | 201 new / 200 replay `{version:2,trip:Trip,reused:boolean}` |
| GET `/:tripId` | none | 200 `{version:2,trip:Trip,content:Content,hardLocks:"unknown",externalOrderStatus:"unknown"}` |
| POST `/:tripId/proposal` | `{patch:TripPatch}` | 201 `{version:2,proposalId,revision,baseTripVersion}` |
| GET `/:tripId/proposal` | optional `?proposalId=UUID` to read the exact created revision | 200 `{version:2,trip:Trip,proposal:Proposal}` |
| POST `/:tripId/proposal/revision` | `{proposalId:UUID,patch:TripPatch}` | 201 `{version:2,proposalId,revision,baseTripVersion}` |
| POST `/:tripId/proposal/reject` | `{proposalId:UUID}` | 200 `{version:2,proposalId,status:"rejected"}` |
| POST `/:tripId/confirm` | `{proposalId:UUID,idempotencyKey:UUID,digest:string}` | 200 `{version:2,outcome:"applied"|"already_applied",resultingVersion:number}` |

`Proposal = {id,revision,baseTripVersion,status:"pending",createdAt,expiresAt,titleDiff:{before,after},dayDiffs:[{kind:"added"|"removed"|"changed",dayId,date,items:[{kind,itemId,title}]}],patch:TripPatch,digest:string,stale:boolean,evidence:"not_recorded",assumptions:"not_recorded"}`.

No confirmable pending/expired proposal returns 409 `PROPOSAL_NOT_CONFIRMABLE`; keep the local draft. Stale create/confirm returns 409 `STALE_TRIP_VERSION`. Other failures: 401 `UNAUTHENTICATED` (including expired/replaced mobile authority), 403 `FORBIDDEN`, 400 `INVALID_INPUT`, 409 `IDEMPOTENCY_KEY_REUSE`, 503 `PROVIDER_UNAVAILABLE`, 500 `INTERNAL_ERROR`. Clients must not interpret unknown fields as false or as a verified external state.

## Snapshot and confirmation integrity

Confirmed title/content come from the immutable `trip_version_snapshots` row for the captured head version. Pending proposal content and its opaque digest are read from the same database row/snapshot; clients must never calculate a digest. The digest binds the full persisted proposal intent (including Trip, owner, revision, base, patch and rollback target) excluding only changing lifecycle status. The confirm transaction rechecks that digest after locking the owned proposal, applies existing CAS/TripPatch, and atomically records the snapshot/event/audit/receipt.

A retry keeps the exact proposal, digest and idempotency key. A different proposal or changed persisted intent cannot reuse the receipt. Old receipts lacking an authoritative proposal binding remain retained but cannot be guessed into a successful replay. Ordinary users cannot forge server-owned receipts/events/audits or mark a proposal applied outside confirmation. Legitimate title/rollback actions retrieve the same opaque digest before confirming.

After a successful confirm, reload the server snapshot; do not infer committed content from a local patch. On conflict, keep the original draft and its base version. Reloading the confirmed server snapshot must not silently replace/rebase the draft. Revision creates a new pending proposal; the consumer must fetch and visibly review its exact ID before confirming.

Hard-lock and external-order states remain **unknown** in this slice; database transaction locks are not user hard locks. Full #192 acceptance remains open for those later states. Web continues to use the original Cookie/same-Origin path; no native cookie fabrication or global Origin exception is allowed.

## Deployment compatibility

The Web data adapter selects the v2 database protocol only when `VISEPANDA_TRIP_PROTOCOL_V2=true`, or when the explicitly enabled native local Trip flag also points to loopback. Otherwise it keeps the existing legacy RPC/deny/reject contract and does not query the new receipt column or v2 read/reject RPCs. That branch is not v2 safety acceptance. Native `/api/trips/native/v2` has no legacy fallback and remains local-only.

Coordinate remote rollout separately: deploy compatible code with the default legacy protocol; obtain the named environment's migration authorization; apply and verify migration 28 with data preservation; then explicitly enable matching v2 callers. The upgraded database does not accept an arbitrary legacy digest even if a caller is misconfigured. Missing v2 proof support fails before v2 confirmation. This local result authorizes no remote migration or activation.

The v2 SHA256 field set is frozen: proposal ID, owner, Trip ID, revision, base version, patch, rollback target, parent proposal, expiry and creation time, serialized with UTC. Unrelated future columns do not change existing digests; new intent semantics require a versioned change. The read RPC returns the proposal and digest from the same row. Optional `before`/`after` objects show the immutable base and the proposed TripPatch projection; `after` is not committed state.

Snapshot responses also include `confirmationState: "initial"|"confirmed"|"unknown"`. A new Trip starts at version zero. Only a server-bound receipt, matching applied proposal/Trip/base, event and immutable snapshot establish `confirmed`. Unbound legacy history is not guessed or deleted. Audit rows have no unique producer binding, so v2 audit metadata is explicitly `verification:"unknown"`; it is not confirmation authority. Creation retries compare the original immutable version-zero title, even after another client renames the Trip.
