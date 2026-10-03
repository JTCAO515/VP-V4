# VPJ65 owner Native support HTTP wire

SQL dependency fixed80e7e7b3ce6df0482192bc8d2fe0ec6de54ec4c1. HTTP-only writer;
no200/receipt.ts/source-impact/bridge edits or permission/target activation.
Native ordinary verified Bearer and current session/epoch/target guards apply;
cookies/Origin, extra/duplicate query/body fields and caller owner/typed-claim fields
are rejected. All output private/no-store; missing authority remains503.

- POST `/api/trips/native/v2/{tripId}/support/prepare`: exact SQL preparation input
  except tripId (derived from path), per fixed vpj65-trip-item-support.md.
- GET `/api/trips/native/v2/{tripId}/support`: exact expectedTripVersion/dayId/itemId.
- POST `/api/trips/native/v2/{tripId}/support/renew`: exact fixed SQL renewal input;
  first read exact Trip/version/day/item support and require selected supportId/version.
- POST `/api/trips/native/v2/support/preparations/revoke`: exact receiptId/expectedVersion.
  Preparation cancel is owner/receipt-scoped by SQL, with no invented Trip path claim.
- POST `/api/trips/native/v2/{tripId}/support/confirm`: exact proposalId/idempotencyKey/
  digest/expectedProposalRevision/expectedBaseVersion/supportSelection.
  supportSelection is1..8 unique exact {receiptId,version,sourceDigest}; only explicitly
  chosen receipts. Public own proposal metadata binds exact path Trip/revision/base;
  original SQL wrapper handles exact supported-confirm receipt replay. No ordinary
  confirm route changes or automatic selection/latest support fallback.

UUIDs canonical lowercase; day/item exact case-sensitive opaque64 domain IDs.
Versions positive safe integers (base/Trip version0..999999999). Hashes lowercase64hex.
Typed prepare scopes only address_reference/opening_window_reference; cities/scenes
reuse current knowledge enum, locale zh/en. No Ops mapping submission/review API.
Prepare/renew need actual reviewed mapping IDs/version/hash supplied by a genuine
producer selection; the newer fixed SQL owner context and candidates reader below supply this real
selection. Missing mapping authority cannot become name/title guessing or a client
eligibility boolean. Native shows unavailable for a blocked source.

Closed SQL outcomes are mapped unchanged: blocked/stale/conflict remain unavailable
support (HTTP200 kind marker), never supported/current success. Success prepared,
revoked, support, renewed, confirmed are separately strict-decoded and context-bound.
No extra HTTP version/envelope will conceal or rename the frozen SQL receipt fields.


## Fixed final owner reads (SQL41cd /443413 /00fce)

GET `/api/trips/native/v2/{tripId}/support/context` requires exactly expectedTripVersion,
proposalId, expectedProposalRevision, dayId, itemId. RPC read_trip_item_support_context_v1
uses p_trip/p_expected_trip_version/p_proposal/p_expected_proposal_revision/p_day/p_item.
Success exact support_context fields: kind,tripId,tripVersion,proposalId,proposalRevision,
baseVersion,proposalDigest,itemDigest,dayId,itemId,canonicalPlaceReferences. Reference
rows exactly referenceId,canonicalPoiId,display:{en,zh}; cap100, overflow unavailable.capacity.
Current server after-diff provides item/proposal hashes. Native explicitly selects a
real own reference; never creates one from item title or enters hashes manually.

GET `/api/trips/native/v2/{tripId}/support/candidates` requires expectedTripVersion,
placeReferenceId,city,scene,locale; optional limit1..50 (default50) and paired
contextDigest/afterMappingId opaque cursor. SQLread_trip_item_support_candidates_v1
returns exact candidates fields kind/tripId/tripVersion/placeReferenceId/contextDigest/
entries/nextCursor. Entries exactly mappingId,mappingVersion,mappingDigest,statementId,
claimRevision,payloadHash,sourceDigest,scope,claim. Max50, source cap500+sentinel,
qualified empty is real empty. Noncanonical/capacity unavailable does not fabricate rows.
Cursor is exact {contextDigest,afterMappingId}, owner/session/source-set SQL-bound.

POST `/api/trips/native/v2/{tripId}/support/confirmation-receipt` is strictly read-only
with the same six fields as the original persisted supported-confirm body. It maps
idempotencyKey/proposalId/digest/original supportSelection directly to
read_supported_trip_confirmation_receipt_v1(p_idempotency_key,p_proposal_id,
p_proposal_digest,p_support_selection JSONB). No confirm call/retry, PG hash recreation
or dependency on the lost response. Success exact {kind:confirmation_receipt,receipt,
historicalOnly:true,currentEligibilityRequiresRead:true}. Original confirmed receipt
is now exactly7 fields: kind/outcome/tripId/proposalId/resultingVersion/supports/
selectionDigest. selectionDigest is a SQL audit hash, not a read authority input.
Native must keep historical ACK recovery separate from fresh item eligibility read.
Closed context → explicit reference picker → candidates → prepare → visible diff /
explicit chosen receipts confirm → original-selection readonlyACK is one owner flow.
All new RPCs remain defaultrevoked; no target/policy/role enablement is implied.
