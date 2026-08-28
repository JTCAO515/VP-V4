# Continuous AFK execution

This policy governs a long-running development session that works across multiple GitHub Issues.
It removes routine per-Issue confirmation, not safety evidence or operator authority.

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
- combine multiple Issues in one branch/PR or stack a PR on an unmerged dependency.

## 2. Work classes

Classify every selected Issue before editing. When uncertain, use the more restrictive class.

| Class | Typical work | Agent authority | After required checks |
| --- | --- | --- | --- |
| `A — autonomous` | reversible repo-only D0/D1 code, tests, docs or UI with frozen contracts | implement, verify, open PR, address CI | enable repository auto-merge when branch protection permits, then continue |
| `B — prepare-only` | auth, RLS, permissions, schema/migration, retention, deletion, data policy, provider region, release controls | implement only the accepted contract, add rollback and adversarial evidence, open PR | absent an active explicit operator instruction, leave the PR ready; otherwise use the restricted repository-only auto-merge rule below |
| `C — operator-owned` | unresolved product/architecture choice, legal/licence/DPA, secret/account provisioning, payment, production migration/cutover, destructive or irreversible action | prepare evidence/options/runbook only | enqueue the exact operator action, mark/retain `ready-for-human` or `needs-info`, then skip |

Class A auto-merge is permitted only when all Issue-required checks and repository required checks are
successful, the PR is mergeable and not draft, no unresolved review or security finding exists, the
base is current, and the PR contains no Class B/C change. GitHub remains the merge authority; the
agent must not disable protection, self-approve a review requirement or use an admin bypass.

Class B repository-only preparation may auto-merge only when the active operator instruction
explicitly authorizes no manual review, an independent automated review reports no unresolved
Critical/Important finding, every Issue-required and repository-required check succeeds, the base is
current, and the merge uses ordinary repository authority. This exception never authorizes a
production migration, production or user-data deletion, provider/account action, branch-protection
bypass, or a claim that a prepared contract has completed its operational lifecycle.

Class B permits normal implementation and review preparation because this keeps the pipeline moving.
It does not imply production application. A migration must remain append-only/reversible and carry
forward/rollback verification; a local or Preview result is not production acceptance. Without the
explicit authorization above, Class B remains prepare-only and is handed off rather than merged.

## 3. Frontier scheduler

At session start and after every material GitHub event:

1. Fetch `origin/main`; inspect the current branch/worktrees, open PRs, checks, Issues, native
   blockers, labels, milestones, deployment state relevant to the work and `docs/operator-actions.json`.
2. Complete or safely hand off any already-open work owned by the session before claiming a new
   Issue. Never overwrite unrelated local changes.
3. Build the eligible frontier from open Issues that have no open native blocker and carry both
   `status:ready` and `ready-for-agent`.
4. Exclude Issues with a missing execution-contract row, unresolved interface conflict, open
   dependent PR, operator-owned decision, unaccepted secret/data/permission assumption, or path
   ownership collision.
5. Select the highest priority and earliest release-phase Issue. Break ties by the smallest tracer
   bullet that unlocks the most critical-path work; record the selection reason.
6. Create a fresh worktree from current `origin/main`, one branch and one PR for that Issue.
7. Run the mandatory reading order and Issue-specific checks. Replace manual visual confirmation
   with reproducible desktop and 390x844 browser automation where possible; preserve screenshots,
   console results and exact limitations.
8. Open/update the PR, wait for required checks, correct failures within scope, and apply the Class A,
   B or C completion rule.
9. Update Issue labels, evidence artifacts, handoff and operator queue, then return to step 1 without
   asking for routine confirmation.

Do not reserve an Issue merely to look busy. Set `status:in-progress` only after the worktree and
execution row are verified. If the Issue cannot start, leave it accurately blocked and choose another.

## 4. Automated evidence instead of routine human verification

The session may replace a human confirmation with automation only when the observation is equivalent:

- unit/contract/integration/security/e2e suites for deterministic behavior;
- schema diff, dry run, local disposable database and rollback rehearsal for migration preparation;
- authenticated owner/other-user/anonymous matrices using controlled test identities without
  exposing identifiers or credentials;
- browser automation at required viewports, RTL, console, network response and claim scans;
- CI, Preview smoke, logs and trace identifiers for deployed behavior that the agent may access.

Automation is not equivalent to legal approval, commercial acceptance, subjective brand approval,
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
  independent Issue; do not create a dependent stacked PR.
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

Observe the first AFK run across at least two independent Issues. Acceptance requires: no per-Issue
confirmation pause, no stacked dependency PR, no hard-gate bypass, accurate queueing of operator work,
and a truthful stop only when the safe frontier is empty.
