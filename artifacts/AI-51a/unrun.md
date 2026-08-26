# AI-51a unrun checks

- Production same-browser Magic Link callback, authenticated owner Trip read/confirm/reload and
  other-user denial are pending deployment of this fix. #120 and #84 remain open until observed.
- No Supabase config push, Auth template change, custom SMTP test, migration, RLS/RPC change, service
  credential, admin user creation or anonymous durable identity is used.
- Email security clients may prefetch or consume one-time links. A failed/expired link remains an honest
  callback failure and requires a fresh controlled attempt; it is never treated as a session success.
- `artifacts/AI-51a/commands.jsonl` is local and git-ignored under the accepted artifact policy.
