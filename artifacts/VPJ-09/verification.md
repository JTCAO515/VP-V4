# VPJ-09 bounded relative-day Trip slice — 2026-09-18

## Scope and dependency check

Source branch `codex/vpj-09-relative-day-20260918` began at `origin/main` `2370391f`. GitHub milestone #9 had 15 open / 1 closed; all 15 and their practical order are in [the S3 dependency snapshot](s3-dependencies-20260918.md). #192 is closed and main has a real native/Web Trip create → Proposal → exact confirmation → readback path. #195 and #196 remain open, so this slice does not claim the complete Ask/recovery chain. #198 and #219 were not changed.

The native Trip screen now accepts a bounded first-time multi-day food/walking request, presents food-first and walk-first relative-day directions, and lets the user edit daily labels. Calendar dates and budget remain unknown at this stage. A valid user-supplied start date is required before the outline becomes a local Trip draft. Existing days are kept and overlapping dates are rejected. Proposal creation, visible diff, exact-version confirmation, rejection, and native/Web reload use the existing writer and permissions. No venue, route, time, cost or feasibility is inferred.

## Observed checks

| Check | Result | Evidence |
| --- | --- | --- |
| Native simulator build | **PASS** | `xcodebuild build`, iOS Simulator destination, code signing disabled. |
| New native outline model and patch tests | **PASS** | Actual iOS 26.5 iPhone 17 Pro Max Simulator, 2 pass / 0 fail / 0 skip: valid/invalid and ambiguous-city prompt, calendar-date binding, overlap rejection and unchanged dinner. [XCTest summary](native-model-summary.json); exact command in `commands.jsonl`. |
| Native visible path on real local Auth/PostgreSQL | **PASS** | `node tests/integration/identity/run-native-io.mjs --outline`: one ordinary synthetic account; create → four-day guided outline → local draft → Proposal/diff → explicit confirm → terminate/relaunch → version 1 and four items. XCTest summary: [summary.json](native-ui-20260918/summary.json), 1 pass / 0 fail / 0 skip. Proposal, confirmed and reloaded screenshots are mapped by [attachment manifest](native-ui-20260918/attachments/manifest.json). Owned simulators and synthetic users were deleted. |
| Native/Web real database contract | **PASS** | `node tests/integration/identity/run-native-io.mjs --same-trip`: disposable local Supabase Auth/PostgreSQL, ordinary synthetic owner, retained confirmed dinner, appended two dated outline items through Proposal/Confirm, native and Web version 2 content equal; concurrent/replay/owner-boundary checks in the same existing test also passed. Exact synthetic users and stack removed; 1 integration test pass / 0 fail / 0 skip. |
| Web/TypeScript repository checks | **PASS** | `pnpm check` (lint, typecheck, build, repository test), `pnpm test:unit` 114/114, `pnpm test:contract` exit 0, `pnpm evals` 35/35, `pnpm docs:check`, and `git diff --check`. Generated unrelated eval artifacts were restored. |
| Target Staging and full Issue | **UNRUN** | See [unrun.md](unrun.md). Local actual DB and UI results are not remote release acceptance. |

An earlier `NativeTripStateTests` run on the shared iPhone 17 Pro simulator exited 65 with three existing session-state tests failing. A later full-state retry on a separate iPhone 17e simulator entered `simctl diagnose` and was interrupted after 154 seconds; its status is **INTERRUPTED**, not pass. The two added outline tests passed on a third isolated iPhone 17 Pro Max simulator, and the actual Auth/PostgreSQL UI path passed on an owned iPhone 17 Pro. No failed or interrupted run is treated as a pass. The prior session-state failures still need diagnosis before full Issue acceptance.

## Rollback and limits

Revert this PR to remove the bounded outline UI and model. It adds no migration, provider call, external order, automatic Trip write or production change. Already confirmed Trips remain under the existing append-only Trip contract. This is a complete local user path for the bounded input, **not** completion of #197 or #219; the milestone open count is unchanged.
