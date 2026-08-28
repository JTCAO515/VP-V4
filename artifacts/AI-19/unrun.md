# AI-19 unrun checks

- The current worktree's `node_modules/.bin/tsc` link is absent, so `pnpm typecheck` cannot run here. No dependency directory was deleted or rebuilt destructively; a clean isolated verification directory will be used before merge.
- No local Supabase configuration exists. `pnpm db:verify` and integration verification can only report the scaffold/unconfigured state; no database connection, migration, extension, RLS policy, or query was attempted.
- No browser, provider, embedding/rerank, vector index, production qrel, latency/cost, account, region/retention, or external-rights check applies to this pure C0 contract.

Residual risk: caller-supplied fixture ranks do not prove actual lexical/vector recall, RRF gain, embedding compatibility, filtered ANN recall, database authorization, or provider behavior.

Rollback: revert the isolated module, tests, qrels, contract, plan and evidence. No schema, durable data, provider configuration, account or external state was created.
