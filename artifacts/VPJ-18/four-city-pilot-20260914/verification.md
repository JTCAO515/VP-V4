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

## Root cause found: code 121 = daily call quota, not throttling or signing

Per Tencent's own status-code documentation and matching independent
developer reports for this exact code/message pairing, **`status 121`
means "此key每日调用量已达到上限"** — the key's daily call quota is
exhausted (new keys default to a 0/unallocated daily quota in the console
until the operator explicitly assigns one per key). This is unrelated to
request cadence (already ruled out above) and unrelated to domain/IP
whitelisting.

Separately, the operator enabled "签名校验" (SN/sig verification) on this
key and supplied its SK. `scripts/maps/probe.mjs` and
`scripts/maps/batch-probe.mjs` now compute and send the `sig` parameter
per lbs.qq.com's own documented algorithm — `md5(path + "?" +
ascending-sorted-by-name unencoded params + SK)` — verified in
`tests/contract/maps/*.test.mjs` against the documentation's own worked
example (`90da272bfa19122547298e2b0bcc0e50`) before use on any real key.
A signed real call still returned `code 121`, confirming quota — not
signature validity — is the actual blocker; the signing code is correct
and kept regardless, since it is a real security setting now active on
this key.

## Still UNRUN / not decided here

- Awaiting operator to assign this Tencent key a daily call quota in the
  console, then a real re-run to confirm the fix.
- Full 120-query (10 places × zh/en/pinyin × 4 cities) / 40-route matrix.
- Entity-match / entrance-accuracy calibration against independent
  ground truth.
- Account price/quota reconciliation for either provider.
- Primary-candidate / supplementary / no-map-mode selection — #362
  requires this only after the full budget-constrained comparison.

#362/#208 remain open. This is a bounded pilot demonstrating the batch
mechanism end-to-end for AMap and surfacing a real, undiagnosed Tencent
throttling signal — not a provider-selection result.
