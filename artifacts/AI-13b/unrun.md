# AI-13b unrun checks

No required local engineering check is unrun.

- The first local revision integration run exposed a parent `superseded` lifecycle state absent from the
  existing owner update policy. The migration now permits `superseded` only for the same authenticated
  owner and the reset local integration matrix passes. This was a reproduced/fixed RLS contract gap,
  not a relaxed cross-user policy.
- Remote migration application, Preview session verification and Canvas UI evidence remain pending this
  PR's CI/Preview and downstream #15 acceptance; no remote schema change has been applied from this branch.
- Remote migration-state reads were attempted twice on 2026-08-27 without a password or connection
  string. The default resolver returned `LegacyDbConnectError: Connection terminated unexpectedly`; the
  HTTPS resolver returned `LegacyDbConnectError` because no valid database IP could be resolved. This
  is an external connectivity blocker for remote rehearsal, not evidence that the migration is applied.
