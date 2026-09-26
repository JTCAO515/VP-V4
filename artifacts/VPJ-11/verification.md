# VPJ-11 travel pace producer — 2026-09-22

Base: `a3a69189` (`origin/main`). Branch: `codex/vpj-11-memory-task-context`.
Stage S3, Related to #199. This slice implements explicit Profile travel pace control,
native management/Undo and a task-specific eligibility read. It does not complete #199.

## Implemented scope

- Existing `user_profiles.travel_pace` remains the sole authority. Old/default values have no consent.
- Additive migration `20260922033000` supplies local-planning/account consent, revision CAS,
  pause/revoke, latest-save Undo, same-request retry and stale-request rejection.
- Legacy Profile pace changes clear eligibility. Withdrawal clears the undo preimage and old value.
- Native API reuses bearer verification and SQL mobile-session locking. Projection checks actual Trip ownership,
  current input precedence and task-only skipping; optional source-version check rejects stale work.
- Native management reuses `NativeSession.dataRequest` through a four-line wrapper. UI shows a
  four-second, Undo-only saved toast after an acknowledged write; reads/replays do not repeat it.
  Scope changes clear state and late responses are discarded.

## Verification

| Check | Result | Meaning |
| --- | --- | --- |
| New input contract tests | PASS 2/2 | Explicit scope/version, strict bounded inputs, task projection request validation |
| Affected Memory/Context contract suites | PASS 20/20 | Existing lifecycle, receipt, actor and context budget boundaries plus new inputs |
| Source policy lint | PASS | 357 runtime source files, repository policy only |
| `git diff --check` | PASS | No whitespace defects |
| `plutil -lint` project | PASS | Xcode project syntax; not a native build |
| Swift frontend parse, three new files | PASS | Syntax only; no typecheck, SDK build or device result |
| `node scripts/docs-check.mjs` | PASS | Contracts/plan/documentation baseline |
| Narrow TypeScript compile | UNRUN | No output after three minutes through shared dependency tree; own process stopped, use Linux CI |
| Isolated SQL suite, local invocation | UNRUN, 4 skipped at initial invocation | Explicit resource restriction; not a passing database test |
| Independent permissions/data review | PASS | Separate reviewer: Critical 0 / Important 0; static only, no build/DB |

The SQL suite now includes five cases and runs only with `VP_MEMORY_DB_TEST=1`. The dedicated
Linux workflow creates a network-none disposable PostgreSQL, loads real migration history and
checks owner/session isolation, unconsented defaults, two-Trip projection, overrides/skipping,
CAS races, correction/withdrawal/retry, Undo, legacy writer invalidation and rollback faults.
GoTrue/JWT/provider/user behavior is outside that fixture's evidence.

## Effort and scope

Started 2026-09-22; user-acceptance time not yet available. No completed-user-result efficiency claim.
No external account wait; shared-host heavy tasks deliberately deferred to the CI queue.
Global handoff/issue-plan ownership remains with Overall. No shared environment migration applied.

Rollback: revert code; in an authorized environment revoke execute on the new RPCs while retaining
schema, monotonic versions and current revoked states. Do not restore old consent or modify applied migrations.

## 2026-09-24 integration with current main

Merged `origin/main` at `a05528f6` into the existing PR branch. The only content conflict was in
the Xcode project groups: retained the Travel Pace sources/tests and main's privacy resources and
hotel test registration. The new RPCs were added to main's authenticated function EXECUTE allowlist;
the migration's explicit grants remain the authority. No applied migration was rewritten.

- PASS: network-isolated PostgreSQL, complete current migration history, travel pace 5/5 tests
  with zero skipped; covers owner/session checks, CAS, stale retry, withdrawal, exact Undo and rollback.
- PASS: focused input contract 2/2; docs check; source policy lint; Xcode project plist; new Swift
  syntax parse; `git diff --check`.
- FAIL (environment): full local `pnpm test:contract` exited because this worktree lacks
  `node_modules`; it is not counted as a passing full contract suite. Final-head CI remains required.
- UNRUN: native SDK build/tests and target-environment user behavior at this integration point;
  the older Native CI failure's job log is unavailable and does not identify a code defect.

