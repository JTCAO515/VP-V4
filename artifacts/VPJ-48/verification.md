# VPJ-48 bounded verification

Scope: registered-author submission → independent internal moderation/rejection →
author withdrawal. Public UGC remains unavailable; #235 is not closed.

- PASS: `node --experimental-strip-types --test tests/contract/community/request.test.mjs`
  — 4 tests, closed inputs, authority forgery, HTTP gate/origin/bearer rejection,
  body bound, private error mapping, acknowledgement timeout semantics.
- PASS: `git diff --check` before initial commit.
- Pending: isolated PostgreSQL CI and repository-required CI on final PR head.
- Pending: independent permission/migration code review.

No local build, full test suite, PostgreSQL stack or simulator was started. Machine
load restrictions route expensive work to authorized Linux CI. The independent
workflow file is a necessary adjacent path to execute this migration's SQL tests;
no shared budget/native workflow or global handoff/issue-plan was edited.

Work started 2026-09-22 ~01:30 UTC. Runtime/user acceptance not reached; elapsed
acceptance time is unmeasured. Rework and external waiting are recorded in the PR.
