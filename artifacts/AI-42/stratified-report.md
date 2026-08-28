# AI-42 C0 stratified report

Corpus version: `ai-42-c0-synthetic-v1`.

| Split | Fixtures | Coverage | Quality metrics |
| --- | ---: | --- | --- |
| Tuning | 450 | 5 locales × 6 execution moments × 5 query modes × 3 risk strata | Not measured |
| Blind holdout | 450 | Same complete matrix, with a disjoint ID namespace | Not measured |

The fixture identifiers are synthetic C0 metadata only. They contain no user text, source text,
retrieval result, provider result or quality label. Consequently this report makes no claim about
MRR, nDCG, recall, safety rate, city coverage, user outcome or model quality. The worst-locale
metric is intentionally unavailable until a licensed, human-reviewed corpus exists.

The executable coverage test rejects duplicate or overlapping split IDs, unsupported strata and
incomplete matrices. It records only the evaluator-contract result.
