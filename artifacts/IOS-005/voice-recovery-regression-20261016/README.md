# IOS-005 Voice recovery consumer regression

Base: `4e4d16c47df920afa02497831622f0da49d54592`. Stable source: `bbf0755d67dee5b063e4a6a0c855aacfdf0123e9`.
Branch: `codex/ios005-voice-recovery-regression-20261016` in the original IOS-005 worktree. Previous branches, 78977a1d and ignored candidate are preserved.

## Cause and bounded repair

Main supplied actual iOS host SIGTRAP/array-out-of-range evidence in the former NativeVoiceTranslationTests pending-retry case. Root TranslationStore correctly rejected generation without an injected persistent recovery port, leaving zero bodies; the old soft count assertion then indexed absent bodies. The production Voice View/Store also lacked the same Session journal composition. Main's evidence says the IDE process was still running; this report claims no independent IDE crash diagnosis.

Voice bind now accepts the existing persistence port, clears transient scope state before rebinding, and configures the original Root Store. The View uses `session.translationRecoveryPersistence()`. No second journal, memory fallback, Root algorithm, shared Session or Audio code is added.

An unresolved or submitted request now reads original status and returns. It cannot make a second generation POST. Unknown identity fences reset/new phrase/recording, including a recreated consumer that has no body. Only Root's current exact recoveredTurnID/qualified phrase can project original/direction/result. Readability additionally checks the live Root phrase, policy/notice and current scope, so a stale Voice result cannot be made readable by ordinary history. The View reads original status without requiring a missing restored body, changes no provider, and gates scope/scene/cancellation. Turn erasure hides transient projections then rereads authoritative eligibility. Audio callbacks, measurement fields and explicit playback remain their original implementation.

The original four Voice tests remain, using real NativeTranslationRecoveryJournal plus synthetic NativeCredentialVault and canonical UUID scopes for HTTP cases. Recovery fixtures validate seven exact query fields plus original Turn and compare physical bytes/identity across same/changed review and unknown GET. Cardinality/optional first-body requirements fail through Swift Testing rather than unsafe array subscripting. New cases cover unconfigured zero POST, save/readback failures, recreated consumer/direction, unknown cancellation, actor/late response/withdrawal, exact UTF-8 and lack of current recovery qualification despite a history row.

## Actual verification

PASS: 12 tests in the complete NativeVoiceTranslationTests suite, including the former four cases. The storage-failure test has two argument cases. Actual Voice Store, unchanged Root Store and actual identity/journal/receipt sources are copied byte-for-byte into an isolated macOS Swift package. The app's scope/error/vault protocol and policy DTO are extracted unchanged; only the four-field legacy NativeTextAccepted decoding surface is assembled for the harness, not unrelated ServiceTask matching. The only storage is FakeVault; no concrete Keychain, HTTP service, ASR, microphone or playback is invoked.

PASS: Swift 6 iOS SDK typecheck of the actual full Voice View/Store with unchanged Root/journal. Neighboring AppSettings/Session and Capture/Playback panels use unavailable interface stubs solely for compilation. This does not validate real Session factory behavior or actual audio integration.

PASS: syntax parse, documentation baseline, diff check. Source scope comparison from base proves exactly the four allowed Voice paths changed, with no shared Root/Session/journal/PBX/CI/navigation/Audio bytes changed. Xcode 27.0 (27A266a), Swift 6.4 were observed. Official model request does not expose effective model/tier, which remains UNKNOWN. File/command/network tools were available with no additional approval or configuration change.

UNRUN here: actual iOS test host/App build-for-testing, Simulator launch/tests/UI, real Session/vault transport, system speech/voice, real Auth/provider, fee/production/TestFlight/device acceptance. Main retains its unique 8F App-test window. A macOS test pass or SDK typecheck is not iOS-host acceptance. No other Simulator was created, borrowed, reset or killed.

## Reproduction harness

The private command below adapts the existing unchanged recovery verifier to compile only the complete Voice test suite and the real Voice Store. `--sdk-only` selects the actual Voice View with unavailable neighbor interfaces. The exact executed harness is retained here; it does not modify repository scripts or production files.

Commands:

```sh
python3 /private/tmp/ios005-voice-regression-check-20261016.py
python3 /private/tmp/ios005-voice-regression-check-20261016.py --sdk-only
node scripts/docs-check.mjs
xcrun swiftc -frontend -parse ios/VisePanda/VisePanda/Features/VoiceTranslation/NativeVoiceTranslationStore.swift ios/VisePanda/VisePanda/Features/VoiceTranslation/NativeVoiceTranslationView.swift ios/VisePanda/VisePandaTests/NativeVoiceTranslationTests.swift
git diff --check
```

