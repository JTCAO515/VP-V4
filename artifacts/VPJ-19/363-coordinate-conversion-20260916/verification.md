# #363 (VPJ-19) verification — explicit, no-double-convert GCJ02<->WGS84 conversion

Scope: `lib/server/maps/coordinate-conversion.ts`. Addresses the VPJ-19
execution row's acceptance bullet "GCJ/WGS等坐标转换显式且不双转" (explicit
coordinate-system conversion, never applied twice), left as an explicit
non-goal ("No automatic coordinate-system conversion") by the 2026-09-14
place-identity/provider-mapping slice (commit `ca6f81e`).

Class: A (reversible, repo-only, pure code — no schema/migration, no RLS,
no secrets, no live provider call).

## What was implemented

- `SystemedCoordinate`: named `{ lat, lng, system }`, never a tuple, so
  axis order cannot be silently swapped at a call site.
- `convertCoordinateSystem(input, targetSystem)`:
  - `noop_same_system` when `input.system === targetSystem` — the offset
    formula is never reapplied to an already-converted point (the
    "不双转" guarantee, enforced by a tag check before any math runs).
  - `unchanged_out_of_china` when the point falls outside GCJ02's
    documented obfuscation bounding box (mainland China) — WGS84 and
    GCJ02 coincide there, so only the system tag changes.
  - `converted` (`algorithm: "gcj02_offset_approx"`) otherwise, using the
    standard non-iterative GCJ02 offset approximation.
- Only wgs84<->gcj02 — bd09 is not in the migration's `CoordinateSystem`
  closed set and is out of scope.

## Commands and results

| Command | Result |
| --- | --- |
| `node --experimental-strip-types --test tests/contract/maps/coordinate-conversion.test.mjs` | 8/8 pass |
| `node scripts/run-ci-suite.mjs contract` | 461/461 pass, 0 skip, 100 test files (includes this slice's 8 new tests) |
| `node scripts/run-ci-suite.mjs unit` | pass, 13 test files, 0 skip |
| `npm run typecheck` | clean |
| `npm run lint` | 301 files checked, clean (adds 2 files: module + test) |
| `npm run docs:check` | VPJ plan (76 tasks) + AI Core/VPJ baseline pass |

## Verified by test (deterministic, no live provider call)

- Same-system request on a China-region point is a no-op (offset formula
  never reapplied).
- Same-system request on an out-of-China point is also a no-op.
- wgs84->gcj02 and gcj02->wgs84 inside China each apply a bounded offset
  (0 < |Δ| < 0.02°, generously bounding the documented ~0-600m GCJ02
  obfuscation magnitude) and correctly re-tag the result.
- Round trip wgs84->gcj02->wgs84 and gcj02->wgs84->gcj02 each stay within
  ~3m (3e-5°) of the origin — internal consistency of the non-iterative
  approximation.
- A point outside China (New York) is passed through with unchanged
  numbers, only re-tagged.

## Explicitly UNRUN — not fabricated

- Agreement of the GCJ02 offset approximation against a surveyed/
  authoritative geodetic ground-truth reference point set. No such fixture
  is available in this environment; only the algorithm's own round-trip
  and bound consistency were checked (see above). A future slice that
  needs sub-meter accuracy claims (e.g. entrance-level navigation
  hand-off) should source and cite an authoritative reference.
- Any live AMap/Tencent API call — this slice is pure math and touches no
  network, credential, or the existing `provider-search-adapter.ts`
  transport.
- Consumption by a route/geocode adapter, UI, or native client — this
  slice only adds the conversion utility itself; #363's remaining
  acceptance bullets (unified suggest/nearby/detail/geocode adapter, map
  display SDK, save/reload with permission isolation) are unchanged and
  still open.

## Files changed

- `lib/server/maps/coordinate-conversion.ts` (new)
- `tests/contract/maps/coordinate-conversion.test.mjs` (new, 8 tests)
- `docs/contracts/place-identity.md` (documents the addition, updates
  "Non-goals" to reflect what remains out of scope)
- `artifacts/VPJ-19/363-coordinate-conversion-20260916/verification.md` (this file)
