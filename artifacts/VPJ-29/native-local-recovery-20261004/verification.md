# #220 native consumer evidence — 2026-10-04

Code fixed: `9c466e105fc85e7c4a0ccc47c54021dc6e17b37a`, from live main `8d30d0ba` plus fixed TS `e72ac95d54c063781eb7fbfca0d8b9ad108b29c7` (local dependency cherry-pick `38551957`). Same-result batch; no separate consumer PR. Source hashes in source-sha256.json.

Implemented: confirmed Today entry → explicit day/1–8 optional items/fixed items/current exact reservation preservation bindings → current prepared context and 1–2 omission candidates with original diff/pending evidence → explicit selection → durable exact original bytes/op → exact original NativeTripView proposalReference/baseVersion → original confirm/reject path → precise operation receipt. No second Trip writer, revise or successor path is offered. ACK identity is durably bound to the first original proposal id/revision/base/expiry/digest. Missing/unbound/unknown/incomplete reservation reads stay pending. High-risk unwell produces no candidate; qualified official help is explicitly unavailable. R2 is unsupported without #366's qualified receipt reader and exposes the original Trip/address outlet.

All failed reads retain unknown state. Independent user-explicit replay first reads the real current Trip through existing Session transport, checks initial/final actor+epoch+generation, reads back original journal bytes/op, then attempts exact operation read. Authentication, permission or malformed response failures in that round prevent dispatch. Network/unknown results do not prove absence; frozen same-operation replay can first commit the original operation, without new operation IDs or duplicate objects. Preparation has no selection-operation receipt reader; this absence is displayed. Journal remains frozen until exact ACK or proven terminal state; explicit privacy logout/account switch is separately handled.

NativeSession's scoped changes: automatic denial clears credentials and visible scope while preserving the recovery journal. An endpoint-scoped non-credential cleanup-owner index survives credential deletion. Explicit logout/account switch erases the same owner/endpoint service and removes that index only on successful erasure; failure fences identity and returns storageError. Existing other-domain cleanup is untouched. Session file released to Main after code fix.

PASS: Xcode 27 generic unsigned arm64/x86_64 compile of the full app, independent `/tmp/vpj29-native-local-recovery-20261004-dd`, generic-build-pass.log.gz. No Simulator boot/install/UI or physical-device action.

PASS: actual NativeRecoveryModels/Journal/Store source, real NativeTripModels source and unchanged selected NativeSession auth/transport/denial/clear methods executed on macOS with fake Vault, URLProtocol and other-domain dependency shims: 12 SwiftTesting tests (15 parameter cases), source-tests-pass.log.gz. The 2 Session tests exercise credentials/login/profile → real dataRequest 401 → real handle(denied)/clear → no credentials/readable scope with original journal retained → explicit logout cleanup, plus explicit erase failure fencing. Projection metadata includes full original NativeSession SHA and the unrelated methods excluded. This is source-method behavior, NOT full iOS NativeSession runtime, real Keychain, signed Auth or target-environment evidence.

PASS: affected iOS NativeRecoveryTests.swift typechecked against the compiled full VisePanda module, arm64 iOS Simulator SDK; tests-typecheck-pass.log (exit 0). TestingMacros loaded from the installed Xcode toolchain plugin path. This is typechecking, not Simulator test execution.

PASS: pbx plutil and git diff --check. Initial generic and incremental evidence reused for unchanged code; no backend PG/model/provider replay.

Historical FAIL preserved: first harness used Swift5/non-actor configuration and lacked unrelated Trip model dependencies; fixture dictionary ternary caused a compiler diagnostic failure; added ACK metadata invalidated one old whole-record equality assertion (fixed to test original bytes/op and exact ACK identity, with changed-child rejection); Session harness lacked firstAccess/tripRequest and one #require inner try; initial iOS typecheck used a nonexistent TestingMacros platform path. These were harness/fixture/compiler issues, not permission denials or target runtime failures. Evidence log files retain them. Evidence preparation's first projection script had a Python path-parentheses error; corrected and reproduced identical tested projection, without rerunning behavior.

UNRUN: full iOS test execution, Simulator UI, real native authenticated server/SQL flow, #646 reservation deployment, #366 receipt reader, provider/model, physical device/human/accessibility, production. At task start #646 was open, so its runtime authority is not treated as installed. SQL atomic lineage/expiry/confirm behavior belongs to original SQL/TS owners' same-result integration, not these synthetic native tests. Whole #220 is not declared closed from this consumer alone.

Reproduce source-method harness at this fixed revision:

```
python3 artifacts/VPJ-29/native-local-recovery-20261004/prepare_harness.py "$PWD" /tmp/vpj29-recovery-source-check
swift test --package-path /tmp/vpj29-recovery-source-check
```

No Hotel files, Reservations/Library files, backend/SQL/provider/grants, real-user deletion/export, or phone actions changed by this native commit.
