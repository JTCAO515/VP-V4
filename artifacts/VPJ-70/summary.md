# VPJ-70 preparation summary

One independent development case; 12 unique deterministic fixture runs across four configurations. Baseline rows are reused across reports and must not be counted again. Real model runs: 0; usage/cost unknown.

## baselineOnly

# VPJ-70 offline read-only pairing

Decision: evidence_insufficient. Mode: fixture / baseline_only. Final acceptance: NOT_RUN.

Independent development cases: 1; synthetic repeats/configuration: 3; fixture runs: 3; failures: 0; NOT_RUN: 3.
Three deterministic repeats are not real model samples or statistical evidence. Usage and cost remain unknown.

| Lane | Language | Risk | Planned | PASS | FAIL | NOT_RUN | Unknown cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | en | normal | 3 | 3 | 0 | 0 | 3 |
| baseline | zh | normal | 3 | 0 | 0 | 3 | 3 |

| Lane | Language | Repeat | Red-line assertions | Quality rubric | Verdict |
| --- | --- | --- | --- | --- | --- |
| baseline | en | 1 | PASS | PASS | PASS |
| baseline | en | 2 | PASS | PASS | PASS |
| baseline | en | 3 | PASS | PASS | PASS |
| baseline | zh | 1 | NOT_RUN | NOT_RUN | NOT_RUN |
| baseline | zh | 2 | NOT_RUN | NOT_RUN | NOT_RUN |
| baseline | zh | 3 | NOT_RUN | NOT_RUN | NOT_RUN |

Reasons: BASELINE_ONLY, REAL_READONLY_CHAIN_UNRUN, PRODUCT_THRESHOLDS_NOT_FROZEN, BUDGET_PERMISSION_UNVERIFIED, HUMAN_CALIBRATION_UNRUN.

Only H01 English is connected. Chinese, other risk categories, holdout, live Staging and human calibration remain NOT_RUN. No production configuration changes or adoption are authorized by this report.

## unchanged

# VPJ-70 offline read-only pairing

Decision: evidence_insufficient. Mode: fixture / paired. Final acceptance: NOT_RUN.

Independent development cases: 1; synthetic repeats/configuration: 3; fixture runs: 6; failures: 0; NOT_RUN: 6.
Three deterministic repeats are not real model samples or statistical evidence. Usage and cost remain unknown.

| Lane | Language | Risk | Planned | PASS | FAIL | NOT_RUN | Unknown cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | en | normal | 3 | 3 | 0 | 0 | 3 |
| candidate | en | normal | 3 | 3 | 0 | 0 | 3 |
| baseline | zh | normal | 3 | 0 | 0 | 3 | 3 |
| candidate | zh | normal | 3 | 0 | 0 | 3 | 3 |

| Lane | Language | Repeat | Red-line assertions | Quality rubric | Verdict |
| --- | --- | --- | --- | --- | --- |
| baseline | en | 1 | PASS | PASS | PASS |
| baseline | en | 2 | PASS | PASS | PASS |
| baseline | en | 3 | PASS | PASS | PASS |
| baseline | zh | 1 | NOT_RUN | NOT_RUN | NOT_RUN |
| baseline | zh | 2 | NOT_RUN | NOT_RUN | NOT_RUN |
| baseline | zh | 3 | NOT_RUN | NOT_RUN | NOT_RUN |
| candidate | en | 1 | PASS | PASS | PASS |
| candidate | en | 2 | PASS | PASS | PASS |
| candidate | en | 3 | PASS | PASS | PASS |
| candidate | zh | 1 | NOT_RUN | NOT_RUN | NOT_RUN |
| candidate | zh | 2 | NOT_RUN | NOT_RUN | NOT_RUN |
| candidate | zh | 3 | NOT_RUN | NOT_RUN | NOT_RUN |

Reasons: REAL_READONLY_CHAIN_UNRUN, PRODUCT_THRESHOLDS_NOT_FROZEN, BUDGET_PERMISSION_UNVERIFIED, HUMAN_CALIBRATION_UNRUN.

Only H01 English is connected. Chinese, other risk categories, holdout, live Staging and human calibration remain NOT_RUN. No production configuration changes or adoption are authorized by this report.

## unsupported

# VPJ-70 offline read-only pairing

Decision: reject. Mode: fixture / paired. Final acceptance: NOT_RUN.

