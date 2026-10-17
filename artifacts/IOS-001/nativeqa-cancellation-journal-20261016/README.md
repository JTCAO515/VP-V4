# NativeQA cancellation metadata custody

Task: #203 / #680. Fixed contract head: `4e9e58b352d51445c4b98eec3f1dece2750bf9d6`, parent `c9288bb98d680d80d7fea40f17227694fd25274f`, ancestor `efb3c794`.
Product commit: `82dc6d76cde3a6da10c71590e87059f25355e491`.
Branch: `codex/p0-nativeqa-cancellation-journal-20261016`.

## Integration API

The sole new production file is `NativeQA/NativeQACancellationJournal.swift`. It conforms to the fixed `NativeQACancellationPersistence` without changing either contract or Store, transport, Session, Root, PBX, JournalData, generation persistence or any old source.

- `@MainActor NativeQACancellationJournal(vault:currentScope:)`. Keep one instance for load/retain/finish so its private snapshot belongs to the current scope generation. Reopened instances first load the exact tuple.
- `loadCancellation(target:)`: returns only exact active endpoint/subject/epoch/session/request custody. A missing record is not an observed cancellation. Restored unknown and observed records only permit GET reconciliation in the consumer; this module never dispatches or grants POST eligibility.
- `retainCancellation(_:scope:)`: atomic process-local capacity check and retain, with exact physical CAS/readback before returning. Same tuple preserves any existing observed receipt. No new cancel UUID is introduced; the immutable command's original body remains `Data("{}".utf8)`.
- `finishCancellation(_:receipt:scope:)`: validates the fixed contract's observed cancelled/terminal receipt, requires this instance's current-generation snapshot, and seals a tombstone with physical readback. Never deletes the immutable command, resets an observed receipt, clears generation custody or changes budget/refund state. A conflicting receipt fails closed.
- `static service(_ endpoint: String) -> String`: `com.visepanda.native.qa-cancellation.v1.` plus the trusted endpoint. Every IO uses account = subject directly, matching the existing JournalData companion addressing convention. This namespace is independent of generation custody.
- `inventory(scope:) -> Inventory`: totalRecords counts all epochs for this endpoint/subject; records projects only active-epoch metadata (`mobileEpoch`, `sessionID`, `requestID`, optional `observedState`). No command body, raw envelope, private CAS UUID, endpoint, owner, credentials, question/output or financial data is exposed.
- `static erase(endpoint:owner:vault:authorized:)`: Main's private identity owner must validate the exact owner/endpoint, original epoch/credential authority and explicit cleanup intent before and after each IO. This works when logout has already fenced active dataScope to nil. Transient offline, locked storage or background state does not authorize cleanup. It physically compares, removes only the fixed cancellation item and confirms absence. No item enumeration or generation-journal access.

One private ledger contains at most 32 records across all epochs. Unknown and observed entries consume capacity equally; no eviction, age reset or automatic clearing. Each actual encoded record is capped at 4096 bytes on both write and read. Public failures `Failure.capacityExceeded` and `Failure.recordTooLarge` make refusal observable. Malformed/foreign/duplicate/oversized custody is not overwritten. Unrelated and older entries retain their original encoded bytes during append/seal.

A private ledger revision UUID plus exact bytes participates in physical compare-and-write. A private per-entry UUID/snapshot prevents old callbacks from sealing replacement custody. Synchronous MainActor transactions and a shared reentry guard serialize all journal instances in this process. These are the existing vault protocol's single-writer guarantees, not a claim of cross-process atomic Keychain CAS. Physical writes/removes may have completed before a subsequent callback/readback failure; failure never reports successful custody/seal/erase and does not retry or undo blindly.

## Actual verification

Run only this module's verification:

`python3 artifacts/IOS-001/nativeqa-cancellation-journal-20261016/verify.py`

PASS at product source `82dc6d76`: Swift 6 actual iOS Simulator target typecheck (`-target arm64-apple-ios17.0-simulator`, installed iPhoneSimulator27.0 SDK) of the exact fixed contracts, new production source and unchanged definitions extracted from actual NativeSession.swift. This validates iOS 17 availability/type compatibility; it is not a simulator launch, iOS 17 SDK/runtime observation or App/PBX build.

PASS: 17 Swift Testing functions / 36 expanded invocations in the isolated macOS SwiftPM harness with synthetic in-memory vault. The XCTest zero-test preamble is distinct from Swift Testing's actual 17-function result. Tests cover write failure, physical readback mismatch/error/absence, same-command idempotence, exact body bytes, unknown/observed reopen, immutable observed seals, wrong/unobserved receipt rejection, finish write/readback failure, physical CAS race, private replacement identity, full 32 with mixed unknown/observed, cross-epoch total 32, no eviction, record >4096 rejection and stored >4096 rejection, owner/endpoint/epoch/generation/nil fences, late callbacks, malformed/foreign/duplicate/body-corrupt records, safe inventory, callback reentry, explicit cleanup after dataScope=nil, authorization denial/revocation, remove/absence failure, preservation of another owner and an independent synthetic generation item.

Original NativeDataScope, NativeCredentialVault and NativeKeychainVault declarations are extracted unchanged from the repository. The real Keychain implementation is compiled but never instantiated/invoked. No SDK/tool/dependency installation. No full iOS/translation matrix rerun.

Initial test compile FAIL is preserved in `initial-test-compile-failure.log` and `initial-verification.json`: two recursively nested Swift Testing `#require` macros. These were split into local values; the production iOS17 typecheck passed in both runs. Final `swift-test.log`, `ios17-typecheck.log` and `verification.json` retain exact source/extracted-primitive hashes and exit codes.

UNRUN: real Keychain IO, actual Auth/provider/target data, integrated App/PBX/Session/JournalData lifecycle, simulator UI or physical device. Main/unique integration owns those follow-ups. No network product calls, real credentials, user data, target writes, refunds, budget changes, deployment or signing were performed.

Owned implementation and scoped checks complete. Evidence-only finalization follows the early product commit. Final STOP retains the lease and has no in-flight or planned writes.
