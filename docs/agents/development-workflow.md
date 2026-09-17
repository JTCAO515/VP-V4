# Practical development workflow

2026-09-12：开发接入遵循 [开发阶段接入规则](development-integration-policy.md)。第三方、法务和产品许可不再作为开发前置条件；agent可依据已有账号/API自主集成和实测，不限于fixture准备。

Effective when the governance PR adopting ADR-0024 merges. This is the shared workflow for
VPJ work and explicitly requested maintenance. ADR-0023 still defines product scope and safety.
Historical task tables and copied kickoff prompts cannot add current development gates.

## Deliver a visible result in the current stage

Use the six [delivery stages](../program/2026-09-05/DELIVERY-STAGES.md) to select work within
VPJ-00; `issue-plan.json` remains the only task-definition source. Stages group existing Issues
and acceptance, without deleting native dependencies or changing the product's final scope.
A stage demonstration is evidence for its stated slice, not automatic closure of every Issue
assigned to that stage. Complete Issue and release checks still apply at their own boundaries.

At the start of a work unit, state the current stage, one observable user result, its owning
Issue(s), the required environment and the next acceptance action. Prefer finishing a partially
integrated result before starting another preparation PR. Keep at most one main integration
lane and one independently useful preparation lane per product; subagents may investigate,
implement disjoint pieces or review inside these lanes. Existing sessions finish or hand off
their current changes safely before the coordinator selects more work.

When an external prerequisite blocks integration, prepare its concrete action/evidence once.
An additional preparation task must either remove a named stage blocker, deliver a separately
testable part of the same user result, or fix an observed defect. Do not keep adding optional
hardening or new research solely to keep an agent busy. Start later-stage procurement, account
setup and customer discovery early when their own prerequisites allow; stages are acceptance
groups, not a rule to wait for every earlier Issue to close before any preparation.

Report progress as **implemented / observed in the target environment / accepted by the user**,
with the relevant version and evidence. PR counts, generated documents and closed-Issue counts
are activity indicators. For the next five comparable work units, record start-to-acceptance
time, rework, external waiting and user-result evidence in the existing Issue/PR. Do not infer
model efficiency or a percentage improvement without this comparison.

## 1. Start with the task

Read `AGENTS.md`, `CONTEXT.md`, the current Issue/PR and its execution row; then read the
interfaces, accepted ADRs and code affected by that task. Read the master plan on first entry
or when product scope changes. Do not reload every blocker body, research ledger or historical
ADR for each small edit. Fetch blocker details when they affect the work.

Live GitHub, code and environment observations establish state. Handoff, manifest `status` and
labels are navigation aids, not proof of acceptance. Keep existing user instructions in force;
do not ask again for routine work already authorized.

## 2. Separate preparation, integration and release

| Stage | May proceed when | Completion means |
| --- | --- | --- |
| Repository preparation | A bounded task has an available contract; its preparation inputs exist | Reviewed code/fixtures/docs for that scope; no live capability claim |
| Runtime integration | Actual upstream interfaces and the permitted test environment exist | The stated behavior was observed on the identified version/environment |
| Release/operations | Relevant integration, data, account and release conditions are met | The named deployment, device or customer outcome was verified |

A missing technical behavior still blocks the parent Issue's acceptance. Cancelled supplier/legal/product
approvals do not block development integration; use the available interface and test environment. For an independent preparation slice: record inputs, paths, unavailable checks and remaining
integration work in a linked Issue or PR before editing. Preparation must not invent identity, end-user consent, retained data or an unmerged interface.
Agents select reversible development configuration; unknown commercial or supplier details are recorded, not approval blockers.
Use existing versioned contracts and controlled fixtures, keep incomplete capabilities unavailable,
and leave the parent open. Do not stack dependent runtime PRs to pretend upstream work is finished.

Check native dependencies and relevant PRs before selecting work. If `status:blocked` is stale
after a baseline/upstream merge, verify readiness and reconcile labels using ordinary tracker
authority; do not wait for someone to relabel an otherwise ready task. No open blocker alone is
insufficient: check interfaces, environment, ownership and external decisions.
Future `expand` tasks still need their recorded activation evidence. Keep genuine blockers intact.

## 3. Choose a reviewable work unit

Use one coherent outcome per branch/PR. A primary Issue may have several incremental PRs;
small directly related fixes can share one PR if all affected Issues and acceptance are listed.
Keep independent features and unrelated refactors separate. Only close an Issue when all of its
acceptance is met. A preparation PR uses `Related to`, not an automatic closing keyword.

Use an isolated worktree when another task is active, the working tree is dirty, or isolation
prevents a collision. A clean dedicated checkout already provides isolation; a new worktree is
not a deliverable. Never overwrite another session's or the user's changes.

For an explicitly requested bug fix or governance/docs/tooling maintenance outside the VPJ
manifest, record a compact Issue/PR brief: goal, files, acceptance, checks and rollback. It does
not need a new product-program row. Product work still uses its VPJ row. Record a scoped
supplement when splitting preparation; do not bypass product decisions or the dependency graph.

