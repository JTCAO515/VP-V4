# VPJ-31 Ops consumer verification

2026-10-05, isolated `codex/vpj31-traveler-brief-ops-20261005`.
Fresh actual `origin/main` was `2b49b94c`; dependency `8675b90c` and
immutable Brief wire `89fe4de6` / `20ea5b46` were integrated normally.
Product source is `fb5c4a4dacfbdff160b78ef9381c534d6905a0ee`, given early
to the sole TS integrator for the same PR. No additional PR was created.
Main granted only the one Case Link in `app/ops/service/workspace.tsx` after
the original Ops writer released it. Old operations fields remain unknown.

## Observed checks

- PASS: `node --experimental-strip-types --test tests/contract/service-cases/brief/ops-consumer.test.mjs` — 15 passed, 0 failed, 0 skipped.
  These deterministic synthetic cases cover actual-head locate → exact read,
  ordinary-grant denial, cross-Case/employee/grant/revision refusal, owner-preview
  refusal, session replacement before/after read, source/revocation/read failure,
  clearing at request start, aborted and overlapping late replies, expiry and
  slow reply refusal, verified-actor/stable-session adapter, cookie/no-store
  headers and reference-only request bytes. The actual TS HTTP handler is
  composed with the consumer in one case using a synthetic RPC; this is **not**
  proof of real Supabase Auth, SQL ACLs or source invalidation triggers.
- Initial FAIL: Node strip-only runner rejected a TypeScript constructor
  parameter property (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`). Changed it to plain
  declared fields; the unchanged behavioral assertions then passed 15/15.
- PASS: `pnpm typecheck`; `pnpm lint` (661 files); `git diff --check`.
- PASS: `pnpm build` — actual exit 0, route `/ops/service/brief` included.
- PASS: Codex in-app browser against that production build on local
  `127.0.0.1:64980`, with Auth/Brief activation absent. Chinese and English
  unauthorized states show no Brief body; the refresh button repeats refusal.
  At 390×844, document scroll width is 390, button height 45.1875 px, and both
  languages fit without horizontal overflow. At desktop 1280 px, duplicate
  `caseId` parameters show invalid task ID and zero field sections. Captured
  browser warning/error logs were empty. Browser selector `getByLabel` could
  not resolve the language label; the observed combobox role succeeded.
  Screenshots are local `/tmp/vpj31-ops-mobile-en.jpg` and
  `/tmp/vpj31-ops-mobile-zh.jpg`, showing the unauthorized state only.

## Authority and freshness limits

Only the server's current locate/read establishes access. Browser getUser
verifies the actor; stable getSession claims provide the expected session
headers. The cookie API and SQL independently verify staff authority.
Local TTL/digests never grant access. No body, source value or selection is
persisted in storage, URL, log or a retained data cache. URLs contain only
the Case locator reference. Owner preview/audit/export/delete are not staff
commands; neither Trip nor Memory writers are called.

Request start/failure, foreground, auth events, Case change, unmount and expiry
clear the visible body and reject late responses. While continuously visible,
the page clears and requalifies every 10 seconds. There is no server push:
remote source correction, withdrawal or deletion can remain visible until
that next poll or an earlier focus/refresh, rather than zero-latency removal.
Each subsequent read requalifies on the server. Missing/unshared field classes
show unknown; response detail has no invented source, and null requirement
subfields are also unknown. No personality or full-history claim is made.

## Unrun / shared evidence

- Real local cookie Auth + SQL read/source-frontier/revoke/default-grant
  negatives belong to the sole TS integrator's one same-source HTTP lane;
  their result must be recorded there. No second Docker stack was launched.
- Positive authenticated field layout and the Case-list Link were source /
  consumer checked here, not browser exercised with actual shared values.
  They remain UNRUN browser acceptance until the combined qualified lane.
- Real employees, target migration/enrollment/GRANT/config, provider/funds,
  Production, human and device acceptance are UNRUN. None was activated.
