# VPJ-19 slice (#363) — canonical place identity and provider mapping

Status: accepted, server-side only. Fills in `public.canonical_pois`
(previously deliberately opaque per v4.11 — "no provider geometry or
inferred POI identity") with real identity fields, and adds
`public.provider_poi_mappings` for provider-id-to-canonical-place mapping.
Client map SDK display integration, native location-permission fallback UI,
and cross-provider degrade orchestration are explicitly out of scope here —
see #367 (blocked on this slice) for controlled degrade, and the client
tickets (#364/#365/#366) for the display/consumption side.

## Invariants

- `canonical_pois` requires non-empty `primary_name_zh`/`primary_name_en`
  (≤160 chars each); `name_pinyin` is optional.
- Entrance data is all-or-nothing: either `entrance_lat`/`entrance_lng`/
  `coordinate_system`/`entrance_source` are all set (and `coordinate_system`/
  `entrance_source` are never `'unknown'`), or none are — `entrance_source`
  defaults to `'unknown'`. A place can never claim a partial entrance.
- `coordinate_system` is one of `gcj02`/`wgs84`, recorded once at
  ingestion; this slice never converts between systems.
- `provider_poi_mappings` is unique on `(canonical_poi_id, provider)` — one
  mapping per provider per canonical place — and unique on
  `(provider, provider_poi_id)` — a provider's POI id can back at most one
  canonical place. Both directions of ambiguity are database-enforced, not
  application-trusted.
- Matching a raw search hit to an existing canonical place happens **only**
  through an existing `provider_poi_mappings` row. Name or vector similarity
  never triggers an automatic merge — `groupSearchCandidatesByCanonicalMatch`
  in `lib/server/maps/place-identity.ts` keeps every unmatched hit in its
  own group, even when two hits share an identical `rawName`.
- `lib/server/maps/provider-search-adapter.ts`'s `searchPlaces()` calls
  exactly one provider per invocation — no cross-provider fallback, no
  retry. AMap is the operator-decided primary candidate and Tencent a
  supplement (see `docs/benchmarks/maps/vpj-18-362-closeout.md`); which
  provider(s) to call and in what order is the caller's decision, not this
  module's.
- Failure classification is the closed set already established by
  `scripts/maps/probe.mjs` and formalized in the #362 closeout doc:
  `observed` / `no_results` / `provider_rejected` / `invalid_response` /
  `http_error` / `timeout` / `transport_or_response_error` / `UNRUN`.
  `provider_rejected` carries the provider's numeric code for operator
  diagnosis only, never a message string (keys/messages are never logged
  or returned to the caller).

## Coordinate system conversion (added 2026-09-16)

`lib/server/maps/coordinate-conversion.ts`'s `convertCoordinateSystem()`
implements the VPJ-19 execution row's other named acceptance bullet —
"GCJ/WGS等坐标转换显式且不双转" (explicit conversion, never double-applied)
— left as an explicit non-goal by the 2026-09-14 identity/mapping slice.

- Input and output are a named `{ lat, lng, system }` record, never a
  `[number, number]` tuple, so axis order can never be silently swapped at
  a call site.
- Requesting the coordinate's own current system is a `noop_same_system`
  result: the GCJ02 offset formula is never reapplied to an
  already-converted point. This is the "不双转" guarantee — enforced by a
  system-tag equality check before any math runs, not by trusting callers.
- A coordinate outside GCJ02's obfuscation region (mainland China's
  documented bounding box) returns `unchanged_out_of_china`: WGS84 and
  GCJ02 coincide there, so only the tag changes, never the numbers.
- Otherwise returns `converted` with `algorithm: "gcj02_offset_approx"` —
  the standard non-iterative offset approximation used by common public
  GCJ02 implementations. This module makes no claim of matching a surveyed
  geodetic ground truth; that comparison is UNRUN (no authoritative
  reference fixture available in this environment). What is verified is
  the algorithm's internal consistency: round-trip wgs84→gcj02→wgs84 and
  gcj02→wgs84→gcj02 both stay within ~3m of the origin, and the applied
  offset inside China stays within its documented ~0-600m bound.
- Only wgs84↔gcj02 — Baidu's bd09 is not part of the `CoordinateSystem`
  closed set in the migration and is out of scope here.
- No database column change: this module is a pure conversion utility for
  callers (route/geocode adapters, future #364/#365 consumers) to use when
  combining coordinates from sources tagged with different systems. It does
  not alter how `canonical_pois.coordinate_system` is recorded at
  ingestion — that field is still set once and never silently mutated.

### Runtime enforcement of coordinate validity (added 2026-09-16, round 10)

Until this addition, `convertCoordinateSystem()` and the detail/geocode/
suggest adapters trusted a caller's `{ lat, lng, system }` unconditionally —
correct at the type level, but a NaN/Infinity from a bad numeric parse, a
swapped or out-of-range lat/lng, or a `system` tag outside the closed
`gcj02`/`wgs84` set would previously pass through untouched. This closes
that gap without expanding scope into client-side selected-ID sharing or
any other #364/#365/#366/#367 territory:

- `isValidSystemedCoordinate()` (exported from `coordinate-conversion.ts`)
  is the single runtime check: `lat`/`lng` must be finite numbers within
  `[-90,90]`/`[-180,180]`, and `system` must be `"gcj02"` or `"wgs84"`.
- `convertCoordinateSystem()` now calls it on both `input` and
  `targetSystem` before doing anything else, throwing
  `InvalidSystemedCoordinateError` instead of silently converting or
  passing through a malformed coordinate. This is the conversion module's
  single entry point, so every caller gets the same enforcement rather than
  each adapter re-implementing its own check.
- `provider-detail-adapter.ts`, `provider-geocode-adapter.ts`, and
  `provider-suggest-adapter.ts` (the three adapters that parse a provider-
  returned `location`) now route their parsed `{ lat, lng }` through the
  same `isValidSystemedCoordinate()` predicate before returning it, so an
  out-of-range or non-finite provider value yields `location: null` (the
  adapters' existing "never a fabricated location" contract) instead of an
  unchecked pass-through. These call sites use the non-throwing predicate,
  not the throwing assert, because the adapters' documented contract is to
  never throw on malformed provider input.
- `provider-search-adapter.ts` and `provider-nearby-adapter.ts` do not
  parse or return a `location` field at all (their `PlaceSearchCandidate`/
  `NearbyResult` shapes carry no coordinate), so there is nothing for this
  change to touch there.

## Place detail lookup (added 2026-09-16)

`lib/server/maps/provider-detail-adapter.ts`'s `getPlaceDetail()` fills in
the "详情" (detail) half of the execution row's "统一服务端适配搜索/详情/
地址/路线/矩阵/导航出口" bullet — search already existed
(`provider-search-adapter.ts`); geocode/route/matrix/nav-handoff remain
future slices, not this one.

- Same shape as the search adapter: one provider per call, no cross-provider
  fallback/retry (#367), no persistence, no canonical matching decision.
  Reuses that module's `boundedJson` response-size guard and `tencentSig`
  signing function rather than duplicating security-relevant transport code.
- Returns `address` (Chinese, as provided — never translated or inferred)
  and `location`, both nullable: a provider that omits either field yields
  `null`, never a fabricated address or a `0,0`/building-centroid location
  guess. `location.coordinateSystem` records the providers' documented
  GCJ02 default for their web-service responses (this module never requests
  a different `coord_type`/`output`); combining it with a WGS84-sourced
  coordinate still requires `coordinate-conversion.ts`'s explicit,
  non-double-applying conversion.
- Each capability (`search`, `detail`) has its own explicit enable flag
  per provider (`AMAP_DETAIL_ENABLED`/`TENCENT_MAP_DETAIL_ENABLED`), reusing
  the same account web-service key/sk as search — "高级能力显式声明"
  (advanced capabilities are explicitly declared, never implicitly turned
  on because the provider itself is enabled).
- Same closed failure-classification set as search, plus `not_found` for an
  empty/missing detail result (distinct from `no_results` used by search,
  since "zero of many candidates" and "the one id you asked for doesn't
  exist" are different caller-facing situations).

## Address geocode (added 2026-09-16)

`lib/server/maps/provider-geocode-adapter.ts`'s `geocodeAddress()` fills in
the "地址解析" (address resolution) half of the execution row's "统一服务端
适配搜索/详情/地址/路线/矩阵/导航出口" bullet — search and detail already
existed; suggest/nearby-category, route/matrix and nav-handoff remain future
slices, not this one.

- Same shape as the search and detail adapters: one provider per call, no
  cross-provider fallback/retry (#367), no persistence, no canonical
  matching decision. Reuses `provider-search-adapter.ts`'s `boundedJson`
  response-size guard and `tencentSig` signing function rather than
  duplicating security-relevant transport code.
- Returns `formattedAddress` (Chinese, as echoed/normalized by the provider —
  never translated or inferred) and `location`, the latter nullable: a
  provider response that omits a parseable coordinate yields `null`, never a
  fabricated `0,0` guess. `location.coordinateSystem` records the providers'
  documented GCJ02 default for their web-service responses (this module
  never requests a different `coord_type`/`output`); combining it with a
  WGS84-sourced coordinate still requires `coordinate-conversion.ts`'s
  explicit, non-double-applying conversion.
- Its own explicit enable flag per provider
  (`AMAP_GEOCODE_ENABLED`/`TENCENT_MAP_GEOCODE_ENABLED`), reusing the same
  account web-service key/sk as search and detail — advanced capabilities
  stay explicitly declared, never implicitly turned on because the provider
  itself is enabled.
- Same closed failure-classification set as search/detail, including
  `not_found` for an empty/missing geocode result (an address that resolves
  to nothing, as distinct from a malformed provider response).
- No reverse geocode (coordinate to address) — this module only resolves an
  address string to a location, not the other direction.

## Input-tip suggest (added 2026-09-16)

`lib/server/maps/provider-suggest-adapter.ts`'s `suggestPlaces()` fills in
the "suggest" (input-tip/autocomplete) half of the execution row's "统一
服务端适配搜索/详情/地址/建议" bullet — search, detail and forward geocode
already existed; nearby-category search, route/matrix, nav-handoff and
reverse geocode remain future slices, not this one.

- Same shape as the other adapters: one provider per call, no cross-provider
  fallback/retry (#367), no persistence. Unlike search, this module takes no
  `lookupMapping` and performs no canonical-matching decision at all,
  because a provider's input-tip response can legitimately carry no backing
  POI id (a plain keyword/history suggestion, not yet a specific place) —
  there is nothing to match against a canonical place for those rows.
  Reuses `provider-search-adapter.ts`'s `boundedJson` response-size guard
  and `tencentSig` signing function rather than duplicating
  security-relevant transport code.
- Returns `providerPoiId` and `location`, both nullable: AMap's own
  `inputtips` documentation describes tips with no backing POI (empty `id`
  and empty `location` string) — this module preserves that as `null`
  rather than dropping the row or inventing an id/coordinate. A row missing
  even its display name is dropped, matching the search adapter's handling
  of unusable rows.
- Its own explicit enable flag per provider
  (`AMAP_SUGGEST_ENABLED`/`TENCENT_MAP_SUGGEST_ENABLED`), reusing the same
  account web-service key/sk as search/detail/geocode — advanced
  capabilities stay explicitly declared, never implicitly turned on because
  the provider itself is enabled.
- Same closed failure-classification set as search (`no_results` for an
  empty tip list, matching search's "zero of many candidates" semantics —
  not `not_found`, which detail/geocode use for "the one thing you asked
  for doesn't exist").

## Nearby-category search (added 2026-09-16)

`lib/server/maps/provider-nearby-adapter.ts`'s `nearbySearch()` fills in the
"周边厕所/便利店/餐饮/药店/ATM分类可查，特殊服务未知不推断" acceptance
bullet and the execution row's remaining "nearby-category" half of "统一
服务端适配搜索/详情/地址/建议" — search, detail, forward geocode and
suggest already existed; route/matrix, nav-handoff and reverse geocode
remain future slices, not this one.

- Same shape as the other adapters: one provider per call, no
  cross-provider fallback/retry (#367), no persistence. Reuses
  `provider-search-adapter.ts`'s `boundedJson` response-size guard and
  `tencentSig` signing function rather than duplicating security-relevant
  transport code. Unlike suggest, a nearby result is a real POI hit (same
  as search), so it reuses `lookupMapping` the same way search does.
- `category` is a closed 5-value enum (`restroom`/`convenience_store`/
  `dining`/`pharmacy`/`atm`) matching the acceptance bullet's named list
  exactly — no free-text category, and no other amenity type is browsable
  ("特殊服务未知不推断": an unlisted special-service category is never
  inferred or approximated by the closest known category). Each category
  maps to a plain Chinese keyword, not a provider-specific POI type code —
  AMap/Tencent's numeric category-code taxonomies are unverified against
  this environment's actual account access, so a misremembered code could
  silently under/over-match; a keyword carries no such risk and is the same
  mechanism the search adapter already uses.
- The query `location` must already be in the providers' documented default
  coordinate system (GCJ02) — this module never converts a caller-supplied
  WGS84 point itself; combining sources still requires
  `coordinate-conversion.ts`'s explicit, non-double-applying conversion
  before calling in here.
- Returns `distanceMeters` (meters from the query location), nullable: a
  provider response that omits it (AMap's `distance` string, Tencent's
  `_distance` number) yields `null`, never an estimate derived from the
  query radius.
- A caller-supplied `radiusMeters` is clamped into a conservative
  module-declared bound (`limits.radiusMetersMax`, default
  `limits.radiusMetersDefault` when omitted or invalid) rather than
  rejected — this module still never fabricates a provider-documented
  maximum it has not verified.
- Its own explicit enable flag per provider (`AMAP_NEARBY_ENABLED`/
  `TENCENT_MAP_NEARBY_ENABLED`), reusing the same account web-service
  key/sk as search/detail/geocode/suggest — advanced capabilities stay
  explicitly declared, never implicitly turned on because the provider
  itself is enabled.
- Same closed failure-classification set as search (`no_results` for an
  empty result list).

## Canonical-mapping lookup (added 2026-09-16, round 11)

`searchPlaces()`/`nearbySearch()` have always required a caller-supplied
`lookupMapping: (provider, providerPoiId) => string | null` — by design,
so the adapters stay DB-free and unit-testable (see their own module
docs). Until this addition, no real implementation of that function
existed anywhere in the repo; every call site, including both adapters'
own contract tests, supplied a hand-written in-memory mock. That gap
matters because it is the concrete blocker behind the still-open
"地图、列表、详情共享选中ID" acceptance bullet: without a real
`provider_poi_mappings` lookup, a search/nearby result's
`matchedCanonicalPoiId` can never be genuinely non-null outside a test.

`lib/server/maps/canonical-mapping-repository.ts`'s
`loadCanonicalMappingLookup(client, provider, providerPoiIds)` closes that
gap:

- Batched, not per-candidate. The adapters call `lookupMapping`
  synchronously once per response row while normalizing an
  already-fetched provider response — a live per-row DB round trip would
  be both the wrong shape (that parameter is synchronous, not a Promise)
  and needlessly slow. This function takes every `providerPoiId` already
  present in an adapter's response, does one batched
  `provider_poi_mappings` query (`provider = eq.<provider>`,
  `provider_poi_id = in.(...)`, deduplicated, and bound-filtered to the
  migration's 128-char `provider_poi_id` limit before the query is built),
  and returns a synchronous closure over the resulting in-memory map — the
  exact shape `searchPlaces`/`nearbySearch` already expect, so neither
  adapter changes.
- Queries `public.provider_poi_mappings` with a caller-supplied
  `SupabaseClient` — this module never constructs its own client or reads
  credentials itself (mirrors
  `lib/server/model-gateway/budget/supabase-rpc.ts`'s
  `createSupabaseBudgetRpc(client)` factory pattern). That table is
  service-role-only (RLS enabled, `anon`/`authenticated` fully revoked in
  the migration), so a route wiring this in must supply a server-authorized
  client, never a request-scoped user client.
- A DB error (network failure, malformed row, service-role
  misconfiguration) collapses to "no known mapping" for every id in that
  batch and is never thrown — the same "unknown when unavailable, never
  guessed" posture already used for entrance data and coordinate systems.
  It never turns into a search/nearby failure, since the underlying
  provider result is still valid without a canonical match. A `dbError`
  flag on the return value lets a caller that cares (logging, retry
  policy) distinguish "checked, no match" from "could not check" without
  changing the synchronous lookup function's own `string | null` contract.
- Round 11: still not a consumer at that point. No route in
  `app/api/places/**` called this yet — `app/api/places/` did not exist in
  this repo. This module made `lookupMapping` real for the first time.
  Round 12 (below, "Route-level consumer") adds the first real HTTP
  consumer; see that section for what it does and does not resolve.

## Route-level consumer (added 2026-09-16, round 12)

`app/api/places/search/route.ts` and `app/api/places/nearby/route.ts` are
the first `app/api/places/**` routes in this repo, and the first real HTTP
consumers of `searchPlaces()`/`nearbySearch()` and
`loadCanonicalMappingLookup()` together. Partial advance on #363's
still-open "地图、列表、详情共享选中ID" acceptance bullet — this makes a
search/nearby result's `matchedCanonicalPoiId` genuinely reachable over
HTTP for the first time, in a real, deployable path; it does not resolve
that bullet on its own, and #363 remains open.

**Correcting round 11's Non-goals note below**: that note attributed "a
route wiring it into search/nearby end-to-end" to "#364/#365/#366's scope".
Re-reading #364/#365/#366 (round 12) shows that was wrong — #364 is a
walking/transit/driving route-comparison and nav-handoff slice, #365 is
place Save/Ask/Add plus trip-candidate adjustment, #366 is in-transit
replanning; none of the three own a plain place-search/nearby HTTP route.
That wiring was always #363's own "地图、列表、详情共享选中ID" bullet, which
is what round 12 advances here.

- `lib/server/maps/place-consumer.ts`'s `searchPlacesWithCanonicalMapping`/
  `nearbySearchWithCanonicalMapping` do the two-phase composition
  `loadCanonicalMappingLookup`'s own doc anticipates: call the provider
  adapter once with an always-null `lookupMapping` to learn the response's
  real `providerPoiId`s, then one batched `provider_poi_mappings` query for
  exactly those ids, then remap `matchedCanonicalPoiId` over the
  already-fetched candidates. One provider network call either way.
- `lib/server/maps/service-role-client.ts` adds this repo's first
  service-role-authorized Supabase client — the only way to legally read
  `provider_poi_mappings` at all (RLS enabled, `anon`/`authenticated` fully
  revoked). It is deliberately its own module: nothing under
  `lib/server/identity/**` or the Trip/proposal/confirm routes
  `tests/security/identity/no-service-credential.test.mjs` guards imports
  it, so that guard's guarantee (no service credential ever stands in for
  a real user's identity or reaches Trip RLS) is unaffected — verified by
  `tests/security/maps/service-credential-isolation.test.ts`, added this
  round, which also asserts no client-rendered surface (`components/**`,
  `ios/**`, any `page.tsx`/`layout.tsx`) and no `NEXT_PUBLIC_`-prefixed
  variable ever references it or the AMap/Tencent Web Service keys.
  `provider_poi_mappings` carries no user-owned row (no `user_id`/owner
  column), so this client can never read or write anything the identity
  guard protects. Reads a private `SUPABASE_SERVICE_ROLE_KEY` (never
  `NEXT_PUBLIC_`-prefixed) that is unset in every environment today;
  `createMapsServiceRoleClient()` returns `null` until an operator
  explicitly provisions it, and every caller already treats a `null`
  client as "no known mapping" rather than an error.
- `lib/server/maps/web-auth.ts` gates both routes behind a real Supabase
  session (`requireAuthenticatedActor`), independent of
  `createUserDataAdapter` — a place search touches no user-owned row, so
  none of that adapter's Trip/memory/profile machinery applies; this exists
  only to keep anonymous traffic from spending paid provider quota.
  Anonymous callers get `UNAUTHENTICATED` before any provider or database
  call.
- Both routes default to `PROVIDER_UNAVAILABLE` (`reason: "disabled"`)
  today, since `AMAP_SEARCH_ENABLED`/`AMAP_NEARBY_ENABLED`/their Tencent
  equivalents remain unset in every environment — this round provisions no
  new provider credential, only the route/composition code and the
  service-role client factory (itself unusable without
  `SUPABASE_SERVICE_ROLE_KEY`, also unprovisioned).
- Not a live-account verification. No real HTTP call against
  `restapi.amap.com`/`apis.map.qq.com` or a real `provider_poi_mappings`
  row was made from these new routes in this environment — same UNRUN
  posture the underlying adapters already carry. Contract-level coverage
  (`tests/contract/maps/place-consumer.test.ts`,
  `service-role-client.test.ts`, `places-route-wiring.test.ts`) uses
  synthetic fetch/Supabase clients, the same style as every other adapter
  test in this slice.
- Still not done: map/list/detail UI actually consuming and sharing the
  same selected id across surfaces (no client-side code changed this
  round), any rate limiting/budget beyond the auth gate, single primary
  map-display SDK selection, credential domain separation beyond what's
  described above, and observation-vs-Fact permission isolation — all
  remain open #363 work.

## Non-goals of this slice

- No client SDK selection/integration (native or Web map display).
- No location-permission-denied fallback UX.
- No cross-provider controlled degrade (timeout/quota-triggered switching) —
  that is #367.
- No POI category browsing beyond the closed 5-category `NearbyCategory`
  enum (restroom/convenience_store/dining/pharmacy/atm) needed for the
  acceptance bullet — any other amenity type remains unbrowsable by design,
  not a future extension of this slice.
- No reverse geocode (coordinate to address) — search, detail, forward
  geocode, suggest and nearby-category search are now implemented; reverse
  geocode remains future #363 work, as does route/matrix/nav-handoff.
- No client-side consumption of the shared selected-place id across
  map/list/detail — round 12 added the `app/api/places/search` and
  `app/api/places/nearby` HTTP routes and their auth/session wiring (see
  "Route-level consumer" above), but no map/list/detail UI component
  changed this round, so nothing actually renders or shares that id yet.
- No single primary map-display SDK selection or observation-vs-Fact
  permission isolation — those remaining VPJ-19 acceptance bullets are
  still open, not addressed by any adapter or route slice to date.
  Credential domain separation for the server-only AMap/Tencent Web
  Service keys and the new service-role key already holds by construction
  (see "Route-level consumer" above and
  `tests/security/maps/service-credential-isolation.test.ts`), but full
  domain separation across native/server/web remains open pending a
  client-facing map-display SDK, which does not exist yet.
- No authoritative geodetic ground-truth verification of the GCJ02
  conversion (see above) — UNRUN, not fabricated.

## Verification

- `supabase/migrations/20260914100000_vpj_19_363_place_identity.sql` run
  against a real local Supabase instance; all four counterexamples (partial
  entrance, missing name, duplicate provider mapping on one canonical place,
  one provider id claimed by two canonical places) correctly rejected by
  the database, two valid rows (with and without entrance data) accepted.
- `tests/contract/maps/place-identity.test.mjs` (10 tests),
  `tests/contract/maps/provider-search-adapter.test.mjs` (7 tests, including
  an independent re-verification of `tencentSig` against lbs.qq.com's own
  worked example), `tests/contract/maps/provider-detail-adapter.test.mjs`
  (9 tests), `tests/contract/maps/provider-geocode-adapter.test.mjs`
  (8 tests), and `tests/contract/maps/provider-suggest-adapter.test.mjs`
  (9 tests) — all passing alongside the existing suite, no regressions
  (`pnpm test:contract`: 486 tests, 0 failures).
- The detail, geocode and suggest adapters' provider request/response
  shapes (`/v3/place/detail`, `/ws/place/v1/detail`, `/v3/geocode/geo`,
  `/ws/geocoder/v1/`, `/v3/assistant/inputtips`, `/ws/place/v1/suggestion`)
  are taken from AMap POI 2.0/Geocoding/Input Tips API and Tencent
  WebService's public documentation (see
  `docs/agents/maps-integration-development.md`'s source list); no real
  account call against these specific endpoints has been made in this
  environment — that live verification is UNRUN, tracked the same way the
  #362 probe work already distinguishes documented-shape from
  observed-response evidence.
- Round 10 (coordinate-system runtime enforcement, 2026-09-16): added 6
  `coordinate-conversion.test.mjs` cases for `isValidSystemedCoordinate()`
  and `convertCoordinateSystem()`'s new throw path, plus one "out-of-range
  provider location is rejected as null" case in each of
  `provider-detail-adapter.test.mjs`, `provider-geocode-adapter.test.mjs`,
  and `provider-suggest-adapter.test.mjs` (2 assertions each, AMap and
  Tencent shapes). `pnpm test:contract`: 505 tests, 0 failures, 0 skips
  (104 test files) after this change; `pnpm typecheck`/`pnpm lint`/
  `pnpm build` all clean.
