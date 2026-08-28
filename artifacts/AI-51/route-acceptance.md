# AI-51 UserDataAdapter route acceptance

## Scope and baseline

- Issue: [#84 AI-51](https://github.com/JTCAO515/VP-V4/issues/84)
- Main baseline: `a442eba` (merged PR #123 password login)
- Boundary: authenticated password session -> Route Handler -> UserDataAdapter -> user-JWT RLS /
  security-invoker RPC.
- Anti-goals retained: no service credential, admin Auth API, public signup, password recovery,
  anonymous durable identity, migration or RLS/RPC modification.

## Reproducible automated evidence

| Check | Result |
| --- | --- |
| `pnpm test:contract` | 21/21 passed |
| `pnpm test:integration` | 1/1 passed: atomic confirmed Proposal in local RLS transaction |
| `pnpm test:security` | 3/3 passed: owner RLS/fault rollback, no service credential, no auth-admin/signup/recovery path |
| `pnpm test:e2e` | 1/1 passed: accessible five-locale password session surface |
| `pnpm check` | passed: lint, strict typecheck, production build, static tests 13/13 |
| `pnpm docs:check`, `jq empty docs/handoff.json`, `git diff --check` | passed |

## Controlled Preview evidence

The operator completed the real session/RLS matrix without disclosing secret or private values:

- pre-provisioned password sign-in succeeded;
- an inaccessible Trip returned `403 FORBIDDEN` while authenticated and `401 UNAUTHENTICATED` after
  sign-out;
- an owner read, confirmed and reloaded a temporary Trip through the same authenticated route;
- a second user was denied both read and confirm for that owner Trip;
- the temporary data was treated as controlled acceptance data, not product content.

Codex browser automation did not bypass its `net::ERR_BLOCKED_BY_CLIENT` API-navigation limitation by
copying a Cookie/JWT. The operator result is recorded in Issue #84/PR #123 context without identifiers.

## Security and rollback

RL-01: confirmation requires the authenticated owner to see the exact Proposal and Trip before the
existing atomic RPC runs. RL-02: reads are owner-scoped by verified JWT and RLS; inaccessible rows map
to `403`, not an empty durable-state claim.

Rollback is `git revert a442eba` (or the PR merge revert). It removes the password/session route surface
without altering accepted Trips, audit rows, RLS policies or migrations. Re-run the checks above and the
same actor matrix after any rollback.
