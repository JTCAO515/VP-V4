# AMap first real probe

Related to #362/#208. Follows the initial preparation lane
(`artifacts/VPJ-18/initial-probe-20260914/verification.md`); this is the
"at least one search + one route per provider" bullet in #362's acceptance,
for AMap only.

## What ran

Operator supplied an AMap Web-service key (`AMAP-Web`) into a local,
git-ignored `scripts/maps/.env` (never committed; `.gitignore` now excludes
`.env`/`.env.*` repo-wide, keeping only `*.env.example` tracked — this repo
previously had no root `.env` ignore rule at all). `node scripts/maps/probe.mjs
amap <ledger>` ran unmodified against the public synthetic Beijing fixture
(北京大学 text search + one walking route), same two-request budget and
redaction rules as the prepared script — no code change to `probe.mjs`.

## Result (AMAP_PROBE, one run, 2026-09-14T05:36:28Z)

| Operation | Status | Elapsed | Observation |
| --- | --- | --- | --- |
| search (`/v5/place/text`) | observed | 276ms | `count: 3`, identity fields present |
| walking (`/v5/direction/walking`) | observed | 116ms | one route, `1541m` / `1233s` |

Both calls returned `API_OBSERVED`; no transport/timeout/http error. Charge
is recorded as `unknown; reconcile account usage` per the script's own
policy — this run does not claim a cost figure. Raw response body and the
API key are not retained anywhere in the repo or in this file.

## Still UNRUN

- Tencent probe: no Tencent Web-service key supplied yet; `TENCENT_MAP_PROBE_ENABLED`
  stays `false` locally. Do not infer no Tencent account exists.
- 120-query / four-city / 40-route full comparison (#362's full acceptance).
- Entity-match/entrance-accuracy calibration against independent ground truth.
- Client-side SDK loading, mainland/overseas network split, physical-device
  observation, account price/quota reconciliation.

#362/#208 remain open. This is one successful AMap read, not a provider
selection or map-integration acceptance result.
