# NativeQA pending custody — owned module delivery

Related: IOS-001 #203 / WEB-001 #681 / PROGRAM #187. Base: 63cfef86767e546c99028270c53fb772b9234c5c.
Source commits: b1f19bf2 (module/tests), 61dac653 (explicit cleanup after session fencing), 8791a727 (JournalData companion address and admission receipt wording).
Owner branch: codex/p0-nativeqa-journal-20261016. Shared Session/PBX/JournalData registration belongs to Main.

## API and integration

`@MainActor NativeQAPendingJournal(vault:currentScope:)` consumes the existing `NativeCredentialVault` and live `NativeDataScope?` closure. It never reads or copies Bearer credentials.

- `load(scope:) throws -> NativeQAPending?`: scoped custody read; restore only original request GET reconciliation. A loaded record is not POST admission.
- `retain(_:scope:) throws`: validates matching endpoint/subject/mobileEpoch and live generation; writes exact immutable command then physically reads matching envelope bytes before returning. Same pending is idempotent; different, foreign, corrupt or old-epoch custody refuses overwrite. The original `body: Data` is base64 stored without rebuilding its JSON.
- `clearExact(_:scope:) throws`: low-level CAS only after a successful load/retain on this instance in this generation. Main/UI must independently validate an exact authoritative admission/message receipt (including an exact persisted pending row proving admission, without implying task completion). Do not call on absent history, 403, cancellation or uncertain ACK.
- `abandonLocally(_:scope:) throws`: explicit local discard using the same CAS. This is not server undo or successful completion.
- `metadata(scope:) throws -> Metadata?`: returns only requestID/sessionID/policyID/noticeHash/mobileEpoch after live scope checks. No raw body, text, output, owner, endpoint, token, configuration or private envelope identity is exported.
- `static erase(endpoint:owner:vault:authorized:) throws`: exact fixed item for explicit account cleanup, including corrupt/old-epoch custody. Main's private Session must repeatedly validate original endpoint+credential/cleanupOwner+explicit non-preserve cleanup intent in `authorized`. This independent authority works after logout has fenced active dataScope to nil. Expiry, 401 and revocation preserve pending. Never provide an unconditional production `true` closure.

The public pure `service(_ endpoint: String) -> String` returns `com.visepanda.native.qa-submission.v1.` plus the trusted endpoint. Keychain account is the subject directly, matching Main's existing JournalData companion. All reads/writes/CAS/removes/erase use that same address without enumeration. This supersedes the initial pre-integration fixed-service/encoded-account layout; no QA records were deployed/persisted so no migration is performed. Production uses original `NativeKeychainVault` read/write/remove and its existing WhenUnlockedThisDeviceOnly insertion; this module changes no primitive. A private random envelope identity and exact physical bytes form the CAS snapshot; generation changes require reloading. Synchronous MainActor serialization plus a shared reentry guard protect this process's single writer. This does not claim cross-process atomic CAS that the existing vault protocol cannot supply. Removal needs successful remove plus physical not-found/nil confirmation. Failures never report successful custody or cleanup; a completed physical write/delete can remain despite a subsequent scope/readback failure.

## Verification

Run from this worktree:

`python3 artifacts/IOS-001/nativeqa-persistence-20261016/verify.py`

PASS at 61dac653: actual Swift 6 compilation and 20 Swift Testing test functions, including parameterized negatives, using synthetic in-memory MockVault (`baseline-verification.json` pins that source). PASS at final source 8791a727: complete exact source/test compilation plus only 4 affected tests, including a new all-operations companion address test. Run the final affected selection with `verify.py --filter 'journalDataCompanionUsesSameAddressForEveryOperation|retainPhysicallyReadsBeforeReturningAndIsIdempotent|eraseCorruptCustodyChecksScopeAndFixedKeyAndAbsence|explicitCleanupAfterLogoutNeedsIndependentAuthority'`. The unchanged failure-path evidence is reused rather than rerunning its matrix. `swift-test.log` is the earlier 20-test run; `swift-test-affected.log` is the final 4-test incremental run; XCTest's zero-test preamble is distinct from Swift Testing's actual 20-test result. The harness copies exact production contract/module/test sources and extracts NativeDataScope, NativeCredentialVault and NativeKeychainVault declarations unchanged from actual NativeSession.swift. Original Keychain implementation compiles but is never invoked. `verification.json` pins final exact source hashes and extracted definitions hash. No dependencies installed; no Simulator resource used.

Coverage: physical write/read ordering and mismatch/failure/absence; exact noncanonical body preservation across reopen/unknown ACK; idempotence and conflicting request rejection; endpoint/owner/epoch/generation/nil checks before/during storage; corrupt/foreign/old-epoch custody; same-command replacement private CAS identity; replacement during delete read; no wrong-request delete; remove/readback/absence failures; scoped metadata allowlist; explicit abandon; explicit account erase with absent/corrupt custody and identity intent; scope nil after logout; preserve=true refusal; revoked cleanup authority; synchronous reentrant writer refusal.

Initial FAIL retained: `initial-test-compile-failure.log` records two missing inner `try` expressions in Swift Testing `#require`; corrected before final PASS. No production-source compile failure was observed.

UNRUN: real Keychain IO, iOS app/PBX integration, actual Session cleanup/JournalData registration, target Auth/provider persistence, Simulator UI, physical device. Main owns integration and applicable checks. No DB/provider/network product calls, credentials, signing, deployment or old translation suites were used.

Implementation and local verification complete. Lease retained; no planned or in-flight product writes after final delivery.
