# LAUNCH-01 developer-experience acceptance

## Objective and scope

LAUNCH-01 makes the repository's deterministic developer-experience gates visible in the pull-request workflow and records any locally skipped CI-suite tests as `incomplete`, rather than presenting them as runtime acceptance.

The scope is repository-only: workflow coverage, deterministic suite reporting, command evidence, and documentation. It does not configure Staging, connect Supabase, change a provider account, or authorize a release.

## Acceptance evidence (2026-08-29)

| Check | Result | Evidence |
| --- | --- | --- |
| frozen dependency install | passed | `pnpm@9.15.9 pnpm install --frozen-lockfile` |
| static gates | passed | `pnpm check` (lint, typecheck, build, static output) |
| unit and contract suites | passed | `pnpm test:unit`, `pnpm test:contract` |
| integration suite | incomplete | `pnpm test:integration`: 8 tests skipped because local Supabase is not running |
| security suite | incomplete | `pnpm test:security`: 1 test skipped because local Supabase is not running |
| static E2E and evaluations | passed | `pnpm test:e2e`, `pnpm evals` |
| browser E2E | passed | `pnpm test:e2e:frontend`: Playwright Chromium, including 390x844 and desktop viewports |
| database probe | not configured | `pnpm db:verify`: baseline present; no connection attempted |
| flags, preview assets, docs | passed | `pnpm check:flags`, `pnpm check:assets`, `pnpm docs:check` |
| release asset gate | blocked as designed | `pnpm check:assets:release` exits 1 while 9 blocked preview assets remain |
| whitespace validation | passed | `git diff --check` |

`artifacts/LAUNCH-01/commands.jsonl` contains the local command ledger and remains ignored because it is run-specific evidence. The durable limitations are recorded in `artifacts/LAUNCH-01/unrun.md`.

## CI behavior

`Quality PR` runs every deterministic repository gate available to a pull request, including `test:e2e:frontend`, flags, and preview asset validation. `Quality Release Candidate` additionally runs the database probe and the release asset gate. Both workflows initialize a GitHub step-summary table; suites run through `scripts/run-ci-suite.mjs` publish `passed`, `incomplete`, or `failed` plus their skipped-test count.

A process exit code of zero for an incomplete suite preserves the deterministic PR workflow while the summary makes the missing runtime evidence explicit. It is not a Staging, database, provider, or release acceptance claim.

The asset ledger hashes Git-canonical bytes for its known internal text assets. `check-assets` normalizes only CRLF line endings for those ledgered `.html`, `.json`, and `.svg` records, so a Windows `core.autocrlf=true` checkout and Linux CI check the same content. Owner-master and binary assets retain raw-byte hashing.

## Constraints, rollback, and next action

The host-wide `pnpm` 11 installation rejects this repository's pnpm 9 lock configuration. The verified runner is the package-manager version declared by `package.json` (`pnpm@9.15.9`); no lockfile update is required.

Rollback is a revert of the LAUNCH-01 commit, restoring the prior workflow and CI-suite reporting behavior.

Next action: merge this PR after its deterministic required checks are green, then recompute the independent Launch Issue frontier.