First integration head `9673de75` exposed a current-main DB Integration registry gate: the new gated
`travel-pace.test.mjs` was not classified, so all five lanes failed their preflight before running
database assertions. This is a CI configuration failure, not a passed database lane. Registered the
test in the network-isolated PostgreSQL lane with `VP_MEMORY_DB_TEST=1`; the next head must rerun CI.

After #478 merged, also merged main `f27af3a9`. Four Xcode project conflict blocks were resolved by
retaining one registration each for Travel Pace app/tests, `VPReadableText`,
`AccessibilityContrastTests`, and privacy resources. `plutil -lint`, project scheme list,
Swift syntax parse, registration-uniqueness inspection, DB test classification and diff check PASS.
No Travel Pace runtime/SQL behavior changed in this merge; new-head CI remains the merge gate.

## 2026-09-26 native task consumer slice

Base `0fff80e8` (also checked against GitHub main). The selected Trip's native relative-day outline now
reads the existing task-only travel-pace projection. The user can use a saved pace, skip it for this
outline, or pick an explicit this-time pace. The projection changes only editable local outline titles;
it never sends the preference to a model or writes a confirmed Trip. A `profile` projection is
preview-only: the Add-to-draft button and method reject it. The user must visibly choose a
this-time pace and regenerate, receiving a `current_input` projection, before an outline may enter
the existing editable Trip draft/Proposal/confirmation flow. The client rechecks that task projection
before adding it to a draft; no saved-Profile source is carried into a Proposal in this slice.

Local checks: `pnpm docs:check` PASS; `node scripts/lint.mjs` PASS (390 files);
`git diff --check` PASS; `xcrun swiftc -frontend -parse` on five changed Swift files PASS
(syntax only). `xcodebuild -list` identified the VisePanda scheme. This task's sandbox could
not run Simulator services or SwiftUI/Observation macro compilation; its generic device build
also lacked the ignored AMap bundle. Separately, the main session reported exit 0 for a generic
iOS Simulator build and `xcodebuild build-for-testing` of the stable 103f worktree, with the app
and test bundle compiled. That build-for-testing had only an existing iOS 17 deprecation warning
in `AccessibilityContrastTests`. These are native compile results, not XCTest results.

The main session attempted focused `NativeTravelPaceTests` and `NativeTripStateTests` on two
iOS 17.5 simulators with parallel testing disabled. Both local `xcodebuild test` invocations
stalled before test execution or an xcresult was produced; they were stopped to release the
shared Mac runner (exit 143). Focused XCTest is **UNRUN**, neither PASS nor assertion FAIL.
The same-SHA Native CI result remains pending. Target Staging migration, real identity/Trip use,
Free/Pass lifecycle and withdrawal behavior remain UNRUN.
The earlier draft had only a View-local pace basis, which would be lost on restored pending Proposals.
This slice now prevents saved-Profile projections from entering drafts at all. Durable owner/source
binding and atomic server confirmation remain future requirements before direct saved-pace Proposal use.
This PR cannot claim that broader #199 acceptance.

After the 2026-09-27 preview-only safety change, `pnpm docs:check`, Swift frontend parse of the
five changed Swift files, and `git diff --check` passed again. The main session committed this
nine-file slice as `ceb5c83d`, then merged `origin/main` at `e6ae8d06` without conflicts; the
combined head is `4dc6521adccf2c2635d2791908c5e9ad5b87b148`. Its diff against main still
contains only this slice's nine files; `NativeTripView` also contains H3's separate mainline addition.
On this combined head, the main session ran `xcodebuild -quiet build-for-testing` for generic iOS
Simulator with DerivedData at `/private/tmp/vpj11-pace-combined-derived` and signing disabled:
exit 0, app and test bundle compiled. The only reported diagnostic is an existing iOS 17
deprecation warning in `AccessibilityContrastTests`. This is compile evidence; focused XCTest
remains UNRUN after the interrupted local launches, pending the final PR SHA's Native CI.

Rollback: revert this client code. Preserve Profile revisions, prior withdrawal state, and all
confirmed Trips; no migration or shared environment was changed in this slice.
