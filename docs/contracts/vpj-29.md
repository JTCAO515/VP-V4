# Local recovery — #220

This contract is for one explicitly selected local scope. The original confirmed
Proposal → visible diff → atomic Patch remains the only Trip writer. User reports
are intentions/reports, never supplier observations or evidence of opening, ETA,
cancellation, refund, or medical safety.

## Closed HTTP wire

Native: `POST /api/trips/native/v2/{tripId}/recovery` (JWT, no Cookie/Origin).
Web: `POST /api/trips/{tripId}/recovery` (ordinary Cookie, exact same Origin).
Both return `{data: ...}` with private/no-store. No caller actor or provider facts.

Preparation input:

```json
{"operation":"preview","input":{"operationId":"UUID","expectedHeadVersion":0,"dayId":"opaque_day","selectedItemIds":["opaque_item"],"fixedItemIds":[],"reservationBindings":[],"report":{"source":"user_report","kind":"fatigue","observedAt":"2026-10-04T04:00:00.000Z"},"locale":"zh"}}
```

`selectedItemIds`: 1–8 unique exact items of the selected day, explicitly declared
optional by this request. `fixedItemIds`: 0–64 exact existing items, user-declared
fixed (including dinner). `reservationBindings`: at most 100 unique
`{referenceId:UUID,revision:positive_integer,dayId:opaque,itemId:opaque}` mappings
explicitly supplied by the user to current owner reservation references and actual
Trip items; no title matching. Bindings mean `user_confirmed_preservation`, not
source-owned item mapping or supplier proof. Every reserved/amended current
reference/revision needs exactly one real item binding. Those items are forced
fixed with every original field intact and cannot be selected. Unknown status,
missing reader, incomplete pagination, unbound active reference, stale/ambiguous
binding, explicit date incompatibility, or selected/fixed overlap means pending/no
executable candidate. Reference tier remains user_reported unless its existing
reader proves otherwise. Bindings do not prove supplier availability.

Report is exactly `{source:"user_report",kind:"fatigue"|"delay"|"closure"|"high_risk_unwell",observedAt:RFC3339}`.
A report is valid for at most five minutes from observedAt; future/expired reports
require a new explicit report. High-risk unwell yields no omission candidate.
Locale is zh/en. No free text parser, title heuristic, replacement venue or route.

Transport input is separately closed:
`{operation:"transport",expectedHeadVersion,dayId,itemId,receiptId:UUID,departure:"now"}`.
Only an installed ordinary owner #366 receipt reader may qualify it. No such
durable reader is installed at base 8d30; return pending `TRANSPORT_RECEIPT_READER_UNAVAILABLE`,
with the existing Trip navigation/official channels, and zero provider calls.
Future, expired, revoked and absent observations cannot become user reports.

Selection input:
`{operation:"select",input:{operationId:UUID,contextId:UUID,contextDigest:SHA256,candidateId:"omit_one"|"omit_selected"}}`.
Only one choice becomes an original pending Proposal. It has an exact original
proposalId/revision/baseVersion/digest/expiry and a visible original diff. Candidates
are not applied, and omission is not cancellation or refund. Confirmation/rejection
use the existing Proposal endpoints with the original idempotency key and digest.

Recovery input: `{operation:"receipt",operationId:UUID}`. Recover the precise
selection operation, including pending/applied/rejected/stale/expired. Unknown ACK
retains the original operation and choice; retry cannot create a second Proposal.
Forbidden/actor drift hides private results and does not mean an earlier write was
rolled back. Applied confirmation is only an original exact Proposal event/version.

## Necessary SQL seam — Main review before runtime

No migration is authorized by this document alone. The SQL task uses one additive
slot designated by Main, ordinary owner RPCs, default EXECUTE revoked on all new
public/private functions (no new grant authorization), private storage with RLS
and owner/Trip/Proposal deletion cascade.

- `prepare_local_recovery_v1(p_trip_id uuid,p_input jsonb)` takes exactly the
  preview `input`. Under current owner/Trip authority it reads the actual current
  snapshot, lawful Profile pace/updatedAt and complete current reservation scope.
  It stores a thin immutable prepared context with the exact report/selection,
  source fingerprints and min(report.observedAt+5min, server-now+5min) expiry.
  Same owner/operation/body replays this context; changed body conflicts. Missing
  reservation capability returns pending and no executable context. Success returns
  `{kind:"local_recovery_context/1",contextId,contextDigest,tripId,baseVersion,
  expiresAt,profileBasis:{travelPace,updatedAt},reservationBasis:[{referenceId,
  revision,contentDigest,status,evidenceTier}],input}`. `contextDigest` is SQL-owned,
  not a client hash. The server cannot extend it on read/retry.
