# VPJ-70 offline pairing verification

Related to #267. Baseline `080d5f0aa2a1e8976d9dc75b8c22207801d87fc4`.
Worktree `/Users/jtcao/Documents/VP-V4-Harness-Pairing`, branch
`codex/vpj-70-offline-pairing`. The independently prepared #193 changes were not included in
this base; no shared gateway, seed, scenario, prompt or contract changed here.

## Implemented and observed

- Public H01 seed reuse; exact clock/input/grader-source hash and version pairing, unique repeats.
- Deterministic checks separate from required-claim/fixed-oracle rubric, no weighted aggregate.
- Baseline-only and unchanged synthetic pairs: evidence_insufficient.
- Unsupported-claim and over-refusal candidates: reject. A single injected hard failure or
  quality regression among successful repeats is rejected by the behavioral tests.
- Missing/duplicated assertion evidence remains NOT_RUN. Unrun Chinese slots stay in the
  report denominator; other risk categories and every Staging slot stay NOT_RUN.
- JSON and Markdown derive from the same reports, with one independent development case,
  12 unique English fixture runs across four configurations and a shared baseline explicitly
  reused between comparisons. No real model runs, statistical or financial claim.

## Actual checks

- Full unit: 45/45 PASS, zero skips (`unit.log`).
- Full contract: 163/163 PASS, zero skips (`contract.log`).
- Full evals: 24/24 PASS, zero skips (`evals.log`). Generated VPJ-66 results restored.
- `pnpm check`: lint/typecheck/build/static 22/22 PASS (`check.log`).
- Final pairing suite after the metadata/count refinement: 10/10 PASS, zero skips
  (`pairing-final.log`); final lint/typecheck PASS (`lint-final.log`, `typecheck-final.log`).
- Final docs and staged diff checks are recorded in `commands.jsonl`.

Build progress-line whitespace and the final typecheck log blank line were normalized after
the staged whitespace check; the repeated diff check passed.
`results.json` / `summary.md` retain per-run deterministic and quality verdicts, language/risk
slices, unknown usage/cost and unavailable prerequisites. Grader/input source hashes and
working-tree sourceState prevent the base commit from masquerading as final-code evidence.

See [scope/rubric](../../docs/benchmarks/vpj-70/offline-pairing.md) and
[unrun.md](unrun.md). Parent #267 OPEN; independent review and required CI pending. No push,
PR, merge, live-provider execution or shared handoff update was performed by this agent.
