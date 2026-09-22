# Continuous AFK execution

Authority, merge rules, the operator queue and long-session scheduling live here. Work units,
scope, local checks and reporting live in [`development-workflow.md`](development-workflow.md);
development-stage approvals in [`development-integration-policy.md`](development-integration-policy.md).

A long-running session selects, implements, verifies and hands off independently executable work
until no safe frontier remains. An Issue finishing is a scheduling event, not a session stop.

## 1. Hard prohibitions

The session may never:

- bypass native dependencies, branch protection, required checks or the Issue execution contract;
- fabricate an approval, reviewer observation, browser result, provider result or production result;
- reveal, request in chat, persist or copy credentials, cookies, JWTs, API keys or connection strings;
- execute production migrations, destructive data changes, DNS/cutover, payment, purchase, contract,
  account or public-release actions without their explicit operator-owned decision;
- weaken RLS, actor isolation, eligibility, licence, privacy, retention, deletion or rollback gates;
- stack runtime PRs on an unmerged dependency or combine unrelated outcomes in one PR.

## 2. Work classes

Classify the actual action or slice before editing, not every file in a broadly titled Issue. A
mixed task may have a repository-preparation part and a separately gated external action. When
authority or data safety is uncertain, take the more restrictive boundary.

| Class | Typical work | Agent authority | After required checks |
| --- | --- | --- | --- |
| `A — autonomous` | reversible repo-only D0/D1 code, tests, docs or UI with frozen contracts | implement, verify, open PR, address CI | enable repository auto-merge when branch protection permits, then continue |
| `B — prepare-only` | auth, RLS, permissions, schema/migration, retention, deletion, data policy, provider region, release controls | implement only the accepted contract, add rollback and adversarial evidence, open PR | absent an active explicit operator instruction, leave the PR ready; otherwise use the restricted repository-only auto-merge rule below |
| `C — operator-owned` | material architecture/scope change, unavailable account access requiring a person, payment outside existing authority, production migration/cutover, destructive or irreversible action | prepare evidence/options/runbook only | enqueue the exact operator action, mark/retain `ready-for-human` or `needs-info`, then skip |

Class A auto-merge is permitted only when all PR-applicable Issue checks under
development-workflow.md and repository required checks are successful, the PR is mergeable and not
draft, no unresolved review or security finding exists, the base is current, and the PR contains no
Class B/C change. GitHub remains the merge authority; the agent must not disable protection,
self-approve a review requirement or use an admin bypass.

Class B repository-only preparation may auto-merge only when the active operator instruction
explicitly authorizes no manual review, an independent automated review reports no unresolved
Critical/Important finding, every PR-applicable Issue check under development-workflow.md and
repository-required check succeeds, the base is current, and the merge uses ordinary repository
authority. This exception never authorizes a production migration, production or user-data
deletion, provider/account action, branch-protection bypass, or a claim that a prepared contract
has completed its operational lifecycle.

Class B is normal implementation and review preparation, not production application. A migration
stays append-only and reversible and carries forward/rollback verification; a local or Preview
result is not production acceptance.

## 3. Frontier scheduling

Inspect the current checkout, live program and relevant blockers at session start, and refresh the
affected frontier after a relevant merge or a dependency/ownership change. Then:

- Finish or safely hand off open work this session owns before starting new work.
- Take the highest-priority independently actionable outcome, preferring the current delivery
  stage's user result. Judge readiness from interfaces, environment, ownership and external
  conditions; reconcile stale labels as you go.
- Use a dedicated branch or worktree, one coherent outcome per PR, and run task-relevant checks
  with their evidence preserved.
- Open or update the PR, fix applicable CI failures, and apply the Class A/B/C merge rules above.
  If auto-merge is unavailable, leave a reviewable PR and continue; never change repository
  settings or substitute an unauthorized direct merge.
- Record results in the Issue/PR, update shared handoff only for shared state or session handoff,
  and continue without routine confirmation.

Set `status:in-progress` only for the scope actually started. Keep a parent open when a preparation
PR has not satisfied its runtime acceptance. Do not remove a real dependency or activate a future
expand task without its activation evidence. Having no eligible useful work is a valid stop.

## 4. Automated evidence instead of routine human verification

Automation may replace a human confirmation only when the observation is equivalent:

- unit/contract/integration/security/e2e suites for deterministic behavior;
- schema diff, dry run, local disposable database and rollback rehearsal for migration preparation;
- authenticated owner/other-user/anonymous matrices using controlled test identities without
  exposing identifiers or credentials;
- browser automation on affected routes/viewports, relevant RTL paths, console, network and claims;
- CI, Preview smoke, logs and trace identifiers for deployed behavior the agent can access.

Automation never establishes commercial rights, public brand acceptance, real-user consent,
production data access, production migration execution or an unavailable external account. Those
are Class C.

## 5. Operator action queue

`docs/operator-actions.json` is the durable queue. Add one minimal entry per genuinely
non-delegable action; never store a secret or private identifier. Each entry carries:

- stable ID, owning Issue, class, status and creation time;
- the exact operator action and why it cannot be automated;
- prerequisites, expected result and a safe verification method;
- effect on the dependency graph, rollback, and the next safe Issue the session took instead.

Queueing blocks its own path, not the session. Set the affected Issue to `ready-for-human` or
`needs-info`, drop `ready-for-agent` when appropriate, and continue another frontier.

## 6. Waiting, correction and stopping

- Poll CI and deployment checks with bounded waits; meanwhile prepare evidence or inspect another
  independent Issue. Do not create a dependent stacked runtime PR.
- Correct deterministic failures within the Issue. After three materially identical failed
  attempts, record the evidence and reclassify the deviation instead of retrying.
- Stop when the objective is complete, no safe eligible frontier exists, every remaining path is
  dependency- or operator-blocked, the same blocking condition survives the retry limit, a critical
  security/data ambiguity lacks authority, or the execution budget is exhausted.
- On stop, report completed/merged/open PRs, checks, unrun evidence, operator queue, current
  blockers, rollback and the single next action. Never describe an open PR or an unexecuted
  production step as done.

## 7. Rollback

Revert this policy with an ordinary revert commit; it changes no runtime or production data.
Session acceptance requires no per-Issue confirmation pause, no stacked dependency PR, no hard-gate
bypass, accurate queueing of operator work, and a truthful stop only when the safe frontier is empty.
