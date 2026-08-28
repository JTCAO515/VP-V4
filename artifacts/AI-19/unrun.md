# AI-19 unrun checks

- Root-local `pnpm check` ran successfully in this worktree. The older isolated-worktree-only TypeScript limitation no longer describes the current verification and is not relied on.
- `pnpm db:verify` and `pnpm test:integration` ran, but every database connection probe is unconfigured and eight unrelated local-Supabase integration cases were skipped because local Supabase is not running. No database connection, migration, extension, RLS policy or query was attempted.
- No browser, provider, embedding/rerank, vector index, production qrel, latency/cost, account, region/retention or external-rights check applies to this pure C0 contract.

Residual risk: caller-supplied fixture ranks do not prove actual lexical/vector recall, RRF gain, embedding compatibility, filtered ANN recall, database authorization or provider behavior.

Rollback: revert the isolated module, tests, qrels, contract, plan and evidence. No schema, durable data, provider configuration, account or external state was created.
