# Tencent Maps first real probe

Related to #362/#208. Follows `artifacts/VPJ-18/amap-first-probe-20260914/verification.md`;
completes the "at least one search + one route per provider" bullet in
#362's acceptance for both selected providers.

## What ran

Operator supplied a Tencent Maps Web-service key into the same local,
git-ignored `scripts/maps/.env` used for the AMap run (never committed,
never printed). `node scripts/maps/probe.mjs tencent <ledger>` ran
unmodified against the same public synthetic Beijing fixture (北京大学 text
search + one walking route), same two-request budget and redaction rules —
no code change to `probe.mjs`.

## Result (TENCENT_PROBE, one run, 2026-09-14T05:38:09Z)

| Operation | Status | Elapsed | Observation |
| --- | --- | --- | --- |
| search (`/ws/place/v1/search`) | observed | 470ms | `count: 3`, identity fields present |
| walking (`/ws/direction/v1/walking`) | observed | 123ms | one route, `1589m` / `1440s` |

Both calls returned `API_OBSERVED`; no transport/timeout/http error. Charge
is `unknown; reconcile account usage` per the script's own policy — no cost
figure is claimed here. Raw response body and the API key are not retained
anywhere in the repo or in this file.

## AMap vs Tencent, same fixture (informational only)

| Provider | Search count | Walking distance | Walking duration |
| --- | --- | --- | --- |
| AMap | 3 | 1541m | 1233s |
| Tencent | 3 | 1589m | 1440s |

Two providers returning similar-shaped output on one shared synthetic point
pair is not agreement on ground truth and is not a provider-selection
result — per #362's own acceptance text, "两家一致不等于事实正确." Distance/
duration differ because the two engines compute different routes; neither
is calibrated against independent official evidence here.

## Still UNRUN

- 120-query / four-city (Shanghai/Beijing/Guangzhou/Chongqing) / 40-route
  full comparison — #362's full acceptance scope.
- Entity-match / entrance-accuracy calibration against independent ground
  truth (terminal buildings, exit numbers, duplicate-name branches,
  Chongqing complex walking).
- Client-side SDK loading (the supplied Tencent key also covers iOS SDK,
  but no client integration exists yet — see #206/#264 scope), mainland
  vs overseas network split, physical-device observation.
- Account price/quota reconciliation for both providers.
- Primary-candidate / supplementary / no-map-mode decision — #362 requires
  this only after the full budget-constrained comparison, not from two
  single-fixture reads.

#362/#208 remain open. This is two successful single-fixture reads, one
per provider — not a map-integration acceptance result and not a provider
selection.
