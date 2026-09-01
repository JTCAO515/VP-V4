# LAUNCH-00 governance risk repair evidence

Date: 2026-09-01
Issue: #149
Deviation: D2 governance-state drift

## Observed deviation

- The primary local worktree was on `e2800e0`, 272 commits behind and one commit ahead of current
  `origin/main`, with six modified tracked files and 226 untracked files.
- Twenty-four of those untracked paths are tracked by current `main`; a blind checkout or pull would
  risk collision or local data loss.
- Git worktree metadata retained registrations whose directories no longer existed.
- Two accepted ADR files used number 0019.
- Closed GitHub Issues retained active scheduling or triage labels.
- Historical handoff text conflicted with the accepted LAUNCH dependency/frontier policy.
- Tracker, triage, execution-contract and unit-test text still declared every defined Issue directly
  schedulable, contradicting native dependencies and the accepted Continuous AFK frontier.

## Control action

- Preserve the primary worktree without reset, checkout, stash, delete or overwrite.
- Work from an isolated branch based on current `origin/main`.
- Create a persistent clean mainline worktree at `/Users/jtcao/Documents/VP - V4 Mainline`, with
  local `main` fast-forwarded to `origin/main@fb8d2ba`, for future LAUNCH work.
- Prune only worktree registrations whose target directory no longer exists.
- Keep the earlier Trip authorization ADR as ADR-0019 and renumber the later ML-01 decision to
  ADR-0022 without changing its decision.
- Add a deterministic ADR uniqueness and filename/heading consistency check.
- Synchronize current context/handoff/report state.
- Replace direct-queue supersession with one dependency-aware live-frontier rule across tracker,
  triage, execution contract and unit tests.
- Remove active scheduling/triage labels from closed Issues while retaining GitHub history and
  `status:superseded` where applicable.

Tracker result: 32 closed Issues were normalized through 55 idempotent label removals. A fresh
closed-Issue query returned zero remaining `status:ready`, `status:blocked`, `status:in-progress`,
`ready-for-agent`, `ready-for-human` or `needs-info` labels.

## Safety boundary

No product route, domain contract, database, migration, RLS rule, Provider, credential, Vercel
deployment, user data, iOS source or Marketing asset is changed by this repair.

## Verification

- `pnpm check`: pass; lint, strict typecheck, production build and 22 static tests pass.
- `pnpm test:unit`: 27/27 pass.
- `pnpm test:contract`: 161/161 pass.
- `pnpm test:e2e`: 40/40 pass.
- `pnpm evals`: 20/20 pass.
- `pnpm test:integration`: 19 pass, 9 explicit local-Supabase skips; incomplete, not failed.
- `pnpm test:security`: 80 pass, 1 explicit local-RLS skip; incomplete, not failed.
- `pnpm docs:check`, `pnpm check:flags`, `pnpm check:assets`, JSON parse, local Markdown links
  and `git diff --check`: pass.
- Closed-Issue active-label audit: 0 residual Issues.

Browser/device QA is not applicable because no rendered UI changed. No database, Provider,
authenticated user, Production or public-release check was run.

## Rollback

Revert the governance commit and restore labels through GitHub Issue history. The preserved primary
worktree remains the recovery source for local-only material.
