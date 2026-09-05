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

## VPJ dependency-aware scheduling

VPJ-00 #187 replaces all old open Issues by explicit operator authority. Native dependencies and
the baseline PR gate implementation. Only status:ready plus ready-for-agent, a valid execution row,
completed blockers and no ownership collision permit automated pickup. Later expand tasks also
require their activationEvidence. Full bodies are generated from issue-plan.json, never from titles.
`UNAUTHENTICATED`, `SAFETY_BLOCKED`, and `DATA_POLICY_BLOCKED` remain fail-closed runtime outcomes;
they never authorize a guest actor, service credential, or bypass.
