# S3 route comparison — #364 / VPJ-19

The existing authenticated Web and native place lookup endpoints accept
`action=routes&provider=amap&originId=<provider POI ID>&destinationId=<provider POI ID>&departure=now`.
There is no new identity/session route, database write, Trip patch, location permission or background location stream.
`AMAP_ROUTES_ENABLED=true`, `AMAP_DETAIL_ENABLED=true` and the existing server-only
`AMAP_WEB_SERVICE_KEY` are required. Disable the routes flag to roll back requests.
The default example remains disabled.

Each explicit comparison resolves both IDs through the existing detail adapter, checks the
returned IDs and GCJ02 coordinates, then queries one whole AMap walking, transit and driving
plan. Maximum five provider calls; no retry, provider mixing or persistent cache. Transit city
codes come from resolved details, never from an unrelated city picker. Missing city codes make
only transit unavailable. AMap plans containing unsupported rail/taxi segments are unavailable,
not silently truncated. Single-provider busline alternatives remain together in their segment.

Responses include the resolved endpoints, provider, observation time, five-minute local expiry,
per-mode outcome, duration, distance, walking distance, transfer count, steps and estimated
current departure/arrival. The five-minute cutoff is a client requery policy, not a supplier
freshness guarantee. Missing fields remain unknown. Driving costs are **tolls only**; all costs
are estimates, not quotes. Transit is not real-time arrival data, driving is not a ride booking,
and missing entrance/accessibility facts never imply a verified accessible entrance.

Future departure returns `422 FUTURE_DEPARTURE_UNAVAILABLE` before provider dispatch.
The client presents this limitation. Future-departure integration and acceptance remain open;
current congestion is never displayed as tomorrow's forecast. Invalid/same endpoints fail
before routing. A provider response for mismatched coordinates is rejected. Empty, timeout,
provider failure and unsupported results remain per-mode outcomes, never synthetic success.

Web and native let the user pin an AMap detail as origin/destination, then explicitly compare.
Manual selection works without requesting location, including when OS location permission is
denied. Query edits preserve pinned endpoints; city/provider changes, backgrounding, account
scope changes/native, Web 401 and Web focus reset clear them. New endpoint selections invalidate
old responses. Expired responses hide route actions. Chinese destination addresses remain
selectable/copyable even when a route fails. Airports/stations use the selected provider address;
terminal/entrance relationships remain unverified.

Native handoff uses the documented `iosamap://path` with provider IDs, coordinates and `dev=0`,
with open completion failure messaging and a separate AMap web URL/clipboard fallback.
Web uses AMap's HTTPS URI with explicit GCJ02 coordinates and mode. Both require requery after
returning to VP. A successful OS open is not proof of arrival or a preserved route in the map app.
Installed/missing app, actual entrance, VoiceOver and live dual-client route acceptance must be
recorded separately from contract tests.

Sources checked 2026-09-22:
- [AMap route 2.0](https://lbs.amap.com/api/webservice/guide/api/newroute)
- [AMap iOS route handoff](https://lbs.amap.com/api/amap-mobile/guide/ios/route)
- [AMap web route URI](https://lbs.amap.com/api/uri-api/guide/travel/route)

This slice does not close #363, #364 or #209. Full acceptance and real service observations are
tracked in the PR evidence; fixtures and CI establish only their stated behavior.
