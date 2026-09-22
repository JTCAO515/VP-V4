# Practical development workflow

ADR-0024, merged and effective. Shared workflow for VPJ work and explicitly requested maintenance; ADR-0023 defines
product scope and safety. Development-stage approvals follow
[the integration policy](development-integration-policy.md) (JT, 2026-09-12): available
accounts and APIs plus observed behavior drive development; unknown supplier details are
recorded honestly, not waited on.

Historical task tables and copied kickoff prompts add no current development gates.

Authority classes, merge rules and the operator queue live in
[`continuous-afk-execution.md`](continuous-afk-execution.md). Label semantics live in
[`triage-labels.md`](triage-labels.md). This file owns work units, scope, checks and reporting.

## 1. Pick a visible result in the current stage

`issue-plan.json` is the only task-definition source; the six
[delivery stages](../program/2026-09-05/DELIVERY-STAGES.md) group its Issues into user-observable
results. A stage demonstration is evidence for its stated slice, not closure of the Issues in it.

At the start of a work unit, state: current stage, one observable user result, its owning Issue(s),
the required environment, the next acceptance action. Finish a partially integrated result before
starting another preparation PR.

Three parallel teams are authorized (JT, 2026-09-17); routing is in
[TEAM-PLAN-2026-09-17.md](../program/2026-09-05/TEAM-PLAN-2026-09-17.md). Each team owns one
primary delivery at a time. Coordinate shared-file edits and shared Staging write windows; do not
wait for another team's whole Issue to close.

An additional preparation task must remove a named stage blocker, deliver a separately testable
part of the same user result, or fix an observed defect. Start later-stage procurement, account
setup and customer discovery as soon as their own prerequisites allow.

Report progress as **implemented / observed in the target environment / accepted by the user**,
with version and evidence. PR, document and closed-Issue counts are activity, not progress. For
the next five comparable work units also record start-to-acceptance time, rework and external
waiting in the Issue/PR, so efficiency claims have a basis.

## 2. Preparation, integration and release

| Stage | May proceed when | Completion means |
| --- | --- | --- |
| Repository preparation | A bounded task has an available contract; its preparation inputs exist | Reviewed code/fixtures/docs for that scope; no live capability claim |
| Runtime integration | Actual upstream interfaces and the permitted test environment exist | The stated behavior was observed on the identified version/environment |
| Release/operations | Relevant integration, data, account and release conditions are met | The named deployment, device or customer outcome was verified |

A missing technical behavior blocks its parent Issue's acceptance, not every independent slice.
For an independent preparation slice, record inputs, paths, unavailable checks and remaining
integration work in the linked Issue/PR before editing. Preparation must not invent identity,
end-user consent, retained data or an unmerged interface, and must leave the parent open.

Check native dependencies and relevant PRs before selecting work. Verify readiness against
interfaces, environment, ownership and external decisions rather than against labels; reconcile
stale labels yourself. Future `expand` tasks still need their recorded activation evidence.

## 3. Choose a reviewable work unit

One coherent outcome per branch/PR. A primary Issue may have several incremental PRs; small
directly related fixes may share one PR when every affected Issue and acceptance is listed. Keep
independent features and unrelated refactors separate. Close an Issue only when all of its
acceptance is met; a preparation PR uses `Related to`, never a closing keyword.

Use an isolated worktree when another task is active, the working tree is dirty, or isolation
prevents a collision. Never overwrite another session's or the user's changes.

For an explicitly requested bug fix or governance/docs/tooling maintenance outside the VPJ
manifest, record a compact Issue/PR brief: goal, files, acceptance, checks, rollback. It needs no
new product-program row; product work still uses its VPJ row.

`allowedPaths` identifies primary ownership and intended scope. Necessary adjacent tests, call
sites, types, build configuration and documentation may change in the same task once the reason
and affected owner are recorded; resolve concurrent edits before touching a shared file.
Dependencies, their lockfile, CI and secret-free `.env.example` templates may be maintained when
the task needs it. Accepted ADRs, archived evidence, applied migrations and data/permission
policies retain their protections; a substantive change needs a new ADR or explicit migration.

