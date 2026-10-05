# VPJ-32 Ops UI verification

UI source: `app/ops/service/**`; public navigation: the single authorized `/ops/service` link in `app/ops/review/workspace.tsx`.
Dependency source: TS contract d5cd89c9 + 4a16a072 + 5983bc4c and API e48eedff. These are read-only integration dependencies; the Ops integrator should cherry-pick only Ops-owned commits.

## PASS — synthetic behavior

`node --test tests/contract/service-cases/ops-workspace.test.mjs`: 17 passed, 0 failed, 0 skipped.
Covers original operation locking, lost ACK/absent receipt, original-byte abandonment, metadata-only journal, page exit/reload, same-actor session replacement, TTL/revocation, 30-second request-start freshness, late responses, staff-only projections, capacity/shift/assignment, evidence kinds, storage failures, erased tombstones and receipt matching.
The controller-to-HTTP-handler test runs the real TS handler against **synthetic RPC responses**. It proves caller/handler wiring, not actual PostgreSQL or staff membership.

`pnpm typecheck`, `pnpm lint`, `git diff --check`: passed.

## PASS — actual local HTTP and browser

Temporary Next dev server on `127.0.0.1:64573`, no service flag or credentials supplied.
Actual POST `/api/ops/service-cases/v1` with `{"action":"workspace"}` returned 503 `CASE_OPERATIONS_DISABLED`; Cache-Control `private, no-store`.
Browser plugin observed actual signed-out UI in zh/en; 390×844 viewport had no horizontal overflow and zero recorded console errors/warnings. No task, staff assignment, or ETA was fabricated.
Screenshots: `/tmp/vpj32-ops-ui-evidence/zh-390.png`, `/tmp/vpj32-ops-ui-evidence/en-390.png`. Local development server and temporary browser tab were closed after verification. Generated AGENTS/next-env churn was excluded.

## UNRUN

Actual qualified staff cookie session → PostgreSQL capacity/shift → accept/assign/update → receipt chain; real revoked staff/grant readback; deployment, target environment, native/device and human acceptance. The sole TS integrator owns combined same-source validation and CI. No staff enrollment, GRANT, credentials, external contact, transaction or deployment was performed.
