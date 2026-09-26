# VPJ-43 Production separation preparation — 2026-09-26

Scope: [execution package](../../docs/runbooks/vpj-43-production-separation.md), based on remote main `cfaa5b187df4f361f94f92637e0a205041ddd023`. The first deliverable is a reviewable operational sequence; no account, database, Vercel, ECS, DNS, key or user-data write was made.

## Source observations

| Item | Result |
| --- | --- |
| GitHub #243 | **PASS** read-only: OPEN; first slice is a reviewed independent Production configuration/migration/rollback package, operator-controlled actual deployment. |
| Repo migration files | **PASS** source inventory: 76 SQL files at the base SHA. This is a file count, not a target migration list or successful fresh bootstrap. |
| Existing shared boundary | **PASS** historical source review: `docs/runbooks/staging-vercel-maintenance.md` and `docs/program/2026-09-05/CURRENT-STATUS-2026-09-24.md` identify shared `dzqdzetcctkhbrhlxxgn`; 2026-09-25 worker review records disabled switch and expired consent. **UNRUN** fresh project/alias/UI readback: the current Vercel metadata script failed closed. |
| Shared migration readback | **UNRUN**: `supabase migration list --linked --project-ref dzqdzetcctkhbrhlxxgn --output-format json` reached the direct DB host then failed with `LegacyDbConnectError / Connection terminated unexpectedly`. No pooler credential was requested or exposed; no write attempted. |
| Native and worker Production paths | **PASS** source inspection: `ios/VisePanda/VisePanda/App/NativeSession.swift`, `lib/server/identity/native-config.ts`, `lib/server/turn/native-http.ts`, `lib/server/jobs/hosted-text-worker.ts` are restricted to local/Staging or pin the Staging database. Production activation remains a code/validation gate. |
| Backup behavior | **PASS** source/document review: [Supabase database backups](https://supabase.com/docs/guides/platform/backups) exclude Storage objects and require custom-role password reset after restore; repository AI-49 runbook requires separate restore, roll-forward, compensation and deletion checks. **UNRUN** selected Production plan, backup and real recovery. |

## Validation

- **PASS** `pnpm docs:check`: VPJ plan and documentation baseline passed. First sandbox attempt was **UNRUN** because package-manager registry signature verification could not reach npm; the same check succeeded when network access was granted, without changing code or dependencies.
- **PASS** `git diff --check` for tracked files. For both new files, `git diff --no-index --check /dev/null <file>` emitted no whitespace diagnostics; its exit 1 denotes the expected file difference.
- **PASS** source/links reviewed against the named files and the current Issue execution row.
- **UNRUN** local database rehearsal: no selected target plan/region, classified data disposition or frozen new project exists. Any later run records its own result; this file does not assert Production acceptance.

## Next boundary

Main coordination task owns any approval request. Operator first selects exact new project/account, region/plan/backup and data-disposition path; development separately adds Production-native and worker guards before their flags can be enabled. No Production target currently exists in the evidence of this preparation task.
