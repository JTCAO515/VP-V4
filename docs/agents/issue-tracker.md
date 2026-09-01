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
- A Continuous AFK session does not stop after each Issue. After a PR/merge/handoff it recomputes
  the live frontier and continues another independent `status:ready` + `ready-for-agent` Issue under
  `continuous-afk-execution.md`.
- An operator-only action blocks its owning dependency path, not unrelated frontier work. Record it
  in `docs/operator-actions.json`, apply `ready-for-human` or `needs-info`, and continue safely.

## Pull requests as a request surface

External PRs are not a triage request surface. Collaborator PRs follow normal review and are not treated as incoming feature requests.

## Live frontier authority

A defined Issue is not automatically schedulable. The executable frontier is the intersection of:

- Issue state is open;
- the Issue has an execution-contract row;
- `status:ready` and `ready-for-agent` are both present;
- no native/textual dependency, open prerequisite PR, path collision or ownership conflict remains;
- no unresolved operator, legal, account, secret, data-policy or irreversible decision is required.

`status:blocked`, `ready-for-human` and `needs-info` exclude the Issue from agent scheduling. A
separately accepted repository-preparation Issue may still produce bounded contracts or runbooks,
but it must not close or promote the blocked runtime/release acceptance. `UNAUTHENTICATED`,
`SAFETY_BLOCKED`, and `DATA_POLICY_BLOCKED` remain fail-closed runtime outcomes; they never authorize
a guest actor, service credential or bypass.
