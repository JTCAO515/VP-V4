# R3 two-city Content, Explore, and SEO acceptance audit

Issue: AI-29/#31. Audit target: `main@7c69820`.

This is an engineering-evidence audit, not a content publication or beta release approval. Its
verdict is intentionally `blocked`: no reviewed, licensed, current, public projection exists for
either an ordinary city or a curated city.

## Scope and traceability

The claimed user journey is candidate → review → eligible projection → Explore → exact-ID Ask/Add.
The repository proves only isolated, fixture-level parts of that chain:

| Boundary | Current evidence | What it does not establish |
| --- | --- | --- |
| Candidate/review | Private C0 import/review contracts | A source-rights-cleared city batch or public Canonical POI |
| Eligibility/retrieval | hybrid retrieval filters caller-supplied reviewed, unexpired, licence-allowed fixtures before deterministic ordering | A database-backed, city-scoped authoritative projection |
| Explore | three localized routes render the unavailable workspace and reject fetch, API, seeds, inputs, maps, Ask, and Add | A city page, category/facet/ranking, POI detail, SEO document, or public content |
| Ask/Add | exact UUID handoff is navigation-only, rejects malformed scope and produces no Trip write | An eligible Explore consumer, immutable Proposal creation, or owner-session Canvas recheck |

The hybrid fixture names `poi-a` and `poi-b`; they are not city content. No test, source record,
or runtime route identifies a normal or curated city, and no geographic, rights, freshness, or SEO
claim is inferred from those fixtures.

## Eight dimensions

| Dimension | Result | Evidence / gap |
| --- | --- | --- |
| Functional | blocked | unavailable Explore is deliberate; no two-city candidate-to-Ask/Add journey can be completed |
| Interface | degraded | exact-ID input and private canonical/user place identities are contract-tested; no projection-to-consumer interface exists |
| Data | blocked | no approved source provenance, reviewed public Canonical POI, Fact freshness receipt, or authoritative eligibility view for either city |
| Security | degraded | fixture contracts deny malformed scope and private candidate rendering; owner/other-user public-projection RLS runtime is unrun |
| Performance | blocked | no projection queue lag, content index, SEO crawl, or city query latency exists |
| UX | degraded | five-locale/RTL unavailable routes are tested; no content card/detail, browser owner journey, or city-specific accessibility evidence exists |
| Observable | blocked | no queue/projection freshness observation, ranking log, search-console signal, or release observation window exists |
| Compliance | blocked | no source licence, public-display right, city content approval, or index/noindex publication decision exists |

## Red-line evidence

| Suite | Fixture count | Runtime invariant | Result and limit |
| --- | ---: | --- | --- |
| RL-08 | 1 Explore source-boundary test | public Explore has no Candidate/Draft/seed/API path; unavailable is rendered instead | 0/1 observed public-leak paths in the static source test; it does not prove RLS or a future projection |
| RL-09 | 1 canonical-place contract plus 1 exact-ID handoff contract | a recheck-required canonical reference retains its opaque ID; handoff retains only a valid UUID and never creates a Trip write | 0/2 violated fixture invariants; it does not prove Fact-level expiry at a public render |

`tests/e2e/explore/ai-27-explore-unavailable.test.mjs` is the RL-08 source-boundary evidence.
`tests/contract/trip/v4-11-place-reference.test.ts` and
`tests/contract/explore/exact-id-handoff.test.ts` provide the two bounded RL-09-adjacent
identity/freshness checks. They do not convert a fixture into a public POI or an accepted content
batch.

## Command evidence and unrun work

The command ledger is `artifacts/AI-29/commands.jsonl`. It records the final repository checks
used for this audit. The complete external/runtime gaps are in `artifacts/AI-29/unrun.md`.

No content, SEO page, canonical POI, Fact, Candidate, Proposal, Trip, provider request, database
row, map state, account, or deployment was created by this audit.

## Observation window, rollback, and verdict

Before a future R3 acceptance can be `accepted`, an authorized owner must provide two bounded city
batches (one ordinary and one curated), immutable source/provenance and rights evidence, review and
eligibility outcomes, queue/projection freshness, owner/other-user RLS tests, exact-ID Proposal and
Canvas recheck traces, five-locale/RTL browser evidence, and an explicit SEO/noindex decision.
Measure projection lag, unavailable/correction rate, and content freshness in a named observation
window with a rollback owner.

Rollback is `git revert` of this audit and its evidence only. There is no runtime or data state to
undo.

**Verdict: `blocked`.** Current repository checks demonstrate truthful unavailable behavior and
small fixture contracts, not a two-city Content, Explore, SEO, or Ask/Add beta.
