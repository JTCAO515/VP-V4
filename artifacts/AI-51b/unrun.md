# AI-51b unrun checks

- The operator completed a real Preview password sign-in and, on 2026-08-27, confirmed that the same
  browser returned `403 FORBIDDEN` for an inaccessible Trip while authenticated and `401
  UNAUTHENTICATED` for that Trip after sign-out. Codex previously observed the signed-in state and the
  sign-out form transition without console warning/error. No credential or private response was copied
  into this artifact.
- Password recovery, public signup, invite, social login and MFA are intentionally unavailable in this
  closed-beta slice; each requires a separate accepted contract.
- No service/admin key, Auth admin API, manual `auth.users` SQL, migration, RLS/RPC change, Supabase
  template/config push or application-layer owner simulation is used.
- `artifacts/AI-51b/commands.jsonl` remains local and git-ignored by the accepted artifact policy.
- The deployed Preview at `2026-08-26T07:17Z` stayed on “Checking session…” without rendering a form
  at 1280×800. This exposed an unhandled `getClaims()` rejection path. The follow-up commit catches it;
  its GitHub deterministic gate and Vercel Preview passed. Post-fix Preview QA observed the signed-in
  state at 1280×800 and 390×844 Arabic RTL with no console warning/error or horizontal overflow.
- Browser safety policy prohibits entering any operator-controlled password. Consequently, owner
  read/confirm/reload and other-user denial still require separate #84 authenticated route evidence.
  Browser automation blocks direct navigation to `/api/trips/*` with `net::ERR_BLOCKED_BY_CLIENT`; it
  must not be substituted with a copied Cookie or token. An anonymous remote curl probe returned `401
  UNAUTHENTICATED`; the retired Magic Link initiation and callback routes returned `404`.
- PR #123 was rebased onto `origin/main` at `ec0faa8` after the visual-identity merge. The rebased
  Preview rendered the signed-out form at 1280×800 and 390×844 Arabic RTL with no console warning/error
  or horizontal overflow. This is UI/Preview evidence only; it does not replace the missing authenticated
  Trip API and owner/other-user RLS evidence.
