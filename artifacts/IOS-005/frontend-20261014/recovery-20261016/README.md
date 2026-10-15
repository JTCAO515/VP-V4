# IOS-005 native original-request recovery consumer

Base QA: `4a628e4a6063d8a2263a36c51af55c8f811c3066`. Same original worktree, new branch `codex/ios005-translation-recovery-native-20261016`. Original stable branch, commits and ignored candidate retained.

Dependencies consumed unchanged: journal owner `39521b328d58537f696545e118237fd0b8db91e7`, `cbf223daf01c6f197d74c090deb07af1305ae43a`, `599791ee962d7d41cc003c3200c677a46e528de6` (local dependency commits `0b95c91b`, `e0583c42`, `c139d93a`). Do not integrate these twice. Main owns actual Session factory/query transport/metadata cleanup/PBX and the server owner owns the GET-only adapter.

## Implemented user chain

- Before the sole initial generation POST: create the exact eight-field identity, retain with injected persistence and physically read back the same record. Failure disables send. No production in-memory persistence fallback.
- Background hides private bodies/cards and stops polling, preserving the durable journal. A new Store reads current owner/endpoint/epoch metadata and reconciles the original GET. Changed generation is not persisted; changed owner/endpoint/epoch never borrows another record.
- Unknown/lost ACK/503/abort/malformed receipt/missing or replaced physical record/absence from latest-20 never settle the original or authorize another generation POST. Repeated explicit submit with an unresolved identity only reconciles; edited in-memory original/Trip source is rejected.
- The recovery GET is exact-bound through identity and source hash; phrase publication/completion additionally rechecks current scope, physical original and a freshly read accepted policy/notice. Only verified positive terminal proof clears the journal. Null terminal projections do not clear it.
- Cancellation POST uses only the original Turn. Generic cancellation ACK is ignored for settlement; the original GET must prove its actual terminal state.
- A recovered original outside the recent history window remains readable and can open the existing large card with an explicit original-request-recovery source label. The latest-20 history cannot replace recovery proof or overwrite the exact recovered phrase. Only this one transient recovered phrase is retained, not a parallel history store.
- Local abandonment uses a separate, explicit confirmation bound to the reviewed physical record. It says local-only, no server undo/no guaranteed stop/no automatic new generation. Stale confirmation cannot abandon a successor record.
- Existing exact Trip selection and original UTF-8 rules remain. No body, translation, Trip data, token or generation is journaled. No voice/provider/SQL/domain authority change.
- Verified Turn erasure observer cancels in-flight work, hides private results/cards and clears only transient UI/store projections; original metadata is kept and current source qualification is re-read via GET. Existing SavedHistory lower module is byte-identical to QA base; existing public clear methods are used for privacy hiding.

## Integration seam

The View calls Main's `session.translationRecoveryPersistence()` and injects it through `store.configureRecovery`. Store default `nil` fails closed; it does not pretend memory is durable. Main's `translateRequest` must recognize only the closed recovery GET query route and pass its parsed queryItems to existing dataRequest. Main confirmed it owns/is implementing this routing and Turn projection fence, so no competing Session patch is included here.

Source/test files for Main: existing NativeTranslationStore.swift / NativeTranslationView.swift / NativeTranslationTests.swift; new NativeTranslationRecoveryStoreTests.swift (Main adds its test PBX entry). The three journal source files and journal test remain owned by their original writer. Consumer commit only is the integration unit after those dependencies.

## Validation limits

Actual Store, journal and affected tests are executed in an isolated macOS Swift package using FakeVault, with real scope/error/vault contracts extracted verbatim. NativeTextAccepted uses only its four legacy decoding fields in this harness; unrelated ServiceTask matching is not exercised. No concrete Keychain implementation, Simulator, HTTP service, credentials or model is used.

The SDK-only mode typechecks the full actual Translation View, Store and journal against the installed iOS Simulator SDK in Swift 6. Neighboring AppSettings/NativeSession/Trip/Voice surfaces are unavailable stubs for compilation only. It does not validate Main's real factory or transport implementation.

