# Library v2 translation page / exact consumer

2026-10-02. Starting main `f4511103de0b960ef9535043b7ab034eefe0047b`; updated by fast-forward to merged accessibility baseline `eee7ad3c7d69dd22591095a2a337fbe6829f018b`. Old branches retained.

## Result

Library now delegates translation pages and exact opening to the merged `NativeSavedTranslationHistoryStore` and fixed `NativeSession.translationHistoryRequest`. No domain writer, API, SQL, shared session, fixture or project change. One page replaces another; query matches original/translation/back-translation on the displayed page only. A no-match message makes no assertion about other pages or full history. Unavailable scans remain unavailable, not empty.

The thin wrapper hides an old page immediately when the requested page identity changes, preserves the domain reader's cursor qualification until it validates pagination, and rejects expired anchors. Explicit refresh and returning from a card reload the first page; no automatic server scanning loop. Policy before/after, exact full body and notice matching, 1MB cap, request-start monotonic 20s lifetime, actor/cancellation/generation checks come from the authoritative reader. Filtering does not renew lifetime or call a network reader.

## PASS observations

- Native Knowledge 28/28 on iPhone SE iOS17.5, including existing body/policy/revocation/late-response/account/TTL cases updated to the v2 wire. Added second-page replacement with an older translation, exact read independent of the old owner-latest20 window, current-page identity checks, expired cursor with zero read calls, and sparse unavailable versus empty.
- Docs, source lint, TypeScript, diff and native test compilation pass.
- Owned disposable Auth/HTTP/PostgreSQL + actual native UI: **1 executed, 1 passed, 0 failed**, not a restarted zero-test summary. [Summary](summary.json), [safe route status](routes-status.json), [test log](auth-ui-pass.log.gz).
- Preparation uses original translation/text admission with explicitly synthetic completed content: 26 translations and 21 unrelated requests. The selected old Turn is absent from the old `/api/translate` latest20 result but readable via exact v2. Its actor's model budget is frozen in this disposable instance; **0 model/provider calls** observed throughout.
- UI logs in through legacy Profile. A real current session GET verifies the owned subject and legal epoch; after terminate/relaunch into the accepted cold four-tab entry, authenticated policy UI is restored and a second session GET verifies the same subject/epoch. Library then opens older page, verifies the first-page row disappeared, taps the old row, checks exact translated body, dismisses, refreshes first page, and withdraws consent through the original endpoint. The unavailable state contains no old row or next button.
- Actual images inspected: [old exact body](old-exact.png), [withdrawn state](withdrawn.png). This is local owned synthetic data with real Auth/HTTP/SQL/UI, not Staging, real provider quality or physical-device acceptance.
- Owned stack/proxy/Next/synthetic users are cleaned in finally; no shared service was killed. The runner uses fresh DerivedData/result directories and requires a nonzero passed-test count.

## Retained failures and scope boundary

- Initial UI attempts failed at keyboard/login-control positioning or an invisible Profile-label wait after successful authentication reset navigation to Ask. [Failed wait log](login-wait-fail.log.gz). An asynchronous runner interruption/restart showed zero tests; it was explicitly rejected as evidence. Test interaction was corrected without changing the production login or its privacy reset.
- The next control check used POST against the GET-only session contract and returned503; only the owned control method was corrected. Auth routes themselves returned200, as verified by method/path/status records without token/password logging.
- **Runtime shell toggle remains FAIL:** after successful login, legacy→More mode toggle→Library caused SIGABRT in `UINavigationBar layoutSubviews` on fresh own build containing #588's fix. [Failure log](runtime-toggle-crash-fail.log.gz), [crash report](runtime-toggle-crash.ips). This happened before translation v2 reads. Main approved using the accepted cold four-tab entry to isolate this consumer; no shared AppShell/TabRoot source was changed. The cold-start PASS does not resolve or replace this separate navigation failure.
- UNRUN: Staging/Production, physical-device/VoiceOver, real translation quality, external/all-history search and runtime-toggle repair. Parent #563 remains OPEN.

## Rollback

Restore Library's prior translation adapter/panel wiring; keep the original Translation tool, v2 reader, stored content, consent/deletion controls and comparison reader intact. No data deletion or applied-migration rewrite is required.