`allowedPaths` identifies primary ownership and intended scope. Necessary adjacent tests,
call sites, types, build configuration and documentation may change in the same task after the
reason and affected owner are recorded. Resolve concurrent edits before touching the same file.
Historical ownership such as “AI-07a only” is not a permanent tooling lock. Dependencies and their
lockfile, CI and secret-free `.env.example` templates can be maintained when needed by the task.
Never include actual secrets or weaken checks just to obtain green CI.
Accepted ADRs, archived evidence, applied migrations and data/permission policies retain their
protections; propose a new ADR or explicit migration for a substantive change.

## 4. Validate the change, then the capability

The VPJ row's check list describes full Issue acceptance. Select local PR checks from the
changed behavior below; explain applicability in the PR. Existing CI/required checks still run
and must pass. Reuse CI evidence for the same tested code instead of repeating it locally.

| Change | Local evidence |
| --- | --- |
| Documentation only | `pnpm docs:check`, `git diff --check`; inspect changed links and generated files |
| Governance/tooling | Relevant executable tests, syntax/schema checks, docs check and diff check |
| Web/server behavior | Lint, typecheck, affected behavioral tests; build for build/runtime integration changes |
| Visible Web UI | Above plus affected-route browser checks at desktop and 390×844, relevant interactions, console and claims |
| Native UI/Swift | Affected native build/tests on an available Apple toolchain; device/accessibility evidence for affected behavior |
| Auth/data/provider/commerce | Affected contract and adversarial tests; real integration/rollback evidence before claiming that capability complete |

For local review, documentation and other small reversible changes normally need a diff review
by the implementing agent and the direct checks above. Ordinary feature work does not require
an additional independent agent on every increment. Use an independent review for permission,
data integrity, money, migration/rollback, critical shared contracts or a concrete unresolved risk.
Repository-required reviews remain in force; this does not authorize self-approval or bypass.

Quality PR has a narrow documentation path for known navigation, workflow and task-definition
files: source-policy lint, governance tests, contract tests and docs checks. Code, tests, CI,
dependencies, ADRs, runtime data, unknown paths and manual runs retain the full existing check set.
The master product plan and explicitly named experience/brand planning pages are included;
the one allowlisted product-experience sync receipt is checked against a closed metadata schema.
This does not allow arbitrary artifact JSON or treat a historical receipt as live acceptance.
The same job/check name reports either applicable scope; its summary states what did not apply.
The full path builds once and reuses that output for browser tests. A newer commit cancels an
older run for the same PR. The standalone frontend-test command still builds when called alone.

Reuse a successful check only when its tested code, relevant environment and test inputs still
match. A documentation-only follow-up need not repeat unrelated local product checks; a change
to behavior or the relevant environment requires the affected checks again. Do not skip a real
integration gate merely because a local fixture or a different deployment passed.

Changes to shared contracts, dependencies, global styles or architecture require broader
regression coverage because their impact is broader. RTL/legacy locale checks apply to changed
locale/navigation/shared layout paths until the explicit migration is complete. A wording fix
does not require unrelated database or native device checks locally. A native-only change does
not require a redundant local Web build if Web contracts and assets are unchanged.

Record relevant results as PASS, FAIL, UNRUN (with reason), or NOT APPLICABLE (with rationale).
A missing environment is UNRUN, never NOT APPLICABLE. Fixture/source inspection is not browser,
database or provider evidence. A skipped release prerequisite remains incomplete. If a nominal
required check is impossible or unrelated, document it for review; do not silently waive CI,
security or release acceptance. Fix meaningful defects in old tests while preserving the invariant;
do not add tests that only assert spelling or code layout for a reversible wording edit.

## 5. Report only what changed

Use the Issue/PR as the normal work log: result, key checks, unresolved limits and next action.
Keep raw logs/screenshots in artifacts when useful to review. Avoid copying identical logs into
multiple documents. Update `docs/handoff.json` when the shared phase, decision, blocker or next
action changes, or at session handoff; regenerate `HANDOFF.md` and `CONTEXT.md` from it.
Keep the active handoff concise: retain current decisions, blockers and evidence pointers. Move
superseded verification history to a linked dated snapshot rather than repeating it in both generated
entry files; keep failures and unrun acceptance visible. Historical snapshots never grant new authority.
`CONTEXT.md` is the compact generated entry (recorded status, stage, next action and links);
`HANDOFF.md` retains the complete decisions, blockers, unrun items and verification from the source.
`pnpm docs:check` rejects drift in either output without rewriting it. After a source update or a
merge involving `docs/handoff.json`, run `node scripts/vpj-program.mjs render-handoff` and review
both generated files. The check proves source consistency, not that GitHub/runtime state is current.
Do not edit all three for every test run or small commit. Update module contracts when behavior
or interfaces change, not merely because a PR exists.

Describe product capability from evidence for its version, environment and supported scope.
Demo fixtures remain identifiable; verified features can be described accurately. The old blanket
prohibition on claiming any AI or persistence is not a permanent product restriction.

## 6. Continue within existing authority

Follow `continuous-afk-execution.md` for long sessions. Recheck the relevant frontier after a
merge or dependency/ownership change; avoid re-reading every deployment and Issue after an
unrelated label or CI event. While checks run, prepare evidence or another independent task.
External decisions block their own action, not all repository preparation.

Apply the development integration policy above to development approvals. Merge authority, required reviews,
production deployment, payment and actual account access retain their existing scopes. This policy change does not authorize merging itself, enabling auto-merge,
publishing, sending messages, or executing operator-owned actions.
