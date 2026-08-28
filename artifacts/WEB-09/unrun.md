# WEB-09 unrun checks

- `pnpm check`, `pnpm test:security`, `pnpm test:e2e`, and `pnpm docs:check` passed locally. The security suite skipped only its existing local-Supabase RLS probe because that runtime is not running.
- Consumer integration is intentionally unrun: #143 owns only `lib/navigation/**` and cross-surface tests. Homepage, Auth, and Product callsites stay with #141, #142, and #92 respectively.
- Preview/Production observation remains operator-owned. The context is memory-only and performs no navigation or session mutation itself.
