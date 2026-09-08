# ADR-0024: Separate development preparation from capability acceptance

Status: proposed for review on 2026-09-08, following JT's request to inspect VP-V4 and optimize
requirements that do not fit actual development. Effective on merge of the adopting PR.

## Context

At main `1bd1ffb4bc91afeffbc806035f4d56f375d50359`, baseline PR #253 and preview PR #254 are
merged, but all 65 VPJ tasks still carry `status:blocked`. The remote verifier requires every task
to stay open and blocked forever. Root instructions require full Web/browser checks for any
change; the active contract entry still contains old AI rows and permanent-looking file locks.
One-Issue/one-PR and repeated three-file handoff updates make incremental delivery harder.

## Decision

Adopt `docs/agents/development-workflow.md` as the shared execution policy. It supersedes the
workflow portions of ADR-0023, the master report sections 18/23/24, agent documents and copied
Issue text where they prescribe universal local checks, immutable file ownership, mandatory
worktrees, one-to-one Issue/PR mapping or a halt solely for stale labels/missing maintenance rows.
It does not supersede product acceptance criteria or runtime safety contracts.

Keep product implementation on the VPJ graph. Permit independently scoped repository preparation
against available contracts while its parent waits for runtime evidence. Classify local validation
by actual change impact, retain CI and final acceptance gates, and distinguish code merged from
capability verified. Model/provider policy, native-first zh/en scope, Trip confirmation, RLS,
privacy, licences, migration history, payment and production authority remain as accepted.

The verifier must recognize a merged baseline and completed tasks. Historical migration checks
remain strict when closing/replacing old work. Verification stays read-only with respect to GitHub;
it reports potential stale root labels without assigning readiness from labels alone.

## Acceptance and rollback

Read current entry points without contradictory mandatory historical rules. Test pre-merge,
post-merge, completed, unresolved-blocker and migration-snapshot verification paths. Keep all
65 task identities, 198 native dependency edges and product acceptance unchanged. Confirm no
workflow, runtime, deployment or security configuration is weakened by this PR.

Revert the adopting PR to restore the prior development workflow. No database, deployment or
customer data rollback is needed. This decision does not approve its own merge.
