# #363 (VPJ-19) verification — runtime enforcement of coordinate validity

Scope: `lib/server/maps/coordinate-conversion.ts` (new export +
enforcement), `lib/server/maps/provider-detail-adapter.ts`,
`lib/server/maps/provider-geocode-adapter.ts`,
`lib/server/maps/provider-suggest-adapter.ts` (route their parsed
`location` through the same shared runtime check). Addresses the
VPJ-19 execution row's acceptance bullet "坐标明确WGS/GCJ等来源与转换
记录、经纬顺序；禁止双转" (explicit coordinate-system source/record,
lat/lng order, no double conversion) — specifically the "运行时强制
校验" (runtime enforcement) gap left after PR #422 (coordinate
conversion), #423 (detail), #424 (geocode), #425 (suggest), #426
(nearby): those slices established the `SystemedCoordinate` type and a
`noop_same_system` guard against re-applying the offset formula, but
`convertCoordinateSystem()` and the three location-parsing adapters
trusted a caller's `{ lat, lng, system }` unconditionally — a
NaN/Infinity, swapped, or out-of-range lat/lng, or a `system` tag
outside the closed `gcj02`/`wgs84` set would previously pass through
untouched at runtime, with only the TypeScript type system (which
cannot catch a value that is malformed at runtime but structurally
matches the type) standing in the way.

Class: A (reversible, repo-only, pure code — no schema/migration, no
RLS, no secrets, no live provider call).

## What was implemented

- `isValidSystemedCoordinate(value): value is SystemedCoordinate`
  (new export, `coordinate-conversion.ts`): the single runtime check —
  `lat`/`lng` finite numbers within `[-90,90]`/`[-180,180]`, `system`
  one of the closed `gcj02`/`wgs84` set.
- `InvalidSystemedCoordinateError` (new export): thrown by
  `convertCoordinateSystem()` when its `input` or `targetSystem` fails
  that check, instead of silently converting or passing through a
  malformed coordinate. This is the module's single entry point, so
  every caller gets the same enforcement rather than re-implementing
  its own check per call site.
