# VPJ-80 first slice: durable action claim boundary

Scope: isolated branch `codex/vpj80-bounded-execution-20260927`, based on `0437f9401c767bd77b08f4b751b286a747f477c7`. This is a preparation slice of #561, not the lodging comparison result or target-environment acceptance.

## Observable result and path

A service-only, lease-bound action claim persists in PostgreSQL across process connections. The tool gateway requires that durable store for `idempotency: required`; a duplicate or unknown claim never invokes the executor. A completed receipt stores a digest. The migration installs no worker route, provider, policy, scope, or scheduler.

Producer: a future bounded planning worker holding an existing `turn_private.work` lease. Transport: explicit `PlanningActionRpc` passed to `durablePlanningActionStore`. Persistence: `turn_private.planning_action_receipts`. Consumer: `executeToolIntent` reads claim and completion status before returning a model-safe receipt. Current user-facing result consumer remains #560's `comparison/1` reader, but it is not connected to this producer yet. Validation: owner/session/Turn lease, current ServiceTask and assistant goal version, source and task consent/policy, explicit Memory revisions, four-action task cap, pending model cost, and output projection. The existing result publisher separately enforces current basis when that future integration exists.

## Local evidence

- PASS: `VP_TURN_DB_TEST=1 node --experimental-strip-types --test tests/integration/turn/planning-action-receipts.test.mjs` against a disposable PostgreSQL container. Migration rollback/reapply, competing SQL clients, persistence across connections, duplicate/unknown, owner/lease, goal/Memory changes, pending cost, cancellation/revocation and task step cap were exercised with synthetic identities. No real worker or provider was used.
- PASS: targeted tool contract/security tests, `pnpm lint`, `pnpm typecheck`, `pnpm docs:check`, and `git diff --check`.
- `pnpm test:integration` exited 0 with 39 pass / 119 skip; its suite reports `incomplete` because DB/target environment gates are not configured in that command. The targeted disposable PostgreSQL test above was run explicitly.
- `pnpm test:security` exited 0 with 178 pass / 1 skip; suite reports `incomplete` because the disposable identity Supabase target was not configured.
- `pnpm test:contract` exited 0; detailed result recorded by CI for the final commit.
- The first PR head (`49454d46`) failed the DB CI classification gate before any lane test: this new gated file was not registered. The fix adds it to the existing disposable `postgres` lane in `scripts/ci-suites/db-integration.mjs`; `--list` now classifies it there. PASS: `node scripts/ci-suites/db-integration.mjs --lane postgres` (129 pass, 0 fail/skip, 15 files). New-head remote CI must still pass before merge.

## UNRUN and follow-up

- UNRUN: real qualified evidence/place/route tool and actual provider chain; no such planning producer is wired in this slice.
- UNRUN: App-closed, hosted worker restart, persisted comparison readback, and native device observation on one target environment/version.
- UNRUN: Production migration/deployment and user acceptance. No production write was authorized.
- No automatic reconciliation workflow exists for `unknown`; the new planning producer must add explicit operator/provider verification before resuming that task. No generic retry is provided.
- #559's unmerged goal-aware manifest is not consumed. Trip-version/typed Proposal integration remains a separate reviewed step; the result publisher continues to reject untrusted Trip membership.

Rollback: leave the new planning producer disabled (it is currently absent), revert the TypeScript seam if needed, and retain the append-only private receipt table until a reviewed forward cleanup. Do not remove existing user data or replay an ambiguous action.
