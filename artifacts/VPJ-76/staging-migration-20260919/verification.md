# #360 Staging migration verification — 2026-09-19

The pinned `VP - V4` Staging project now has the two merged #360 migrations:
`20260915190000_vpj_76_360_grounded_ai_assist_context.sql` and
`20260915200000_vpj_76_360_grounded_ai_assist_jobs.sql`. They were part of
the exact 11-file transaction described in
`artifacts/VPJ-75/staging-migration-20260919/verification.md`.

Real remote readback shows migration history at 61, the
`public.grounded_ai_assist_work_v1(jsonb)` RPC present, and the private
`turn_private.grounded_ai_assist_jobs` table RLS-enabled with no direct
`anon`/`authenticated` SELECT. The RPC denies `anon` execution. The original
3 Trip rows and their full-row digest remain unchanged.

The encrypted backup was restored into an isolated PostgreSQL 17 database
before migration, and the exact package had a real Staging rollback rehearsal.
No Web or iOS Ask call, EvidencePack, owner-isolation runtime check, history
reload, or rollback of a published result has been observed yet. #360 remains
open.
