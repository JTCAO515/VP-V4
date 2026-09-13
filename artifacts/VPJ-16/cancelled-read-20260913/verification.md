# Cancelled grounded work read repair — local and bounded Staging verified

Related to #206 / #264. Baseline PR357 merged at a352c7e.

An actual SIM evaluation lost its original mobile session after native login.
Normal expired-lease claiming cancelled its work, but public Turn/event history
remained accepted; consumers kept waiting. The observed cancelled Turn is
73ea2ef0-5aca-4993-b3c1-8662cc48fdaf (synthetic Staging task).

## Change

Append one migration replacing only read_grounded_turn. Same-owner unfinished
work cancelled/failed/quarantined projects cancelled/failed/failed while existing
public terminal or completed grounded answers win. Read authorization and empty
result fields remain unchanged. SSE allows only that empty unfinished terminal
projection without a persisted terminal event, preserves event/cursor history
and stops heartbeat. No worker, budget, consent, Trip or provider changes.

## Verification

- PASS: database integration15/15; actual native session SQL login replacement,
  normal claim cancellation, initial/acknowledged SSE cursors, list/read status,
  owner/session/policy/hidden/consent denial, unchanged Turn/events/work/content/
  grounded/budget records, migration transaction rollback and exact RPC ACL.
  SQL fixture auth claims are not GoTrue or real device acceptance.
- PASS: contracts274/274; focused SSE3/3; lint266 files and typecheck.
- Security:146 PASS,1 SKIP: existing AI14 disposable identity target absent.
- PASS: independent critical-contract/migration review0 Critical/0 Important.
- PASS: Staging44 encrypted backup and network-isolated restore;6users/3Trips,
  data/schema digests preserved and temporary container removed.
- Initial test implementation mistakes (withdraw RPC name; budget key name)
  corrected. Existing lease-expiry test failed before entering its lock wait
  under load; test lease now5s, statement timeout15s, expiry wait10s. It still
  requires observed blocking, actual expiry and denied completion. Failure logs
  retained; final full database suite passes.

## Actual Staging observation

Frozen API/native c8a12c86e2fff1432dbc866e319200d22d9c10d6; dedicated Preview
dpl_GQ7ixe8EFGxt9d6vBvLzEF1mRXSU, vp-v4-evh5ltzbs-jtcao515s-projects.vercel.app.
The ad8d087 follow-up changes only the handoff date to its accepted YYYY-MM-DD
format; original Quality34764821307 failed that date assertion. The targeted
governance test2/2 passes after correction; fresh CI remains required.

- PASS: Staging44→45 through official CLI, exactly one pending migration.
  All78 original table digests and261 schema entries verified, only expected
  read_grounded_turn definition changed. Exact candidate definition and ACL
  matched isolated apply/rollback. All role/RLS and default-disabled checks pass.
- PASS: actual native-v2 credentials/login → existing consent → read history,
  cancelled SSE cursor0/1, completed SSE and foreign-owner denial. Both API
  sessions logged out200. No new consent or worker dispatch.
- PASS: Web English cancelled question at1365×900 and390×844, reload retained
  it, completed English/Chinese SIM sources retained, foreign account could not
  see the English task. Both normal UI logouts observed, console errors empty,
  viewport reset and owned tab closed.
- PASS: ad-hoc signed native Staging build/codesign; actual existing English
  question shows 已取消 in Chinese UI. Reload retains cancellation; adjacent
  completed payment card retains Reviewed date and expandable PBOC page locator.
  Native logout observed; owned simulator shut down. No new UI submission.
- PASS:207 Turns/207 budget attempts/1549974 CNYmicros estimate/0 unresolved
  unchanged. Exact before/after digests match for all Turns, events, grounded
  answers, work, budgets and Trips. These are global staging totals, not charges
  or a new evaluation.
- Cleanup PASS: reader/Ops false,0 active members,6 users/3 Trips, own WAF host
  removed(version64), window process exit0. Shared/Production targets unchanged.

## Observed remaining display defect

Web currently hides the entire retained card container while revalidating every
read lifetime. At deep scroll, two screenshots captured a blank viewport before
content returned at the same position. Ready-state cancellation/source screenshots
are separate; no continuous-reading pass is claimed. Source inspection points to
SavedAnswers.tsx load→invalidate and the state-controlled hidden container.
Address this observed rendering interruption in a separate focused slice while
preserving the30-second evidence deadline and immediate permission invalidation.

## Remaining / rollback

Final-head CI/merge pending. Native cancellation was observed with Chinese UI
and the existing English question; a separate English-native UI run, physical
VoiceOver, full S2 and Production remain unrun. Rollback closes scoped entry and
uses an appended function repair; never rewrite applied migration/history/budget
records. No new provider call, payment or Production release occurred.
