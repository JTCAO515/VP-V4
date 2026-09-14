# #363 verification — canonical place identity + provider mapping

## Schema (real local Supabase, project_id `vp-v4-ai-08`, own containers)

`supabase start` → `supabase db push --local` applied
`20260914100000_vpj_19_363_place_identity.sql` cleanly on top of full
existing migration history (no replay issue this time — incremental push,
not a cold full-history replay).

Real inserts via `docker exec supabase_db_vp-v4-ai-08 psql`:

| Case | Expected | Result |
| --- | --- | --- |
| Canonical POI with full entrance (广州塔, gcj02, provider_geocode) | insert succeeds | PASS |
| Canonical POI with no entrance data, defaults to `entrance_source='unknown'` | insert succeeds | PASS |
| Entrance `lat` set without `lng`/`coordinate_system` | rejected | PASS — `canonical_pois_entrance_pair` violated |
| Empty `primary_name_en` | rejected | PASS — `canonical_pois_names_required` violated |
| Two `provider_poi_mappings` rows, same canonical place, same provider (`amap`) | second insert rejected | PASS — unique `(canonical_poi_id, provider)` violated |
| Same `provider_poi_id` (`amap`/`B0001`) claimed by a second canonical place | rejected | PASS — unique `(provider, provider_poi_id)` violated |

## Contract tests

- `tests/contract/maps/place-identity.test.mjs` — 10/10 pass (closed-schema
  validators for `CanonicalPoiIdentity`, `CanonicalPoiEntrance`,
  `ProviderPoiMapping`, and the no-auto-merge grouping function).
- `tests/contract/maps/provider-search-adapter.test.mjs` — 7/7 pass
  (disabled/missing-credential UNRUN, observed normalization + mapping
  lookup, no_results, provider_rejected without message leak, oversized
  response, transport failure, Tencent sig only when SK configured).
- `node scripts/run-ci-suite.mjs contract` — 343/343 pass (was 313 before
  this slice's 17 new tests; no regressions).
- `node scripts/run-ci-suite.mjs security` — 146 pass, 1 pre-existing skip
  (AI-14, needs an explicit disposable identity Supabase target env var —
  unrelated to this slice).
- `npm run typecheck` — clean.
- `npm run lint` — 274 files, clean (this slice adds 2 files, checked).
- `npm run docs:check` — VPJ plan + AI Core baseline pass.

## Explicitly out of scope this slice (not silently skipped)

See `docs/contracts/place-identity.md`'s "Non-goals" section: client map
SDK display, location-permission fallback UX, cross-provider controlled
degrade (#367), POI category browsing beyond entrance disambiguation,
automatic coordinate-system conversion.
