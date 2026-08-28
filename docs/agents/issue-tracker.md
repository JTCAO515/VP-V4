# Issue tracker: GitHub

Issues for this repository live in [JTCAO515/VP-V4](https://github.com/JTCAO515/VP-V4/issues). Use the `gh` CLI from this clone.

## Conventions

- Create and read one GitHub Issue per accepted work unit.
- Use titles such as `[AI-09] 迁移 TripPatch Golden Contract`.
- Bodies declare the Program, user capability, current evidence, scope, anti-goals, interface impact, dependencies, acceptance, estimate, rollback, documentation, and observation.
- Create issues in dependency order so `Blocked by #N` uses real issue numbers.
- Use GitHub native dependencies when available; retain the textual `Blocked by` section for portability.
- Only frontier work receives `status:ready`; dependency-gated work receives `status:blocked`.
- Apply `ready-for-agent` only when no human or operator decision remains.
- One Issue uses one branch and one reviewable PR. Do not stack PRs on unmerged work.

## Pull requests as a request surface

External PRs are not a triage request surface. Collaborator PRs follow normal review and are not treated as incoming feature requests.

## Direct queue supersession

Defined Issues are directly schedulable; an open Issue, textual `Blocked by` reference, or GitHub
dependency does not prohibit development. `status:blocked` reports unavailable runtime, provider,
legal, or operator state only. It does not prohibit development, testing, automated review, or merge.
`UNAUTHENTICATED`, `SAFETY_BLOCKED`, and `DATA_POLICY_BLOCKED` remain fail-closed runtime outcomes;
they never authorize a guest actor, service credential, or bypass.
