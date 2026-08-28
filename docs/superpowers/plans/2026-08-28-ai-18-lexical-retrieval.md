# AI-18 lexical retrieval execution plan

Goal: establish a fixture-only five-locale lexical baseline with exact aliases, explicit transliterations, one-character typo matching, deterministic MRR/nDCG/no-answer reporting, and fail-closed malformed input handling.

Scope: `lib/server/knowledge/retrieval/lexical/**`, `evals/qrels/**`, and the expanded AI-18 evidence/handoff paths. Anti-goals: no real corpus, database, PostgreSQL extension, vector/provider route, persistence, user data, or public search claim.

Acceptance: five locales and closed query modes are reported; unmatched queries remain empty; malformed records throw; nDCG is discounted cumulative gain; `pnpm check`, `pnpm evals`, documentation/JSON/diff checks, independent review, and fast-forward merge pass. Rollback removes only this isolated fixture baseline.
