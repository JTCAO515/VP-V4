# V4-17 unrun evidence

- Local Supabase is not running, so the migration, owner/RLS and cross-owner
  runtime probes were not executed.
- No accepted export/delivery, deletion or backup-retention executor exists.
  V4-17 records only a `requested` receipt and must not be treated as proof of
  export, erasure, provider deletion or backup expiry.
- No browser Privacy surface is introduced: the scoped deliverable is the
  authenticated API request/receipt boundary, not a completion claim.

Rollback: revert the V4-17 code, migration preparation, documentation and
artifacts. No existing user data requires repair.
