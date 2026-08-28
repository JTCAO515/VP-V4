# V4-13 unrun evidence

- Local Supabase is not running or configured, so this branch did not apply the V4-13 migration or
  execute owner/cross-owner RPC and RLS integration probes. `pnpm db:verify` reports that condition
  without attempting a production connection.
- No Copilot/UI, provider inference, Chat/Canvas impact receipt, privacy erasure, performance or
  production observation exists in V4-13. Those boundaries remain owned by V4-14, V4-15 and V4-17.
- Rollback before an environment applies the migration is a normal revert. After an environment
  applies it, use a forward repair migration; do not drop user-owned memory or receipt history.
