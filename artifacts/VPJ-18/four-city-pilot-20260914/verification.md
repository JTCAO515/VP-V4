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

**Final status: both providers pass the full pilot — see "Final result"
below.** The sections immediately following record the real
troubleshooting history (Tencent's initial `code 121` failures and their
resolution) rather than skipping to the ending, per this repo's evidence
convention of not rewriting failed runs into a clean success narrative.

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

## Tencent result — 0/6 fixtures, 0/12 requests observed (two runs)

**Run 1** (no delay, ~25-130ms between requests): all 12 requests
returned `provider_rejected`, `code: "121"`.

**Run 2** (`delayMs=800`, added specifically to test the rate-limit
hypothesis; actual observed elapsed time between admissions ranged
36ms-3230ms, well past any plausible per-second QPS window): **still all
12 requests `provider_rejected code "121"`**, same as run 1.

This rules out simple request-cadence/QPS throttling as the explanation —
spacing varied by two orders of magnitude across the two runs with an
identical result. Per the script's redaction policy, the provider's raw
error message is never retained, so code 121's exact meaning is not
captured here and is **not guessed** as fact. The pattern (100% rejection
regardless of timing, on every fixture/operation, with the same key that
worked for one single-fixture run earlier the same day —
`artifacts/VPJ-18/tencent-first-probe-20260914/verification.md`) is more
consistent with an account/key-configuration issue than a rate limit:
candidates include an IP allowlist bound to the key, the WebService
capability not being fully enabled alongside the iOS SDK capability on
this key, or a delay between enabling a service and it taking effect.
None of these are verifiable from here — they need the operator to check
the Tencent console (服务开通状态、IP白名单、Key类型/平台限制) directly.
No further automated retries were run against the real API pending that
check, to avoid spending more calls on an unexplained failure mode.

## Root cause confirmed and resolved: per-endpoint daily quota

Per Tencent's own status-code documentation, **`status 121` means "此key
每日调用量已达到上限"** — daily call quota exhausted/unallocated. This
was unrelated to request cadence (ruled out earlier) and unrelated to
domain/IP whitelisting or signing. The console assigns quota
**per endpoint**, not per key as a whole: after the operator allocated
quota, `/ws/place/v1/search` started returning `observed` immediately,
while `/ws/direction/v1/walking` still returned `code 121` for one more
call — the operator's own console screenshot at that moment showed
`0/300000 已用 0%` for walking, i.e. quota was configured but the change
had not yet propagated to the API gateway. A second retry ~2 minutes
later succeeded on both operations, and the full 6-fixture/12-request
pilot then passed end to end.

Separately, the operator enabled "签名校验" (SN/sig verification) on this
key and supplied its SK. `scripts/maps/probe.mjs` and
`scripts/maps/batch-probe.mjs` now compute and send the `sig` parameter
per lbs.qq.com's own documented algorithm — `md5(path + "?" +
ascending-sorted-by-name unencoded params + SK)` — verified in
`tests/contract/maps/*.test.mjs` against the documentation's own worked
example (`90da272bfa19122547298e2b0bcc0e50`) before use on any real key.
This was not the fix for `121` (quota was), but it is real, kept
capability now that signing is active on this key.

## Final result — both providers, 6/6 fixtures, 24/24 requests observed

| City | Category | Query | AMap search / walking | Tencent search / walking |
| --- | --- | --- | --- | --- |
| 上海市 | airport_terminal | 上海虹桥国际机场2号航站楼 | 3 / 5781m,4625s | 3 / 5835m,5280s |
| 北京市 | station_exit | 北京西站 | 3 / 1118m,894s | 3 / 744m,660s |
| 广州市 | scenic_entrance | 广州塔 | 3 / 1878m,1502s | 3 / 1903m,1740s |
| 广州市 | duplicate_name_branch | 星巴克 | 3 / 1020m,816s | 3 / 806m,720s |
| 重庆市 | scenic_entrance | 解放碑 | 3 / 394m,315s | 3 / 464m,420s |
| 重庆市 | chongqing_complex_walking | 李子坝轻轨站 | 3 / 700m,560s | 3 / 715m,660s |

Both providers return a similar-shaped result on every fixture; distances
and durations differ per fixture because each engine computes its own
route. This is still not agreement on ground truth and not a provider
selection — per #362's own acceptance text, "两家一致不等于事实正确" —
entity-match/entrance-accuracy stay `UNRUN`.

## Still UNRUN / not decided here

- Full 120-query (10 places × zh/en/pinyin × 4 cities) / 40-route matrix
  — this pilot covers 6 of the ~40 landmarks the full spec calls for.
- Entity-match / entrance-accuracy calibration against independent
  ground truth.
- Account price/quota reconciliation for either provider.
- Primary-candidate / supplementary / no-map-mode selection — #362
  requires this only after the full budget-constrained comparison.

#362/#208 remain open. This is a bounded pilot demonstrating the batch
mechanism end-to-end for both providers — not a provider-selection
result.