## 4. Validate the change, then the capability

The VPJ row's check list describes full Issue acceptance. Select local PR checks from the changed
behavior and explain the selection in the PR. Repository-required checks still run and must pass.
Reuse CI evidence for the same tested code instead of repeating it locally.

| Change | Local evidence |
| --- | --- |
| Documentation only | `pnpm docs:check`, `git diff --check`; inspect changed links and generated files |
| Governance/tooling | Relevant executable tests, syntax/schema checks, docs check and diff check |
| Web/server behavior | Lint, typecheck, affected behavioral tests; build for build/runtime integration changes |
| Visible Web UI | Above plus affected-route browser checks at desktop and 390×844, relevant interactions, console and claims |
| Native UI/Swift | Affected native build/tests on an available Apple toolchain; device/accessibility evidence for affected behavior |
| Auth/data/provider/commerce | Affected contract and adversarial tests; real integration/rollback evidence before claiming that capability complete |

Record every relevant result as **PASS**, **FAIL**, **UNRUN** (with reason) or **NOT APPLICABLE**
(with rationale). A missing environment is UNRUN, never NOT APPLICABLE. Fixture or source
inspection is not browser, database or provider evidence. If a nominally required check is
impossible, document it for review rather than silently waiving CI, security or release acceptance.

Changes to shared contracts, dependencies, global styles or architecture need broader regression
coverage. RTL/legacy-locale checks apply to changed locale, navigation and shared-layout paths
until the VPJ-01 migration completes. A native-only change needs no local Web build when Web
contracts and assets are unchanged.

A diff review by the implementing agent plus the checks above is enough for ordinary feature work.
Use an independent review for permission, data integrity, money, migration/rollback, critical
shared contracts, or a concrete unresolved risk. Repository-required reviews remain in force; this
never authorizes self-approval or bypass.

Quality PR narrows to a documentation path (source-policy lint, governance tests, contract tests,
docs checks) for known navigation, workflow and task-definition files, including the master product
plan and the named experience/brand planning pages. Code, tests, CI, dependencies, ADRs, runtime
data, unknown paths and manual runs keep the full check set. The full path builds once and reuses
that output for browser tests; a newer commit cancels an older run for the same PR.

## 5. Report only what changed

Use the Issue/PR as the work log: result, key checks, unresolved limits, next action. Keep raw
logs and screenshots in `artifacts/` when they help review; do not copy identical logs into several
documents.

`docs/handoff.json` is the source; `HANDOFF.md` and `CONTEXT.md` are generated from it by
`node scripts/vpj-program.mjs render-handoff`, and `pnpm docs:check` rejects drift between them.
Update the source when the shared phase, decision, blocker or next action changes, or at session
handoff — not after every command. `CONTEXT.md` is the compact entry (status, stage, next action,
links); `HANDOFF.md` retains complete decisions, blockers, unrun items and verification. Keep
current decisions, blockers and evidence pointers; move superseded verification history to a dated
snapshot, keeping failures and unrun acceptance visible.

During the three-team assignment, teams record scoped evidence in their own Issue/PR and artifacts;
Overall integrates shared phase, decision and next-action updates in one coordinated write. Do not
overwrite another team's global status.

Update module contracts when behavior or interfaces change, not merely because a PR exists.
Describe product capability from evidence for its version, environment and supported scope; demo
fixtures stay identifiable, and verified features may be described plainly.

## 6. Continue within existing authority

Follow [`continuous-afk-execution.md`](continuous-afk-execution.md) for long sessions. Recheck the
affected frontier after a merge or a dependency/ownership change. While checks run, prepare
evidence or take another independent task. An external decision blocks its own action, not all
repository preparation.

Merge authority, required reviews, production deployment, payment and actual account access keep
their existing scopes. Nothing in this file authorizes merging, enabling auto-merge, publishing,
sending messages, or executing an operator-owned action.
