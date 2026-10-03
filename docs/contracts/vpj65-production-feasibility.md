# VPJ65 production feasibility assembly wire

POST /api/trips/native/v2/{tripId}/feasibility. Native ordinary Bearer/current
positive session epoch/exact owned pending Proposal and original Trip base apply.
No cookies/Origin/query/owner/evidence boolean/provider or eligibility override.
Body exactly proposalId,expectedProposalRevision,expectedBaseVersion,needs,placeChoices.
needs exactly partySize1..20,currency3uppercase,maxBudgetMinor:null|0..100000000,
minTransferMinutes/baggageBufferMinutes/appointmentBufferMinutes0..1440,
maxWalkingMinutes:null|0..1440. These are current explicit input; no saved preview
is silently adopted as a hard condition. placeChoices<=40 distinct item IDs, exactly
dayId,itemId,placeReferenceId,mappingId,expectedMappingVersion,city,scene,locale.
IDs must come from actual existing context/picker/candidate reads, never name guess.
No client claim/value/hash authority.

Success exact kind:plan_feasibility/1, basis:{tripId,proposalId,proposalRevision,
baseVersion,proposalDigest}, status:feasible|pending|infeasible,
lines:[{itemId:null|string,constraint,status:supported|pending|violated,reason}],
evidenceBasis:[{itemId,placeReferenceId,mappingId,mappingVersion,sourceDigest,
contextDigest,claimType,facts:[{factId,version,expiresAt}]}],
missingEvidence:[{itemId,constraint,reason}],
userDecisions:[{dayId,itemId,startsAt:null|string,endsAt:null|string,disposition:preserved}],
scheduleChanges:none,proposalMutation:none,needsBasis:current_explicit_input.
All fields are required; source absence is an empty evidenceBasis with explicit
pending gaps, not an empty successful plan. Unavailable reason STALE_BASIS or
STALE_EVIDENCE, existing error taxonomy for actor/invalid/provider failures.

Production adapter actually reads owned pending after-diff, current typed SQL owner
context/reviewed candidates, passes server-qualified selected place/time-window
facts to existing evaluateFeasibility, then rechecks evidence/basis/actor+epoch.
Date is checked against local start in exact timezone. Only current covering window
supports opening; outside a positive opening window stays unknown, because these
sources do not assert complete closing hours; qualified address/window is not route, live admission/reservation,
price, walking duration or timetable authority. Current installed route read targets
"now"/two stay-area candidates and has no exact proposed-departure binding; it is
never upgraded into a future whole-plan feasibility assertion; the optional
foreground path below consumes only its actual current observations.

Door-to-door route, last connection, walking and required buffer conditions remain
pending without qualified sources. Route+explicit minimum/baggage/appointment buffers
must fit the original fixed window; no constraint silently reschedules items. Missing
reservation/calendar/place evidence remains pending. Infeasible is a witnessed
constraint conflict, not permission to discard user's choices. Whole219 is not
claimed complete from reference-only evidence or local contract checks.

No new provider fees, source acquisition, Ops mapping publication, Trip writer,
role/grant/target configuration or dynamic external DSL. Native consumes exact
Proposal reference and all supported/pending/violated lines with explicit gaps.

## Verification and remaining source dependencies

Local contract tests cover exact owned HTTP proposal reads with ordinary JWT,
positive epoch replacement rejection, current/expired/wrong-context opening receipts,
opaque Trip IDs, and fixed overlapping appointment windows without rescheduling.
HTTP transport and keys are synthetic; no target deployment/device/provider acceptance
is claimed. Candidate lookup follows at most ten current SQL pages (500 entries) and
fails to pending when the selection cannot be requalified. Request body is bounded
to 24000 bytes.

The existing maps route-comparison reader explicitly rejects future departures and
returns observations for departure=now. No installed persisted exact-future-departure
route receipt reader, live appointment/reservation availability reader, or last-service
timetable reader was found in the affected planning path. These require actual
qualified authority before their pending checks can become supported. No provider
call or paid acquisition is introduced by this adapter. Whole #219 remains in
development while these broader planning behaviors are incomplete.

## Optional explicit foreground Maps operation

The original five request keys remain valid. Optional routeRequests is an array
of zero or one entry, exactly fromItemId,toItemId,mode:walking|transit|driving,departure:now,mapConsent:true.
Provider IDs are resolved only on the server from both own selected canonical
place receipts and existing provider_poi_mappings rows. Exactly one valid AMap
identity per canonical POI is required; missing or multiple mappings dispatch
nothing. Caller provider IDs and names are not accepted. User foreground consent is necessary but cannot qualify evidence.

VISEPANDA_FEASIBILITY_ROUTES_ENABLED defaults off. Existing AMAP_ROUTES_ENABLED,
AMAP_DETAIL_ENABLED, server key, ordinary actor place quota, current positive session
epoch before each provider request, request cancellation and five-call bound all
apply. No environment flag/key is enabled or installed by this change. Only one
explicit leg is queried with the existing compareRoutes now interface. Fixed
departure in the future dispatches zero provider calls; past departure outside the
existing five-minute observation lifetime is unsupported.

evidenceBasis may additionally contain a route variant exactly
kind:route_observation,fromItemId,toItemId,originCanonicalPoiId,
destinationCanonicalPoiId,provider:amap,mode:walking|transit|driving,departure:now,
actualDeparture,timeBinding:exact|reference_only,observedAt,expiresAt.
Only observedAt exactly equal to the original from-item endsAt qualifies a route
for plan checking. Different instants remain independent reference observations
with the plan route line pending. No tolerance window is invented. Walking
duration is qualified only for walking mode; transit walking distance does not
become walking minutes. Last-service and reservation checks remain pending.

## Current saved Profile soft reference

Success may additionally include preferenceContext exactly
kind:profile_preference_context/1,status:current|unknown|unavailable,
travelPace:null|relaxed|balanced|packed,currency:null|string,
defaultDepartureTime:null|HH:mm,updatedAt:null|string,
influence:soft_reference_only,explicitInputPriority:current_explicit_input,hints:string[].
The production route includes this field and reads it twice through the existing
ordinary owner Profile adapter. Changed Profile context returns STALE_EVIDENCE.
Missing/invalid values are unknown, read errors unavailable, never synthesized
defaults. Only the existing travel pace, currency and default departure reference
are returned; unrelated profile identity fields stay outside this result.

Hints are PROFILE_PACE_RELAXED_SOFT_REFERENCE, PROFILE_PACE_BALANCED_SOFT_REFERENCE,
or PROFILE_PACE_PACKED_SOFT_REFERENCE; EXPLICIT_CURRENCY_MATCHES_PROFILE or
EXPLICIT_CURRENCY_OVERRIDES_PROFILE; PROFILE_DEPARTURE_REFERENCE_ONLY.
Display this preview separately from current explicit needs, with existing Profile
correction/navigation or current-input editing. Applying a preview to input requires
the user's explicit selection. Profile hints never count as supported feasibility
lines and never change constraints, times or Trip data.
