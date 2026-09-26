# Personal-assistant upgrade planning verification

Date: 2026-09-27. Base: `72059c6327d6ec658e86dee64508f88dd88314e6`.
Scope: repository planning, one documentation-renderer wording correction, and authorized GitHub tracker updates. No product runtime, migration, model/provider call, app build, purchase, account setting or Production action was executed.

## Delivered planning

- ADR-0027 records the accepted relationship-first assistant, visual discovery, interactive results, rebuilt interaction layer and retained domain invariants.
- Four tabs: VP / Journeys / Library / Memory; global Search/discovery. Memory is visible in its tab, relevant VP context, successful save/undo and result-use explanation.
- Experience, versioned integration seams, coding-agent kickoff, visual references and task map live in `docs/product/assistant-upgrade-2026-09-27/`.
- Existing manifest grows from 76 to 83 tasks; new VPJ-77…83 map to #558…564 under Program #187. Revised 21 existing task definitions/bodies and the Program; no Issue deleted or closed.
- Root/current documentation and handoff route to the new plan. Historical handoff is preserved; old accepted evidence and unresolved runtime conditions are not rewritten into success.
- The generator's Program description no longer reasserts a historical six-thread dispatch order. No runtime code was changed.

## Checks

- PASS: `node scripts/vpj-program.mjs verify` — 83 unique tasks, valid source contracts and acyclic combined dependencies.
- PASS: `node scripts/vpj-program.mjs render` and `pnpm docs:check` — manifest-derived bodies, execution rows, stages, documentation index and handoff are synchronized.
- PASS: `node --test tests/unit/governance/vpj-plan.test.mjs tests/unit/governance/vpj-body-progress.test.mjs tests/unit/governance/vpj-lifecycle.test.mjs tests/unit/governance/vpj-sequence.test.mjs tests/unit/governance/handoff-documents.test.mjs` — 58 passed, 0 failed, 0 skipped.
- Original intermediate governance result: 57 passed / 1 failed because new tasks had not yet received GitHub numbers, so a current-dependency link was unresolved. Created and assigned the seven real identities, regenerated and reran all 58; no test or rule was weakened.
- PASS: `node --check scripts/vpj-program.mjs`.
- PASS: `pnpm lint` — source policy, 390 files at the check.
- PASS: new plan relative file links inspected and all 28 new/revised task identities assigned.
- PASS: `git diff --check`.
- PASS: GitHub readback of 28 tasks and Program. Current acceptance, original checked items, state, existing labels/milestones and native dependency edges retained; seven new issues linked to #187. See [readback](readback.json) and [mutation receipts](issue-sync.json).

## Tracker reconciliation

[Before snapshot](issues-before.json.gz) contains the 21 affected existing tasks and Program with native blocker numbers. Updates preflighted the full batch and reread bodies before each mutation. Existing comments were untouched.

#197 had one known drift: its live boundary omitted the 2026-09-18 PR #475 implementation note present in main's generated body. The exact difference was reviewed, the existing live history retained, and the main implementation note retained explicitly after the new body. All other affected generated prefixes were recognized without a blanket overwrite. #195's checked text-worker slice remained checked and scoped; no new assistant acceptance was checked.

## Limits and rollback

This verifies planning integrity and tracker publication only. New conversation, goal, memory consumption, artifact, background execution, four-tab UI and subscription behaviours remain unimplemented/unverified by this change. Their target-environment, device and user acceptance remain with the task owners. Required PR CI/merge state is reported on the PR; this receipt does not predict it.

Planning rollback uses an ordinary revert plus a fresh comparison against the saved issue snapshot. Do not overwrite later execution progress, delete newly accumulated history, restore old runtime grants, change applied migrations or revive deleted memory. New tasks may be marked superseded with replacement references if the plan is later withdrawn; that is not completed acceptance.