```python
from pathlib import Path
import sys
repo = Path('/Users/jtsm5p/Documents/Codex/VP-V10-worktrees/ios005-expression-ui-20261014')
runner = repo / 'tests/contract/ios005-expression-ui/verify_recovery.py'
source = runner.read_text()
source = source.replace("    session = (APP / 'App/NativeSession.swift').read_text()", "    (lib / 'NativeVoiceTranslationStore.swift').write_bytes((APP / 'Features/VoiceTranslation/NativeVoiceTranslationStore.swift').read_bytes())\n    session = (APP / 'App/NativeSession.swift').read_text()")
source = source.replace("['NativeTranslationTests', 'NativeTranslationRecoveryStoreTests']", "['NativeVoiceTranslationTests']")
source = source.replace("(lib / 'NativeTranslationView.swift').write_bytes((APP / 'Features/Translation/NativeTranslationView.swift').read_bytes())", "(lib / 'NativeVoiceTranslationView.swift').write_bytes((APP / 'Features/VoiceTranslation/NativeVoiceTranslationView.swift').read_bytes())")
source = source.replace('struct NativeVoiceTranslationView: View { var body: some View { EmptyView() } }', '''struct NativeVoiceCapturePanel: View {
    let store: NativeVoiceTranslationStore; let source: String
    var body: some View { EmptyView() }
}
struct NativeVoicePlaybackPanel: View {
    let phrase: NativeTranslationPhrase; let scope: NativeDataScope?
    var body: some View { EmptyView() }
}''')
source = source.replace('actual full Translation View, Store and journal', 'actual full Voice View/Store, unchanged Root Store and journal')
exec(compile(source, str(runner), 'exec'), {'__file__': str(runner), '__name__': '__main__'})
```

## Source SHA-256

- `ios/VisePanda/VisePanda/Features/VoiceTranslation/NativeVoiceTranslationStore.swift`: `9844913d8bed5d4c936efd2eb4292e279ec2ce3a21f59d81ac0dbf795f950582`
- `ios/VisePanda/VisePanda/Features/VoiceTranslation/NativeVoiceTranslationView.swift`: `1a6a45172c5bf613e3ac1d0c8799f3ec422eba48947d9adfffd676c4752944db`
- `ios/VisePanda/VisePanda/Features/VoiceTranslation/WIRE.md`: `6a44776ce11b4d976f5d7a4d83050ab199ec7bbf6c346879b60b725de8379871`
- `ios/VisePanda/VisePandaTests/NativeVoiceTranslationTests.swift`: `ac1d4bf85d0e699c4ebf98f3e914532946d8a6aa1b20de0d2150d57ddb8d1236`

## Voice test suite

Output SHA-256: `ae495b187bd6832513a3a36b6920beb00ab1074ff1c9ec554ffcd32cdac9d6fd`

