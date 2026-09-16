# #363 (VPJ-19) verification — unified place-detail adapter

Scope: `lib/server/maps/provider-detail-adapter.ts`. Addresses the "详情"
(detail) half of the execution row's acceptance bullet "统一服务端适配
搜索/详情/地址/路线/矩阵/导航出口" — search already existed
(`provider-search-adapter.ts`, from #394's `ca6f81e`); geocode/route/
matrix/nav-handoff remain future slices, not this one.

Class: A (reversible, repo-only, pure transport code — no schema/
migration, no RLS, no secrets committed, no live provider call made in
this environment).

## What was implemented

- `getPlaceDetail({ provider, providerPoiId, env, fetcher })` — same
  narrow shape as `searchPlaces()`: one provider per call, no
  cross-provider fallback/retry (#367's job), no persistence, no
  canonical-matching decision.
- `PlaceDetail`: `{ provider, providerPoiId, rawName, address, location }`.
  `address` and `location` are both nullable — a provider response
  omitting either field yields `null`, never a fabricated address or a
  `0,0`/building-centroid location guess.
- `location.coordinateSystem` records AMap/Tencent web-service responses'
  documented GCJ02 default (neither is asked for a different
  `coord_type`/`output`). Combining it with a WGS84-sourced coordinate
  still requires `coordinate-conversion.ts`'s explicit, non-double-
  applying conversion — this module does not convert anything itself.
- Same closed failure-classification set as search
  (`provider_rejected`/`invalid_response`/`http_error`/`timeout`/
  `transport_or_response_error`/`UNRUN`), plus a new `not_found` for an
  empty/missing detail result — distinct from search's `no_results`,
  since "zero of many candidates" and "the one id you asked for doesn't
  exist" are different caller-facing situations.
- Each capability (`search`, `detail`) has its own explicit per-provider
  enable flag (`AMAP_DETAIL_ENABLED`/`TENCENT_MAP_DETAIL_ENABLED`),
  reusing the same account web-service key/sk as search —
  "高级能力显式声明" (advanced capabilities explicitly declared, never
  implicitly turned on because the provider itself is enabled).
- Reuses `provider-search-adapter.ts`'s `boundedJson` response-size guard
  and `tencentSig` signing function (now exported) rather than
  duplicating security-relevant transport code within the same module
  namespace.

## Commands and results

| Command | Result |
| --- | --- |
| `node --experimental-strip-types --test tests/contract/maps/provider-detail-adapter.test.mjs` | 9/9 pass |
| `node scripts/run-ci-suite.mjs contract` | 469/469 pass, 0 fail, 0 skip, 101 test files (includes this slice's 9 new tests) |
| `node scripts/run-ci-suite.mjs unit` | 100/100 pass, 0 fail, 0 skip, 13 test files |
| `node scripts/run-ci-suite.mjs e2e` | 40/40 pass (source/contract inspection only, no browser) |
| `node scripts/run-ci-suite.mjs security` | 144/147 pass, 2 fail — pre-existing `WEB-04` asset-policy failures, confirmed present on a clean `origin/main` checkout via `git stash -u` before/after; unrelated to this change and not introduced by it |
| `pnpm typecheck` (`tsc --noEmit`) | clean |
| `pnpm lint` | 302 files checked, clean |
| `pnpm docs:check` | VPJ plan (76 tasks) + AI Core/VPJ baseline pass |
| `git diff --check` | clean |
| `pnpm build` | succeeds (Next.js production build) |
| `pnpm test` (static-output/design suite) | 22/22 pass |

## Verified by test (deterministic, no live provider call)

- Disabled/missing-credential env never dispatches a request (`UNRUN`).
- AMap's `"lng,lat"` string location and Tencent's `{lat,lng}` object
  location both parse correctly into the closed `location` shape.
- A response missing `location`/`address` yields `null` for that field —
  never a fabricated coordinate or address.
- An empty/missing result row is `not_found`, not an error.
- Provider rejection carries only the numeric code, never the message
  string (secret-leak guard, mirroring the search adapter's test).
- Oversized response and transport failure are both classified as
  `transport_or_response_error` without retry.
- HTTP error status is passed through as `http_error` with the observed
  status code.
- Tencent's request is signed (`sig` param present) only when
  `TENCENT_MAP_SK` is configured — reusing the independently-verified
  `tencentSig` from the search adapter's own test.

## Explicitly UNRUN — not fabricated

- Any live AMap/Tencent `/v3/place/detail` or `/ws/place/v1/detail` call.
  This slice's request/response shapes are taken from AMap POI 2.0 and
  Tencent WebService's public documentation (see
  `docs/agents/maps-integration-development.md`'s source list); no
  account-backed call against these specific endpoints has been made in
  this environment.
- Consumption by a route/geocode adapter, UI, or native client — #363's
  remaining acceptance bullets (unified suggest/nearby/geocode adapters,
  map/list/detail shared selected ID, single main map display SDK,
  server/native/Web credential separation, observation-vs-Fact permission
  isolation) are unchanged and still open.
- Nearby-category search (restrooms/convenience/dining/pharmacy/ATM) — a
  separate remaining bullet, not addressed by this slice.

## Files changed

- `lib/server/maps/provider-detail-adapter.ts` (new)
- `lib/server/maps/provider-search-adapter.ts` (exports `boundedJson` for reuse; no behavior change)
- `tests/contract/maps/provider-detail-adapter.test.mjs` (new, 9 tests)
- `docs/contracts/place-identity.md` (documents the addition, updates "Non-goals")
- `scripts/maps/.env.example` (adds the new detail flags, plus the
  previously-undocumented search flags found missing during this slice)
- `artifacts/VPJ-19/363-place-detail-adapter-20260916/verification.md` (this file)

## Label reconciliation

`#363`'s `status:blocked` label names only one dependency in the issue
body: `#362`, closed 2026-09-14. That dependency is resolved, so the
label no longer reflects "waiting for an explicit dependency or operator
trigger" (`docs/agents/triage-labels.md`). Removed as part of this PR,
per the explicit authority granted for this round to verify and reconcile
`status:blocked`. The issue itself stays open — its remaining acceptance
bullets are unchecked and this PR does not claim to close it.
