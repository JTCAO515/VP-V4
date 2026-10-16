# NativeQA cancellation integration

Scope: IOS-001 #203, repository-only integration of the accepted original-request stop contract. Main dispatched the exact shared Transport/ServiceView/factory/cleanup/metadata/PBX lease; original component owners supplied immutable sources. No real account, provider, managed target, database migration, restore window, signing, device or release operation is performed by these checks.

## Source and custody

- Dedicated WT `p0-nativeqa-cancel-main-20261016`, branch `codex/p0-nativeqa-cancel-main-20261016`, base UI `45c89a4fc6a96ead7be9114bc902811cdceb831d`. Original A/B worktrees, branch and dirty custody retained.
- Contracts c9288bb9 + 4e9e58b352d51445c4b98eec3f1dece2750bf9d6; A product d1e69058c1319425236fa5f114c4ca2e7d15a310 + race repair84c67dbb90ed5d9f19ed7ae813de4021a9d0990a; B journal82dc6d76cde3a6da10c71590e87059f25355e491 + evidence58ca8faa4052f27509d27323ddca74aa720f0cb9. A evidence b684ddec/fe441f357798f012788aeef589222a8ed0fb3a1e retained.
- Shared integration source71738abb9843482b00f87a11b7e11c1cd28e514d. Consumer test conflict preserves every existing UI/Store test and adds the original cancellation-target case; run_consumer combines all four required original source names. No component-internal repair was taken over.
- Original A intent-race P2 retained: old rendered A could queue a Task that acted on newly bound B. The owner fix captures displayed scope/tuple/generation synchronously and checks it at tap, Task, Store and owned-child boundaries before any IO. Main routed independent A/B and actual shared source reviews, each Standards0/Spec0; final formal head review remains required.

## Integrated behavior

Original session/request tuple, POST exact `{}` and original cancellation GET; no new cancellation UUID. NativeSession validates command endpoint/subject/epoch and preserves cancellation status/body through a separate 4096-byte response cap without using generation's qa-agent/1 authentication decoder. Cancellation receipts never set verifiedAdmission or clear the generation journal.

Each session port owns one cancellation-journal instance whose live scope uses that port's presentation generation. The cancellation Store receives the same instance across load/retain/finish, preserving instance/generation-bound physical snapshots. ServiceView takes targets only from the original current protected message getter; scene/scope/session/consent guards remain immediate. Its original-result callback only refreshes the matching original Store.

Only explicit !preservePendingJournals cleanup erases cancellation custody, with endpoint/owner authority before and after every vault IO. Background/temporary unavailability retains records. JournalData registers one fixed source; export is count plus active-epoch session/request/state metadata, with no body/raw ledger/private CAS identity. All old-source assertions remain; new counts and exact absence checks are additive. The journal's static MainActor transaction guard is same-process serialization, not a cross-process/native Keychain CAS guarantee.

## Actual App evidence

Exclusive simulator8F6CA72C-73C0-45C0-8606-0543B1F725BD and original Main DerivedData reused. session_show_defaults verified before changing only the project path to this WT, persist=false. No other simulator/device was used by this integrator. All Xcode artifacts are under `~/Library/Developer/XcodeBuildMCP/workspaces/Documents-2025647e2650/`.