- `provider-detail-adapter.ts`, `provider-geocode-adapter.ts`,
  `provider-suggest-adapter.ts`: their `parseLocation()` now calls the
  same `isValidSystemedCoordinate()` predicate (not the throwing
  assert — these adapters' documented contract is to never throw on
  malformed provider input) before returning a parsed `{ lat, lng }`,
  so an out-of-range or non-finite provider value now yields
  `location: null` (the adapters' existing "never a fabricated
  location" contract) instead of an unchecked pass-through that only
  checked `Number.isFinite`, not range.
- `provider-search-adapter.ts` and `provider-nearby-adapter.ts` are
  unchanged: neither parses or returns a `location` field at all
  (`PlaceSearchCandidate`/`NearbyResult` carry no coordinate), so there
  was nothing for this change to touch there — confirmed by reading
  both files before starting (no `parseLocation`/`coordinateSystem`
  matches).

## Explicitly out of scope (not addressed by this change)

- Client-side shared selected-place ID consumption across map/list/
  detail (#364/#365/#366) — untouched.
- A branded/nominal TypeScript type distinguishing `WGS84Coord` from
  `GCJ02Coord` at compile time — the runtime check added here is
  deliberately the enforcement layer; a nominal-type change would touch
  every call site across all five adapters and risk scope creep beyond
  a bounded slice.
- Cross-call provenance tracking (detecting that a *specific* already-
  converted coordinate object is being fed back through
  `convertCoordinateSystem()` a second time by mistake) — the existing
  `noop_same_system` branch already guarantees the offset formula is
  never reapplied when the input's declared `system` already equals
  the requested target, which is the literal "禁止双转" guarantee;
  going further into object-identity provenance tracking was judged
  out of this bounded slice's scope.
- Plausibility-based system detection (e.g. flagging a GCJ02-tagged
  coordinate whose numeric offset from a "true" WGS84 value looks
  implausible) — not attempted: GCJ02 and WGS84 have near-identical
  numeric ranges (the offset is at most ~600m/~0.006°), so no reliable
  heuristic exists to detect a mislabeled-but-in-range coordinate from
  its numbers alone. The runtime check here catches structurally
  invalid values (out-of-range, non-finite, wrong enum), not a
  correctly-shaped-but-wrong-label value — that remains an inherent
  limit of pure numeric validation, not a gap in this change.

## Commands and results

| Command | Result |
| --- | --- |
| `node --experimental-strip-types --test tests/contract/maps/coordinate-conversion.test.mjs tests/contract/maps/provider-detail-adapter.test.mjs tests/contract/maps/provider-geocode-adapter.test.mjs tests/contract/maps/provider-suggest-adapter.test.mjs tests/contract/maps/provider-search-adapter.test.mjs tests/contract/maps/provider-nearby-adapter.test.mjs` | 59/59 pass |
| `pnpm lint` | 305 files checked, clean |
| `pnpm typecheck` | clean |
| `pnpm build` | succeeds, all routes generated |
| `pnpm test` (static-output + web-06 foundation) | 22/22 pass |
| `pnpm test:contract` | 505/505 pass, 0 skip, 104 test files |
| `pnpm test:unit` | 100/100 pass, 0 skip, 13 test files |
| `pnpm test:security` | 146/147 pass, 1 skip (`AI-14` — no local disposable Supabase target configured; pre-existing environment limitation, unrelated to this change's files) |
| `pnpm docs:check` | VPJ plan (76 tasks) + AI Core/VPJ baseline pass |
| `pnpm check:assets` | Asset policy passed (49 ledger records; 9 blocked preview files) |

## Verified by test (deterministic, no live provider call)

- `isValidSystemedCoordinate()` accepts well-formed gcj02/wgs84 points
  and rejects: lat > 90, lng > 180, NaN, Infinity, an unrecognized
  `system` tag (`"bd09"`), a string-typed `lat`, `null`, and a
  non-object value.
- `convertCoordinateSystem()` throws `InvalidSystemedCoordinateError`
  on an out-of-range input, a non-finite input, an input whose
  `system` tag is outside the closed set, and an unrecognized
  `targetSystem` — instead of converting or returning a mistagged
  result.
- Each of the three location-parsing adapters (detail/geocode/suggest)
  now returns `location: null` for an out-of-range AMap `"lng,lat"`
  string (`lat: 990`) and an out-of-range Tencent `{lat,lng}` object
  (`lng: 999`), rather than accepting the corrupted value — verified
  for both provider shapes in each adapter's test file.
- Existing coordinate-conversion, detail, geocode, and suggest test
  cases (well-formed inputs, round trips, out-of-China pass-through,
  provider failure classification, credential gating) still pass
  unchanged — no regression to the behavior established by PR
  #422-#426.

## Explicitly UNRUN — not fabricated

- Any live AMap/Tencent API call — this change is pure validation logic
  layered onto the existing adapters' response parsing; it touches no
  network, credential, or transport code.
- Authoritative geodetic ground-truth verification of the underlying
  GCJ02 offset formula — unchanged from PR #422's original UNRUN
  disclosure; this slice does not touch the conversion math itself.

## Files changed

- `lib/server/maps/coordinate-conversion.ts` (adds
  `isValidSystemedCoordinate`, `InvalidSystemedCoordinateError`, and
  the enforcement call inside `convertCoordinateSystem`)
- `lib/server/maps/provider-detail-adapter.ts` (routes `parseLocation`
  through the shared validator)
- `lib/server/maps/provider-geocode-adapter.ts` (same)
- `lib/server/maps/provider-suggest-adapter.ts` (same)
- `tests/contract/maps/coordinate-conversion.test.mjs` (+6 tests)
- `tests/contract/maps/provider-detail-adapter.test.mjs` (+1 test)
- `tests/contract/maps/provider-geocode-adapter.test.mjs` (+1 test)
- `tests/contract/maps/provider-suggest-adapter.test.mjs` (+1 test)
- `docs/contracts/place-identity.md` (documents this addition)
- `artifacts/VPJ-19/363-coord-runtime-guard-20260916/verification.md`
  (this file)