Independent development cases: 1; synthetic repeats/configuration: 3; fixture runs: 6; failures: 3; NOT_RUN: 6.
Three deterministic repeats are not real model samples or statistical evidence. Usage and cost remain unknown.

| Lane | Language | Risk | Planned | PASS | FAIL | NOT_RUN | Unknown cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | en | normal | 3 | 3 | 0 | 0 | 3 |
| candidate | en | normal | 3 | 0 | 3 | 0 | 3 |
| baseline | zh | normal | 3 | 0 | 0 | 3 | 3 |
| candidate | zh | normal | 3 | 0 | 0 | 3 | 3 |

| Lane | Language | Repeat | Red-line assertions | Quality rubric | Verdict |
| --- | --- | --- | --- | --- | --- |
| baseline | en | 1 | PASS | PASS | PASS |
| baseline | en | 2 | PASS | PASS | PASS |
| baseline | en | 3 | PASS | PASS | PASS |
| baseline | zh | 1 | NOT_RUN | NOT_RUN | NOT_RUN |
| baseline | zh | 2 | NOT_RUN | NOT_RUN | NOT_RUN |
| baseline | zh | 3 | NOT_RUN | NOT_RUN | NOT_RUN |
| candidate | en | 1 | PASS | FAIL | FAIL |
| candidate | en | 2 | PASS | FAIL | FAIL |
| candidate | en | 3 | PASS | FAIL | FAIL |
| candidate | zh | 1 | NOT_RUN | NOT_RUN | NOT_RUN |
| candidate | zh | 2 | NOT_RUN | NOT_RUN | NOT_RUN |
| candidate | zh | 3 | NOT_RUN | NOT_RUN | NOT_RUN |

Reasons: CANDIDATE_REDLINE_OR_REQUIRED_QUALITY_FAILURE, REAL_READONLY_CHAIN_UNRUN, PRODUCT_THRESHOLDS_NOT_FROZEN, BUDGET_PERMISSION_UNVERIFIED, HUMAN_CALIBRATION_UNRUN.

Only H01 English is connected. Chinese, other risk categories, holdout, live Staging and human calibration remain NOT_RUN. No production configuration changes or adoption are authorized by this report.

## refusal

# VPJ-70 offline read-only pairing

Decision: reject. Mode: fixture / paired. Final acceptance: NOT_RUN.

Independent development cases: 1; synthetic repeats/configuration: 3; fixture runs: 6; failures: 3; NOT_RUN: 6.
Three deterministic repeats are not real model samples or statistical evidence. Usage and cost remain unknown.

| Lane | Language | Risk | Planned | PASS | FAIL | NOT_RUN | Unknown cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | en | normal | 3 | 3 | 0 | 0 | 3 |
| candidate | en | normal | 3 | 0 | 3 | 0 | 3 |
| baseline | zh | normal | 3 | 0 | 0 | 3 | 3 |
| candidate | zh | normal | 3 | 0 | 0 | 3 | 3 |

| Lane | Language | Repeat | Red-line assertions | Quality rubric | Verdict |
| --- | --- | --- | --- | --- | --- |
| baseline | en | 1 | PASS | PASS | PASS |
| baseline | en | 2 | PASS | PASS | PASS |
| baseline | en | 3 | PASS | PASS | PASS |
| baseline | zh | 1 | NOT_RUN | NOT_RUN | NOT_RUN |
| baseline | zh | 2 | NOT_RUN | NOT_RUN | NOT_RUN |
| baseline | zh | 3 | NOT_RUN | NOT_RUN | NOT_RUN |
| candidate | en | 1 | PASS | FAIL | FAIL |
| candidate | en | 2 | PASS | FAIL | FAIL |
| candidate | en | 3 | PASS | FAIL | FAIL |
| candidate | zh | 1 | NOT_RUN | NOT_RUN | NOT_RUN |
| candidate | zh | 2 | NOT_RUN | NOT_RUN | NOT_RUN |
| candidate | zh | 3 | NOT_RUN | NOT_RUN | NOT_RUN |

Reasons: CANDIDATE_REDLINE_OR_REQUIRED_QUALITY_FAILURE, REAL_READONLY_CHAIN_UNRUN, PRODUCT_THRESHOLDS_NOT_FROZEN, BUDGET_PERMISSION_UNVERIFIED, HUMAN_CALIBRATION_UNRUN.

Only H01 English is connected. Chinese, other risk categories, holdout, live Staging and human calibration remain NOT_RUN. No production configuration changes or adoption are authorized by this report.
