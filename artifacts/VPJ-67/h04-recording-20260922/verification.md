# VPJ-67 H04 recording consistency slice

Base: freshly fetched main `72095f93e65489b89e373a01380bbfff1f7f8ec5`, 2026-09-22.
Branch: `codex/vpj67-readonly-evidence`. Related to #264; does not close it.

Implemented a content-free recording adapter using the existing Web grounded-history
parser and historical usage validator. It catches blocked instead of clarification,
cross-task links, missing usage, Trip creation and equal-count content mutation.
Incomplete snapshots remain evidence insufficient. No raw question, Trip content or
exception detail appears in the returned report. Diff reviewed by implementing agent.

PASS: single-process Node contract checks, 11/11:
`node --experimental-strip-types --test --test-concurrency=1 tests/contract/harness/recorded/h04-readonly.test.ts tests/contract/harness/recorded/usage-trace.test.ts`.
PASS: `node scripts/docs-check.mjs`; `git diff --check`.

UNRUN locally: full typecheck, full suites, build, database and native/browser runtime.
Local heavy work is prohibited by Overall's current machine-load restriction; use
existing Linux Quality PR CI for repository checks. Native CI path filter is not
triggered. Real provider calls, Staging writes, migrations, Trip writes: none.
Bilingual fixtures are supplied RPC recordings, not real bilingual task observations.

PR #420 verified MERGED into `testing-chat-vpv4` (`a9a1bfc5`), not main.
Its H04 primitive returns blocked while H04 allows clarification; this adapter fails
that mismatch. No cherry-pick, seed hash change or #267 artifact regeneration.
Original no-city prerequisite, authenticated full Trip collection snapshots, actual
native/Web UI, current consent and attempt-set completeness remain UNRUN/unverified.
See docs/harness/VPJ-67-H04-RECORDING.md for the input contract and bounded live plan.

Network: initial GitHub fetch TLS failure; sequential HTTP/1.1 retry succeeded.
GitHub Issue #264 and PR #420/open-PR ownership subsequently read successfully.
No #206/#267/#195/#360 implementation changes. Rollback: revert this adapter slice;
no production state or schema changes require rollback.

Efficiency: work started 2026-09-22; user acceptance time pending. Rework: tightened
incomplete-snapshot treatment after Overall clarified evidence requirements.
External waiting: transient GitHub connection failures and pending live authorization.
