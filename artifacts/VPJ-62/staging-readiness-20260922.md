# Research intake Staging readiness — 2026-09-22

Related to #202 and #246. Read-only checks; no schema, feature flag, participant
record, deployment or external message was changed.

## Observed

The connected Supabase app listed only VP-Final-V2; it was not used as a substitute.
The existing CLI session listed the correct `VP - V4` Staging project
`dzqdzetcctkhbrhlxxgn`, Singapore (`ap-southeast-1`), `ACTIVE_HEALTHY`.

Executed through Management API in a read-only transaction:

```sql
begin transaction read only;
select
  exists(select 1 from supabase_migrations.schema_migrations
         where version='20260917140000') as intake_migration_applied,
  to_regnamespace('research_intake_private') is not null as intake_schema_exists,
  to_regprocedure('public.research_intake_v1(jsonb)') is not null as intake_rpc_exists;
rollback;
```

Result: **false / false / false**. No participant records or secrets were read.
The current Staging cannot yet supply the first-party intake RPC. The existing
local real-DB acceptance in [verification.md](verification.md) remains valid for
its stated version/environment; it is not hosted activation evidence.

An in-app browser attempt to read `https://staging.go2china.space/research?lang=en`
timed out in navigation and state inspection. A separate HTTPS GET failed with
`SSL_ERROR_SYSCALL` before any HTTP response (HTTP000). This is an inconclusive
hosted-page check, not proof of site downtime or a successful application.

## Prepared next action requiring schema authorization

Apply only the existing [intake migration](../../../supabase/migrations/20260917140000_vpj_62_research_intake.sql)
to the exact Staging project above, through the repository migration workflow
with migration-history recording. Do not bulk-push other pending migrations.

SHA-256: `256d042da73874d8b990be903e9a6f94e2c57366925bc52eb094859bf0a8290a`.

It creates four private tables and two explicitly granted RPCs, defaults intake
to disabled, and does not alter Auth, Trip or knowledge tables. Before execution,
recheck the exact target, migration absence, reviewed hash and affected-schema
backup. After execution verify migration history, disabled settings, RLS/private
ACLs and anonymous RPC denial while disabled. Then run bounded synthetic
apply/replay/withdraw checks with an isolated transactional enable that rolls back;
retain only sanitized outcomes and confirm disabled/empty state afterward.

This approval scope does **not** include public activation or real participant
collection. Those require the deployed route/flag and an actual organizer contact,
designated operator, region/retention record and browser apply/withdraw observation
under [the intake runbook](../../../docs/operations/research-intake.md).

The repository's supplied AGENTS.md requires confirmation before an unauthorized
schema/permission change. Existing authorization for older migrations does not
identify this new intake schema. The migration was not applied in this task.

Rollback before commit is transactional. After migration, leave intake disabled
and preserve any later receipt fences; do not drop participant data or restore
withdrawn consent as a routine rollback.
