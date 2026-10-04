# Foreground traffic SQL authority v1

Related to #366 and #220. Fixed SQL wire for Main review, based on real main
`8d30d0ba645552e6de3251e4d76ba09a78d652b1`. This task owns only append migration
`20261004040000`, this contract and its PG tests. No runtime grants, roles,
policy seeds, provider calls or changes to 030000/TS/Swift/registry.

## Identity and fixed RPCs

All functions have empty search_path; all new EXECUTE and private table/schema
privileges are revoked from PUBLIC/anon/authenticated/service_role. Ordinary
user clients cannot forward producer calls. A separately configured database
role, recorded by OID in an initially empty private producer table, must be the
actual effective invoking role (role setting/session_user including a separately enabled existing service_role transport, never JWT role,
caller body, digest or signature). The server first verifies the real request JWT/session and supplies a separate closed p_actor {subject,sessionId,mobileEpoch:null|integer}; SQL locks auth.users/auth.sessions and native account epoch when mobile. SQL trusts the restricted server actor assertion; it does not independently verify that JWT. Its activation and credential delivery are outside
this migration. SQL trusts that restricted server role's fixed HTTP fetcher;
SQL does not attest the external HTTP origin.

`public.foreground_traffic_policy_v1(p_scope jsonb,p_actor jsonb)` is server-only. Closed scope:
`tripId`, `expectedHeadVersion`, `dayId`, `itemId`, `originPlaceReferenceId`,
`destinationPlaceReferenceId`, `mode` (walking/transit/driving), `departure` (now).
p_actor is built only from actual server-verified request identity, never the public request body.
Result is `{kind:unavailable}` or `{kind:policy, policyId, policyRevision,
policy, sourceVersion, accountScope, allowedEndpointModes, stopEpoch, stopped, endpoints}`.
`policy` has exactly existing PolicyReceipt evaluator fields and grants.
`endpoints` has origin/destination `{referenceId,canonicalPoiId,mappingId,
canonicalFingerprint,mappingFingerprint,providerPoiId}`. Fingerprints are only
internal revision comparison, never source evidence. Legacy tables have no
revision counters, so full current row fingerprints are reread under locks.

`public.foreground_traffic_producer_v1(p_action text,p_input jsonb,p_actor jsonb)` is server-only:

- begin: closed `{operationId,scope,policyId,policyRevision,stopEpoch,
  operation,endpoints}`; operation check/refresh. Result unavailable, limited,
  unknown (same dispatched operation), or `{kind:dispatch,dispatchId,stopEpoch}`.
  Explicit check may resume only its observed stopped epoch; refresh cannot.
- request: closed `{dispatchId,requestIndex,endpointKind}`; index is integer 1..5, exactly
  next index, with no replay grant. endpointKind is detail/walking/transit/driving from the actual fixed server fetch dispatch; detail max two, each explicitly allowed route mode max one. Same SQL transaction locks/rechecks actual
  actor/session/scope/policy/stop and uses a private helper sharing the original place_quota_private.usage actor/minute/day rows and lock order, with fixed `places` quota
  (30/minute,500/day) before returning `{kind:request,dispatchId,requestIndex}`.
  TS calls this immediately before each provider request instead of consuming
  that request twice. Receipt reads never consume or grant provider budget.
- complete: closed `{dispatchId,fetchedAt,selected,alternatives,previousReceiptId}`.
  selected/each alternative closed `{mode,durationSeconds,distanceMeters,tmc}`;
  tmc is null or closed `{unknown,smooth,slow,congested,severely_congested}`
  with nonnegative finite category-distance metres. At most two alternatives;
  no road/polyline/coordinates/address/raw response/URL/secrets. Duration and
  distance are bounded nonnegative integers. `fetchedAt` is trusted server
  fetch clock, between dispatch creation and SQL now. providerObservedAt is
  always null. Result unavailable/unknown or `{kind:receipt,receipt}`.
- unknown: closed `{dispatchId}`; clears observation values, holds the durable
  comparison window until its five-minute end. No implicit dispatch retry.

Begin serializes per owner/session/viewed Trip/day/item: at most three
comparisons in five minutes, minimum 60 seconds between comparisons, one
unfinished dispatch at a time. Each begin binds immutable exact owner/session/
native epoch, Trip head/day/item, references/current canonical/provider rows,
mode, policy/source/account versions and stop epoch. Owner check/foreground/
consent/movement refresh rules remain TS inputs checked before every request;
SQL does not claim consent or movement attestation from caller JSON.

`public.read_foreground_traffic_v1(p_receipt uuid,p_scope jsonb)` derives actual
owner/session. Result unavailable or `{kind:receipt,receipt}`. Receipt contains
receiptId, dispatchId, exact scope, stopEpoch, policyId/policyRevision,
sourceVersion, fetchedAt, providerObservedAt:null, expiresAt, selected,
alternatives, previousReceiptId, changeKind, durationDeltaSeconds,
routeChangeCaveat:true, r2Qualified:boolean. Prior receipt must have identical
scope/session/stop/policy/source/current mappings. Duration-only difference is
route_estimate_changed; changed non-null TMC aggregate is
route_condition_changed; otherwise unchanged. Neither is a closure, incident,
arrival or forecast claim. Query time is fetchedAt.

