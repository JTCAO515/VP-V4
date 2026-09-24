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
