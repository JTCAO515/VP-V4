# AI-18 unrun checks

- No PostgreSQL, `pg_trgm`, native FTS, PGroonga, vector, RRF, reranker, provider, network, account, credential, environment value, or production qrel was used.
- No Fact eligibility database join, RLS path, user data, persistence, Trip/Fact write, browser surface, or public capability route applies to this fixture-only evaluator.
- `jq` is unavailable locally; Node JSON parsing will be used for the handoff check.

Residual risk: synthetic aliases do not prove real Chinese/Arabic segmentation, transliteration coverage, typo recall, corpus licensing, ranking quality, latency, or no-answer behavior on production data.

Rollback: remove the AI-18 lexical module, qrels fixtures, contract, and evidence. No durable or external state was created.
