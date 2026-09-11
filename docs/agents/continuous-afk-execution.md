# Continuous AFK execution

2026-09-12：[开发接入规则](development-integration-policy.md)优先。供应商/法务/产品许可等待不属于C类人工阻塞；agent完成开发配置、集成和实测，未知信息如实记录。

This policy governs a long-running development session that works across multiple GitHub Issues.
Use `development-workflow.md` / ADR-0024 for work units, preparation scope, local checks and
reading. This policy retains existing merge and operator authority.

## 1. Objective and boundaries

The session continuously selects, implements, verifies and hands off independently executable work
until no safe frontier remains. An Issue finishing is a scheduling event, not a session stop.

The policy does not authorize the agent to:

- bypass native dependencies, branch protection, required checks or the Issue execution contract;
- fabricate an approval, reviewer observation, browser result, provider result or production result;
- reveal, request in chat, persist or copy credentials, cookies, JWTs, API keys or connection strings;
- execute production migrations, destructive data changes, DNS/cutover, payment, purchase, contract,
  account or public-release actions without their explicit operator-owned decision;
- weaken RLS, actor isolation, eligibility, licence, privacy, retention, deletion or rollback gates;
- stack runtime PRs on an unmerged dependency or combine unrelated outcomes in one PR.

## 2. Work classes

Classify the actual action/slice before editing, not every file in a broadly titled Issue.
A mixed task may have a repo preparation part and a separately gated external action.
When authority or data safety is uncertain, preserve the more restrictive boundary.

| Class | Typical work | Agent authority | After required checks |
| --- | --- | --- | --- |
| `A — autonomous` | reversible repo-only D0/D1 code, tests, docs or UI with frozen contracts | implement, verify, open PR, address CI | enable repository auto-merge when branch protection permits, then continue |
| `B — prepare-only` | auth, RLS, permissions, schema/migration, retention, deletion, data policy, provider region, release controls | implement only the accepted contract, add rollback and adversarial evidence, open PR | absent an active explicit operator instruction, leave the PR ready; otherwise use the restricted repository-only auto-merge rule below |
| `C — operator-owned` | material architecture/scope change, unavailable account access requiring a person, payment outside existing authority, production migration/cutover, destructive or irreversible action | prepare evidence/options/runbook only | enqueue the exact operator action, mark/retain `ready-for-human` or `needs-info`, then skip |

Class A auto-merge is permitted only when all PR-applicable Issue checks under development-workflow.md and repository required checks are
successful, the PR is mergeable and not draft, no unresolved review or security finding exists, the
base is current, and the PR contains no Class B/C change. GitHub remains the merge authority; the
agent must not disable protection, self-approve a review requirement or use an admin bypass.

Class B repository-only preparation may auto-merge only when the active operator instruction
explicitly authorizes no manual review, an independent automated review reports no unresolved
Critical/Important finding, every PR-applicable Issue check under development-workflow.md and repository-required check succeeds, the base is
current, and the merge uses ordinary repository authority. This exception never authorizes a
production migration, production or user-data deletion, provider/account action, branch-protection
bypass, or a claim that a prepared contract has completed its operational lifecycle.

Class B permits normal implementation and review preparation because this keeps the pipeline moving.
It does not imply production application. A migration must remain append-only/reversible and carry
forward/rollback verification; a local or Preview result is not production acceptance. Without the
explicit authorization above, Class B remains prepare-only and is handed off rather than merged.

## 3. Frontier scheduler

At session start, inspect the current checkout/user changes, live program and relevant blockers.
After a relevant merge or dependency/ownership change, refresh the affected frontier:

1. Complete or safely hand off already-open work owned by the session; never overwrite user changes.
2. Inspect native blockers, available interfaces, relevant PRs and external conditions. Reconcile
   stale labels after verification; labels alone neither approve nor permanently block work.
