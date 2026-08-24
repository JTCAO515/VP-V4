# AI-07a unrun and scaffold boundary

## Commands that ran as scaffolds

- `pnpm evals` runs a real Node test runner that verifies the empty eval directory layout. AI-42 owns corpus, qrels, blind holdout, human rubric, and RL-01 through RL-09 suite content; no quality score or red-line claim is produced here.
- `pnpm db:verify` verifies only that no Supabase baseline is configured. AI-08 owns actual connection and migration verification; no database connection is attempted here.
- `pnpm test:e2e` verifies the end-to-end suite command boundary only. The owning product Issues add browser scenarios.

## Not run

- Provider conformance, paid model calls, real database, queue, storage, browser/device flows, and external data: outside AI-07a scope and blocked by their owning Issues and policy gates.

## Evidence artifact rule

`artifacts/AI-07a/commands.jsonl` is intentionally ignored by Git. It records local command execution without secrets; this Markdown summary is tracked for PR review.
