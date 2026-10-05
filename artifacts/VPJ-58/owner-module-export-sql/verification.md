# VPJ-58 owner metadata SQL delivery

Implemented ordinary-owner `privacy_coverage_module_export_v1(jsonb)` start/page/proof for notification-metadata/1 and trip-lifecycle-metadata/1. No source deletion, source body retention, service worker/lease/job, old D2 artifact/worker enrollment or target activation. New migration remains append-only; all API roles are revoked by default. Main reviewed the upstream OWNER-SEAM contract; the sole TS integrator owns combined independent review/CI and one PR.

## Actual checks

- PASS: final own disposable PostgreSQL 17.6 full accepted migration replay plus new migration: 17 tests, 0 failures, 0 skips (`postgres-r5.txt`). Includes bootstrap rollback and applied own-schema/RPC rollback/replay, unchanged original function bodies/ACL/config and table columns/RLS/ACL, all old source table row digests unchanged across each successful notification/lifecycle export.
- PASS: three owned SQL contract checks (`contract.txt`), including exact accepted notification safe projection comparison, no credential/core/old-source mutation, authority before UUID/effects, SQL NULL guards, single wall clock and cap-before-hash.
- PASS: source policy lint; docs baseline checks. `git diff --check` is recorded at commit.
- FAIL, corrected: r1 UNION expression ORDER BY compilation; r2 wrapper closing syntax. r3: global token uniqueness violated by the synthetic multi-owner fixture. All original failures retained. r4: 17/17 PASS; r5 adds full original data digest equality and remains 17/17 PASS. No production or signed-Auth failure is inferred from these SQL-claims fixtures.

## Authority and retained metadata

Current SQL actor, non-anonymous authenticated credentials, current live Auth session, actual mobile account/session/epoch and matching mobile attempt are checked before request lookup or cleanup. Existing mobile guard is reused with a strict IS NOT TRUE follow-up. Server-side Auth session created_at supplies the existing five-minute sensitive reauth rule, never JWT iat or client fields.

Every successful start has one wall clock capture; expiresAt equals capturedAt+30000. Retry cannot extend it. Whole-source sentinel and aggregate canonical source sections <=1,000,000 bytes are checked before digest/return. Lifecycle metadata excludes original Trip body; operations reuse the exact existing source-free receipt projection. Per-section null-to-terminal traversal, source/current authority, exact cursor anchor and previous cursor/limit, page/row budgets and SQL proof counts are enforced. TS must independently decode rows, count and verify its own aggregate output cap/binding; start/proof alone are not download delivery.

`requests_v1` retains UUID actor/session/epoch/scope, digest and fixed times. `sections_v1` retains cursor/limit, counts and terminal status. Expired request+section progress is lazily removed by a successful newly authorized own RPC after source validation. `request_fences_v1` is a minimum immutable request UUID/owner/session/scope/expiry fence, retained until that Auth session or account is revoked/deleted, so cleanup cannot let the same request restart. All three are private, RLS enabled, deny direct API access, and FK cascade on owner/session revocation. Start/proof expose the current owner's source-free receipt within the absolute TTL; an expired request returns COVERAGE_EXPIRED and cannot revive. The exported start binding already contains every retained fence field. No secret/source payload or artifact is stored.

## Integration work and UNRUN

The sole integrator must classify the new gated PG test in the shared CI registry before PR CI: append VP_COVERAGE_DB_TEST=1 to the isolated-postgres env and append tests/integration/privacy/owner-module-export-postgres.test.mjs to that same files list. The observed `db-integration --list` failure is an unclassified new gated file, not a SQL failure; this SQL owner has no shared registry lease and has not edited it. Reuse the final own evidence; do not create a second Auth HTTP matrix.

Signed GoTrue/PostgREST/HTTP: sole TS owner. Target GRANT, credentials, real userdata, remote schema/rollout, provider/Storage/budget, physical device, ALL2 restore/offline races, external exported-file recall and all-account completion: UNRUN/out of scope. Notification delete remains unavailable. Lifecycle delete remains the original explicitly selected Trip handler. #239 whole-parent closure belongs to Main, not this partial SQL seam.

## Reversible local rollback

Only on an isolated/authorized target: drop function public.privacy_coverage_module_export_v1(jsonb); drop schema coverage_export_private cascade. This removes transient export metadata/minimum fences and the new RPC only. The owned applied rollback verifies original schemas/data/ACL remain unchanged. Reapply the append-only migration restores default deny; grants are a separate operator action. No remote rollback is authorized here.

Fixed product/test source commit: `5b521f45`. Subsequent handoff/evidence formatting changes do not change these sources. Raw failure log lines retain the original messages and results; trailing spaces were normalized for diff hygiene.
