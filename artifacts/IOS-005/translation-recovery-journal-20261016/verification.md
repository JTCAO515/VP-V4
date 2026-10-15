# IOS-005 recovery journal evidence

Owned implementation: three new Translation recovery files and one independent test file. Base `4a628e4a6063d8a2263a36c51af55c8f811c3066`; initial stable API/implementation `39521b32` pushed and accepted by Main. This artifact describes isolated journal evidence, not complete Issue/device acceptance.

## Stable consumer seam

- `NativeTranslationRecoveryIdentity`: throwing initializer for the exact eight fields; `hashInput(_:)` hashes untouched UTF-8. UUID versions/variant match the existing server guard; lowercase SHA256 and opposite zh/en only.
- `NativeTranslationRecoveryPersistence`: synchronous MainActor `read(scope)`, `retain(identity,scope)`, `complete(original,verifiedReceipt,scope)`, `abandonLocally(original,scope)`. The returned record carries exact physical bytes for CAS. A new retain writes and physically reads back before its only initial POST; ANY existing record refuses retain, including the same identity after a lost write-readback acknowledgement. Restore uses GET only.
- `NativeTranslationRecoveryJournal(vault:)`: mandatory existing Session vault injection. Main wraps current dataScope before/after each port call, as Main's integration reply specifies. The journal does not own Session.
- Fixed service: `com.visepanda.native.local-session.v2.translation-recovery.` + exact endpoint. Keychain account is exact canonical subject. Record exact keys: version=1, schema=translation-recovery/1, endpoint, subject, mobileEpoch, identity. Maximum 4096 bytes. No generation, text, translation, Trip, prompt/audio, credential or token.
- Only NotFound plus no bytes is absence. Scope mismatch/corruption/access errors block all new submission. No TTL or launch infers completion. Same owner/new epoch is an error that hides old metadata and blocks replacement until explicit Session cleanup; other owner/endpoint uses a different physical item.
- `NativeTranslationRecoveryReceipt.verify(bytes,original,httpStatus:)`: closed, duplicate-aware JSON, exact identity, current GET recovery wire only. Only a source phrase with matching original hash/direction/turn and terminal state permits completion. Null/unavailable projection, unknown, pending, HTTP failure and generic cancel acknowledgements cannot clear. Nontranslated phrase accepts the existing five-field projection or seven fields with explicit null translations; it rejects private translated text. DTO remains independent of Store/Phrase/UI and never persists.
- `static erase(endpoint:owner:vault:)`: explicitly requested by Main for logout/account cleanup, including old epoch/corrupt records. Deletes only that fixed exact item, accepts absent deletion only with physical NotFound readback. Transient auth/network loss must preserve pending journals. Feature completion/local abandon require original-record CAS and never call erase.

## Main-only integration candidates

Session factory injects its existing NativeCredentialVault and gates each port with current dataScope. Existing explicit logout/account-delete journal cleanup calls the fixed `erase`; transient loss follows Main's `preservePendingJournals`. No new vault, entitlements or Keychain access-group changes. Register only the fixed metadata companion with the existing JournalData inventory, via its original owner and Main's exact shared hunks. Export only the bounded validated record metadata above; preserve original module return semantics and do not report unknown recovery as completed or as fresh content permission. This owner changed none of Session, JournalData, PBX, Store, View or backend.

## Actual checks

PASS: standalone production typecheck with Swift 6, complete concurrency and `-default-isolation MainActor`. Dependencies are exact copied declarations of unchanged NativeDataScope and NativeCredentialVault, asserted against current source by run-tests.sh; no production implementation is stubbed or simulated except the injected FakeVault.

PASS: run-tests.sh compiles the three actual production sources through read-only symlinks, uses App-equivalent Swift 6/MainActor isolation, and runs the actual test source. Latest result: **15 XCTest tests, 0 failures, 0 skips**, 0.014s suite duration. SwiftPM's trailing zero Swift Testing tests is separate; the fifteen executed XCTest cases are listed in swift-test.log. No external package dependencies, installs, lockfiles or global changes.

Cases exercise object recreation preserving physical original bytes/IDs; generation changes; two owners/endpoints and epoch mismatch; repeat/successor retain denial; access/NotFound contradictions; failed writes; dropped writes; valid-but-changed readback; landed-write/failed-readback recovery; corrupt/oversize/unknown/duplicate/escaped-duplicate/type/version fields; original-byte CAS; missing/different successor; failed remove/readback; unknown/pending/null terminals retaining record; wrong receipt/hash/direction/turn; generic cancellation rejection; each qualified terminal; explicit local abandon; explicit Session erase of corrupt/old metadata limited to exact service/owner; SHA256 known vector and composed/decomposed Unicode distinction. FakeVault only, no real Keychain/account/provider.

Historical FAIL: first App-equivalent default MainActor harness attempt exposed XCTest inherited initializer isolation. Fixed by explicitly nonisolated XCTestCase plus MainActor helper/test operations. Failure log retained. Initial non-default-isolation runs were 11/11 then 15/15; final same-isolation run supersedes them for source-level compatibility.

PASS: git diff --check against the implementation base after removing diagnostic-log trailing spaces and an extra support-file EOF blank line. The initial staged artifact whitespace failure was cosmetic and is retained here. PASS: docs:check; result is recorded in docs-check.log.

UNRUN: complete App build, App XCTest target/PBX registration, 8F Simulator, physical device/VoiceOver, real Keychain/account lifecycle, managed Auth, real provider and target environment. Main owns App/Session/Store/lifecycle integration and final shared verification. Isolated FakeVault tests do not prove those results.

## Ownership at delivery

After final push, this owner stops writing. No in-flight tool, planned edit or successor writer; only a concrete Main-requested repair resumes this exact owner/chat. Main may integrate the three new product files and independent tests plus the exact fixed lifecycle candidates above. No ownership of shared files or existing resources is transferred by this evidence.