3. Choose the highest-priority independently actionable outcome. Product work uses its VPJ row;
   direct maintenance and bounded preparation use the scoped brief in `development-workflow.md`.
   Do not infer a frozen interface from a type name in a planning document.
   Prefer the current delivery stage's user result and finish its existing integration first.
   Apply the shared limit of one integration lane plus one independent preparation lane; a new
   preparation increment must remove a named stage blocker, deliver a testable part of that result,
   or fix an observed defect. A lack of eligible useful work is a valid stop, not a reason to
   invent another hardening increment.
4. Use a dedicated branch/checkout; add a worktree when needed for isolation. One coherent outcome
   per PR; an Issue may have incremental PRs without closing its remaining acceptance.
5. Run task-relevant checks and preserve evidence. Browser/device checks apply to affected
   behavior; actual runtime/release prerequisites remain required for final acceptance.
6. Open/update the PR, fix applicable CI failures, and follow the unchanged Class A/B/C merge rules.
   If auto-merge is disabled or unavailable, leave a reviewable PR and continue other work;
   do not change repository settings or substitute an unauthorized direct merge.
7. Record results in the Issue/PR. Update shared handoff only for shared state changes or session
   handoff; record genuinely new operator actions once. Continue without routine confirmation.

Set `status:in-progress` only for the scope actually started. Keep a parent blocked/open when a
preparation PR has not satisfied its runtime acceptance. Do not remove real dependencies or
activate future expand tasks without their activation evidence.

## 4. Automated evidence instead of routine human verification

The session may replace a human confirmation with automation only when the observation is equivalent:

- unit/contract/integration/security/e2e suites for deterministic behavior;
- schema diff, dry run, local disposable database and rollback rehearsal for migration preparation;
- authenticated owner/other-user/anonymous matrices using controlled test identities without
  exposing identifiers or credentials;
- browser automation on affected routes/viewports, relevant RTL paths, console, network and claims;
- CI, Preview smoke, logs and trace identifiers for deployed behavior that the agent may access.

Development requires no separate legal or product approval. Automation does not establish commercial rights, public brand acceptance,
real-user consent, production data access, production migration execution or an unavailable external
account. Record those as Class C rather than claiming success.

## 5. Operator action queue

`docs/operator-actions.json` is the durable queue. Add one minimal entry per genuinely non-delegable
action; never store a secret or private identifier. Each entry includes:

- stable ID, owning Issue, class, status and creation time;
- exact operator action and why it cannot be automated;
- prerequisites, expected result and a safe verification method;
- effect on the dependency graph, rollback and the next safe Issue the session selected instead.

Queueing is not a blocker for the whole session. Set the affected Issue to `ready-for-human` or
`needs-info`, remove `ready-for-agent` when appropriate, and continue another independent frontier.

## 6. Waiting, correction and stop conditions

- Poll CI/deployment checks with bounded waits. While a check runs, prepare evidence or inspect another
  independent Issue; do not create a dependent stacked runtime PR.
- Correct deterministic failures within the Issue. After three materially identical failed attempts,
  record the evidence and reclassify the deviation instead of looping blindly.
- Continue after a Class B/C handoff whenever any eligible independent frontier exists.
- Stop only when the objective is complete, no safe eligible frontier exists, every remaining path is
  dependency/operator blocked, a critical security/data ambiguity lacks authority, the same blocking
  condition remains after the defined retry limit, or the execution budget/system is exhausted.
- On stop, report completed/merged/open PRs, checks, unrun evidence, operator queue, current blockers,
  rollback and the single next action. Never describe an open PR or unexecuted production step as done.

## 7. Rollback and observation

Rollback this policy with a normal revert commit. It changes no runtime or production data.

During an actual AFK run, observe two independent work units when available; this observation is
not a prerequisite for merging a documentation/tooling change. Session acceptance requires: no per-Issue
confirmation pause, no stacked dependency PR, no hard-gate bypass, accurate queueing of operator work,
and a truthful stop only when the safe frontier is empty.
