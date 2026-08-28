# V4-08 unrun checks

- Local Supabase is not running, so the migration and authenticated RLS integration probe was skipped by `pnpm test:integration`.
- No production migration, account, provider, model, Trip write, or external service was invoked.
- Assistive-technology and physical-device interaction validation remain outside this local automated run.

Rollback: before a migration is applied, revert the V4-08 commit. After application, use a reviewed forward migration; do not drop user thread state.
