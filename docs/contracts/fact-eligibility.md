# AI-11 Fact Eligibility

Only a `reviewed`, unexpired, licence-allowed Fact is eligible for retrieval, Chat, Canvas, Explore, or SEO. Candidate, draft, deprecated, expired, and licence-blocked records fail closed. This pure contract creates no Fact rows, projection, RAG index, or public content. Later database/RLS consumers must enforce the same predicate.
