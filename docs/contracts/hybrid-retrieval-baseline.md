# AI-19 hybrid retrieval baseline

Status: implemented as a pure C0 contract only. It is not a database query, embedding generator,
vector index, reranker, public route, or production RAG capability.

## Boundary

`buildHybridEvidencePack` accepts caller-supplied opaque unit IDs and lexical/vector rank positions.
Each unit contains one existing `FactEligibility`; the function invokes `isEligibleFact` with the
closed `now` input before it can use any hit. Candidate, draft, deprecated, expired and
licence-blocked Facts therefore produce no evidence. Unknown hit IDs are discarded and cannot fill
a no-answer; duplicate IDs or hits, malformed objects/ranks, invalid timestamps, profile changes,
or content-bearing input keys throw before a result is produced.

The contract accepts no fact text, prompt, user data, raw embedding, similarity score, source URL,
provider result, claim, or mutable state. Its output is either `no_eligible_evidence` or opaque
retrieval-unit/target/Fact IDs with ranks and a reproducible RRF score. It cannot answer a question,
create a GroundedClaim, write a Trip/Fact/permission, or persist/log a query.

## Ordering

1. Eligible exact lexical hits appear first, ascending by lexical rank then ASCII unit ID.
2. Other eligible hits are fused with `1 / (rrfK + lexicalRank)` plus
   `1 / (rrfK + vectorRank)` when each rank exists.
3. Equal fused scores sort by ASCII unit ID. If no eligible hit remains, output is exactly
   `no_eligible_evidence`.

`EmbeddingProfileV1` is an immutable descriptor of `modelId`, `region`, `dimensions` and
`indexVersion`; its text values are bounded opaque identifiers (`[A-Za-z0-9._-]`), and timestamps
must be valid timezone-qualified RFC3339 values. It validates compatibility only. It neither
selects a provider nor activates an embedding model, region, index or feature flag.

## Security and maturity

RL-02 is covered by six denied fixtures: candidate, draft, deprecated, expired,
licence-blocked and unknown-ID. The runtime invariant is eligibility before rank association;
there is no fallback that can fill a no-answer from a nearest ineligible unit. RL-05 is bounded to
opaque evidence IDs only: no citation or GroundedClaim is produced until its owning Issue exists.

Functional, interface, security and observability evidence is automated through closed fixtures.
Data, performance, UX and compliance are not applicable to this in-memory contract; production
database queries, vector recall/latency, browser behavior, provider region/retention, real qrels,
and external rights remain unrun. The Knowledge owner re-audits the baseline at the next retrieval
adapter Issue; any live adapter requires a separate accepted schema/API/permission contract.

## Rollback

Revert the isolated module, fixtures, contract and evidence. No migration, schema, index, account,
external state, provider configuration or user data exists to roll back.