Initial test compile failed because new Swift Testing #require expressions omitted inner try; test syntax was repaired. Historical failure log retained at `/private/tmp/ios005-recovery-native-tests-20261016.log`. No assertion, authority check or decoder was weakened.

App target/build, real Session transport factory, actual UI interaction, real Auth/provider/persist, hardware/VoiceOver/fee/production acceptance: UNRUN here, Main coordinates its sole App/Simulator window. Parent #216 remains open.

## Source SHA-256

- `ios/VisePanda/VisePanda/Features/Translation/NativeTranslationStore.swift`: `7f47b6ad3d3253b28fabb680a556412107051d0c6c21169ea483f129db24fea2`
- `ios/VisePanda/VisePanda/Features/Translation/NativeTranslationView.swift`: `8bfe27c1648bc22dddf12bbcb81b3e9227d7f4f8219d23c0c2d5e441985b6082`
- `ios/VisePanda/VisePandaTests/NativeTranslationTests.swift`: `8e6fe95ff9e2de947956e97b64e153bc9dc133878298f5bf6f957f34817f17de`
- `ios/VisePanda/VisePandaTests/NativeTranslationRecoveryStoreTests.swift`: `46cbd82e83d79398c80d74e5f7e5ab75ff62486e45cf55e14a87afeef55f1adc`
- `tests/contract/ios005-expression-ui/verify_recovery.py`: `6a9195b4a15734f8c682f249773bdddf7c1546e317421c2d82e1eba9656d37d5`

## PASS: 37 tests in two affected suites

Command: `python3 tests/contract/ios005-expression-ui/verify_recovery.py`

Original output SHA-256: `d39657767957c32d5202748fd53c2351dba2f1a9a68a1c8fb1b58c73799cf67c`