```text
Building for debugging...
[Planning deferred tasks]
[27 / 50]
[28 / 51] VisePanda
[40 / 95]
[46 / 95]
[48 / 95]
[53 / 95]
[57 / 95]
[61 / 95]
[63 / 95]
[64 / 95]
[72 / 95] VisePanda
[80 / 95] VisePanda
[85 / 96] VisePandaTests-product
[86 / 101]
[90 / 101] VisePandaTests-product
[95 / 101] VisePandaTests-product
[97 / 101] VisePandaTests-product
Build complete! (6.52秒)
◇ Test run started.
↳ Testing Library Version: 2084
↳ Target Platform: arm64e-apple-macos14.0
◇ Suite NativeVoiceTranslationTests started.
◇ Test pendingRetryKeepsExactBytesAndNeverUsesUnrelatedHistory() started.
◇ Test lateRecoveryAfterActorSwitchCannotPublishOriginal() started.
◇ Test canonicallyEqualEditedReviewCannotChangeOriginalUTF8OrKey() started.
◇ Test unconfiguredPersistenceRemainsClosedWithoutTrapping() started.
◇ Test newReadWithoutRecoveryQualificationHidesPreviouslyVerifiedVoiceResult() started.
◇ Test journalSaveOrPhysicalReadbackFailurePreventsPOST(afterWrite:) started.
◇ Test lateAndDuplicateFinalsCannotReplaceReviewedTextOrCrossAccount() started.
◇ Test unknownACKReadbackFindsOriginalTurnWithoutSecondGenerate() started.
◇ Test recreatedVoiceConsumerRestoresOnlyVerifiedOriginalAndDirection() started.
◇ Test liveActorChangeAndWithdrawalDuringGETCannotPublishOrComplete() started.
◇ Test policyWithdrawalAndLateResponseHideScopedResult() started.
◇ Test case passing 1 argument afterWrite → false to journalSaveOrPhysicalReadbackFailurePreventsPOST(afterWrite:) started.
◇ Test cancellationUnknownPreservesPhysicalIdentityAndDoesNotUnlockNewPhrase() started.
◇ Test case passing 1 argument afterWrite → true to journalSaveOrPhysicalReadbackFailurePreventsPOST(afterWrite:) started.
✔ Test newReadWithoutRecoveryQualificationHidesPreviouslyVerifiedVoiceResult() passed after 0.005 seconds.
✔ Test canonicallyEqualEditedReviewCannotChangeOriginalUTF8OrKey() passed after 0.005 seconds.
✔ Test unconfiguredPersistenceRemainsClosedWithoutTrapping() passed after 0.005 seconds.
✔ Test recreatedVoiceConsumerRestoresOnlyVerifiedOriginalAndDirection() passed after 0.008 seconds.
✔ Test pendingRetryKeepsExactBytesAndNeverUsesUnrelatedHistory() passed after 0.009 seconds.
✔ Test lateRecoveryAfterActorSwitchCannotPublishOriginal() passed after 0.010 seconds.
✔ Test liveActorChangeAndWithdrawalDuringGETCannotPublishOrComplete() passed after 0.011 seconds.
✔ Test unknownACKReadbackFindsOriginalTurnWithoutSecondGenerate() passed after 0.012 seconds.
✔ Test policyWithdrawalAndLateResponseHideScopedResult() passed after 0.013 seconds.
✔ Test cancellationUnknownPreservesPhysicalIdentityAndDoesNotUnlockNewPhrase() passed after 0.014 seconds.
✔ Test journalSaveOrPhysicalReadbackFailurePreventsPOST(afterWrite:) with 2 test cases passed after 0.015 seconds.
✔ Test lateAndDuplicateFinalsCannotReplaceReviewedTextOrCrossAccount() passed after 0.015 seconds.
✔ Suite NativeVoiceTranslationTests passed after 0.015 seconds.
✔ Test run with 12 tests in 1 suite passed after 0.015 seconds.
```

## Scoped iOS SDK check

Output SHA-256: `c4273160ad3a6af8db198590c7b606e654eb005accaa75e74f6796f1faab3f97`

```text
PASS: actual full Voice View/Store, unchanged Root Store and journal iOS SDK typecheck; neighboring app interfaces unavailable stubs only
```

## Documentation check

Output SHA-256: `6ef37bbdf6456c5d59627a6d18ba7bc78abdc2b026c8ef90e0b5bf6945ea553b`

```text
VPJ plan passed: 83 tasks, 20 replacements, acyclic dependencies, contracts and archive hashes.
AI Core and VPJ documentation baseline passed.
```

## Main P1 review: protect the edit-field recovery body

Source commits: `c1d19d862ff0c7e44d8b57fe74e1e2ff94724473` then `df28dedac85578468ddf9f77ab8eb08a70e4f66f`. Both are based on the original owner branch fce0ba5c; Main's separate SSE counting change is not cherry-picked or modified.

Main found that a recreated Voice consumer's qualified original was copied into View State review. Later Root qualification loss hid resultView but left that unguarded TextField copy. The View no longer has a review State or a submittedText-to-review observer. Its actual TextField Binding reads Store.reviewText(scope:) at render/access time, checks the render-bound actor/scene scope and uses only Root's currently qualified original for recovered content. Old bindings cannot write a former actor's text into a new actor's draft. The confirm action also rechecks render scope and reads current projected text rather than a captured recovered body.

The Store distinguishes local typed/accepted-final draft from server-recovered review. It never writes a recovered original into the local draft. Starting a new recovery read removes the protected submittedText/result copy, and failed synchronization leaves the protected copy nil without clearing Turn identity or physical journal. Even before notification callbacks run, current actor/scene/Root mismatch rejects the recovered body through the read port. A genuinely unsent local draft is preserved byte-for-byte: if it existed before an old request was recovered, it remains distinct and is available after that recovered body's qualification ends. Explicit withdrawal/reset retains the previous user-commanded clearing semantics.

