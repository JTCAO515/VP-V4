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

## Non-goals of this slice

- No client SDK selection/integration (native or Web map display).
- No location-permission-denied fallback UX.
- No cross-provider controlled degrade (timeout/quota-triggered switching) —
  that is #367.
- No POI category browsing (restrooms/ATMs/etc.) beyond the closed
  `category` enum needed for entrance disambiguation — nearby-category
  search remains future #363 work.
- No unified suggest (input-tip/autocomplete) adapter or reverse geocode —
  those remain future #363 work (search, detail and forward geocode are now
  implemented).
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
  (9 tests), and `tests/contract/maps/provider-geocode-adapter.test.mjs`
  (8 tests) — all passing alongside the existing suite, no regressions.
- The detail and geocode adapters' provider request/response shapes
  (`/v3/place/detail`, `/ws/place/v1/detail`, `/v3/geocode/geo`,
  `/ws/geocoder/v1/`) are taken from AMap POI 2.0/Geocoding API and Tencent
  WebService's public documentation (see
  `docs/agents/maps-integration-development.md`'s source list); no real
  account call against these specific endpoints has been made in this
  environment — that live verification is UNRUN, tracked the same way the
  #362 probe work already distinguishes documented-shape from
  observed-response evidence.
