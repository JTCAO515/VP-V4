# AGENT-013 H09/H10 scoped delivery

Base: `f702d71aa59c2d3ad79b31df50261f76a4cd3ce0`, clean at startup,
same tree as QA `1b8f372eaac378fb91844f48dc0a4bcf7543907a`.
Branch: `codex/agent013-runtime-recovery-20261014`.
Final source/test head: `800ee3d786f8123066f413b7f9e1c7061d970c65`;
subsequent evidence-only commits do not change the tested module or tests.
Official model request: Sol/medium; effective model/tier not exposed, unknown.

Implemented callable driver, concrete authorized-fetch bridge, existing-port
receipt/reload/replay validation and a bounded JSON/Markdown report producer.
H09 confirms at most once per explicit invocation and reconciles lost ACKs by
readback only. H10 consumes production cancel/replay; late completed tool events
are ignored, while post-cancel new tools/artifacts or conflicting terminals fail
closed. The original durable worker is imported for the late-result test.

No new Trip, budget, journal, queue, database or usage authority. No original
Harness seeds/cases/holdout/grader/registry/CLI or production port edits. Module
API and precise Main integration candidates are in
`evals/harness/runtime-recovery/README.md`.

Main explicitly authorized importing only the exact two-file CI dependency
`ec29bdf9e998c69090c22d3c119ac05f9e0fe422`, cherry-picked as `ce4e024c`:
`scripts/ci-change-scope.mjs` and
`tests/unit/governance/ci-change-scope.test.mjs`. No hand edits to those files.
Main's earlier PR702 static-output FAIL remains historical; this task did not
claim to have observed that remote failure. No skip/threshold/gate weakening.

Local checks:

- PASS: 25 direct runtime adapter tests, zero skip/cancel/fail.
- PASS: TypeScript check after the final resource/closed-input delta.
- PASS: 10 imported CI selector tests; combined 32 tests at the prior 22-test
  runtime head. The unchanged Main CI dependency is reused.
- PASS: source lint and documentation checks; `local-checks.log` records the
  refreshed 800ee3d7-source checks, including 25 tests and typecheck.
- PASS: diff whitespace checks.
- No Web build/visible UI changes in owned source; CI chooses its applicable
  full suite because the authorized CI-selector dependency is also present.

Resolved local failures retained: initial Node strip-only execution rejected a
TypeScript parameter property; it was changed to an ordinary declared field.
The added caller-mutation test initially failed typecheck because its clone
retained readonly types; the test now constructs a writable caller object.
Neither failure changed a production invariant or test assertion.

Actual Staging H09/H10, provider costs, durable process restart, DB writes,
production, native/Web target consumers and human/device acceptance: **NOT_RUN**.
No target credentials were acquired or emitted; provider/data writes were not
executed. GitHub auth was present, official network repo/issue reads and normal
Git push were observed. Approval profile is disabled; this does not grant new
target permissions. Tests use injected controlled boundary responses.

Known existing-port limits: requested API/worker/config versions are caller-bound
and not attested by runtime response; original idempotency-key readback,
Task→Trip causal relationship, commit count, quota debit, provider usage and
vendor costs remain **unknown**. The actual Trip confirmation receipt plus
operation and reload can prove scoped proposal application; they cannot prove
whole ServiceTask completion or complete accounting. Cancelled is a finite
observed window with unchanged Trip, not a guarantee about all future events.
Full parent #264 remains open; other AC and required-mode acceptance are not
completed by this slice. Shared entry hookup and missing authoritative ports
remain with Main/original owners.
