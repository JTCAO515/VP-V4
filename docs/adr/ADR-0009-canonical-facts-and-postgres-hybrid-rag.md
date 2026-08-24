# ADR-0009: Canonical Facts and Postgres hybrid RAG

Status: accepted on 2026-08-24 through explicit operator delegation.

## Decision

Canonical POI and reviewed/current Fact are the only shared truth for Chat, Canvas, Explore, and SEO. Import is candidate-first. Retrieval starts with Postgres exact identity, aliases, `pg_trgm`/FTS, multilingual vector retrieval, RRF, and evaluated reranking; no second vector database is introduced initially.

## Consequences

- Candidate, draft, expired, or licence-blocked records are private and ineligible.
- Retrieval Unit and Explore Projection are rebuildable read models, not truth.
- AI-11, AI-18 through AI-24 own each later contract and implementation seam.

## Rollback

Disable a projection/index and fall back to exact reviewed lookup or truthful unavailable behavior.
