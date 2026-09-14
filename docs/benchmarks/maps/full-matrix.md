# #362 full 120-query / 40-route matrix

Extends `four-city-pilot.md`'s 6-landmark pilot to the full acceptance
scope: 10 real places per city (Shanghai/Beijing/Guangzhou/Chongqing),
each searched in zh/en/pinyin (120 search requests) plus one short walking
route per place (40 requests), against both providers — run with an
explicit operator go-ahead for the ~320-request real-call volume.

`scripts/maps/full-matrix-places.mjs` holds the 40 places (zh/en/pinyin
names, approximate coordinates from memory — not independently verified).
`scripts/maps/generate-full-matrix-fixtures.mjs` deterministically builds
`full-matrix-search-120.json`/`full-matrix-routes-40.json` from it — run it
again after editing the place list. `scripts/maps/run-full-matrix.mjs`
drives both files through `batch-probe.mjs`'s `runBatchProbe`, chunked at
the existing `HARD_CAP_REQUESTS = 40` per call (a per-run ceiling this
script does not raise), 1s delay between requests:

```sh
node scripts/maps/run-full-matrix.mjs amap /absolute/private/ledger-dir scripts/maps/full-matrix-search-120.json scripts/maps/full-matrix-routes-40.json
node scripts/maps/run-full-matrix.mjs tencent /absolute/private/ledger-dir scripts/maps/full-matrix-search-120.json scripts/maps/full-matrix-routes-40.json
```

Routes use each place's own coordinate plus a short ~600m synthetic offset
as the destination — **not** a second real landmark. An earlier attempt
paired consecutive real places into a city-wide loop and hit AMap's real
`OVER_DIRECTION_RANGE` (code `20803`) limit on two long-distance pairs
(e.g. an airport to a downtown attraction ~50-80km away); see
`artifacts/VPJ-18/full-matrix-20260914/verification.md` for that finding
and the fix.

2026-09-14 result: AMap 160/160; Tencent 159/160 (one genuine `no_results`
on an English query for a minor viewpoint, not an error — see the
verification doc's variant/city breakdown). Do not infer a provider
preference from this alone — #362 itself requires the accuracy/entrance
calibration and cost/quota reconciliation bullets before any selection.
