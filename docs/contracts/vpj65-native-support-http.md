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
producer selection; there is currently no owner-facing eligible-mapping picker RPC
in the fixed contract. Missing mapping source cannot become name/title guessing or
an arbitrary client eligibility boolean. Native must show unavailable for that gap.

Closed SQL outcomes are mapped unchanged: blocked/stale/conflict remain unavailable
support (HTTP200 kind marker), never supported/current success. Success prepared,
revoked, support, renewed, confirmed are separately strict-decoded and context-bound.
No extra HTTP version/envelope will conceal or rename the frozen SQL receipt fields.
