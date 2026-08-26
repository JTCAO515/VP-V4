# AI-51b unrun checks

- A valid application password has not been provisioned or entered by Codex. Real sign-in, owner
  read/confirm/reload, other-user denial and sign-out-to-401 remain pending Preview deployment and an
  operator-controlled credential entry.
- Password recovery, public signup, invite, social login and MFA are intentionally unavailable in this
  closed-beta slice; each requires a separate accepted contract.
- No service/admin key, Auth admin API, manual `auth.users` SQL, migration, RLS/RPC change, Supabase
  template/config push or application-layer owner simulation is used.
- `artifacts/AI-51b/commands.jsonl` remains local and git-ignored by the accepted artifact policy.
- Desktop 1280×800 and 390×844 Arabic RTL rendered checks passed before the final credential-state
  simplification. The Browser safety policy then blocked another local password-field interaction, so
  the final password-clear behavior is verified by source/security/E2E tests and still requires Preview
  interaction with an operator-controlled credential.
