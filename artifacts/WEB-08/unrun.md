# WEB-08 unrun checks

- `pnpm test:security` completed with 11 passing tests. `AI-14 owner RLS and fault rollback hold on a running local Supabase` was skipped because local Supabase was not running. No local database was started and no RLS/security bypass was attempted.
- `artifacts/WEB-08/commands.jsonl` is intentionally not versioned: repository `.gitignore` excludes non-Markdown artifact payloads. Command outcomes are recorded here and in `HANDOFF.md` instead.

Rollback is a normal revert of the WEB-08 UI commit. The change adds no migration, credential, API, session-policy or data write.
