# Issue execution contract

Current product tasks use [the VPJ execution contract](../program/2026-09-05/EXECUTION-CONTRACT.md),
generated from `issue-plan.json`. Shared scope, preparation and validation follow
[the development workflow](development-workflow.md) / ADR-0024.

The prior AI/V4/LAUNCH tables are historical and available in
[the exact archived contract](../archive/2026-09-05/baseline/issue-execution-contract.md).
They add no current file locks, reading requirements or release dependencies.

## Task scope and checks

Read the current Issue/PR, its VPJ row and affected interfaces/code. The row's checks describe
full Issue acceptance; select local checks for each PR by actual impact under the shared workflow.
All applicable CI/required checks and runtime acceptance remain in force.
A missing environment is UNRUN; passing fixtures do not complete integration or release.

Product implementation uses its VPJ row. Explicit maintenance outside the manifest uses a compact
Issue/PR brief with goal, paths, checks, acceptance and rollback. A scoped preparation slice records
its inputs and retained runtime blockers before editing; it does not close the parent Issue.

Primary paths guide ownership. Document necessary adjacent edits and coordinate actual concurrent
owners. No historical task permanently owns all workflows, lockfiles or tests. Accepted ADRs,
archived evidence, applied migrations, secrets and data/permission boundaries retain protection.

## Command registry

`package.json` is the source of runnable commands. Use `pnpm check` for the Web baseline
(lint/typecheck/build/static tests), affected `test:unit`, `test:contract`, `test:integration`,
`test:security`, `test:e2e`, `test:e2e:frontend` and `evals` as needed.
`test:e2e` is source/contract inspection; only `test:e2e:frontend` runs browser flows.
`db:verify` and provider/native checks need their actual environment and task-specific assertions;
a command name alone proves no live behavior. `docs:check`, `check:assets`, `check:flags` and
release-specific checks retain their defined scope. Record unavailable commands explicitly.

## Evidence

Record important commands and results in the Issue/PR or `artifacts/<task>/`.
The recorder supports VPJ and GOV identifiers, for example
`VP_ARTIFACT_ISSUE=VPJ-01 node scripts/record-command.mjs node --version`.
Keep useful raw logs/screenshots; summarize failed, skipped and unavailable evidence.
Do not duplicate unchanged evidence or update three handoff files after every command.
Full task acceptance still requires the artifacts named by its row.

## Red-line suite registry

The report's nine hard gates become nine named deterministic suites. `0` always means
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

An Issue that claims a red line must name the suite ID, the fixture count, and the runtime
invariant. Extend the affected suite with a task-scoped regression that preserves its runtime invariant.
Historical Issue ownership is not a permanent restriction on maintaining the suite.

### AI-42 registry snapshot

AI-42 owns the C0 fixture-count baseline for the registry: RL-01=2, RL-02=3, RL-03=2,
RL-04=3, RL-05=2, RL-06=2, RL-07=2, RL-08=3 and RL-09=2. These counts describe only
the deterministic named fixtures; they do not establish a production safety rate. The executable
registry, five-locale/six-moment strata and split validator live in `evals/quality/ai-42-corpus.ts`.
