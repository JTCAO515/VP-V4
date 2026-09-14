# #362 closeout — remaining acceptance bullets

Follows `initial-probe.md` → `four-city-pilot.md` → `full-matrix.md`. Those
three cover #362's first three acceptance bullets (credentials/toggle/
budget config; public-place-only synthetic probing; the frozen 120-search/
40-route matrix actually run). This doc closes the remaining three, each
either decided or explicitly `UNRUN` with a stated reason — none
fabricated.

## Decision: primary candidate / supplement / no-map fallback

**AMap is the primary candidate; Tencent is a supplement, not a second
primary.** Operator decision (2026-09-14), based on the full-matrix
result: AMap 160/160 vs Tencent 159/160 (Tencent's one miss was a genuine
`no_results` on an obscure viewpoint's English name, not an error —
see `full-matrix.md`). The gap is too small to be the deciding factor by
itself; the deciding factors are:

- AMap needs no request signing. Tencent requires the SN/`sig` algorithm
  (`lib` mirror: `scripts/maps/probe.mjs`'s `tencentSig()`) once signature
  verification is enabled on a key — one more moving part in production.
- Tencent's per-key quota is allocated **per endpoint** (search vs
  walking counted separately, confirmed via this session's `code 121`
  investigation) — an operational surprise AMap's single combined quota
  doesn't have.
- Both are real, working, quota-sufficient candidates today; keeping
  Tencent wired as a supplement (not removed) preserves the fallback this
  ticket's own scope calls for ("双供应商...启停开关") if AMap degrades or
  its quota is exhausted.

**No-map fallback mode**: when both providers are disabled (env flags off)
or both return non-`observed` status for a given request, the product
falls back to **plain manual text entry** for the place/address — no
search suggestions, no route distance/duration shown, the user's typed
text is kept as-is. This is not a new capability to build in this slice;
it is the natural behavior already implied by `probe.mjs`'s existing
`UNRUN`/error statuses never being treated as "must retry or block" —
consumers of the maps layer must already handle "no result" without
assuming a provider is always reachable.

## Decision: failure classification

Formalizing the taxonomy `probe.mjs`/`batch-probe.mjs` already implement
(`summarize()` and the outer fetch handler), as the single classification
both this ticket and future consumers should use — no new codes invented
here, only naming what exists:

| Status | Meaning | Retry? |
| --- | --- | --- |
| `observed` | Successful call, provider returned usable data | n/a |
| `no_results` | Successful call, zero matches — not an error | no |
| `provider_rejected` | Provider returned a non-success status/error code | no (surface to fallback) |
| `invalid_response` | 200 OK but response shape didn't match expectations | no (surface to fallback) |
| `http_error` | Non-2xx HTTP status | no (surface to fallback) |
| `timeout` | Request exceeded `limits.timeoutMs` (15s) | no (this session's scripts never retry) |
| `transport_or_response_error` | Network/DNS/TLS/parse failure below HTTP | no |
| `UNRUN` | Feature flag off or credential missing | n/a — expected disabled state |

None of these are provider-specific hacks; `provider_rejected` carries the
provider's own numeric code (e.g. AMap `20803` OVER_DIRECTION_RANGE,
Tencent `121` quota-exhausted) for operator diagnosis, but the consumer-
facing branch is the 8 statuses above, not per-code handling.

## Explicitly UNRUN (not decided, not fabricated)

- **Entrance-level accuracy against independent ground truth.** This
  session cross-checked place *existence* (correct district/address) for
  a sample via public sources (Wikipedia, government pages), confirming
  the pilot fixtures are real, correctly-named places — not fabricated
  coordinates. It did **not** independently verify entrance-level GPS
  precision: doing that needs either a site visit or a second, unrelated
  geocoding source, and public web search returns addresses, not
  coordinates, for these landmarks. Two providers agreeing is not ground
  truth (`full-matrix.md`'s own framing). Remains `UNRUN`.
- **Overseas-client map SDK load vs mainland-client SDK vs server API
  split.** This entire #362 slice, by design, only exercised the
  server-side REST APIs (`probe.mjs`/`batch-probe.mjs`) — no client SDK,
  no device, no network-path distinction. That work belongs to the
  client-side tickets already filed and blocked (#363/#364/#365/#366/
  #367). Remains `UNRUN` here, not silently assumed equivalent.
- **Account price/quota reconciliation.** Quota headroom was confirmed
  empirically (Tencent: 2,000/day search, 300,000/day walking, per the
  operator's console during the `code 121` investigation); actual
  **price** per call for either provider was never obtained — no billing
  console was checked this session. Operator action: reconcile actual
  per-call/monthly cost from each provider's own billing console before
  any production budget commitment.

## What this closes

#362's six acceptance bullets are now each either done-with-evidence
(bullets 1-3, prior docs) or resolved-or-explicitly-UNRUN (bullets 4-6,
this doc) — none silently skipped, none claimed without evidence. Closing
the GitHub issue itself remains the operator's call, consistent with how
this repo has treated ticket-closure decisions elsewhere in this session.
