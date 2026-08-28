# AI-42 C0 corpus contract

`ai-42-corpus.ts` is a deterministic coverage contract, not a content corpus or retrieval benchmark.
It emits only synthetic, opaque fixture identifiers for the frozen five locales, six execution
moments, five query modes and three risk strata. It contains no user text, POI facts, external
source, model output, provider call or quality score.

## Version and split

- corpus version: `ai-42-c0-synthetic-v1`
- tuning set: 450 synthetic metadata fixtures
- blind holdout: 450 separately named synthetic metadata fixtures
- split rule: a holdout ID must never be present in tuning; the runner fails closed on overlap,
  duplicate IDs, unknown dimensions or incomplete coverage.

The C0 split proves only evaluator wiring and stratification. It must not tune a production prompt,
be presented as retrieval quality, or be used to satisfy a reviewed/licensed qrels requirement.

## Human rubric template (operator-owned)

For an approved, licensed future corpus, two independent reviewers must score each holdout record
without seeing model/provider identity or tuning outcomes. Record locale, execution moment, query
mode, risk stratum, relevance/no-evidence decision, safety outcome, evidence correctness, reviewer
IDs, disagreement reason and adjudication. High-risk disagreements require a second reviewer and
an explicit adjudication; no average may hide a high-risk failure. Do not place reviewer identities,
user data or source text in this repository.

## Quality metrics

The C0 report intentionally returns `qualityMetrics: null`. Per-locale metrics, the worst locale
slice, confidence intervals and a human-reviewed release decision require the operator-provided
licensed corpus described above.
