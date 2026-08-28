# V4-02 ContextPlan ablation report

## Fixture boundary

`context-fixtures.json` uses only synthetic actor and source identifiers. It contains no production Trip, Memory, Evidence, Tool payload, session, credential, personal data, or provider output.

## Required comparison

The evaluator compares a full-history fixture with a compacted-thread fixture. Both must render the identical `constraints` section from the same source version; compactable thread narration may differ. The current fixture keeps the current user message in the final stable section.

## Leak matrix

| Candidate | Expected result |
| --- | --- |
| Other actor Memory | omit: actor mismatch |
| Draft Memory | omit: ineligible state |
| Expired Evidence | omit: ineligible state |
| Prohibited Evidence | omit: ineligible state |
| Raw Tool payload | omit: model-safe projection required |

The evaluator treats a prohibited source reference in the manifest as a failure. The manifest intentionally retains only selected source references, source versions, count statistics, category-only omission reasons, and content fingerprints.

## Scope limits

This is a deterministic contract/eval baseline. It does not measure model quality, provider latency, cache hit rate, production retrieval, or real user context. Those measurements remain unavailable until their owning runtime modules and observation environment exist.