The original 12 tests, including the original four, remain. Five new tests cover four remote invalidation variants (withdrawal, changed notice, permission rejection, unrelated history), immediate actor/scene/Root rejection through the actual read port before callbacks, preservation of an unsent local draft on failed refresh, preservation of unknown physical identity on permission rejection, and restoration not overwriting a preexisting unsent draft. Fixture arguments and metadata retain exact identity/hash/bytes and one generation POST. Ordinary history cannot supply recovered-review qualification.

PASS: 17 tests in the complete Voice suite, Swift 6 actual-source/FakeVault harness. PASS: final actual full Voice View/Store + unchanged Root/journal scoped iOS SDK typecheck, documentation baseline and diff check. Source boundary check from fce0ba5c shows exactly the four allowed Voice paths, no Root/Session/Audio/SSE/PBX/CI changes. No mirror-string or source-layout tests were added.

Main previously reported 64 actual iOS-host passes for the earlier delivered source; that historical result is not claimed as validation of these new P1 commits. Current App/iOS-host/UI/provider/device acceptance remains Main-owned and UNRUN here. No Simulator/App/audio/network action was taken. No additional shared interface is required.

### Updated source SHA-256

- `ios/VisePanda/VisePanda/Features/VoiceTranslation/NativeVoiceTranslationStore.swift`: `b7b6f6d994101c0497ef4505f4107008a7d37f0950bd947fbc8260c597dcf228`
- `ios/VisePanda/VisePanda/Features/VoiceTranslation/NativeVoiceTranslationView.swift`: `c472305f196b5010743dad6d8d78c82711ab87422a279b15ba69ae34db881378`
- `ios/VisePanda/VisePanda/Features/VoiceTranslation/WIRE.md`: `a4affc32377ad596f2627d6a141ce4c9e9a3a36a2f961e00bcad2c5a5f387451`
- `ios/VisePanda/VisePandaTests/NativeVoiceTranslationTests.swift`: `ef1535e48215b2b98ae953db51801b43650cd5abc88053c215c60a83cffa7739`

### 17-test Voice suite

Command: `python3 /private/tmp/ios005-voice-regression-check-20261016.py`

Output SHA-256: `5b3fff6f1151fe6476a0c91f73600c2398b354df6eb1630d55b4aef3243fab34`

