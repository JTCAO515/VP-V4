# AI-18 lexical retrieval fixture baseline

## Boundary

AI-18 provides a deterministic, in-memory lexical evaluator for synthetic C0 qrels only. It has no database, PostgreSQL FTS, `pg_trgm`, PGroonga, vector index, provider, network, persistence, user data, Fact/Trip write, or public retrieval route. It is a benchmark harness, not evidence of real five-language product retrieval.

The corpus accepts only bounded IDs plus explicit aliases and optional explicit transliterations. It does not infer names or transliterations. Qrels are closed to `zh`, `en`, `es`, `ru`, and `ar` and to the five frozen query modes. Invalid/empty corpus rows, duplicate IDs, unknown locales/modes, or malformed qrels throw before any metrics are produced.

## Fixture report

| Locale | Queries | MRR | nDCG | No-answer precision | Covered fixture |
| --- | ---: | ---: | ---: | ---: | --- |
| zh | 2 | 1.0 | 1.0 | 1.0 | exact alias; absent ambiguous query |
| en | 1 | 1.0 | 1.0 | 1.0 | explicit transliteration |
| es | 1 | 1.0 | 1.0 | 1.0 | single-character typo |
| ru | 1 | 1.0 | 1.0 | 1.0 | exact alias |
| ar | 1 | 1.0 | 1.0 | 1.0 | exact alias |

The separate lower-ranked-alias fixture produces MRR `0.5` and nDCG `1 / log2(3)`, proving the evaluator uses discounted cumulative gain rather than treating nDCG as reciprocal rank. A no-answer is correct only when the ranked result set is empty; it can never be filled with a nearest unrelated alias.

## Deferred work and rollback

This baseline does not choose a tokenizer or enable `pg_trgm`, native FTS, PGroonga, vector/RRF, reranking, database eligibility joins, or live quality thresholds. Those require their own owner modules, real reviewed/licensed qrels, and policy/region acceptance. Remove the lexical module, qrels fixture, this contract, and AI-18 evidence to roll back; no durable or external state exists.
