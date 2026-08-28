# AI-13b unrun checks

No required local engineering check is unrun.

- The first local revision integration run exposed a parent `superseded` lifecycle state absent from the
  existing owner update policy. The migration now permits `superseded` only for the same authenticated
  owner and the reset local integration matrix passes. This was a reproduced/fixed RLS contract gap,
  not a relaxed cross-user policy.
- Remote migration application is complete: `20260827030717_ai13b_proposal_revision_lineage.sql`
  was pushed with `--skip-vault`, then appeared in remote migration history. Read-only schema checks
  confirmed `parent_proposal_id`, `revise_trip_proposal` as `SECURITY INVOKER`, and the owner update
  policy. No seed, role, Vault or other configuration update ran.
- The operator completed the Preview owner/other-user child-revision matrix on 2026-08-27: other-user
  revision was denied, the owner read the parent, created a durable child revision, confirmed that exact
  child and reloaded the updated Trip/audit state. No credential or private identifier is retained.
  Downstream Canvas UI/browser evidence remains #15 ownership; this backend PR makes no Canvas or
  production product claim.
- Remote migration-state reads were attempted twice on 2026-08-27 without a password or connection
  string. The default resolver returned `LegacyDbConnectError: Connection terminated unexpectedly`; the
  HTTPS resolver returned `LegacyDbConnectError` because no valid database IP could be resolved. This
  is an external connectivity blocker for remote rehearsal, not evidence that the migration is applied.
- A Management API read via `supabase db query --linked` subsequently reached the remote migration
  history and confirmed its head was `20260825161535`, before this migration. After the operator restored
  the CLI network path, `supabase db push --linked --skip-vault` applied the one dry-run-listed migration
  and a follow-up migration list confirmed the new head. No ad-hoc Management API write was used.
- Read-only remote advisors reported pre-existing warnings for `private.ai10_confirm_fault_trigger`
  search path, public `rls_auto_enable()` security-definer execution, and leaked-password protection.
  This PR does not create or modify those objects; the warnings need separate security ownership.
