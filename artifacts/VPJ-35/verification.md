# VPJ-35 U1 development capacity verification

Date: 2026-09-26. Base: `origin/main` `c74c2ba66fd6922f2d815e0667f36768650b0cee` (#549 merged). Scope: text ServiceTask development capacity only. The migration defaults to record-only; no shared Staging, Production, real StoreKit transaction, or paid product was changed.

## Implemented

- Atomic owner-serialized new-goal capacity reservation, using the frozen #225 development policy and the active #226 Sandbox grant snapshot. No effective grant means Free; an active Pass never falls back to Free on exhaustion.
- One task ledger row across clarification and repair. A durable owner-readable `answered` Turn settles it once in the same transaction as the output. Partial output remains readable and releases its reservation without settlement or an automatic continuation path. Technical failure, blocked outcome, and pre-delivery cancel also release the reservation; repair rechecks capacity without creating another task or resetting the existing internal provider budget.
- Existing task/Turn idempotency and owner checks remain the admission authority. A metered task cannot silently revert to record-only after the development switch is turned off or its ledger row is erased. The new table is private with RLS and service-role-only export/erase RPCs; it holds IDs and timestamps, not prompt text or attempt charges.
- A distinct HTTP 429 error code reports task capacity exhaustion without changing the internal model budget code.

## Checks

| Check | Result | Scope |
| --- | --- | --- |
| `VP_TURN_DB_TEST=1 node --experimental-strip-types --test tests/integration/turn/text-work.test.mjs` | PASS 31/31, 0 skip; rerun after review repairs | Disposable network-disabled PostgreSQL, all migrations, real concurrent SQL; partial release and missing settings fail-closed added |
| `pnpm typecheck` | PASS | Main coordinator ran after frozen-lockfile install |
| `pnpm lint` | PASS | Main coordinator: source policy lint, 390 files |
| `pnpm test:contract` | PASS | Main coordinator |
| `node --experimental-strip-types --test tests/contract/errors/failure-taxonomy.test.ts` | PASS 3/3 | All five locale entries and unique error taxonomy |
| `pnpm docs:check` | PASS | Contract/document baseline |
| `git diff --check` | PASS | Local diff |
| `node scripts/run-ci-suite.mjs security` | Main coordinator: exit 0, 177 pass, 0 fail, 1 skip; suite outcome INCOMPLETE | AI-14 requires an unconfigured disposable identity Supabase target. Sandbox run separately failed five localhost listeners with `EPERM`; those failures did not reproduce in main environment. |

## Limits and next acceptance

- The migration's switch remains off in all existing environments. Development enablement and a task's readable answer have only been exercised in disposable PostgreSQL; Staging/physical iPhone, actual Sandbox purchase-to-grant, live provider and Production remain UNRUN.
- U1 does not enable partial settlement, waiting TTL, cross-period resume, amendment, Trip outcome, or media/task tool costs. Those stay in U2-U4. The new ledger does not alter #226 transaction tombstones or #194 supplier attempt accounting.
- Rollback: leave the append-only migration and ledger intact, keep/restore `enabled=false`, and roll back the API/worker deployment if needed. Existing metered tasks fail closed rather than silently become free.
