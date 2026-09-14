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

## Non-goals of this slice

- No client SDK selection/integration (native or Web map display).
- No location-permission-denied fallback UX.
- No cross-provider controlled degrade (timeout/quota-triggered switching) —
  that is #367.
- No POI category browsing (restrooms/ATMs/etc.) beyond the closed
  `category` enum needed for entrance disambiguation.
- No automatic coordinate-system conversion.

## Verification

- `supabase/migrations/20260914100000_vpj_19_363_place_identity.sql` run
  against a real local Supabase instance; all four counterexamples (partial
  entrance, missing name, duplicate provider mapping on one canonical place,
  one provider id claimed by two canonical places) correctly rejected by
  the database, two valid rows (with and without entrance data) accepted.
- `tests/contract/maps/place-identity.test.mjs` (10 tests) and
  `tests/contract/maps/provider-search-adapter.test.mjs` (7 tests, including
  an independent re-verification of `tencentSig` against lbs.qq.com's own
  worked example) — all passing alongside the existing 313, no regressions.
