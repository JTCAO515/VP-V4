# Evidence lifecycle — S2 integration in progress

Related to #206/#264. Baseline main8e95279 / PR371 is merged. Its final Quality34771205900, Budget34771205904, Native34771205917 and Preview passed; Production deployment was cancelled and all aliases unchanged at2026-09-13T17:30:24Z.

This slice verifies live eligibility changes without rewriting original completions: current support, a newly published conflict, natural conflict expiry, then natural support expiry. A historical partial must not silently gain evidence after its original gap resolves. It adds no runtime/migration change. The new test uses ordinary author/reviewer publication and real elapsed time, with no SQL expiry rewrite.

PASS: isolated PostgreSQL17/17, zero skips, about50seconds; source syntax and diff checks. The new lifecycle scenario preserves original completion/Turn/work snapshots and owner isolation. This is a disposable database test with controlled classification, not live model or Staging acceptance.

## Staging run v1: FAIL, safely closed

Runtime8e95279 / dedicated Preview dpl_3DBuDovUeBcgkqck7woeHg3W1Xi8. Two real Qwen tasks completed in English/Chinese and returned answered with the synthetic card and existing mobile-payment facts. Normal native API and Web Cookie readback matched; native UI showed both facts and explicit synthetic labels. Web DOM matched task IDs at1365×900 and390×844; mobile screenshots at the initial scroll position show the answer heading, while fact content was verified in the DOM and native views.

The next synthetic conflict submission returned400 INVALID_INPUT. Frozen v1 contains uppercase C in both sourceKey and its synthetic URI; the existing Ops validator rejects each. Therefore conflict-current, natural-conflict-expiry and natural-card-expiry are **UNRUN**. The overall lifecycle run is **FAIL**, not a two-case pass. Both completed tasks settled once, with configured-price estimate22638 CNY micros (about¥0.023); billed cost remains unknown. Both tasks and original operation IDs remain retained; no model call was retried. A native UI automation input appended a fixture email to the retained form; this failed login was resolved by relaunching the signed-out app, without a model submission.

Cleanup PASS: own card publication revoked through normal reviewer API; original12 publications and all original task/Trip rows retained by full-row hash multiset checks;46 migrations,6users/3Trips,317 attempts/0unresolved; reader/Ops false, activeMembers0. Exact host allowance removed, WAF72, Production target unchanged. Browser/native sessions normally signed out, browser tab closed and owned Simulator shut down. See lifecycle.json.gz, cleanup.json, after-disable.json.gz and attempt-audit.json.

The operator controller persists the DB-assigned xid8 before activation, then checks locked row xmins/revisions before cleanup. Local PostgreSQL tests4/4 cover own close, lost commit receipt, foreign takeover refusal and retention failure after close. Independent permission/data review0 Critical/0 Important. Initial review defects and local test setup failures were repaired before Staging activation; no remote schema change. Observed operator scripts are evidence, not portable repository runtime.

## Corrected frozen v2: historical preparation (now FAIL)

Keep v1 unchanged as failure evidence. v2 uses fresh candidate IDs and valid lowercase source keys/URIs. The real Ops admission validator now runs against every statement in a contract test, and preserves a reproduction of the v1 rejection;2/2 PASS. Questions, classifications and lifecycle expectations are unchanged. Four fresh tasks are needed because the first run's original card publication has been revoked and saved answers must not acquire replacement evidence. Maximum remaining calls4, aggregate slice maximum6 including the two retained first-run tasks; each task permits one model attempt. No question tuning or selective replacement of failed semantic outcomes.

Before a v2 window, capture a fresh317-attempt/13-statement baseline, validate both fixtures with the real Ops validator before activation, recheck existing budget/policy validity and freeze the exact runner. At most28 million CNY micros reservation and35minutes in the new window. Card TTL20minutes and conflict TTL5minutes; do not rewrite publication dates. Preserve the original12 and v1 retained records. Revoke only v2's two candidates in cleanup.

This additional payment scenario does not fulfill frozen museum/ferry H07/H08 or complete12-case Harness. H08 was visible during readiness review; do not claim it remained blind to this executor. Physical/VoiceOver, source injection, provider-unavailable, full S2 and Production acceptance remain UNRUN. Maps draftPR372 remains the only independent preparation lane and has not made actual provider calls.

V2 was subsequently executed and failed its final reason assertion; see [v2 evidence](../evidence-lifecycle-r2-20260914/verification.md). Its three full stages passed, cleanup completed, and all six aggregate model calls are consumed. The preparation text above records the pre-run plan, not current readiness.
