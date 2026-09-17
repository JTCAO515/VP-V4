# VPJ-04 mobile-guard fresh-bootstrap ACL repair

Date: 2026-09-17. This maintenance repair was found while rerunning the completed
VPJ-05 local native/Web same-Trip integration with the installed Supabase CLI 2.117.0.

## Defect

Fresh migration replay stopped in `20260909223841_vpj_04_native_mobile_sessions.sql`
with `Unreviewed definer RPC inventory`. A database replay through the migration directly
before that guard proved two public `SECURITY DEFINER` functions had direct `anon` and
`authenticated` execute ACLs but were not mobile RPCs in its 15-function review list:

- `public.append_chat_turn_event(uuid,text,text,text)` — intended service-role writer.
- `public.capture_initial_trip_version()` — trigger implementation.

The first function was therefore unexpectedly Data API callable. The second did not
need a Data API grant. The guard correctly refused to proceed, but no later append-only
migration could repair a bootstrap that could not reach it.

## Repair

The source baseline now explicitly revokes `public`, `anon`, and `authenticated` execute
from both functions before its guard inventory runs; only `service_role` is regranted for
the worker writer. The new append-only migration
`20260917062305_revoke_unreviewed_mobile_guard_rpc_acl.sql` applies the same ACL correction
to already-created databases and asserts the forbidden grants remain absent. No user table,
RLS policy, function signature, business logic, migration history, remote database or
credential changed.

The historical-source correction is intentional and narrowly necessary: it allows a fresh
database to reach the append-only migration. Existing databases receive their state change
only from the new migration.

## Observed verification

- CLI binary: `2.117.0`, found in the pnpm global store. Its path was missing from shell
  PATH; the test used that already-installed binary directly and made no shell change.
- Fresh disposable Supabase stack: all migrations, including the repaired guard and new ACL
  migration, applied successfully. Its SQL assertion verified `anon`/`authenticated` cannot
  execute either function and `service_role` retains the worker writer.
- `node tests/integration/identity/run-native-io.mjs --same-trip`: PASS 1/1. It starts and
  stops its own disposable Auth/PostgreSQL/Next stack, creates synthetic ordinary users,
  verifies native/Web one UUID plus CAS/Proposal/Confirm behavior, exercises browser zh/en
  at 1280×800 and 390×844, and removes its synthetic users.
- Full repository commands: `pnpm check`, `test:unit`, `test:contract`, `test:integration`,
  `test:security`, `test:e2e`, `evals`, `check:flags`, `check:assets`, `docs:check`, and
  `git diff --check` passed. Generic integration and security retain their normal
  environment-gated skips; the explicit same-Trip run above is zero-skip.

No remote `supabase db push`, migration repair, production action, provider call or real-user
data was used. The local `migration list --local` command was attempted after its disposable
stack was stopped and reported connection refused; it is not a failure of the replay above.
