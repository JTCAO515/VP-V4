# V4-14 unrun checks

- Local Supabase migration/RLS integration was not run because the local Supabase runtime is not
  running. The integration suite therefore skipped all eight existing probes.
- No authenticated browser persistence/reload trace was run because there is no local Supabase
  runtime with an owner session.
- No current verified Turn/Proposal coordinator writes V4-15 consumer receipts. The UI can display
  existing recorded impacts, but a populated runtime impact trace remains unrun.
