# #365 current place actions

Native POST `/api/explore/native/v1/trips/{tripId}/place-actions` uses the original
native Trip configuration/ordinary credentials and current session epoch.
Web POST `/api/trips/{tripId}/explore/place-actions` requires the current ordinary
cookie actor and same origin. Credential crossover and URL parameters are rejected.
Responses are private/no-store; a bounded request lifetime covers all reads/writes.

The closed parser in `lib/server/explore/place-action-command.ts` accepts only
exact canonical/provider/providerPoiId identity, explicit Trip version, mapping
digest and user choices. `context` reads current authority twice, checking snapshot,
saved state, reviewed source candidates, complete/unavailable source status and
fact-bounded 30-second expiry. Names/addresses/coordinates never infer qualification.
`saved` uses the same ordinary context RPC with a digest-bound cursor and limit
1–100; rows preserve the saved selection, reference, revision and mapping digest
when mapping disappears. Unavailable/changed names stay null. Partial pages are
not complete inventories; changed cursors fail closed.

Save means retaining an identity reference in this Trip. It grants no supplier
body retention, model prompt, display, translation or redistribution rights.
Unsave compares the original stored selection/reference/revision/digest and
retains references consumed by other domains. Current mapping is not required.
The legacy Library v1 detail DTO remains compatible; the new actions consume
current owner context through `libraryPlaceCapabilities` and the action routes.

Ask returns an exact first-party current input and the existing selected Trip
source. `readyForProvider:false` and `purpose:first_party_reference_only` are
explicit. No model/provider call or new place source kind is introduced. Web
navigation uses the old exact POI handoff only when an owned reference exists.
Without one, the UI requests Save before that navigation. Native prepares the
existing editable draft; sending remains a separate user choice.

Add accepts one existing day, a new item ID, a locale and an explicit window at
most 24 hours. It creates one pending proposal through the original
`create_trip_proposal_patch`. SQL owns the atomic reference/Proposal/receipt
transaction; TS does not call Confirm or a Trip writer. The initial preview
selects at most two affected directed edges, records removed edges, and keeps
unknown opening/reservation/stay duration/future routes/buffers pending. Its
internal neutral engine parameters are explicitly not user needs.

An explicit read-only `evaluate` request carries the original Add command and
the existing #219 `{needs,placeChoices,routeRequests}` contract. It reuses current
support candidates, original proposal identity/digest/base, reservation readers,
constraint assembly and bounded Maps route reader. Only an affected directed
edge can be requested; the existing reader admits at most one foreground leg,
five provider requests and one concurrency slot. Consent, route/feature flags,
quota, cancellation, session, exact Proposal and current source are rechecked
before every request. Default requests make zero provider calls. A future or
different departure observation is reference-only; billing unit and cost stay
unknown. No sourcing of stay duration/reservation/last-service evidence is
invented, so incomplete results remain pending. Native also reaches the existing
#219 feasibility controls from its original Proposal page.

Success contains the immutable historical receipt plus required `proposalReview`
(null or `{id,revision,digest,baseVersion}`) and `preview` (null or initial preview).
The digest comes from the original pending reader and must be `trip-v2:<64hex>`.
Native and Web open the original diff/Confirm surface using the exact reference.
Web references with missing/invalid fields or changed id/revision/digest/base
fail closed; no latest-Proposal fallback applies to selected references.

Unknown ACK keeps the original command and operation ID. `receipt` wraps the
original command; absence and 400/401/403/409/503 do not erase recovery state.
User-requested `abandon` wraps the same command under the original SQL operation
lock. It returns an existing success or creates a cancelled-before-apply fence.
The cancelled reply has exactly ten fields: kind, tripId, operationId, action,
selection, tripVersion, mappingDigest, requestDigest, historicalOnly and
currentEligibilityRequiresRead. Late retries cannot apply a fenced command.
Cancellation does not reverse a committed save, proposal, confirmed Trip or
external order. The opaque PostgreSQL JSONB SHA256 is not recomputed by clients;
SQL compares the entire original request as well as actor/Trip/operation.

The Web journal stores only original command bytes and Trip ID under its current
actor key. It is persisted before sending, carries no supplier label/body,
coordinate or secret, and is hidden on identity/session changes. Replies from
old scopes cannot clear the current journal. Only matching committed/cancelled
terminals release it. Server deletion/export follows the separately versioned
metadata seam described in `vpj20-place-actions-sql.md`; existing partial exports
are not silently enlarged. Default RPC grants and feature activation remain off.

This source is a development implementation. Real target Auth/ACL enrollment,
provider billing/routes, authenticated Web/device execution and export delivery
are separate unrun acceptance. Main alone decides whole #365 closure.
