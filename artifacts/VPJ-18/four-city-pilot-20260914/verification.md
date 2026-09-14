# Four-city pilot batch (toward #362 full 120-query/40-route matrix)

Related to #362/#208. This is a **6-landmark, 4-city pilot** (12 requests
per provider, 24 total), not the full 120-query/40-route acceptance —
that remains open. New capability added: `scripts/maps/batch-probe.mjs`
(bounded to `HARD_CAP_REQUESTS = 40` per run regardless of input size),
`scripts/maps/pilot-fixtures.json` (6 real, well-known public landmarks
across Shanghai/Beijing/Guangzhou/Chongqing, one each covering the
category types #362 asks for: airport terminal, station exit, scenic
entrance, a duplicate-name chain branch, and Chongqing's own complex
walking terrain via two entries), plus
`tests/contract/maps/batch-probe.test.mjs` (7 tests, no real network
calls). `docs-check`, `lint` (267 files) and `typecheck` all PASS;
`node --test tests/contract/maps/*.test.mjs` 13/13 PASS (6 existing +
7 new), unmodified `probe.mjs` behavior untouched.

Landmark query text names real places. `from`/`to` coordinates are
approximate synthetic offsets from memory, not verified precise
entrances or a second confirmed landmark — same "public synthetic"
framing `probe.mjs`'s own Beijing fixture already uses. Entrance/entity
accuracy stays `UNRUN`, exactly as before.

## AMap result — 6/6 fixtures, 12/12 requests observed

| City | Category | Query | Search count | Walking distance/duration |
| --- | --- | --- | --- | --- |
| 上海市 | airport_terminal | 上海虹桥国际机场2号航站楼 | 3 | 5781m / 4625s |
| 北京市 | station_exit | 北京西站 | 3 | 1118m / 894s |
| 广州市 | scenic_entrance | 广州塔 | 3 | 1878m / 1502s |
| 广州市 | duplicate_name_branch | 星巴克 | 3 | 1020m / 816s |
| 重庆市 | scenic_entrance | 解放碑 | 3 | 394m / 315s |
| 重庆市 | chongqing_complex_walking | 李子坝轻轨站 | 3 | 700m / 560s |

Request spacing ~100-360ms; all returned `observed` with no
transport/timeout/http error.

## Tencent result — 0/6 fixtures, 0/12 requests observed

All 12 requests (both search and walking, all 6 fixtures) returned
`provider_rejected`, `code: "121"`. Per the script's redaction policy,
the provider's raw error message is never retained, so the human-readable
reason for code 121 is not captured here and is **not guessed** in this
document.

Request spacing in this run was ~25-130ms — noticeably tighter than the
single successful Tencent probe run earlier the same day
(`artifacts/VPJ-18/tencent-first-probe-20260914/verification.md`, two
requests ~470ms apart). The leading hypothesis is per-second rate
limiting on this Tencent account/plan tier triggered by the batch's
tighter cadence, not a key or parameter regression — the exact same
request-building code path (`requestsForFixture`) that works for AMap on
the same fixtures, and Tencent's own earlier single-fixture run with the
same key succeeded. This is a hypothesis, not a diagnosed root cause.

## Still UNRUN / not decided here

- Root cause of Tencent code 121 (rate limit vs quota vs something else)
  — needs either an inter-request delay added to `batch-probe.mjs` and a
  re-run, or the operator's own account dashboard showing the QPS/quota
  terms for this key. Not attempted further in this round to avoid
  additional unexplained real API calls without a plan.
- Full 120-query (10 places × zh/en/pinyin × 4 cities) / 40-route matrix.
- Entity-match / entrance-accuracy calibration against independent
  ground truth.
- Account price/quota reconciliation for either provider.
- Primary-candidate / supplementary / no-map-mode selection — #362
  requires this only after the full budget-constrained comparison.

#362/#208 remain open. This is a bounded pilot demonstrating the batch
mechanism end-to-end for AMap and surfacing a real, undiagnosed Tencent
throttling signal — not a provider-selection result.
