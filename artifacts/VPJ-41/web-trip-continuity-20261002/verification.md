# WEB1 local canonical confirmation continuity

2026-10-02. Related to #234; full parent acceptance remains incomplete.
Opened on merged main `99fce505`, then fast-forwarded through #616 and #617 to `03e9627ee753ccc19a447e9edd8c55794b635368` before the final run. The summary records SHA256 of the actual tested product/test/runner files, including the local product fix; no remote target or migration was applied.

## Reused coverage and remaining gap

- #192's `artifacts/VPJ-05/server/verification.md` and `browser-root/verification.md`, plus existing `native-same-trip.test.mjs` / `same-trip-browser.mjs`, cover ordinary Auth/RLS, same Trip UUID, immutable revisions/digests, CAS, concurrent/idempotent confirmation, reload, and earlier desktop/390x844 zh/en browser actions. Their historical dates/sources remain explicit; they are not presented as new V5 acceptance.
- #198's Proposal/revision contracts retain the same writer and stale-version rejection. The #599/#601 comparison-only consumer tests are retained and not duplicated.
- New gap: real Web cookie/browser confirmation with the V5 comparison consumer present, exact native-created Proposal/child revision, future result schema isolation, and cross-client rejection with no additional Trip event.

## Actual result

PASS, one dedicated integration flow, zero skipped. Real disposable local Supabase Auth/PostgreSQL, Next Web cookie session and native Bearer session, headless Chromium 1280x900 / en. DB API64641 / Next64651; a uniquely named `vp-web-continuity-*` stack is created and removed by the dedicated runner. No Simulator.

1. Native creates the pending parent. Ordinary Web and native reads resolve the same ID; Web edits it into a canonical immutable child and displays its actual revision and before/after diff. Head remains1 until explicit confirmation.
2. An unsupported comparison/99 transport response (based on the actual ordinary-cookie result read) includes an alien target. This is a clearly controlled schema seam, not a real provider or real published future artifact. It grants no confirmation action; the real Web confirm request still contains the canonical child ID and digest. Native reload returns the same Trip/head2/content; Web reload agrees. Trip event count increases exactly once.
3. Native creates the next child while Web still holds its parent. Web confirms the old parent, receives409, and Trip/head/events remain unchanged. The real failure exposed an effect bug: automatic reload replaced the conflict notice with ordinary pending. The only product change preserves an existing conflict during that automatic pending refresh.
4. For isolated head CAS, reuse #192's ordinary-owner/RLS legacy-coexistence pending fixture. No permission is changed and no Trip is edited through SQL. The native confirmation API advances head3, then Web's older pending ID/digest receives `STALE_TRIP_VERSION`409 with no extra event/write. The no-longer-confirmable candidate disappears; the conflict remains visible.
5. An explicit new Web review clears the prior conflict and remains unconfirmed at head3. Navigation to a second owned synthetic Trip resets the old notice and target. No page errors or horizontal overflow.

The normal create API correctly refuses a second pending proposal; the CAS fixture does not claim the product can create arbitrary concurrent pending proposals. The browser hydration/locale initialization failures were test setup failures and are not product regressions. The actual conflict RED and final GREEN are retained separately.

## Checks and limits

PASS: dedicated runner, local classification (`db-integration --list`), lint, typecheck, docs check, diff whitespace, two inspected viewport PNGs. The registered CI step is only appended after journeys-goal-index-http; all existing steps and other owners' hunks are preserved. The broader required PR gates run in CI rather than being duplicated locally.

UNRUN: physical native UI, Staging/Production, real provider, materials/entitlements and full #234 acceptance. The prior dual-viewport/zh-en evidence is reused; this effect-only notice fix introduces no layout or translation change, so no extra full viewport/locale matrix was run.

Rollback: revert this one effect change and its dedicated regression runner/step. No schema, writer, authorization or data conversion changes.

## Runner diagnostic review fix

The independent review identified a CLI diagnostic leak: substring redaction did not guarantee that short passwords, punctuated cookies, DSNs or Authorization values could not enter an Error. Startup and cleanup now reuse the already merged #612 fixed-enum process classifier without changing it. Raw CLI output is never returned; successful CLI output stays silent. Nonzero startup does not launch the test, cleanup runs only on the runner-created workdir/project, failed cleanup preserves that directory, and cleanup failure cannot replace the original nonzero exit.

PASS: controlled process injection tests2/2, zero skips; includes short/punctuated secret-like stdout/stderr, successful silence, start37 with cleanup0/29, exact allowed diagnostic enums and owned recovery cleanup. Syntax, lint, typecheck and diff checks passed. The original real browser1/1 evidence and its original runner fingerprint remain unchanged historical records; the product and real continuity test fingerprints still match exactly. The browser chain was not repeated for this diagnostic-only fix. The new runner remains subject to final-head CI.
