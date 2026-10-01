# Web Trip comparison consumer

`GET /api/trips/{tripId}/comparison-result` uses the existing Web SSR cookie
actor and ordinary public Supabase key. It rejects bearer credentials, foreign
Origin/Sec-Fetch-Site, unknown query parameters and invalid Trip IDs. Responses
are private/no-store and vary on Cookie. No native endpoint protection changes.

The adapter calls `read_trip_result_reference_v1` then
`read_result_artifacts_v1` with the returned exact ID/revision. Both retain
`text_owner()`, real Auth-session existence and the existing mobile epoch guard.
Normal Web sessions without native proofs are already supported by
`mobile_access_v2()`; a native-proven session still follows its replacement
rule. No service role, new RPC or alternative session model is introduced.

The current result must match Trip, artifact and revision and pass the closed
comparison/1 schema. Trip archive/deletion/head changes, goal/link/Task changes,
Memory eligibility and text consent remain governed by the result authority.
Missing/non-current references show empty; unavailable or unknown/malformed
content fails closed. No second persisted body, Task, Proposal or confirmation writer exists.

TripCanvas renders bounded literal text and a refresh control. Reads expire
30 seconds after request start using monotonic browser time; background,
auth changes, Trip/version navigation and unmount clear or fence responses.
The card rechecks on visible return/online/refresh, validates the displayed
Trip version and never displays a late response from a previous Trip.

Evidence is local synthetic Auth/Postgres/HTTP and browser verification.
Staging/Production, real provider result and physical-device/full #560 acceptance
remain UNRUN. Rollback can remove only this Web consumer; existing native and
authoritative result readers remain intact.
