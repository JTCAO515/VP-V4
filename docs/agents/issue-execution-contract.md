# Issue execution contract

Product tasks use [the VPJ execution contract](../program/2026-09-05/EXECUTION-CONTRACT.md),
generated from `issue-plan.json`. Scope, preparation and validation follow
[the development workflow](development-workflow.md) / ADR-0024. This file owns the runnable
command registry and the red-line suite registry.

## Task scope and checks

Read the current Issue/PR, its VPJ row and the affected interfaces and code. The row's checks
describe full Issue acceptance; select the local checks for each PR by actual impact. Applicable
CI, required checks and runtime acceptance remain in force. A missing environment is UNRUN;
passing fixtures complete neither integration nor release.

Product implementation uses its VPJ row. Explicit maintenance outside the manifest uses a compact
Issue/PR brief with goal, paths, checks, acceptance and rollback. A scoped preparation slice
records its inputs and retained runtime blockers before editing and does not close its parent.

Primary paths guide ownership: document necessary adjacent edits and coordinate actual concurrent
owners. Accepted ADRs, archived evidence, applied migrations, secrets and data/permission
boundaries retain their protection.

## Command registry

`package.json` is the source of runnable commands. `pnpm check` is the Web baseline
(lint/typecheck/build/static tests). Add `test:unit`, `test:contract`, `test:integration`,
`test:security`, `test:e2e`, `test:e2e:frontend` and `evals` by affected behavior.

- `test:e2e` is source/contract inspection; only `test:e2e:frontend` runs browser flows.
- `db:verify` and provider/native checks need their actual environment and task-specific
  assertions; a command name alone proves no live behavior.
- `docs:check`, `check:assets`, `check:flags` and `check:artifacts` keep their defined scope.
- Record an unavailable command explicitly.

`evals` and some harness suites rewrite evidence files under `artifacts/` with the current commit
and timing. Review and revert that churn before committing unless the regenerated evidence is the
point of the PR.

## Evidence

Record important commands and results in the Issue/PR or `artifacts/<task>/`, for example
`VP_ARTIFACT_ISSUE=VPJ-01 node scripts/record-command.mjs node --version` (the recorder supports
VPJ and GOV identifiers). Keep useful raw logs and screenshots; summarize failed, skipped and
unavailable evidence. Do not duplicate unchanged evidence. Full task acceptance still requires the
artifacts named by its row.

## Red-line suite registry

Nine hard gates are nine named deterministic suites. `0` always means
`N/N observed violations in this named suite`, never a claim about unbounded scenarios.

| Suite | Invariant | Runtime fail-closed |
| --- | --- | --- |
| `RL-01` | no unauthorized or unconfirmed Trip write | writer rejects patch without a confirmed proposal receipt |
| `RL-02` | no cross-user / private / draft / expired leakage | authoritative eligibility join on every read path |
| `RL-03` | no invalid Patch reaches the writer | closed operation union validated before transaction |
| `RL-04` | no unsupported high-risk claim | `NO_ELIGIBLE_EVIDENCE` terminal outcome |
| `RL-05` | no wrong citation or fact receipt | typed `GroundedClaim` with current receipt |
| `RL-06` | no prohibited display/cache/persist/prompt/embed/translate/TTS | `DATA_POLICY_BLOCKED` before provider call |
| `RL-07` | no sensitive raw media or secret in general logs | allowlisted trace fields only |
| `RL-08` | no candidate or importer row public | shared eligibility view, RLS |
| `RL-09` | no expired Explore capability badge | fact-level freshness gate at render |

An Issue claiming a red line must name the suite ID, the fixture count and the runtime invariant,
and extend that suite with a task-scoped regression preserving its runtime invariant.

### AI-42 registry snapshot

AI-42 owns the C0 fixture-count baseline: RL-01=2, RL-02=3, RL-03=2, RL-04=3, RL-05=2, RL-06=2,
RL-07=2, RL-08=3, RL-09=2. These counts describe the deterministic named fixtures only; they
establish no production safety rate. The executable registry, five-locale/six-moment strata and
split validator live in `evals/quality/ai-42-corpus.ts`.
