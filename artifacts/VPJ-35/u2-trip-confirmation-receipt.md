# VPJ-35 U2 Trip confirmation receipt preparation

Date: 2026-09-26. Base before final sync: `15e9be8e460a2c4855e4f6bc284d52118ef10587`; final main sync is a PR prerequisite. Scope: current-version, owner-readable Trip confirmation result proof. This slice does not settle Trip ServiceTasks or enable paid capacity.

## Implemented

- `read_trip_confirmation_receipt_v1` returns only a Proposal/Trip/version triple when the authenticated owner can read the current Trip version and the applied Proposal, event, linked idempotency row and content snapshot agree.
- Pending, rejected, expired, and superseded versions return no receipt. Anonymous callers cannot execute; other owners get no row. A partial or failed atomic Patch cannot create the required joint evidence.
- The existing `confirm_and_apply_trip_proposal` writer, U1 task ledger, StoreKit grant ledger, supplier attempt accounting, and native Today UI were not changed. The development capacity switch stays disabled by default.

## Checks

| Check | Result | Scope |
| --- | --- | --- |
| `pnpm test:integration:db --lane supabase-rls` | PASS 18/18, 0 fail, 0 skip | Main coordinator ran in this worktree after frozen-lockfile install; disposable local Supabase, all 80 migrations, Auth/RLS/Trip RPC tests. The first run exposed the missing ACL allowlist entry and local `node_modules`; both were fixed before the passing run. |
| `pnpm docs:check` | PASS | Contract and generated-document baseline. |
| `node --check tests/integration/trip/confirm-apply.test.mjs` and `node --check tests/integration/identity/function-acl.test.mjs` | PASS | Changed test syntax. |
| `git diff --check` | PASS | Local diff. |

## Remaining acceptance

- The #198 confirmation request has no verified ServiceTask identity; U1 tasks only have `expected_result=text_answer` and exclude Trip threads. No Trip capacity is reserved or settled by this PR. An atomic task binding and settlement path, including cancel/worker races, is still needed for U2 acceptance.
- Shared Staging, a real provider-generated Trip goal, physical iPhone, actual Sandbox purchase-to-grant, Production, and paid settlement: UNRUN. Local Supabase proves the receipt contract only.
- Rollback: leave the append-only migration in place and stop using the optional read RPC. Existing Trip writer and capacity behavior are unchanged.
