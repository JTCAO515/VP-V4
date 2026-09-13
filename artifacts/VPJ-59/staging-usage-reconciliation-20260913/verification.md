# Validated usage recovery — local evidence

Implemented on the source following PR347, in an isolated worktree. Real Staging usage recovery and full#195/#196/S2 acceptance remain pending. No remote ledger, account, price, scope, migration or production change has been made by this slice.

The trusted worker now fsyncs closed validated usage before settlement. Explicit recovery validates the original private configuration/journal and only settles the original attempt. Missing/torn/invalid usage remains unknown; no provider call, reserve, hold release, Turn creation or Trip mutation occurs during recovery. See docs/contracts/vpj-59.md.

PASS:14/14 actual PostgreSQL cost tests in a network-none disposable container (no GoTrue/provider claim), including SIGKILL after fsync, original dispatched hold, concurrency denial, settlement acknowledgement loss, exact replay and conflicting cost rejection. A fresh recovery object reads the retained receipt; the single attempt remains settled at its observed cost.26/26 worker/security checks passed; final cost contract plus receipt/CLI checks12/12 passed, including ordinary/thinking/service journals, expired service replay, private-file guards and torn tail. Lint/typecheck, complete Next build and docs check passed.

Independent money/data review initially found one Important: bounded-thinking worker journals use worker-run/3, which the first parser rejected. The parser now derives the exact version from configuration, and explicit CLI regressions cover it. Follow-up review0Critical/0Important also checked the cancellation-cause fix; hashes retained. Review is source inspection, not runtime proof.

Retained failed runs: initial SQL13pass/1fail and second12pass/2fail. The ordinary200ms fixture timeout incorrectly included slow Docker settlement; ordinary scenarios now use10000ms while true timeout remains10ms. The second run also exposed a real pre-existing bug: a later timeout could overwrite an earlier cancellation while pending settlement drained. The timer now preserves the first abort cause; the regression deliberately delays pending recording beyond the10ms timeout after cancellation. Final14/14passed. No failed run is counted as acceptance.

UNRUN: actual selected-version Staging recovery, real supplier outage/tail loss, supplier invoice reconciliation, automatic lost-answer recovery, complete cancellation/Trip recovery and release acceptance. Historical no-usage holds are not retrospectively settled by this implementation. Existing physical-device deferral remains in force.
