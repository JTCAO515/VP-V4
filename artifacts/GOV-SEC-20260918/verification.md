# GOV-SEC-20260918: RPC/RLS ACL audit and one ACL fix

Scope: independent read-only audit of the full effective grant/RLS state produced by
replaying all 65 pre-existing `supabase/migrations/*.sql` files in order into a fresh,
disposable native PostgreSQL 16 instance (Homebrew, `LC_ALL=C`), bootstrapped with the
repo's own `tests/integration/turn/fixtures/durable-work-schema.sql` fixture (creates
`anon`/`authenticated`/`service_role` and a minimal `auth.users`/`auth.sessions`/`auth.uid`/
`auth.jwt` fixture, matching how `tests/integration/knowledge/wiki-draft.test.mjs` bootstraps
its own native-PostgreSQL runs). No remote/Staging/Production database was touched; no
provider or paid call was made.

## Method

1. `initdb` a disposable cluster, start it on a local Unix socket, `LC_ALL=C`.
2. Apply the durable-work-schema fixture, then `create schema extensions; create extension
   pgcrypto with schema extensions;` (mirrors the existing test harness).
3. Apply all files under `supabase/migrations/` in filename-sorted order inside a loop that
   stops on the first failing statement. All 65 pre-existing migrations applied cleanly.
4. Query the resulting catalog directly (`pg_proc`, `pg_class`, `pg_policy`,
   `has_function_privilege`, `has_table_privilege`) for the *actual effective* state, rather
   than reading GRANT/REVOKE statements textually (257 GRANT/REVOKE statements across 65
   files accumulate; only the final catalog state is ground truth).

## Findings

### Confirmed sound (no action needed)

- **RLS coverage**: 30 of 31 tables in `public` have `relrowsecurity = true`. The one
  exception, `v4_migration_baseline`, has zero grants to `anon`/`authenticated` and zero
  rows of application data (it is a migration marker table), so the gap is inert.
- **`anon` has zero direct table privileges** on every `public` table (verified via
  `has_table_privilege('anon', ..., 'SELECT'|'INSERT')` = false across all 31 tables). All
  anonymous-reachable functionality is intentionally routed through `research_intake_v1`
  (the public research-intake form, VPJ-62), which is itself `SECURITY DEFINER` with
  `search_path` pinned.
- **No `search_path` hijack risk**: all 45 `SECURITY DEFINER` functions reachable by `anon`
  or `authenticated` have an explicit `search_path` pin in `pg_proc.proconfig`. 0/45 were
  missing one.
- **API surface is correctly scoped at the platform level**: `supabase/config.toml` exposes
  only `schemas = ["public", "graphql_public"]` to PostgREST. `private`,
  `identity_private`, `knowledge_review_private`, `ops_budget_private`, etc. are not
  reachable through the Data API regardless of role grants; the `auto_expose_new_tables`
  legacy-autoexpose flag is left unset, i.e. new `public` objects are NOT auto-exposed by
  default (current Supabase CLI default).
- **`identity_private.mobile_access_v2()` used in the `native_mobile_access_v2` RLS policy
  on `trips`/`chat_threads`/`user_profiles` was checked for a permissive-policy bypass risk**
  (a function with no row-column reference, returning `true` in the common no-mobile-replacement
  case, combined via OR with ownership policies, would be a cross-tenant read/write bypass).
  Confirmed via `pg_policy.polpermissive = false`: this policy is RESTRICTIVE, not PERMISSIVE,
  so it narrows access (AND-combined) rather than broadening it. No bypass exists.
- **Historical fix confirmed still effective**: `20260917062305_revoke_unreviewed_mobile_guard_rpc_acl.sql`
  (`append_chat_turn_event`, `capture_initial_trip_version`) — re-queried post-replay:
  `anon`/`authenticated` EXECUTE is false on both, `service_role` EXECUTE is true on the
  worker-only one, exactly as that migration's own assertion requires.

### New finding, fixed this round

- **`private.ai10_confirm_fault_trigger()`** (added by
  `20260825161535_ai10_confirm_fault_triggers.sql`, 2026-08-25) is an `AFTER` trigger fired
  on every write to `trips`, `trip_events`, `trip_proposals`, `trip_idempotency`, and
  `trip_audit_events`. It raises `AI10_FAULT_<table>` only when the session GUC
  `app.ai10_fault_at` equals the firing table's name — a manual fault-injection hook. Unlike
  every other function touched by later migrations, it never had `PUBLIC`/`anon`/
  `authenticated` `EXECUTE` explicitly revoked, so it still carried the Postgres default
  grant. Real-world exploitability was already close to nil (not `SECURITY DEFINER`; not in
  an API-exposed schema per `supabase/config.toml`; a direct `SELECT
  private.ai10_confirm_fault_trigger()` call fails with Postgres's own "trigger functions
  can only be called as triggers" error) — this is a hygiene/consistency fix, not an active
  vulnerability.
- A repo-wide search (`grep -rn "ai10_fault_at" lib/ tests/ scripts/`) found **zero**
  references to the activation GUC anywhere in current application code, tests, or scripts —
  this hook is not exercised by anything currently in the repository. Recorded here for the
  maintainers' own judgment on whether to keep, gate, or remove it; this PR only closes the
  ACL gap and does not delete or otherwise change the trigger's behavior.
- Fix: `20260918032847_revoke_ai10_fault_trigger_public_acl.sql` — `revoke all ... from
  public, anon, authenticated`, followed by an assertion block in the same style as the
  2026-09-17 fix (`raise exception 'AI10_FAULT_TRIGGER_ACL_NOT_REVOKED'` if the revoke did
  not take effect).

## Verification of the fix itself

All performed against the disposable local instance with all 66 migrations (65 existing +
this one) applied in order:

- `has_function_privilege('anon', 'private.ai10_confirm_fault_trigger()'::regprocedure, 'EXECUTE')`
  → `false`; same for `authenticated` → `false`.
- Functional regression check: inserted a real row into `public.trips` after the fix —
  ordinary INSERT/UPDATE traffic is unaffected (trigger no-ops when
  `app.ai10_fault_at` is unset, exactly as before).
- Functional preservation check: `set app.ai10_fault_at = 'trips';` in the same session,
  then `update public.trips set title=... where owner_id=...` → raised
  `AI10_FAULT_trips` as designed. This confirms revoking `EXECUTE` does **not** disable the
  trigger — Postgres fires trigger functions independent of the DML caller's `EXECUTE`
  privilege on the function, so the harness hook (if ever wired up) keeps working for
  whoever runs it with superuser/service-role access to `SET` that GUC; only the unused
  direct-call surface is closed.

## Not covered by this round

- No Staging/Production database was touched; this migration has not been applied anywhere
  outside the disposable local instance described above.
- This audit did not attempt a full manual read of all 257 GRANT/REVOKE statements'
  intent — it relied on final-state catalog queries, which is a stronger method for "what is
  true now" but does not itself explain the history of every intermediate migration.
- Whether `private.ai10_confirm_fault_trigger` / `app.ai10_fault_at` should be kept, gated
  behind an explicit environment check, or removed as dead code is left to the maintainers;
  no functional or deletion decision was made here.
