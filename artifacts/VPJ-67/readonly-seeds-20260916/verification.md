# VPJ-67 H04 offline seed verification

Related to #264. VPJ-67's directly listed blockers (VPJ-66 #263, VPJ-16 #206) are both closed
(PR271; PR416 merged 2026-09-16), so the `status:blocked` label on #264 was stale and has been
removed. This is offline preparation, not a claim that the full real read-only Ask acceptance
(the deeper VPJ-07/#195 identity/provider/budget chain, tracked in
docs/harness/IMPLEMENTATION-STATUS.md) is complete.

## What changed

- `evals/harness/cases.ts`: H04 (ambiguity, development group, owner VPJ-67) marked `seed: true`.
- `evals/harness/seeds.ts`: added `runAmbiguitySeed`, reusing the real production pure function
  `prepareGroundedExecution` (`lib/server/knowledge/claim/grounded-execution.ts`) exactly as H01
  already does -- no new fake adapter, no model call, no credentials needed.
- `evals/harness/harness.evals.test.ts`: baseline wiring changed from a positional array
  (`baseline[index]`) to a case-ID-keyed map (`seedRunners`), so future scenarios can be added
  without renumbering H01/H02. Added the H04 baseline run and one fault-injection mutation
  (`single_candidate_assumed`) that must be detected as FAIL.
- `docs/harness/VPJ-67-READONLY-SEEDS.md`: records which VPJ-67-owned scenario was connected
  (H04) and, explicitly, why H03/H07/H08/H12 were not (holdout-invariant question, no partial-
  answer production seam, and no provider credentials available in this environment respectively).
- `docs/harness/IMPLEMENTATION-STATUS.md`: VPJ-67 row updated to record the resolved blockers and
  this new evidence while keeping #264 OPEN.

## Evidence

```
node --experimental-strip-types --test evals/harness/harness.evals.test.ts
```

Result: 3/3 passing, including the new H04 baseline (PASS, `unsupported_execution` /
`NO_ELIGIBLE_EVIDENCE`) and the new H04 mutation (FAIL at `answer`/`NO_SINGLE_SUBJECT_SELECTED`,
as required). `artifacts/VPJ-66/results.json` now reports `fixtureBaselineRuns: 3`,
`mutationRuns: 5`, `fixtureNotRun: 9`; `stagingRuns` stays `0` and `stagingNotRun` stays `12` --
no real Staging or provider run is claimed. `finalAcceptance` stays `NOT_RUN`.

Repository-wide checks run for this slice: `pnpm lint`, `pnpm typecheck`, `pnpm docs:check`,
`pnpm test:unit`, `pnpm test:contract`, `pnpm evals`. This change touches only offline
`evals/harness/*` fixtures and documentation, so native/browser/E2E/integration/security suites
that require a running product, database, or device were not re-run locally; they are unaffected
by this diff and continue to run in CI.

## UNRUN (unchanged, explicitly not claimed)

Real Staging read-only Ask for any of the 12 scenarios; native iOS/Web consumer acceptance;
H03/H07/H08/H12; the deeper VPJ-04/05/06/59/07 identity-provider-budget chain referenced by
docs/harness/IMPLEMENTATION-STATUS.md. #264 remains open; this PR uses "Related to", not a
closing keyword.

## Rollback

Revert this commit. It only changes `evals/harness/*` fixture code, generated
`artifacts/VPJ-66/{results.json,summary.md}`, and documentation; no database, migration, identity,
or provider configuration is touched.