- Initial affected App: 80 methods PASS / 0 failed / 0 skipped, 59.540s. Consumer26, cancellation consumer19, cancellation journal17 (parameter expansions not summed as extra methods), session bridge10, original JournalData8. Log `test_sim_2026-10-16T09-26-45-845Z_pid30316_0a16d175.log`; result `f5793dab`. The added AssistantEvents selector was misspelled and did not run; it is not included in80.
- Original real-Keychain inventory/partial-purge/logout method separately1/1 PASS, 0skip, 6.964s using its exact existing name `testRegisteredSessionCursorJournalExportPartialPurgeAndLogoutPhysicalAbsence`. Log `09-29-28-682Z...ddac4d5a`; result `a083fe33`. This remains synthetic local App/vault evidence, not a real account/target claim.
- Hosted production CancellationView: one method with en/zh accessibility5 loop, 1/1 PASS0skip15.760s. One original-tuple GET per language, zero cancellation POST and zero generation calls; unknown command remains retained. Observable scope revocation removes content, leaving only host safe-area insets; four snapshots retained. Log `09-30-40-719Z...c3b5a90b`; result `49cebf5b`. Host explicitly supplies active scenePhase; OS scene-transition delivery is not proven.
- Final bridge fixture now reads the actual URLProtocol HTTP body/stream and verifies POST exact `{}`, original message path and GET method. Whole affected bridge10/10 PASS0skip5.707s (same fixture changed); log `09-32-25-030Z...8e669282`, result `f7c071e8`. Other same-source App methods reused, not added as a fresh larger matrix.
- docs-check, PBX plutil and diff whitespace PASS.

## Retained failures and limits

Hosted initial test asserted total intrinsic height zero after revocation; actual96 equals top/bottom host safe-area insets. Corrected only the host measurement to subtract/account for those insets, and inspected the blank revoked screenshot. Original FAIL log `09-30-12-463Z...20ac1ef6`, result `7a8a95d6` retained. Product unchanged.

A bare Swift Testing method selector omitted parentheses and selected zero methods (`09-32-04-587Z...541859d3`, result `d9a02887`). This is UNRUN, not PASS; subsequent actual bridge10 result above supplies the required behavior evidence.

Original owner macro/compile/intent RED and UI/history/keyboard limitations remain in their existing evidence. No actual rendered stop-button tap, human VoiceOver, real Auth/provider/managed-target cancellation/refund, raw data restoration, physical device or release acceptance is claimed. No #203/#680/#229 parent closure follows from this scope. Both terminated restore attempts remain FAIL/cleanupPASS and are not restarted.

## Final CI compatibility repair

PR739 exact809 CI simulator failed in seven pre-existing AskPersistence/AskState/TripState methods (nine listed assertions). Code Review job116908748844/run38881404596 is the diagnostic source; no GitHub Actions CLI/browser/local-runner-log fallback was used. The job's retained tail names the failures without their assertions. Local exact-source RED reproduces `NativeAskPersistenceTests.testActualDeviceOnlyKeychainPersistsAcrossSessionRecreation`: after logout its original Keychain item remains errSecSuccess rather than errSecItemNotFound. Log `09-40-28-001Z...305dcb44`, result `0f83c94d`, 1FAIL6.715s.

Cause: the shared global cleanup unconditionally called the new cancellation journal's strict UUID-owner eraser. Existing non-QA identities, including the original owner-a/text-owner-a fixtures, cannot retain this namespace and were incorrectly stopped before their original cleanup completed. This was a shared integration regression, not an original component defect; the prior narrow80PASS did not cover these legacy suites.

Only the new shared cleanup hunk changes. UUID identities still call the original strict journal eraser unchanged. A legacy non-UUID identity may continue its existing cleanup only after two authorized physical reads of the exact cancellation service/owner both return errSecItemNotFound with nil bytes. Unexpected data, locked storage, changed authority or read failure stays blocked; no new data is ignored or erased. Original Ask/Trip source, fixtures and assertions, B journal UUID guards and all pending/receipt rules remain unchanged.

Actual affected complete suites: 52/52PASS0skip49.284s across original AskPersistence, AskState, TripState and bridge including three new cleanup compatibility negatives/positive. Log `09-41-56-450Z...eda844de`; result `e9bed13a`. After strengthening the positive test to require the actual signedOut status, final affected bridge13/13PASS0skip13.544s; log `09-43-17-825Z...906bac3e`, result `2696dbfc`. These overlapping results are separate, not a fresh65-method matrix. The original CI failure remains FAIL at809; the new head must pass all applicable remote gates and independent repair review before merge. No blind rerun or check weakening.
