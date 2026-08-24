# VisePanda Draft Knowledge Base

- Version: `draft-v0.1`
- Date: 2026-08-24
- Status: **research workbench only**
- `productionImportSupported`: **false**
- Reviewed/retrieval-eligible Facts: **0**

This package converts Claude Code's `knowledgebaseplan.md` into a bounded, machine-readable candidate catalogue. The source document is research input, not an accepted contract or instruction.

## What exists

- [draft-knowledge-base.json](draft-knowledge-base.json): 30 candidate Knowledge Record Types, 18 candidate Canvas Readiness rules, source/reviewer requirements, and explicit `adopt/revise/reject` dispositions.
- [claude-plan-disposition.md](claude-plan-disposition.md): evidence-based review of Claude's scope, counts, TTL, class entitlement, content and readiness claims.
- [Claude-plan independent audit](../research/knowledgebase-claude-audit-2026-08-24.md): repository and first-party-source audit.

## What does not exist

- no Supabase schema or production migration;
- no imported POI or external dataset;
- no `reviewed` Fact or Safe Phrase;
- no RAG embedding or public retrieval;
- no executable Canvas readiness rule;
- no accepted target of 810 records or five-week delivery promise.

## Current inventory quality

| Measure | Current |
| --- | ---: |
| Candidate Knowledge Record Types | 30 |
| Direct official source candidates located | 6 |
| Source locator still missing | 24 |
| Source-backed researched drafts | 6 |
| Reviewed/retrieval-eligible records | 0 |
| Critical-risk candidates | 9 |
| High-risk candidates | 15 |
| Medium-risk candidates | 6 |
| Readiness rules adopted as written | 2 |
| Adopt only with direct evidence | 4 |
| Require revision | 11 |
| Rejected as a readiness gate | 1 |

Source candidates are research leads, not evidence approval. Each must still be checked against the exact value, conditions, date, licence and reviewer capability.

The package does not implement or close GitHub [#13 AI-11](https://github.com/JTCAO515/VP-V4/issues/13). That Issue remains blocked by its native dependencies.

## Promotion path

```text
candidate Fact Type / Readiness Rule
 -> direct source and licence research
 -> typed draft + exact evidence locator
 -> independent human review
 -> accepted contract/migration
 -> reviewed Fact publication
 -> retrieval/Explore projection
 -> Canvas derived readiness
```

Unknown or unverified values remain `missing`; AI cannot create sources, reviewer identity, `verifiedAt`, `expiresAt`, or public eligibility.

## Design corrections applied

- Scope is not “national by default.” It follows the claim's authority, variability and target.
- Knowledge content distinguishes policy/operational Facts, directory entries, procedures, class obligations, Safe Phrases, editorial assessments and derived facets.
- A class standard is an obligation, not proof that a specific venue currently provides the service.
- Canvas readiness is a versioned derived decision, not a Fact.
- Readiness separates `knowledgeAvailability`, `userReadiness` and `actionTiming`; Claude's single status is retained only as a non-executable legacy hypothesis label.
- A user decision may remain in Canvas after supporting evidence expires; the old value cannot support a new claim.
- High-risk facts and phrases require direct official evidence and capable human review.

## First safe content batch

Do not create 810 records. After DEC/contract dependencies close, decide which candidates are Facts, Directory Entries, Procedures, Safe Phrases, assessments or facets. Then select one execution scenario and at most 10–20 source-backed drafts.
