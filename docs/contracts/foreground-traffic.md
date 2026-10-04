# #366 foreground observation and R2 authority

Baseline: main `8d30d0ba`, 2026-10-04. The existing route reader resolves exact
AMap POI IDs and calls the fixed official HTTPS endpoint. It exposes current
route estimates, not closure events, provider timestamps or live bus arrivals.
[AMap v5 documentation](https://lbs.amap.com/api/webservice/guide/api/newroute)
documents driving `show_fields=tmcs`, `steps.tmcs.tmc_status` and
`tmc_distance`. Returned TMC categories describe the returned route at fetch
time. Account coverage remains unverified. Local `fetchedAt` is not
`providerObservedAt`; the five-minute cutoff is local consumer policy.

## Independent foreground wire

POST `/api/trips/[tripId]/traffic-observations` and native
`/api/trips/native/v2/[tripId]/traffic-observations` accept the closed object:
`operation: check|refresh|stop`, `expectedHeadVersion`, `dayId`, `itemId`,
`originPlaceReferenceId`, `destinationPlaceReferenceId`, `mode:
walking|transit|driving`, `departure: now`, `mapConsent`, `foreground`,
`previousReceiptId: UUID|null`, `movementMeters: number`.

The server reads the ordinary owner's current Trip, selected item, archive,
session, explicitly selected current canonical Trip references and unique
AMap mapping. Reference selection is user intent, not a verified semantic
item-to-place association. No inferred title match. No Trip writes. Automatic
refresh requires the same viewed scope, 120 seconds elapsed or reported
movement >=250 metres; every comparison is throttled at 60 seconds. Movement
is a user report, not position evidence. At most three comparisons per local
five-minute window, five provider requests per comparison, no retries.
Original global atomic actor quota runs before provider dispatch regardless
of cold start; the process window is an additional limit only. Unknown
post-dispatch cost blocks the local window until its end. Stop/consent loss,
background, session/head/reference change suppress output and invalidate the
local receipt. Client cancellation is required when leaving the screen.

Display and cache of **every new output field** require current installed
server policy rights; flags/working keys do not grant rights. Missing policy
is unavailable before provider dispatch. The fixture policy is only a test
dependency. No runtime registry is currently installed. Existing Maps
address/navigation routes remain the fallback. Estimates and TMC deltas are
separate; TMC category-distance changes can reflect a different chosen route,
not proof of an incident on an unchanged road. No closure/forecast/arrival claim.

## Proposed SQL authority contract for Main review (not implemented here)

R2 cannot use the process receipt as SQL confirmation authority. A separate
SQL task is needed if R2 is to generate externally triggered candidates.
No allowed policy seed, new credential, live lease or permission grant is
part of this proposal. All new RPC EXECUTE/table privileges default revoked,
including service role; runtime remains disabled pending bounded operator
configuration under existing development policy.

1. **Producer boundary.** A private producer RPC is callable only by a
   separately enabled server capability, never anon/authenticated, and never
   through ordinary generic user RPC forwarding. It records only observations
   made in the same foreground server operation by the fixed AMap fetcher:
   successful bounded JSON, matching resolved endpoints, selected whole mode,
   successful before-each-request owner/session/head/consent/stop/quota checks.
   `producerKind=amap_v5_foreground`, `endpointKind=driving|walking|transit`,
   `dispatchId` is server random and unique; `receivedAt` is server clock,
   `providerObservedAt=null`. No caller JSON, body hash, signature or local ACK
   attests origin. SQL trusts only this restricted producer identity; it
   cannot independently verify the external HTTP response. Synthetic fixtures
   never enter a live producer. No producer RPC is enabled by this migration.
2. **Scope and currentness.** Receipt UUID binds actual owner, auth session,
   native epoch if applicable, Trip ID/head, selected day/item, explicit
   origin/destination reference IDs and their canonical/provider mapping IDs
   and revisions, mode, now departure and actual server query time. Exact
   current Trip/item/ref existence and source-qualified semantic association
   must hold; user reference selection alone remains insufficient for R2.
   All dependencies are reread before issue/read/consume. Missing authority,
   future clock, changed head/mapping/session, archive/delete, expiry or stop
   returns unavailable. No global/latest receipt fallback.
3. **Policy authority.** A private, initially empty policy table binds
   provider/account/endpoint/source version to field-level action/purpose/
   region using existing `PolicyReceiptV1` meanings. Fields include duration,
   distance, TMC category-distance, derived change and bounded receipt metadata.
   Separate `display/explore`, `cache/explore`, `persist/trip_planning` and
   derivative `trip_planning` purposes must be explicitly current for the
   fields consumed. Store policy ID/revision/licenceVersion/sourceId,
   effective/expires/termsRecheck/trial deadlines, retention and revoked state.
   Unknown denies. No inference rights are needed or granted. Policy authority
   uses existing documented development configuration, not invented licence
   facts; configuring it requires a named operator scope. A policy JSON or
   evaluator-produced client receipt is not current DB authority.
4. **Receipt payload.** Persist only bounded provider/source/policy identity,
   exact scope, dispatch/time/expiry, selected duration/distance and available
   TMC category-distance aggregates, prior receipt reference, change kind and
   delta, max two complete alternative summaries with mode/duration/distance.
   No raw provider response, road/polyline/precise track, credentials, query
   text, addresses or provider URLs. Duration delta is `route_estimate_changed`,
   never closure or incident. TMC aggregate delta is `route_condition_changed`,
   with route-change caveat. Rights for deriving/persisting these fields are
   independently required. Upper TTL min(300s, all current policy/source
   deadlines); local TTL never upgrades unknown supplier currentness.
5. **Atomic consumer.** Ordinary owner reader takes receipt UUID plus exact
   Trip/head/day/item/mode/now and authentic session, never actor from body.
   #220 context records exact receipt+policy versions only when fully qualified.
   Existing recovery confirmation writer locks/rechecks Trip, policy, source,
   stop scope and receipt in the same transaction before original Proposal
   confirm; failed read is unavailable. No second Trip writer. Revocation,
   expiry and stop between preview and confirm reject. SQL slot/order and
   integration with 030000 belong to their designated owners.
6. **Stop, concurrency, budget.** Durable stop epoch per owner/session/viewed
   scope is checked by producer and original confirm. Stop revokes outstanding
   receipts for that scope. Provider uncertainty records a bounded unknown
   dispatch outcome and forbids implicit retry; existing global quota remains
   mandatory before every external request, not replaced by the local window.
   Never grant a new budget by receipt read. Concurrent producer/stop/confirm
   must serialize or return unavailable without partial Trip mutation.
7. **Privacy/lifecycle.** Trip/account deletion erases new metadata; source
   revocation invalidates and erases expired observation values. Short expiry
   purges values, leaving only minimum operation outcome metadata if justified
   by its own retention policy. Owner export returns bounded receipt scope,
   source/policy/time/outcome metadata via the existing typed privacy extension;
   no silently changed old export predicate. Delete/export completeness is
   reported separately until integrated. No default trace retention.

Operator/target UNRUN: installed account capability, policy authority and its
field purposes, restricted producer/reader grants, source association and
currentness inputs, target migration, real provider and native/web UI caller.
This document is a concrete contract review input, not a grant or #366 closure.
