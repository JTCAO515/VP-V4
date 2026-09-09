# Practical development workflow

Effective when the governance PR adopting ADR-0024 merges. This is the shared workflow for
VPJ work and explicitly requested maintenance. ADR-0023 still defines product scope and safety.
Historical task tables and copied kickoff prompts cannot add current development gates.

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

An open runtime/operator dependency still blocks the parent Issue's acceptance. It need not
block an independent preparation slice: record inputs, paths, unavailable checks and remaining
integration work in a linked Issue or PR before editing. Preparation must not assume unresolved
identity, permissions, retained data, recipients, commercial terms or an unmerged interface.
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

Merge authority, required reviews, production deployment, payment, data use and account access
are unchanged. This policy change does not authorize merging itself, enabling auto-merge,
publishing, sending messages, or executing operator-owned actions.
