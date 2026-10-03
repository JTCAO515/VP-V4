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
supports opening; qualified address/window is not route, live admission/reservation,
price, walking duration or timetable authority. Current installed route read targets
"now"/two stay-area candidates and has no exact proposed-departure binding; it is
not called or upgraded into a future whole-plan feasibility assertion.

Door-to-door route, last connection, walking and required buffer conditions remain
pending without qualified sources. Route+explicit minimum/baggage/appointment buffers
must fit the original fixed window; no constraint silently reschedules items. Missing
reservation/calendar/place evidence remains pending. Infeasible is a witnessed
constraint conflict, not permission to discard user's choices. Whole219 is not
claimed complete from reference-only evidence or local contract checks.

No new provider fees, source acquisition, Ops mapping publication, Trip writer,
role/grant/target configuration or dynamic external DSL. Native consumes exact
Proposal reference and all supported/pending/violated lines with explicit gaps.
