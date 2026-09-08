# Issue tracker: GitHub

Use [JTCAO515/VP-V4 Issues](https://github.com/JTCAO515/VP-V4/issues) through an authenticated
GitHub tool or `gh`. Current execution follows `development-workflow.md`.

- VPJ-00 #187 is the active product program. The manifest owns task identities, scope, acceptance
  and dependencies; live GitHub and environment observations establish execution state.
- Product Issues use their VPJ rows. Explicit maintenance uses a compact goal, scope, checks,
  acceptance and rollback brief; do not create a second program for a small fix.
- One PR has one coherent outcome. An Issue may have incremental PRs; tightly related fixes
  may share a PR with explicit mapping. Keep independent features separate.
- Use native dependencies plus portable textual links. Do not close parent runtime acceptance
  after fixture preparation. Use `Related to` on partial PRs and retain the unverified checklist.
- Available interfaces may support a scoped preparation PR while its parent remains blocked;
  record the scope and retained integration gate before editing. Do not assume unmerged behavior.
- Reconcile stale labels after inspecting baseline, native blockers, PRs, ownership and external
  conditions. Never remove a valid dependency merely to create ready work.
- `ready-for-agent` means the selected scope is actionable; operator-only steps use
  `ready-for-human`/`needs-info`. A blocked parent may have a separate ready preparation slice.
- Long sessions continue independent work after a PR/handoff. Record a genuinely non-delegable
  action once in `docs/operator-actions.json`, not at every status check.
- Future expand tasks require `activationEvidence` even after dependencies complete.

Full VPJ bodies are generated from `issue-plan.json`; do not replace them with title-only tasks.
Tracker migration modes are separate from ordinary development and retain their explicit authority.
External PRs are not a feature-request triage surface; collaborator PRs receive normal review.

`UNAUTHENTICATED`, `SAFETY_BLOCKED` and `DATA_POLICY_BLOCKED` remain runtime refusals,
not permission to use a guest actor, service credential or bypass.