- `submit_local_recovery_v1(p_trip_id uuid,p_input jsonb)` takes exactly selection
  `input`. Locks original Trip/current sources and context, validates immutable
  currentness and expiry, computes only delete_item operations for either the first
  selected item or all explicit optional selected items, verifies fixed/unselected
  preservation, and calls existing `create_trip_proposal_patch`. Attach a thin
  recovery lineage receipt and shorten proposal expiry in the SAME transaction.
  No direct Trip update. Same owner/operation/choice replays the same Proposal;
  second choice/new operation on a used context conflicts. Return
  `{kind:"local_recovery_proposal/1",operationId,contextId,contextDigest,candidateId,
  proposalId,proposalRevision,baseVersion,expiresAt,reused}`.
- `read_local_recovery_operation_v1(p_trip_id uuid,p_operation_id uuid)` is exact
  owner operation read, never global/latest. Return `kind:"local_recovery_operation/1"`,
  `operationId`, `tripId`, original selection `input`, `receipt` (above),
  `state:"pending"|"applied"|"rejected"|"expired"|"stale"`,
  `resultingVersion:number|null`; no unqualified success when receipt is absent.
- Recovery lineage MUST be enforced in the original confirm transaction through
  an additive deferred Trip event guard (or equivalent mandatory original writer
  seam): current source/Profile/reservation fingerprints, immutable patch/revision,
  exact fixed scope and short expiry checked atomically. Plain confirm, alternate
  confirm, original revise/successor/rollback lineage cannot bypass the guard.
  All recovery revisions/successors, including identical patches, reject. Users
  reject the old Proposal and prepare a new context; operation applied receipts
  refer only to their exact original Proposal event. Ordinary historical
  proposals retain their current behavior. No second writer, no old migration edit.
- Export/delete/cleanup follows the existing owner Trip/Proposal domain: only an
  independently enrolled exact-job/lease private export seam may include bounded
  original report/selection/source metadata. Until enrolled, export remains
  partial; old authorized source egress must not expand. Explicit cascade and
  bounded cleanup cover expired unused preparations. No new grants.

TS independently rereads actor/epoch, exact Trip version/content, lawful Profile
and source basis before emitting any private response. Returned context must match
the original request and current independently read owner basis. SQL protects the
actual confirmation race; HTTP fences do not substitute for atomic guards.

## Candidate semantics and qualification

One candidate omits the first explicitly optional selected item. With multiple
optional selections, the second omits all of that bounded explicit selection.
Both retain every other item and the original dated windows. Relaxed Profile pace
may order the two candidates with the larger omission first; current explicit
selection always wins. Profile is a visible soft reference with timestamp, not a
hard safety fact. Invalid/unavailable Profile is an explicit unknown.

Run the existing `describeProposalDiff` and feasibility assembler/constraint engine
on each proposed next snapshot. Without qualified place/route/availability inputs,
feasibility stays pending. A local edit can be proposed with manual verification
clearly required; never claim a safe onward itinerary or an open place. Removing
optional entries can change adjacent transfers, which remain unverified. Infeasible
remaining fixed windows produce no executable candidate.

Unknown or unsupported outcomes offer only current eligible existing Trip
official/supplier actions from the existing action projector. Absent qualified
actions are explicitly unavailable; no fabricated URL, phone number or provider.
High-risk unwell uses the existing safety helper with qualified official channel;
without one, report official-channel-unavailable and generic seek-local-help text,
never instructions to keep travelling.

## Verification boundary

Necessary affected evidence: exact scope/fixed preservation, profile drift, expired
and future report, source absence/incomplete/unbound order, independent native/web
HTTP authentication and same-Origin, lost ACK/same-operation read/retry, original
Proposal read/diff/confirm/no-duplicate event, reject/expiry/revision/source-change
and alternate-confirm negatives. Target provider/device/production are UNRUN unless
actually observed. No new SQL persistence may ship without its deletion/export and
atomic original-writer negatives. A service helper alone does not close #220.
