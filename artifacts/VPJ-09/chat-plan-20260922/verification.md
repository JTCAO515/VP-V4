# VPJ-09: current Ask input to relative-day outline

Related to #197; parent remains open. Base: `a3a69189f349a9e9547157c3cf4ad13232ebd68c`.
Work started 2026-09-22 around 10:22 Asia/Shanghai. Target acceptance has not occurred;
start-to-acceptance duration is unavailable. Shared host load was 269 at 10:26,
so Overall prohibited new local native builds, simulators and database stacks.

## Implemented

- Supported new-goal composer input opens a local planning sheet without sending
  an Ask turn; the same input immediately generates editable relative days.
- No Trip, date or budget is required to see the initial outline. Selecting or
  creating a Trip preserves it; only an explicit date can enter the existing
  append-only local draft → proposal/diff → exact confirmation path from #475.
- Food-only/walking-only inputs choose that direction; two interests retain the
  existing alternatives. The UI explicitly discloses unsupported constraints.
- Entry dismisses the Ask keyboard. Return retains the original composer and
  underlying layout, with a warning before losing unsubmitted planning edits.
  Account-scope changes dismiss the sheet; grounded read leases revalidate after it.
- Existing source-text edits invalidate old titles. No stored preference or
  default profile pace is consumed. No shared worker, store, DTO or writer change.

## Evidence

- PASS: Swift frontend syntax parse of all five changed Swift source/test files.
- PASS: standalone production-model smoke, 22 assertions for original input,
  one/two interests, input limit, unsupported city, invalid/overlapping dates,
  preserved fixed content, base version and no inferred times. See `model-smoke.swift`.
  This runs Foundation model code only, without Simulator or a database.
- PASS: `git diff --check`.
- PASS: `node scripts/docs-check.mjs` (76 tasks, contracts and archive hashes).
- Native build and XCTest: UNRUN locally due to the shared-host resource restriction;
  automatic single-runner CI will report separately on the PR head.
- Added opt-in English/Chinese native UI cases for immediate generation, copied
  input, keyboard dismissal and return to the same composer. UNRUN until the
  isolated native text test environment and a serialized Simulator window exist.
- Real Auth/PostgreSQL, same-Trip Web reload, target Staging, device and
  accessibility: UNRUN for this increment. #475 evidence is historical and is
  not represented as new evidence for these changes.
- Web/server behavior is unchanged; no local Web build or broad test suite was
  started. Required remote checks remain applicable.

## Full Issue remaining

Saved explicit preferences await K/#199's merged authority and a genuine planner
consumer. Arbitrary vague requests, negation/compound input, general deterministic
budget/time/fixed-item constraints, and full target-environment Chat → Plan →
diff → confirm → both-client reload remain open. Grounded venues/routes and
feasibility remain #219, local replanning #198. Date/budget unknown is not a claim
that supplied prose constraints were applied. This PR does not close #197.

Rollback: revert this increment; previously saved Trip/proposal data is unchanged.
No migration, external provider, paid operation, production or shared-Staging write.
Global handoff/issue-plan remain Overall-owned. L/#211 independently owns only
the Ready link inside `NativeTripView.confirmed(_:)`.