```text
Building for debugging...
[Planning deferred tasks]
[27 / 50]
[28 / 51] VisePanda
[38 / 94]
[46 / 94]
[48 / 94]
[52 / 94]
[55 / 94]
[61 / 94]
[62 / 94]
[63 / 94]
[64 / 94]
[71 / 94] VisePanda
[79 / 94] VisePanda
[84 / 95] VisePandaTests-product
[85 / 101]
[90 / 101] VisePandaTests-product
[95 / 101] VisePandaTests-product
[97 / 101] VisePandaTests-product
Build complete! (6.16秒)
◇ Test run started.
↳ Testing Library Version: 2084
↳ Target Platform: arm64e-apple-macos14.0
◇ Suite NativeTranslationRecoveryStoreTests started.
◇ Suite NativeTranslationTests started.
◇ Test cancellationACKAndNullTerminalCannotProveCompletion() started.
◇ Test policyNoticeAndWithdrawalHidePrivateTextButKeepDurableIdentity() started.
◇ Test actorEndpointAndEpochChangesNeverReadOriginalPrivatePhrase() started.
◇ Test lateActorChangeBeforeReconciliationCannotPublishOrComplete() started.
◇ Test replacedPhysicalRecordCannotBeClearedByLateOriginalTerminal() started.
◇ Test saveOrPhysicalReadbackFailurePreventsPOST(afterWrite:) started.
◇ Test staleAbandonConfirmationCannotDiscardAnotherIdentity() started.
◇ Test policyChangeDuringOriginalGETCannotExposeOrSettle(change:) started.
◇ Test savedHistoryClearDuringReadCannotPublishLateContent() started.
◇ Test lostACKBackgroundAndRecreatedStoreReconcileSameIdentityWithoutExtraPOST() started.
◇ Test lateCallbackAfterBackgroundCannotPublishOrComplete() started.
◇ Test utf8OriginalHashDoesNotNormalizeAndTripFieldsNeverPersist() started.
◇ Test missingPhysicalRecordDoesNotProvePriorRequestNeverExisted() started.
◇ Test latestHistoryCannotReplaceExactRecoveryProof(terminal:) started.
◇ Test ambiguousSendReadsSameIdentityAndRejectsEditedInput() started.
◇ Test nullProjectionNeverSettlesEvenForTerminalState(state:) started.
◇ Test withdrawalHidesCachedPhraseEvenIfNetworkFails() started.
◇ Test selectedSubmissionDriftIsClosedAndNoConsentCannotPost() started.
◇ Test exactTerminalGETRestoresOutsideHistoryWindowAndSettlesOnlyOriginalRecord() started.
◇ Test searchPermissionWithdrawalAndExpiredReferenceNeverExposeRows() started.
◇ Test tripOpaqueIDsAndNullFieldsHaveExactWire() started.
◇ Test explicitLocalAbandonDoesNotCancelOrGenerate() started.
◇ Test mismatchedReceiptAnd503RetainOriginalAndNeverBecomeNewSendEligibility() started.
◇ Test savedHistoryUsesMonotonicLifetimeIncludingRequestTime(delay:) started.
◇ Test savedHistoryAcceptsTwentyMaximumCJKPhrasesAndEscapedWire() started.
◇ Test tripSelectionBindsOwnerVersionOpaquePathAndExactBytes() started.
◇ Test selectedSubmissionReconcilesSameIdentityAndRejectsOtherTripOrEditedText() started.
◇ Test searchPagesBindQueryAndExactReadKeepsOriginalPermissionWire() started.
◇ Test cardRequiresBothTranslationsAndPreservesOriginal() started.
◇ Test tripReaderDropsLateActorChangeAndExplicitClear() started.
◇ Test noConsentNeverSubmits() started.
◇ Test savedHistoryCannotOpenChangedExactContentOrPublishMalformedCursor() started.
◇ Test savedHistoryDropsLateScopeChangeAndRevokedFinalPolicy() started.
◇ Test savedHistoryPagesReplaceRowsAndOlderTranslationUsesFreshExactGET() started.
◇ Test case passing 1 argument afterWrite → false to saveOrPhysicalReadbackFailurePreventsPOST(afterWrite:) started.
◇ Test case passing 1 argument terminal → true to latestHistoryCannotReplaceExactRecoveryProof(terminal:) started.
◇ Test case passing 1 argument change → "policy" to policyChangeDuringOriginalGETCannotExposeOrSettle(change:) started.
◇ Test case passing 1 argument terminal → false to latestHistoryCannotReplaceExactRecoveryProof(terminal:) started.
◇ Test scopeChangeDropsLateResponseAndPendingText() started.
◇ Test queryChangeAndLateOldReplyCannotOverwriteNewQueryPage() started.
◇ Test case passing 1 argument change → "notice" to policyChangeDuringOriginalGETCannotExposeOrSettle(change:) started.
◇ Test case passing 1 argument change → "consent" to policyChangeDuringOriginalGETCannotExposeOrSettle(change:) started.
◇ Test case passing 1 argument state → "unavailable" to nullProjectionNeverSettlesEvenForTerminalState(state:) started.
◇ Test case passing 1 argument delay → 20.0 to savedHistoryUsesMonotonicLifetimeIncludingRequestTime(delay:) started.
◇ Test case passing 1 argument state → "cancelled" to nullProjectionNeverSettlesEvenForTerminalState(state:) started.
◇ Test case passing 1 argument afterWrite → true to saveOrPhysicalReadbackFailurePreventsPOST(afterWrite:) started.
◇ Test case passing 1 argument state → "unknown" to nullProjectionNeverSettlesEvenForTerminalState(state:) started.
◇ Test case passing 1 argument delay → 21.0 to savedHistoryUsesMonotonicLifetimeIncludingRequestTime(delay:) started.
◇ Test queryEchoMismatchAndCanonicalUnicodeDifferenceFailClosed() started.
◇ Test case passing 1 argument state → "pending" to nullProjectionNeverSettlesEvenForTerminalState(state:) started.
◇ Test case passing 1 argument state → "needs_review" to nullProjectionNeverSettlesEvenForTerminalState(state:) started.
◇ Test case passing 1 argument delay → 19.0 to savedHistoryUsesMonotonicLifetimeIncludingRequestTime(delay:) started.
✔ Test policyNoticeAndWithdrawalHidePrivateTextButKeepDurableIdentity() passed after 0.005 seconds.
✔ Test cancellationACKAndNullTerminalCannotProveCompletion() passed after 0.007 seconds.
✔ Test staleAbandonConfirmationCannotDiscardAnotherIdentity() passed after 0.008 seconds.
✔ Test actorEndpointAndEpochChangesNeverReadOriginalPrivatePhrase() passed after 0.009 seconds.
✔ Test withdrawalHidesCachedPhraseEvenIfNetworkFails() passed after 0.009 seconds.
✔ Test replacedPhysicalRecordCannotBeClearedByLateOriginalTerminal() passed after 0.011 seconds.
✔ Test latestHistoryCannotReplaceExactRecoveryProof(terminal:) with 2 test cases passed after 0.013 seconds.
✔ Test missingPhysicalRecordDoesNotProvePriorRequestNeverExisted() passed after 0.013 seconds.
✔ Test selectedSubmissionDriftIsClosedAndNoConsentCannotPost() passed after 0.013 seconds.
✔ Test ambiguousSendReadsSameIdentityAndRejectsEditedInput() passed after 0.013 seconds.
✔ Test searchPermissionWithdrawalAndExpiredReferenceNeverExposeRows() passed after 0.014 seconds.
✔ Test lateActorChangeBeforeReconciliationCannotPublishOrComplete() passed after 0.014 seconds.
✔ Test exactTerminalGETRestoresOutsideHistoryWindowAndSettlesOnlyOriginalRecord() passed after 0.016 seconds.
✔ Test mismatchedReceiptAnd503RetainOriginalAndNeverBecomeNewSendEligibility() passed after 0.018 seconds.
✔ Test utf8OriginalHashDoesNotNormalizeAndTripFieldsNeverPersist() passed after 0.019 seconds.
✔ Test lateCallbackAfterBackgroundCannotPublishOrComplete() passed after 0.020 seconds.
✔ Test policyChangeDuringOriginalGETCannotExposeOrSettle(change:) with 3 test cases passed after 0.021 seconds.
✔ Test searchPagesBindQueryAndExactReadKeepsOriginalPermissionWire() passed after 0.021 seconds.
✔ Test savedHistoryCannotOpenChangedExactContentOrPublishMalformedCursor() passed after 0.022 seconds.
✔ Test savedHistoryDropsLateScopeChangeAndRevokedFinalPolicy() passed after 0.022 seconds.
✔ Test saveOrPhysicalReadbackFailurePreventsPOST(afterWrite:) with 2 test cases passed after 0.024 seconds.
✔ Test savedHistoryClearDuringReadCannotPublishLateContent() passed after 0.024 seconds.
✔ Test savedHistoryPagesReplaceRowsAndOlderTranslationUsesFreshExactGET() passed after 0.025 seconds.
✔ Test queryChangeAndLateOldReplyCannotOverwriteNewQueryPage() passed after 0.025 seconds.
✔ Test tripReaderDropsLateActorChangeAndExplicitClear() passed after 0.025 seconds.
✔ Test noConsentNeverSubmits() passed after 0.025 seconds.
✔ Test queryEchoMismatchAndCanonicalUnicodeDifferenceFailClosed() passed after 0.025 seconds.
✔ Test scopeChangeDropsLateResponseAndPendingText() passed after 0.026 seconds.
✔ Test lostACKBackgroundAndRecreatedStoreReconcileSameIdentityWithoutExtraPOST() passed after 0.028 seconds.
✔ Test selectedSubmissionReconcilesSameIdentityAndRejectsOtherTripOrEditedText() passed after 0.028 seconds.
✔ Test tripSelectionBindsOwnerVersionOpaquePathAndExactBytes() passed after 0.028 seconds.
✔ Test nullProjectionNeverSettlesEvenForTerminalState(state:) with 5 test cases passed after 0.029 seconds.
✔ Test savedHistoryUsesMonotonicLifetimeIncludingRequestTime(delay:) with 3 test cases passed after 0.029 seconds.
✔ Test explicitLocalAbandonDoesNotCancelOrGenerate() passed after 0.029 seconds.
✔ Suite NativeTranslationRecoveryStoreTests passed after 0.030 seconds.
✔ Test savedHistoryAcceptsTwentyMaximumCJKPhrasesAndEscapedWire() passed after 0.057 seconds.
✔ Test tripOpaqueIDsAndNullFieldsHaveExactWire() passed after 0.057 seconds.
✔ Test cardRequiresBothTranslationsAndPreservesOriginal() passed after 0.057 seconds.
✔ Suite NativeTranslationTests passed after 0.058 seconds.
✔ Test run with 37 tests in 2 suites passed after 0.058 seconds.
```

