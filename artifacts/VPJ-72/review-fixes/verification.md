# VPJ-72 independent-review fixes

Fixes the two Important findings against `4df1bf52f40fffc1575b3bcce49146186d19e42a`.
No sample, oracle, rubric score/anchor, 2,000,000-byte input ceiling, 8,000-character field
ceiling or 200-feedback ceiling was changed to make the counterexamples pass.

## Parent lineage

Changing every parent row and supplied sample to H02 while retaining the frozen H01 basis now
rejects with PAIRING_LINEAGE_MISMATCH. All imported rows bind case/mode/risk to the basis and
preserve the current paired-v1 row grid: 2 lanes × en/zh × repeats 1–3. Duplicate/missing/out-of-range
repeat tuples, inconsistent per-lane configurations, duplicate/missing English run IDs and
invented Chinese runs reject. Legitimate opaque run IDs remain accepted: the existing source
contract does not require run IDs to encode case names.

## Read/write state limit

The CLI now uses one 2,000,000-byte constant for JSON input and persisted state. It serializes
and byte-checks the complete prospective state before any directory creation/file replacement;
overflow returns STATE_FILE_LIMIT without truncating reasons or dropping previous feedback.

The regression uses the reviewer's original construction: two separate legal 20-feedback batches,
each reason `Permitted anchored explanation. ` repeated 190 times (6,080 characters). Both batch
files remain below 2MB; the first import succeeds. The second exceeds the accumulated state limit
and is rejected. Every existing review file is byte-identical afterward, and a later small
21st record can still be imported. The accepted state therefore remains readable by the CLI.

## Evidence

Before the fixes, all three new negative regressions failed as expected (lineage and cumulative
state overflow were accepted). After the fixes, affected unit/contract tests passed 18/18.
Final complete checks:

- pnpm test:unit: 60/60 PASS, zero skips (`unit.log`).
- pnpm test:contract: 191/191 PASS, zero skips (`contract.log`).
- pnpm evals: 25/25 PASS, zero skips (`evals.log`).
- pnpm check: lint/typecheck/build and static 22/22 PASS (`check.log`).
- docs/diff checks recorded in the main VPJ-72 command ledger and `docs.log`.

Generated random-order VPJ-72 artifacts were restored to the previously committed review package;
new-code qualityReport reproduced its existing results exactly, retaining all 20 fixture records.
VPJ-66/70 generated results were restored too. Only validation, tests, usage notes and this fix
evidence change. No provider, key, user data, DB, shared status document, PR or merge action.
Real provider pairing, human calibration and adoption remain UNRUN. Exact-HEAD re-review and
required CI remain with root.