`public.stop_foreground_traffic_v1(p_scope jsonb,p_expected_stop_epoch bigint)`
derives owner/session, takes the same locks, increments the durable epoch,
marks stopped and deletes outstanding receipt values. Exact old epoch rejects.
Stop is available without installed policy so revocation does not prevent stop.

## Current policy and atomic #220 seam

Empty private policy table holds provider amap, accountScope, sourceVersion,
endpoint mode, region cn, revision, exact PolicyReceipt semantics (c0_public,
effective/expires/termsRecheck/trial, derivative/combination/redistribution/
training/shareAlike/retention), and field grants. Required fields are duration,
distance, tmc, derived_change, receipt_metadata. Each actually used field needs display/explore,
cache/explore and persist/trip_planning; retention must be durable, derivative
allowed for trip_planning. endpoint_modes is an explicit required 1..3 mode set, no default. Before dispatch request checks that set; complete summaries must use modes actually requested, alternatives differ from selected and cannot repeat. TMC null for walking/transit requires no TMC grant; driving requesting TMC checks it before fetch. Unknown/ambiguous/revoked/deadline denies before
dispatch. Short value retention expires at min(300s, source/policy deadlines,
policy retention seconds). No inference/training permission is inferred.

`traffic_private.qualify_recovery_v1(p_receipt uuid,p_scope jsonb,
p_policy_id uuid,p_policy_revision bigint,p_stop_epoch bigint) returns jsonb`
is the private exact seam for 030000's owner. Result unavailable or
`{kind:qualified,receiptId,policyId,policyRevision,stopEpoch,expiresAt,proofBasis}`. expiresAt is the minimum receipt/policy/producer/support/publication deadline. proofBasis is opaque server-only DB-captured metadata, never returned through public owner read or the UI.
It runs inside the ORIGINAL recovery-confirm transaction, after that writer
locks current Trip, before any mutation. No new writer. It locks/rechecks the
same auth/Trip/scope/receipt/policy/source rows and clock. Locks stay held through
original confirm. No latest/global fallback or budget. If missing function or
non-qualified result, #220 stays pending/rejects. 030000 ownership remains with
its SQL owner; no direct consumer grants to app roles.

R2 requires at least one exact current matched address_reference ItemSupport
whose preparation references the destination TripPlaceRef and approved
canonical mapping, whose current item digest/source/claim/member/publication
and preparation deadline all remain valid. Ambiguity denies. Explicit origin
and destination selection alone is user intent. Origin reference is current
but not falsely represented as an item association. The existing TripSupport
qualification chain is reused; no new association writer or licence facts.

Lock order auth user/session/mobile account -> Trip -> durable scope -> policy
-> reference/canonical/provider -> support/source -> dispatch/receipt. NOWAIT
or try-lock contention returns unavailable without partial Trip write. Existing
confirm may already own Trip; acquisition is compatible within its transaction.
Stop, policy/source revocation and confirm therefore serialize on actual rows.

## Lifecycle

Account/session/Trip/reference deletion cascades the new owner metadata.
Policy revocation/change erases stored observation values and makes all old
versions unreadable; source expiry does likewise on read/purge. Private
`traffic_private.purge_expired_v1(p_limit integer)` bounded 1..500 erases expired
dispatches/receipts/windows; no default diagnostic trace retention.
Private `traffic_private.export_metadata_v1(p_request uuid,p_lease uuid,
p_generation integer,p_after uuid,p_limit integer)` checks the real D2 job,
active lease, generation/session and eligibility, returning only bounded
scope/source/policy/time/outcome metadata. This seam is NOT registered into old
egress: export integration remains partial, no old predicate is widened.

Synthetic/admin fixture grants and sources exercise code only. Installed
producer/account capability, real provider response/field purposes, target
migration, export registration and actual provider/native flow remain UNRUN.

`public.read_foreground_traffic_scope_v1(p_scope jsonb)` is an ordinary owner
RPC returning unavailable or {kind:scope,stopEpoch,stopped}; actual owner JWT,
session/native epoch, current Trip/head/item and exact same-owner references
are checked, independent of receipt or policy. Lost ACK/cross-instance/revoked
policy stop obtains this real epoch and calls the original CAS stop, no guessing
or retry budget. Privileges remain default revoked.

`traffic_private.validate_recovery_proof_v1(p_receipt uuid,p_scope jsonb,
p_policy_id uuid,p_policy_revision bigint,p_stop_epoch bigint,p_proof_basis jsonb)`
returns boolean. 030000's sole owner captures qualify proof in the original
transaction, binds exact root/context/transaction, then validates immediately
before transaction completion. It compares current DB receipt and dispatch
fingerprints plus auth/policy/stop/reference/canonical/provider/support/claim/
source/member/publication tuples under retained locks and final clock. UTC
serialization stabilizes timestamp fingerprints. Legitimate original writer
Trip head/item changes are excluded from this deferred comparison; same-tx
receipt/value/source mutations, revocation and expiration reject. No GUC proof.
