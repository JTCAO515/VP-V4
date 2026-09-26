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

## 2026-09-27 explicit Web Memory create/Undo preparation

Base `origin/main` at `253930f9`, branch `codex/vpj11-memory-create-undo-20260927`.
The existing Web Memory page had a real explicit-create API but no write-success toast; its
generic `deleted` transition had no source or version condition and could not safely be used
as Undo. This slice keeps `memory_profiles` as the sole authority, adds a monotonic row revision,
returns the create source receipt/version, and adds an owner-locked Undo of exactly revision 1.
Both new definer RPCs check the mobile session before any replay/read return; the create wrapper
locks and rechecks the Profile state and granted consent before acknowledging the write.
An identical Undo operation reuses its deletion receipt; later transitions or a different source
make the old Undo conflict. The page shows a top zh/en saved prompt after the first acknowledged
create result and same-owner readback of the exact source, revision, explicit state and granted
consent, including a first acknowledgment delivered by replay. A later change gets a truthful
status message and no stale Undo entry.
The prompt has only Undo, normally hides after four seconds, and never displays the summary by
default. An unknown Undo result retains the same operation for retry; owner change clears it.
Consent/create requests also send the last read owner ID as a rejection-only guard so an A-initiated
write cannot land in B if browser credentials switch before those requests.
No model recipient, Trip writer or generic Memory summary update was added.
When a deployment lacks this migration, only a specifically missing v2 RPC/`revision` column
uses the old owner-scoped list/create path; the response has no Undo eligibility and the page
does not show the new toast. Other failures remain failures. This prevents a code-first rollout
from breaking existing Memory creation, but is not a tested shared-environment deployment.

Checks observed in this worktree: eight focused Memory/error/Copilot source contract tests PASS;
`node scripts/lint.mjs` PASS (393 files); `node scripts/docs-check.mjs` PASS;
`git diff --check` PASS. TypeScript compiler API with the original repo's dependency tree
reported no changed-file diagnostic and one unrelated missing StoreKit module; it is not a
full passing `pnpm typecheck`. `pnpm check`, `pnpm typecheck`, and offline install produced no
output in this dependency-free worktree and were stopped, so they remain UNRUN. Docker socket
access was denied; disposable `initdb` could not create a shared memory segment in the sandbox.
No database assertion, browser timing, live account or Staging write has been observed yet.

## 2026-09-27 final-head Native CI assertion

PR #555 head `9f2abaf341ad458ba82c6d0031572b1b64305f58` ran Native iOS CI
([run 36254623450](https://github.com/JTCAO515/VP-V4/actions/runs/36254623450)).
The main session inspected its retained xcresult: iPhone 17 Pro / iOS 26.5 reported
133 PASS, 1 FAIL and 34 SKIP. The sole failure was
`NativeTripStateTests.testAuthorizedPaceChangesOnlyUnconfirmedRelativeDayDensity()` at
`NativeTripStateTests.swift:151`. Its original balanced assertion treated a semicolon as a
second theme, although a single food or walk theme already includes that punctuation.
Build and test-build passed; `test-without-building` exited 65 due to this assertion.

The follow-up edits only that test's assertions: balanced days must contain exactly one
food/walk theme, packed days both themes, relaxed free days remain, and day counts stay four.
The implementation is unchanged. Local iOS 17.5 focused XCTest remains UNRUN as recorded above;
the corrected test needs new-head Native CI before it can be called PASS.
