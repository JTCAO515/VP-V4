# VPJ-48 bounded verification

Scope: registered-author submission → independent internal moderation/rejection →
author withdrawal. Public UGC remains unavailable; #235 is not closed.

- PASS: `node --experimental-strip-types --test tests/contract/community/request.test.mjs`
  — 4 tests, closed inputs, authority forgery, HTTP gate/origin/bearer rejection,
  body bound, private error mapping, acknowledgement timeout semantics.
- PASS: `git diff --check` before initial commit.
- Pending: isolated PostgreSQL CI and repository-required CI on final PR head.
- PASS: independent read-only permission/migration review; one non-blocking SQL
  whitespace-validation mismatch fixed and incrementally re-reviewed. No unresolved
  blocking finding. Review is not merge approval.
- PASS: source policy lint (347 files), `node scripts/docs-check.mjs`.

No local build, full test suite, PostgreSQL stack or simulator was started. Machine
load restrictions route expensive work to authorized Linux CI. The independent
workflow file is a necessary adjacent path to execute this migration's SQL tests;
no shared budget/native workflow or global handoff/issue-plan was edited.

Work started 2026-09-22 ~01:30 UTC. Runtime/user acceptance not reached; elapsed
acceptance time is unmeasured. Rework and external waiting are recorded in the PR.

Initial isolated SQL CI (run 35676940819, repeated in 35677017320) applied
the migration history and ran 5 scenarios: 3 passed, 2 failed because the test
expected UNAUTHENTICATED for a missing/deleted session. The unchanged existing
`guard_mobile_rpc_v2` rejects this earlier with SESSION_REPLACED. Corrected those
two exact expected errors; the rejection assertion and identity guards are unchanged.
This is a test expectation defect, not relaxed authorization. GitHub log retrieval
was delayed by TLS handshake timeouts before the error could be diagnosed.
