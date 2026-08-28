# V4-16 unrun evidence

- Local Supabase is not running, so the `user_profiles` migration, owner-RLS
  read/write isolation and authenticated save/reload path have not run against
  a local database.
- No authenticated browser runtime with a configured local Supabase project is
  available, so interactive persistence/reload evidence is unrun. The UI does
  not claim that this verification occurred.

Rollback: revert the V4-16 route and workspace before deployment. Once the
migration has been applied, repair owned Profile data forward rather than
dropping user profiles.
