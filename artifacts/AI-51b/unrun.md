# AI-51b unrun checks

- A valid application password has not been provisioned or entered by Codex. Real sign-in, owner
  read/confirm/reload, other-user denial and sign-out-to-401 remain pending Preview deployment and an
  operator-controlled credential entry.
- Password recovery, public signup, invite, social login and MFA are intentionally unavailable in this
  closed-beta slice; each requires a separate accepted contract.
- No service/admin key, Auth admin API, manual `auth.users` SQL, migration, RLS/RPC change, Supabase
  template/config push or application-layer owner simulation is used.
- `artifacts/AI-51b/commands.jsonl` remains local and git-ignored by the accepted artifact policy.
- The deployed Preview at `2026-08-26T07:17Z` stayed on “Checking session…” without rendering a form
  at 1280×800. This exposed an unhandled `getClaims()` rejection path. The follow-up commit catches it;
  its GitHub deterministic gate and Vercel Preview passed. Post-fix Preview QA observed the signed-in
  state at 1280×800 and 390×844 Arabic RTL with no console warning/error or horizontal overflow.
- Browser safety policy prohibits entering any operator-controlled password. Consequently, a genuine
  password session, owner read/confirm/reload, other-user denial and sign-out-to-401 still require a
  pre-provisioned account and an operator-controlled credential entry after the post-fix Preview is ready.
