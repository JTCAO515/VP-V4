# V4-09 unrun checks

- Local Supabase is not running, so live migration/RLS integration is not executed.
- No model, external provider, Trip write, account change or deployment was invoked.

Rollback: revert before migration application; after application, use a reviewed forward migration rather than deleting feedback records.