## PASS: full scoped iOS SDK typecheck

Command: `python3 tests/contract/ios005-expression-ui/verify_recovery.py --sdk-only`

Original output SHA-256: `35d8b0bbf485f36ddf57e278a0e6df3f88d56ceb7f741c8083d3ce06d69efe45`

```text
PASS: actual full Translation View, Store and journal iOS SDK typecheck; neighboring app interfaces unavailable stubs only
```

## PASS: documentation baseline

Command: `node scripts/docs-check.mjs`

Original output SHA-256: `6ef37bbdf6456c5d59627a6d18ba7bc78abdc2b026c8ef90e0b5bf6945ea553b`

```text
VPJ plan passed: 83 tasks, 20 replacements, acyclic dependencies, contracts and archive hashes.
AI Core and VPJ documentation baseline passed.
```

## Existing locale/presentation contract compatibility

The old exact-origin-enum snapshot failed because this feature adds an explicit recovered origin. The updated check removes only that new case before comparing all original enum bytes against accepted QA. Every prior source/AI/sample label remains byte-identical; the new recovered source labels are now directly executed in both languages. Product source is unchanged from ba42c895.

- `tests/contract/ios005-expression-ui/verify.py` SHA-256: `f65ee58c4556e21e9a60ca2698cd43e8acae83c294f458e8b4b260d47dfb568b`

