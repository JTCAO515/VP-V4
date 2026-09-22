# VPJ-70 frozen review connection — 2026-09-22

Related to #267; preparation increment on `codex/vpj70-paired-eval`, base `d2d1406`.
Scope: three new files under `evals/harness/pairing/`, module documentation, this evidence directory.
No runtime, endpoint, ledger, shared handoff, database, simulator or holdout changes.

## Observed result

The existing VPJ-72 validator/rubric/blind mapping is consumed by a frozen input/authority/
version/budget/threshold contract. The JSON and Markdown here come from one report:
one public H01 synthetic development task, English/Chinese variants, three deterministic
repeats per lane, six pairs. One candidate output is deliberately changed to unavailable;
that pair and the overall candidate are rejected. Five other pairs do not compensate for it.
These are NOT real provider samples. No feedback was supplied for this recorded example;
human semantic dimensions, human calibration, actual latency, usage/cost and live pairing
remain UNRUN/unknown. The parent Chinese producer and all Staging rows retain NOT_RUN.

The source commit identifies the base; the frozen hash additionally binds the working-tree
implementation and rubric. This locally generated fixture demonstrates tool behavior, not
independently timestamped pre-registration or approved real task execution. Other tests use
explicit fixture annotations to prove non-regression/minimum thresholds and preserve their source.

## Checks

- PASS: focused frozen review tests 7/7, zero skips, including CLI fresh-output refusal,
  JSON/Markdown agreement, input/authority/threshold drift and isolated negative controls.
  Final rerun after test-only TypeScript fixes: 7/7.
- PASS: full unit 117/117, zero skips.
- PASS: full evals 42/42, zero skips; subsequent stricter three-repeat/closed-field validation
  covered by the final focused 7/7. Generated unrelated historical artifacts restored.
- PASS: final `pnpm typecheck`, `pnpm lint`, `pnpm docs:check`, `git diff --check`.
- FAIL (initial, retained): full contract 582/587, zero skips. Five failures in unchanged
  `tests/contract/ops/wiki-request.test.mjs` and `provenance-request.test.mjs`: authentication
  503 instead of 401; RPC error mapping 503 instead of 403 (read and withdraw); malformed body
  OPS_UNAVAILABLE instead of INVALID_INPUT; elapsed deadline check exceeded 500ms (721ms).
  Both files use a 25ms request lifetime. Heavy concurrent host load is a plausible cause,
  not yet established by this local run. No test deadline or expectation was modified.
- UNRUN/incomplete: same full contract suite rerun with `--test-concurrency=1` was interrupted
  by normal SIGTERM at Overall's explicit resource-coordination request. Only this task's
  confirmed runner PID 73647 and child PID 74735 were stopped. No new heavy local runs.
- Initial typecheck caught two readonly assignments in new tests; both were corrected using
  immutable replacement, and final typecheck passed. This did not alter runtime behavior.
- Required remote CI is recorded on the PR; local incomplete contract evidence is not a waiver.

## Remaining acceptance and rollback

Real approved read-only task, provider/usage receipts, live cost/latency thresholds and budget
window, additional risks/holdout, genuine positive/negative human calibration and disagreement
analysis remain UNRUN. No candidate adoption, auto-release or #267 closure. Provider calls in
this increment: zero; offline caps are zero, not a claim that historical provider usage was free.

Revert only this tooling/documentation increment; keep existing baseline, VPJ-72 reports and
runtime unchanged. Overall owns merge and shared status updates.

Workflow timing: implementation and local verification performed in this session; user acceptance
UNRUN. Rework: two test typing fixes; verification waiting/interruption due shared host contention.
No numerical start-to-user-acceptance claim is made.