```text
Building for debugging...
[Planning deferred tasks]
[27 / 50]
[28 / 51] VisePanda
[40 / 95]
[46 / 95]
[48 / 95]
[53 / 95]
[57 / 95]
[61 / 95]
[63 / 95]
[64 / 95]
[72 / 95] VisePanda
[80 / 95] VisePanda
[85 / 96] VisePandaTests-product
[86 / 101]
[90 / 101] VisePandaTests-product
[95 / 101] VisePandaTests-product
[97 / 101] VisePandaTests-product
Build complete! (5.95秒)
◇ Test run started.
↳ Testing Library Version: 2084
↳ Target Platform: arm64e-apple-macos14.0
◇ Suite NativeVoiceTranslationTests started.
◇ Test failedRefreshDoesNotEraseUnsubmittedLocalReview() started.
◇ Test pendingRetryKeepsExactBytesAndNeverUsesUnrelatedHistory() started.
◇ Test liveActorChangeAndWithdrawalDuringGETCannotPublishOrComplete() started.
◇ Test newReadWithoutRecoveryQualificationHidesPreviouslyVerifiedVoiceResult() started.
◇ Test lateRecoveryAfterActorSwitchCannotPublishOriginal() started.
◇ Test unconfiguredPersistenceRemainsClosedWithoutTrapping() started.
◇ Test recreatedRecoveredReviewExpiresWithCurrentQualification(reason:) started.
◇ Test rejectedRecoveryReadKeepsUnknownPhysicalIdentityWithoutReviewBody() started.
◇ Test policyWithdrawalAndLateResponseHideScopedResult() started.
◇ Test recoveredReviewReadPortRejectsActorSceneAndRootInvalidationImmediately() started.
◇ Test journalSaveOrPhysicalReadbackFailurePreventsPOST(afterWrite:) started.
◇ Test canonicallyEqualEditedReviewCannotChangeOriginalUTF8OrKey() started.
◇ Test unknownACKReadbackFindsOriginalTurnWithoutSecondGenerate() started.
◇ Test recreatedVoiceConsumerRestoresOnlyVerifiedOriginalAndDirection() started.
◇ Test cancellationUnknownPreservesPhysicalIdentityAndDoesNotUnlockNewPhrase() started.
◇ Test restoringOriginalNeverOverwritesAnUnsubmittedLocalDraft() started.
◇ Test lateAndDuplicateFinalsCannotReplaceReviewedTextOrCrossAccount() started.
◇ Test case passing 1 argument reason → "notice" to recreatedRecoveredReviewExpiresWithCurrentQualification(reason:) started.
◇ Test case passing 1 argument afterWrite → true to journalSaveOrPhysicalReadbackFailurePreventsPOST(afterWrite:) started.
◇ Test case passing 1 argument afterWrite → false to journalSaveOrPhysicalReadbackFailurePreventsPOST(afterWrite:) started.
◇ Test case passing 1 argument reason → "permission" to recreatedRecoveredReviewExpiresWithCurrentQualification(reason:) started.
◇ Test case passing 1 argument reason → "unrelated-history" to recreatedRecoveredReviewExpiresWithCurrentQualification(reason:) started.
◇ Test case passing 1 argument reason → "withdraw" to recreatedRecoveredReviewExpiresWithCurrentQualification(reason:) started.
✔ Test failedRefreshDoesNotEraseUnsubmittedLocalReview() passed after 0.001 seconds.
✔ Test newReadWithoutRecoveryQualificationHidesPreviouslyVerifiedVoiceResult() passed after 0.005 seconds.
✔ Test lateRecoveryAfterActorSwitchCannotPublishOriginal() passed after 0.006 seconds.
✔ Test pendingRetryKeepsExactBytesAndNeverUsesUnrelatedHistory() passed after 0.007 seconds.
✔ Test policyWithdrawalAndLateResponseHideScopedResult() passed after 0.008 seconds.
✔ Test recoveredReviewReadPortRejectsActorSceneAndRootInvalidationImmediately() passed after 0.009 seconds.
✔ Test canonicallyEqualEditedReviewCannotChangeOriginalUTF8OrKey() passed after 0.010 seconds.
✔ Test liveActorChangeAndWithdrawalDuringGETCannotPublishOrComplete() passed after 0.011 seconds.
✔ Test recreatedVoiceConsumerRestoresOnlyVerifiedOriginalAndDirection() passed after 0.013 seconds.
✔ Test rejectedRecoveryReadKeepsUnknownPhysicalIdentityWithoutReviewBody() passed after 0.014 seconds.
✔ Test unconfiguredPersistenceRemainsClosedWithoutTrapping() passed after 0.014 seconds.
✔ Test journalSaveOrPhysicalReadbackFailurePreventsPOST(afterWrite:) with 2 test cases passed after 0.016 seconds.
✔ Test restoringOriginalNeverOverwritesAnUnsubmittedLocalDraft() passed after 0.019 seconds.
✔ Test cancellationUnknownPreservesPhysicalIdentityAndDoesNotUnlockNewPhrase() passed after 0.020 seconds.
✔ Test unknownACKReadbackFindsOriginalTurnWithoutSecondGenerate() passed after 0.021 seconds.
✔ Test recreatedRecoveredReviewExpiresWithCurrentQualification(reason:) with 4 test cases passed after 0.023 seconds.
✔ Test lateAndDuplicateFinalsCannotReplaceReviewedTextOrCrossAccount() passed after 0.023 seconds.
✔ Suite NativeVoiceTranslationTests passed after 0.023 seconds.
✔ Test run with 17 tests in 1 suite passed after 0.023 seconds.
```

### Final scoped SDK check

Command: `python3 /private/tmp/ios005-voice-regression-check-20261016.py --sdk-only`

Output SHA-256: `c4273160ad3a6af8db198590c7b606e654eb005accaa75e74f6796f1faab3f97`

```text
PASS: actual full Voice View/Store, unchanged Root Store and journal iOS SDK typecheck; neighboring app interfaces unavailable stubs only
```

### Documentation baseline

Command: `node scripts/docs-check.mjs`

Output SHA-256: `6ef37bbdf6456c5d59627a6d18ba7bc78abdc2b026c8ef90e0b5bf6945ea553b`

```text
VPJ plan passed: 83 tasks, 20 replacements, acyclic dependencies, contracts and archive hashes.
AI Core and VPJ documentation baseline passed.
```