- `tests/contract/ios005-expression-ui/verify_locale.py` SHA-256: `d83213398cc12b8bb7c385a71e4a45f5b85f2b6c2e88c708131c2db055a11742`

Command: `python3 tests/contract/ios005-expression-ui/verify_locale.py`

```text
PASS: actual Expression/Sample selectors in en and zh-Hans
PASS: dynamic payload, fixed fixture factory, authority/readiness/history guard source unchanged
```

Command: `python3 tests/contract/ios005-expression-ui/verify.py`

```text
PASS: explicit sample-origin bilingual labels; real recent/saved AI labels preserved
PASS: actual phrase/presentation readiness and actor/consent/current-result negative predicates
PASS: actual SwiftUI card, DEBUG sample and shared-state expression wrapper typecheck against installed iOS Simulator SDK (no Simulator boot or app build)
PASS: full changed view syntax parse; runtime UI/provider/device remains UNRUN
```

## Main P1 review correction: fresh read qualification

Main identified two missing sequence cases in the initial ba42c895 implementation: a pending recovery phrase could survive a later unknown/null read, and a completed recovered phrase could be reinserted after the journal was cleared even when current history omitted that Turn.

The Store now removes its previous transient recovered phrase before each refresh. Original GET reconciliation also hides that original Turn before reading. Only a qualified response in this read, or a current qualified history row after completion, may publish it again. Unknown/null retains durable identity but never republishes old private text. A completed original outside the recent window remains visible for its successful recovery read; a later history-only refresh that lacks the Turn hides it. No additional exact-read authority, route, wrapper or cache is introduced.

New real sequence cases: pending private phrase -> unknown/null hides original and retains the exact journal; translated terminal -> journal cleared -> next history missing does not resurrect the original/card eligibility. All original 37 tests plus these two pass: 39 tests in two suites. This Store-only change is compiled/executed in Swift 6; unchanged View SDK evidence is reused. Main still owns full App/factory/transport/UI and actual-provider acceptance.

Command: `python3 tests/contract/ios005-expression-ui/verify_recovery.py`

