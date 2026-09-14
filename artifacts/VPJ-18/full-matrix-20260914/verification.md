# #362 full 120-query / 40-route matrix

Related to #362/#208. Follows the pilot
(`artifacts/VPJ-18/four-city-pilot-20260914/verification.md`). This is the
"冻结上海/北京/广州/重庆每城10个地点的中/英/拼音120条查询，以及每城10条…路线"
bullet of #362's acceptance — 10 real, well-known public places per city
(`scripts/maps/full-matrix-places.mjs`), each searched in zh/en/pinyin
(120 total search-only requests) plus one short-walking-route request per
place (40 total), against both providers with an operator go-ahead for the
full real-call volume (~320 requests across both providers).

## What ran

`scripts/maps/generate-full-matrix-fixtures.mjs` deterministically builds
`full-matrix-search-120.json` (120 search-only fixtures) and
`full-matrix-routes-40.json` (40 walking-only fixtures, one per place, each
routing to a short ~600m synthetic offset — not a second real landmark; see
"route redesign" below) from the place data. `scripts/maps/run-full-matrix.mjs`
drives both files through the existing `runBatchProbe`, chunked at the
existing `HARD_CAP_REQUESTS = 40` per call (4 chunks per provider), with a
1s inter-request delay. New tests:
`tests/contract/maps/full-matrix.test.mjs` (5 tests: place-data shape,
generated-file shape, `chunk()` behavior) and 4 new tests in
`batch-probe.test.mjs` for the new `operations` field and
`fixtureRequestCount` — all pure logic, no real network calls.

## Route redesign after a real failure

The first real AMap run (before this evidence was finalized) paired
consecutive real places into a 10-route walking loop per city — e.g.
Beijing's Summer Palace → Great Wall at Badaling, Guangzhou's Chimelong
Safari Park → Baiyun Airport. AMap rejected 2 of 40 walking requests with
`code 20803` (`OVER_DIRECTION_RANGE`) — a real, documented AMap limit
(walking routes are capped well under the ~65-80km these particular real
distances hit). This was a genuine design mistake, not a provider issue:
pairing two far-apart real landmarks isn't a valid walking-route test.
Fixed by routing each place to a short synthetic offset (~0.004° ≈ 600m in
this latitude range) instead, matching the earlier pilot's own pattern.
Re-ran with the corrected fixtures; see results below.

## Final result

| Provider | Search (120) | Route/walking (40) | Total (160) |
| --- | --- | --- | --- |
| AMap | 120/120 | 40/40 | **160/160** |
| Tencent | 119/120 | 40/40 | **159/160** |

### AMap, by search-query variant

| Variant | Hit rate |
| --- | --- |
| zh | 40/40 |
| en | 40/40 |
| pinyin | 40/40 |

### Tencent, by search-query variant

| Variant | Hit rate |
| --- | --- |
| zh | 40/40 |
| en | **39/40** |
| pinyin | 40/40 |

### By city (search only)

| City | AMap | Tencent |
| --- | --- | --- |
| 上海市 | 30/30 | 30/30 |
| 北京市 | 30/30 | 30/30 |
| 广州市 | 30/30 | 30/30 |
| 重庆市 | 30/30 | **29/30** |

## The one real miss

Tencent's search for the English query **"Nanshan Yikeshu Viewpoint"**
(南山一棵树观景台, a Chongqing hillside viewpoint) returned
`status: "no_results", count: 0` — a genuine, successful API call that
found zero matching POIs, not a transport/HTTP/provider-rejected error.
This is not treated as a bug or retried with a different English phrasing
to force a hit: it is exactly the kind of finding #362's own acceptance
text anticipates — "英文实体命中…有逐项结果；两家一致不等于事实正确" and
"英文查询效果与英文结果权限是不同问题". A less prominent attraction's
informally-translated English name not existing as a registered POI name
in one provider's database is a real, useful data point about English
coverage, not a defect to paper over.

## Cost and quota

All calls stayed far under the confirmed quota headroom from the earlier
session (Tencent: 2,000/day on place search, 300,000/day on walking — used
120 and 40 respectively here, one-time). Actual per-call cost remains
`unknown; reconcile account usage`, as every prior probe run in this
series has recorded — this evidence does not claim a cost figure.

## Still not decided

- **Entity-match / entrance-accuracy calibration** against independent
  ground truth remains `UNRUN` — a successful search/route response is not
  independently verified to be the *correct* place or a walkable entrance.
- **Primary-candidate / supplementary / no-map-mode selection** — #362
  requires this decision only after this full comparison, which is now
  available, but the decision itself is an operator call, not made here.
- **Account price/quota reconciliation** for either provider — still
  `unknown`.
- Client-side SDK loading, mainland vs overseas network split, and
  physical-device observation remain out of scope for this server-API-only
  slice.

#362/#208 remain open — this matrix satisfies the acceptance bullet asking
for the frozen 120-query/40-route comparison to actually run, not the
ticket's remaining decision/calibration bullets.
