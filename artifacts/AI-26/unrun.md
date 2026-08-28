# AI-26 unrun checks

- `pnpm db:verify` and `pnpm test:integration` ran, but all database probes are unconfigured and eight separate local-Supabase integration cases were skipped. No Supabase Queue/pgmq, worker host, Function poll/push transport, external queue, durable lease, RLS/runtime, credential, staging, Production, feature flag, crash-process, browser or observation-window proof was run: this Issue implements only a process-local C0 contract.
- No separate Ops replay deployment or account was accessed. The replay input is an opaque fixture identity, not a credential or authorization claim.