- Current `ios/VisePanda/VisePanda/Features/Translation/NativeTranslationStore.swift` SHA-256: `78ac9cdf2ad263bece2a6df568d34174f86e48610f7a83b449da4683677ebd99`
- Current `ios/VisePanda/VisePandaTests/NativeTranslationRecoveryStoreTests.swift` SHA-256: `ea32698a4ca8e848e9b0e889209b013322bb3746e62f57d24d87b8af8fdd4f9f`

Output SHA-256: `b95bf6dc632f9c072c6e485933b32c197b7dfa851cb77a32164b026b6c632af5`

```text
Building for debugging...
[Planning deferred tasks]
[27 / 50]
[28 / 51] VisePanda
[38 / 94]
[43 / 94]
[47 / 94]
[48 / 94]
[52 / 94]
[54 / 94]
[57 / 94]
[61 / 94]
[63 / 94]
[64 / 94]
[71 / 94] VisePanda
[79 / 94] VisePanda
[84 / 95] VisePandaTests-product
[85 / 101]
[90 / 101] VisePandaTests-product
[95 / 101] VisePandaTests-product
[97 / 101] VisePandaTests-product
Build complete! (8.12秒)
◇ Test run started.
↳ Testing Library Version: 2084
↳ Target Platform: arm64e-apple-macos14.0
◇ Suite NativeTranslationTests started.
◇ Suite NativeTranslationRecoveryStoreTests started.
◇ Test scopeChangeDropsLateResponseAndPendingText() started.
◇ Test savedHistoryClearDuringReadCannotPublishLateContent() started.
◇ Test selectedSubmissionReconcilesSameIdentityAndRejectsOtherTripOrEditedText() started.
◇ Test tripReaderDropsLateActorChangeAndExplicitClear() started.
◇ Test cardRequiresBothTranslationsAndPreservesOriginal() started.
◇ Test queryChangeAndLateOldReplyCannotOverwriteNewQueryPage() started.
◇ Test tripOpaqueIDsAndNullFieldsHaveExactWire() started.
◇ Test savedHistoryDropsLateScopeChangeAndRevokedFinalPolicy() started.
◇ Test tripSelectionBindsOwnerVersionOpaquePathAndExactBytes() started.
◇ Test selectedSubmissionDriftIsClosedAndNoConsentCannotPost() started.
◇ Test searchPagesBindQueryAndExactReadKeepsOriginalPermissionWire() started.
◇ Test withdrawalHidesCachedPhraseEvenIfNetworkFails() started.
◇ Test queryEchoMismatchAndCanonicalUnicodeDifferenceFailClosed() started.
◇ Test ambiguousSendReadsSameIdentityAndRejectsEditedInput() started.
◇ Test searchPermissionWithdrawalAndExpiredReferenceNeverExposeRows() started.
◇ Test savedHistoryAcceptsTwentyMaximumCJKPhrasesAndEscapedWire() started.
◇ Test mismatchedReceiptAnd503RetainOriginalAndNeverBecomeNewSendEligibility() started.
◇ Test policyNoticeAndWithdrawalHidePrivateTextButKeepDurableIdentity() started.
◇ Test saveOrPhysicalReadbackFailurePreventsPOST(afterWrite:) started.
◇ Test savedHistoryUsesMonotonicLifetimeIncludingRequestTime(delay:) started.
◇ Test policyChangeDuringOriginalGETCannotExposeOrSettle(change:) started.
◇ Test pendingPrivatePhraseThenUnknownNullHidesOriginalAndKeepsIdentity() started.
◇ Test lostACKBackgroundAndRecreatedStoreReconcileSameIdentityWithoutExtraPOST() started.
◇ Test lateActorChangeBeforeReconciliationCannotPublishOrComplete() started.
◇ Test completedRecoveryThenHistoryMissingCannotResurrectPrivatePhrase() started.
◇ Test utf8OriginalHashDoesNotNormalizeAndTripFieldsNeverPersist() started.
◇ Test cancellationACKAndNullTerminalCannotProveCompletion() started.
◇ Test noConsentNeverSubmits() started.
◇ Test nullProjectionNeverSettlesEvenForTerminalState(state:) started.
◇ Test savedHistoryPagesReplaceRowsAndOlderTranslationUsesFreshExactGET() started.
◇ Test staleAbandonConfirmationCannotDiscardAnotherIdentity() started.
◇ Test savedHistoryCannotOpenChangedExactContentOrPublishMalformedCursor() started.
◇ Test actorEndpointAndEpochChangesNeverReadOriginalPrivatePhrase() started.
◇ Test case passing 1 argument afterWrite → true to saveOrPhysicalReadbackFailurePreventsPOST(afterWrite:) started.
◇ Test case passing 1 argument change → "notice" to policyChangeDuringOriginalGETCannotExposeOrSettle(change:) started.
◇ Test case passing 1 argument delay → 21.0 to savedHistoryUsesMonotonicLifetimeIncludingRequestTime(delay:) started.
◇ Test case passing 1 argument change → "consent" to policyChangeDuringOriginalGETCannotExposeOrSettle(change:) started.
◇ Test case passing 1 argument delay → 20.0 to savedHistoryUsesMonotonicLifetimeIncludingRequestTime(delay:) started.
◇ Test case passing 1 argument afterWrite → false to saveOrPhysicalReadbackFailurePreventsPOST(afterWrite:) started.
◇ Test case passing 1 argument state → "cancelled" to nullProjectionNeverSettlesEvenForTerminalState(state:) started.
◇ Test case passing 1 argument change → "policy" to policyChangeDuringOriginalGETCannotExposeOrSettle(change:) started.
◇ Test case passing 1 argument state → "needs_review" to nullProjectionNeverSettlesEvenForTerminalState(state:) started.
◇ Test replacedPhysicalRecordCannotBeClearedByLateOriginalTerminal() started.
◇ Test exactTerminalGETRestoresOutsideHistoryWindowAndSettlesOnlyOriginalRecord() started.
◇ Test lateCallbackAfterBackgroundCannotPublishOrComplete() started.
◇ Test explicitLocalAbandonDoesNotCancelOrGenerate() started.
◇ Test case passing 1 argument state → "unavailable" to nullProjectionNeverSettlesEvenForTerminalState(state:) started.
◇ Test missingPhysicalRecordDoesNotProvePriorRequestNeverExisted() started.
◇ Test case passing 1 argument state → "pending" to nullProjectionNeverSettlesEvenForTerminalState(state:) started.
◇ Test case passing 1 argument delay → 19.0 to savedHistoryUsesMonotonicLifetimeIncludingRequestTime(delay:) started.
◇ Test case passing 1 argument state → "unknown" to nullProjectionNeverSettlesEvenForTerminalState(state:) started.
◇ Test latestHistoryCannotReplaceExactRecoveryProof(terminal:) started.
◇ Test case passing 1 argument terminal → false to latestHistoryCannotReplaceExactRecoveryProof(terminal:) started.
◇ Test case passing 1 argument terminal → true to latestHistoryCannotReplaceExactRecoveryProof(terminal:) started.
✔ Test tripReaderDropsLateActorChangeAndExplicitClear() passed after 0.001 seconds.
✔ Test queryChangeAndLateOldReplyCannotOverwriteNewQueryPage() passed after 0.001 seconds.
✔ Test savedHistoryDropsLateScopeChangeAndRevokedFinalPolicy() passed after 0.002 seconds.
✔ Test savedHistoryClearDuringReadCannotPublishLateContent() passed after 0.002 seconds.
✔ Test scopeChangeDropsLateResponseAndPendingText() passed after 0.002 seconds.
✔ Test selectedSubmissionDriftIsClosedAndNoConsentCannotPost() passed after 0.002 seconds.
✔ Test searchPagesBindQueryAndExactReadKeepsOriginalPermissionWire() passed after 0.003 seconds.
✔ Test withdrawalHidesCachedPhraseEvenIfNetworkFails() passed after 0.003 seconds.
✔ Test tripSelectionBindsOwnerVersionOpaquePathAndExactBytes() passed after 0.004 seconds.
✔ Test ambiguousSendReadsSameIdentityAndRejectsEditedInput() passed after 0.004 seconds.
✔ Test searchPermissionWithdrawalAndExpiredReferenceNeverExposeRows() passed after 0.004 seconds.
✔ Test queryEchoMismatchAndCanonicalUnicodeDifferenceFailClosed() passed after 0.004 seconds.
✔ Test selectedSubmissionReconcilesSameIdentityAndRejectsOtherTripOrEditedText() passed after 0.004 seconds.
✔ Test pendingPrivatePhraseThenUnknownNullHidesOriginalAndKeepsIdentity() passed after 0.011 seconds.
✔ Test lostACKBackgroundAndRecreatedStoreReconcileSameIdentityWithoutExtraPOST() passed after 0.012 seconds.
✔ Test lateActorChangeBeforeReconciliationCannotPublishOrComplete() passed after 0.013 seconds.
✔ Test mismatchedReceiptAnd503RetainOriginalAndNeverBecomeNewSendEligibility() passed after 0.015 seconds.
✔ Test savedHistoryAcceptsTwentyMaximumCJKPhrasesAndEscapedWire() passed after 0.047 seconds.
✔ Test utf8OriginalHashDoesNotNormalizeAndTripFieldsNeverPersist() passed after 0.048 seconds.
✔ Test completedRecoveryThenHistoryMissingCannotResurrectPrivatePhrase() passed after 0.050 seconds.
✔ Test cancellationACKAndNullTerminalCannotProveCompletion() passed after 0.052 seconds.
✔ Test noConsentNeverSubmits() passed after 0.056 seconds.
✔ Test savedHistoryPagesReplaceRowsAndOlderTranslationUsesFreshExactGET() passed after 0.056 seconds.
✔ Test saveOrPhysicalReadbackFailurePreventsPOST(afterWrite:) with 2 test cases passed after 0.057 seconds.
✔ Test policyChangeDuringOriginalGETCannotExposeOrSettle(change:) with 3 test cases passed after 0.059 seconds.
✔ Test staleAbandonConfirmationCannotDiscardAnotherIdentity() passed after 0.062 seconds.
✔ Test replacedPhysicalRecordCannotBeClearedByLateOriginalTerminal() passed after 0.063 seconds.
✔ Test actorEndpointAndEpochChangesNeverReadOriginalPrivatePhrase() passed after 0.064 seconds.
✔ Test lateCallbackAfterBackgroundCannotPublishOrComplete() passed after 0.066 seconds.
✔ Test missingPhysicalRecordDoesNotProvePriorRequestNeverExisted() passed after 0.069 seconds.
✔ Test savedHistoryUsesMonotonicLifetimeIncludingRequestTime(delay:) with 3 test cases passed after 0.069 seconds.
✔ Test nullProjectionNeverSettlesEvenForTerminalState(state:) with 5 test cases passed after 0.070 seconds.
✔ Test exactTerminalGETRestoresOutsideHistoryWindowAndSettlesOnlyOriginalRecord() passed after 0.071 seconds.
✔ Test savedHistoryCannotOpenChangedExactContentOrPublishMalformedCursor() passed after 0.072 seconds.
✔ Test explicitLocalAbandonDoesNotCancelOrGenerate() passed after 0.072 seconds.
✔ Test policyNoticeAndWithdrawalHidePrivateTextButKeepDurableIdentity() passed after 0.073 seconds.
✔ Test latestHistoryCannotReplaceExactRecoveryProof(terminal:) with 2 test cases passed after 0.076 seconds.
✔ Suite NativeTranslationRecoveryStoreTests passed after 0.077 seconds.
✔ Test tripOpaqueIDsAndNullFieldsHaveExactWire() passed after 0.077 seconds.
✔ Test cardRequiresBothTranslationsAndPreservesOriginal() passed after 0.077 seconds.
✔ Suite NativeTranslationTests passed after 0.077 seconds.
✔ Test run with 39 tests in 2 suites passed after 0.077 seconds.
```
