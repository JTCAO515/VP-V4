# VPJ-43 Production separation preparation — 2026-09-26

Scope: [execution package](../../docs/runbooks/vpj-43-production-separation.md), based on remote main `cfaa5b187df4f361f94f92637e0a205041ddd023`. The first deliverable is a reviewable operational sequence; no account, database, Vercel, ECS, DNS, key or user-data write was made.

## Source observations

| Item | Result |
| --- | --- |
| GitHub #243 | **PASS** read-only: OPEN; first slice is a reviewed independent Production configuration/migration/rollback package, operator-controlled actual deployment. |
| Repo migration files | **PASS** source inventory: 76 SQL files at the base SHA. This is a file count, not a target migration list or successful fresh bootstrap. |
| Existing shared boundary | **PASS** historical source review: `docs/runbooks/staging-vercel-maintenance.md` and `docs/program/2026-09-05/CURRENT-STATUS-2026-09-24.md` identify shared `dzqdzetcctkhbrhlxxgn`; 2026-09-25 worker review records disabled switch and expired consent. **UNRUN** fresh project/alias/UI readback: the current Vercel metadata script failed closed. |
| Shared migration readback | **UNRUN**: `supabase migration list --linked --project-ref dzqdzetcctkhbrhlxxgn --output-format json` reached the direct DB host then failed with `LegacyDbConnectError / Connection terminated unexpectedly`. No pooler credential was requested or exposed; no write attempted. |
| Shared migration aggregate follow-up | **PASS, limited read-only observation by main coordination on 2026-09-26**: `supabase db query --linked --project-ref dzqdzetcctkhbrhlxxgn --output-format json 'select count(*)::integer as migration_count, max(version) as latest_migration from supabase_migrations.schema_migrations'` returned count `75`, latest `20260923140000` using CLI 2.117.0. Repo has 76 files; these two aggregates do not establish a complete ordered diff, data state, recovery or any new Production project. The failed direct-host `migration list` above remains UNRUN. |
| Native and worker Production paths | **PASS** source inspection: `ios/VisePanda/VisePanda/App/NativeSession.swift`, `lib/server/identity/native-config.ts`, `lib/server/turn/native-http.ts`, `lib/server/jobs/hosted-text-worker.ts` are restricted to local/Staging or pin the Staging database. Production activation remains a code/validation gate. |
| Backup behavior | **PASS** source/document review: [Supabase database backups](https://supabase.com/docs/guides/platform/backups) exclude Storage objects and require custom-role password reset after restore; repository AI-49 runbook requires separate restore, roll-forward, compensation and deletion checks. **UNRUN** selected Production plan, backup and real recovery. |

## Validation

- **PASS** `pnpm docs:check`: VPJ plan and documentation baseline passed. First sandbox attempt was **UNRUN** because package-manager registry signature verification could not reach npm; the same check succeeded when network access was granted, without changing code or dependencies.
- **PASS** `git diff --check` for tracked files. For both new files, `git diff --no-index --check /dev/null <file>` emitted no whitespace diagnostics; its exit 1 denotes the expected file difference.
- **PASS** source/links reviewed against the named files and the current Issue execution row.
- **UNRUN** local database rehearsal: no selected target plan/region, classified data disposition or frozen new project exists. Any later run records its own result; this file does not assert Production acceptance.

## Next boundary

Main coordination task owns any approval request. Operator first selects exact new project/account, region/plan/backup and data-disposition path; development separately adds Production-native and worker guards before their flags can be enabled. No Production target currently exists in the evidence of this preparation task.

## Server-side Production native guard slice

Base `1923c2161592aeae348c08cfa929c8aabc4658e8`. Repository-only default-off identity/Trip/Ask target selection; no Production project, key, Vercel variable, worker, deployment, user record or alias was changed. iOS Production build target and #195 worker binding remain separate work.

| Check | Result |
| --- | --- |
| Exact target and consumer matrix | **PASS** synthetic tests/source audit: Production requires `VERCEL_ENV=production`, a selected production domain, explicit ref other than shared Staging, exact Supabase URL and public origin, protocol and capability flags. Only native Auth v2, native Trip v2 and Ask call the explicit Production surfaces. Existing knowledge, readiness, places, notifications, memory, privacy, service cases and Web TripCanvas callers retain the two-argument config call and stay closed. Translation is separately denied in Production. |
| Identity/Trip/Ask security | **PASS** 29/29 targeted native configuration, HTTP, Auth issuer/claim and translation contract tests on final source. Stale captured Production identity config is denied after rollback flag change; two-argument legacy consumers return null in Production. |
| Knowledge flag separation | **PASS** Production selects only `KNOWLEDGE_PRODUCTION_READ`; local/Staging flags do not open it, and its config consumer is not yet Production-enabled. No target HTTP observation. |
| Type, lint, docs, build | **PASS** on final source: direct TypeScript, source lint, docs check, `git diff --check` and Next 16.3.6 webpack build. |
| Full security suite | **INCOMPLETE on main coordination's unrestricted run before final callsite audit**: `pnpm test:security` exited 0 with 176 tests, 175 pass, 0 fail, 1 skip (AI-14 needs an unconfigured disposable identity Supabase target). Required CI must rerun the final SHA. My restricted sandbox run had 170 pass, 5 loopback `listen EPERM 127.0.0.1` failures and 1 skip; no check was waived. Logs remain local under `/private/tmp/`, not copied into Git. |
| Real Production target | **UNRUN**: no selected new project ref, key-to-project readback, approved Vercel Production config, exact-domain deployment, user consent/budget, iOS build or worker. Opaque publishable keys cannot be matched to a project from syntax alone. |

Callsite audit at this SHA: six `app/api/auth/native/v2/*/route.ts` files pass `identity`; `lib/server/trip/native-http.ts` passes `trip`; `lib/server/turn/native-http.ts` passes `text`. The two knowledge native routes, four places native routes, `lib/server/readiness/http.ts`, `lib/server/notifications/native-http.ts`, `lib/server/memory/native-http.ts`, `lib/server/privacy/trip-deletion-http.ts`, `lib/server/service-cases/http.ts`, and `app/visepanda/trips/[tripId]/page.tsx` still call without the Production surface and therefore receive `null`. `lib/server/media-translation/text/http.ts` wraps the Ask handler but explicitly denies Production before delegation. Knowledge/readiness no longer interpret Production as local. A later edit adding a Production surface to any closed caller requires its own capability review and tests.

All new flags are default-off. Disable `VISEPANDA_NATIVE_PRODUCTION` first to reject new requests, then capability flags; preserve authenticated sessions and user data for a reviewed continuity decision. Reverting this code slice removes the new server target without schema/data rollback. Before enablement, verify the new project's key/issuer and deployed build in the target environment, finish the Production iOS destination and independent worker, and run owner/other/anonymous plus prior-Staging-token negative probes. #243 remains OPEN.
