# #362 four-city pilot batch

Extends `docs/benchmarks/maps/initial-probe.md`'s single-fixture probe with
a bounded multi-fixture batch runner, toward #362's full 120-query/40-route
acceptance. This is still a pilot (6 landmarks, 4 cities, 12 requests per
provider) — not the full matrix.

`scripts/maps/batch-probe.mjs` reuses `probe.mjs`'s validated `summarize()`
and shares its timeout/response-size limits. It reads a JSON fixtures file
(`{city, category, query, from:{lat,lng}, to:{lat,lng}}[]`), builds exactly
two requests per fixture (search + walking), and refuses to run if
`fixtures.length * 2` would exceed `HARD_CAP_REQUESTS = 40` — a code-level
ceiling independent of the fixtures file's own size, so a larger fixtures
file cannot silently authorize a larger real-money batch.

Same safety properties as the single-fixture script: 0600 exclusive ledger
creation, disabled-by-default env flags, fixed HTTPS official domains, no
redirects, no retries, bounded response size, and provider responses/keys
are never retained — only `observed`/`provider_rejected`/`http_error`/
`timeout`/`transport_or_response_error` plus redacted counts/distances.

```sh
node scripts/maps/batch-probe.mjs amap /absolute/private/path/amap-pilot.jsonl scripts/maps/pilot-fixtures.json
node scripts/maps/batch-probe.mjs tencent /absolute/private/path/tencent-pilot.jsonl scripts/maps/pilot-fixtures.json
```

`scripts/maps/pilot-fixtures.json` (checked in, no secrets) lists 6 real,
well-known public landmarks across Shanghai/Beijing/Guangzhou/Chongqing,
covering the category types #362's acceptance names: airport terminal,
station exit, scenic entrance, a duplicate-name chain branch, and two
Chongqing entries for its own complex-walking terrain. `from`/`to`
coordinates are approximate synthetic offsets from memory — not verified
precise entrances — same framing as the single-fixture script's own
Beijing point pair.

2026-09-14 pilot result: AMap 6/6 fixtures observed across two runs;
Tencent 0/6 across two runs (no delay, then `delayMs=800`), both
`provider_rejected code 121` regardless of request spacing — see
`artifacts/VPJ-18/four-city-pilot-20260914/verification.md` for the full
table. The delayed re-run rules out simple QPS throttling; the pattern
now points at an account/key-configuration issue (IP allowlist, platform
restriction, or enablement delay) that needs the operator's own Tencent
console. Do not infer a provider preference from this alone.

`runBatchProbe`/the CLI now accept an optional `delayMs` (capped at
`MAX_DELAY_MS = 5000`) to sleep between requests — added for this
diagnostic, available for any future run that wants deliberate spacing.

Scaling to the full 120/40 matrix needs: (1) the operator resolving the
Tencent code 121 signal via their console, (2) the remaining ~34
landmarks and ~34 routes per #362's spec, and (3) an explicit go-ahead on
real-call volume before firing that many requests against both accounts.
