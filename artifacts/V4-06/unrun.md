# V4-06 unrun evidence

- Local Supabase is not configured or running, so owner/cross-owner RLS probes, expired-session
  recovery against a real session, and durable Trip/Turn/Profile write-denial probes are unrun.
- No password, cookie, JWT, user ID, or service credential was read or used. A prior operator-only
  Preview matrix is preserved in `artifacts/AI-51b/`; it is historical context, not a replacement
  for a new authenticated runtime probe.
- Password recovery, public signup, invitations, social login, MFA, Auth configuration changes and
  Production cutover remain outside this closed-beta Issue.
- Roll back source behavior with a normal Git revert. Do not restore retired Magic Link routes without
  a separate accepted contract; no migration or user-data rollback is involved.
