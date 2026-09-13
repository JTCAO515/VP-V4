# VPJ-67 recorded usage trace preparation

Related to #264. This is an offline trace consistency tool, with two historical Staging
recordings from PR #352. It does not execute or accept the full Harness.

Both recordings passed the closed-schema reporter. Each contains one settled attempt,
with matching owner, ServiceTask, Turn relation, policy, budget scope, currency, provider,
model, price version, reservation and validated usage receipt. Runtime source is
`d15baf7a94a4740e6c2a801bb5bd2d58e3fd3059`; prompt is `vp-knowledge-intent-v3`.
English recorded tariff is 6972 CNY micros; Chinese is 6978. Supplier fee remains unknown.
These are historical ledger values, not invoices or customer charges.

The collection at 2026-09-13T04:39:40Z selected actual persisted associations read-only
and paired them with the existing worker journals identified in `collection.json`.
No new model calls, database writes, reader enablement, identity or policy changes occurred.
Input files contain only allowlisted synthetic identifiers and metadata; no user text or secrets.
`manifest.json` binds the committed input/report bytes. It does not authenticate provenance.

The supplemental historical Trip audit compared all original columns and row digests of ten
Trip tables before PR352 migration/44 calls and after cleanup. All matched. This observation
is specific to that window; the offline reporter still marks Trip invariance NOT_CHECKED.
Original UI/evaluation/cleanup evidence remains in
[PR352 verification](../../VPJ-16/payment-ask-20260913/verification.md).

Validation: six executable contract/CLI tests passed (including identity/ledger swaps,
missing usage and associations, unknown currency, extra fields and private error containment).
Typecheck, lint, docs check and diff check passed. Independent data-integrity review found
zero critical or important findings after fixing ledger metadata and relation comparisons.
CI for this change is pending. Product builds, native and browser checks are not locally
repeated because this slice changes only an offline evaluator and documentation.

Reproduce from repository root:

```sh
node --experimental-strip-types --test tests/contract/harness/recorded/usage-trace.test.ts
node --experimental-strip-types scripts/harness-recorded-usage.mjs artifacts/VPJ-67/recorded-usage-20260913/en-input.json
node --experimental-strip-types scripts/harness-recorded-usage.mjs artifacts/VPJ-67/recorded-usage-20260913/zh-input.json
```

UNRUN: current authorization, independent origin authentication, complete attempt-set proof,
actual source/claim grading, the complete named read-only cases, provider-outage and document
injection cases, and native/Web consumer acceptance for #264. Original fixture results remain
fixture. Full acceptance remains NOT_RUN and #264 stays open.

Rollback: revert this offline tool, its tests and documentation; no runtime, database or
provider configuration changes are needed. The small scripts/ CLI entry is adjacent to the
allowed evals/harness implementation so operators can validate recordings without credentials.
