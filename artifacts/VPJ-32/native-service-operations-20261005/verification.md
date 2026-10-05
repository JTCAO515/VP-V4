# VPJ-32 native service operations — 2026-10-05

Native ownership only; related to #224 S1/S2. This does not close the whole Issue.

## Implemented

- Existing Profile Case/grant/revoke flow now opens service progress and reads authoritative operational summaries. Missing or expired operations reads display unknown, never inferred queued/accepted.
- Owner service screen displays bounded current capacity, queued/accepted/assigned/waiting_external/resolved/unresolved/cancelled, actual acceptance/shift timestamps, and distinct tutorial/contact/external-resolution evidence. No ETA is invented. Recorded minutes are labeled `recorded_only`; actual total and charges remain unknown.
- Explicit user-selected owned Trip/head binding is independent of the current viewer. Staff grants still share only the issue. Brief/source qualification stays unknown because no qualifying producer exists in the audited baseline.
- Existing canonical pending proposal selection uses the owner `select_proposal` operation. Review fetches the exact original proposal ID, checks Trip/head/status and then opens the original Trip confirmation flow with the fetched revision/digest reference. No new Trip writer, patch, booking, refund or external contact.
- Actor-scoped synchronous Keychain journal retains the original UTF-8 mutation before dispatch. Receipts must match operation/case/action and SHA256 of those bytes. Missing receipts remain unknown; explicit retry reuses original bytes, and abandon sends their original text. HTTP `CASE_OPERATION_ERASED` never implies cancelled/unexecuted; explicit device recovery stop only erases the local journal.
- Reads expire after at most 30 seconds with both monotonic and wall-clock checks, and active grants expire locally. Scope/background/view changes hide state and fence late replies. Automatic session denial preserves pending journals; explicit logout erases this journal with storage failure fences while preserving existing cleanup behavior.
- A separate `service-case-data/1` family provides explicit confirmed owner Case deletion, minimal digest-bound deleted/cancelled receipts, original-byte abandon and recovery independent of operations availability. The same device journal protects both families.
- An explicit owner export creates a real companion JSON artifact after checking exact request, owner, current session binder, six-domain coverage and at most 30-second expiry. Brief/attachments remain unavailable, original core enrollment is unchanged, and all-account completion is false. Source digest and actual written-file digest are distinct. User-initiated sharing is the only external-transfer entry; app-controlled temporary files are erased on expiry/leaving/logout and interrupted files are swept on re-entry. No actual export or user share was performed.
- Initial canonical Trip/head and proposal base version zero are supported without changing ownership, strict integer/bool checks, original proposal authority or the confirmation writer.
- Complete owner workspace is mandatory; duplicate rows, boolean counters/complete markers, unsupported staff authority, open wire shapes and mismatched Trip candidates are rejected.

## Actual checks

- PASS `git diff --check`.
- PASS `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj` on Xcode 27.0 / 27A266a.
- PASS unsigned full `build-for-testing` with generic iOS Simulator destination and own `/tmp/vpj32-native-dd`, including actual app source and unit/UI test compilation. Initial and final affected delta builds passed. Build success is not test execution.
- PASS 13 Swift Testing cases on macOS via real feature files and unchanged actor/error/vault declarations extracted from `NativeSession.swift`. Tests inject an in-memory vault and response bytes. Reproduce: `python3 tests/unit/service-cases/native-service-operations-host.py`. This does not exercise iOS UI, real Auth or Keychain runtime.
- PASS actual iOS 26.5 execution: `NativeServiceOperationTests` 15/15, 0 failures/skips, including actual `NativeSession` URLProtocol-injected denial/relaunch/logout cleanup and service-journal erase failure. Owned simulator `9CB5C412-F1DB-47D6-A81E-949C8C82A821` was shut down and deleted. This does not verify real target Auth or physical device behavior. Reuse these results for unchanged service operations; new data lifecycle behavior receives only affected checks.

- PASS 6 new data-lifecycle/v0 host Swift Testing cases: explicit confirmation/minimal receipt, data-family unknown ACK and original retry, abandon cancelled versus deleted, source/bundle owner-session-request/TTL/coverage, actual file artifact versus source proof/cleanup, initial canonical Trip version zero. Unchanged 15 iOS tests were reused rather than rerun.

- PASS integrator finding repair: companion response bytes now match the locked 512 KiB (`524_288`) bound. One new host regression accepts an otherwise valid JSON response padded to exactly the limit and rejects the same response at limit + 1 byte. Command: `python3 tests/unit/service-cases/native-service-operations-host.py --filter 'NativeServiceOperationTests.dataExportRejectsBytesBeyond512KiB'`. Result 1/1, no failure/skip. Previous compile and 15/6 scoped evidence are reused; no matrix rerun.

## Unrun and boundaries

Target deployment, staff membership/shift/role/GRANT activation, real operator/provider contacts, real account data, paid actions, real Brief/source producer, physical phone/accessibility and full #224 operational acceptance are UNRUN. Feature activation remains disabled and no staff was enrolled. Backend/RPC/SQL/Ops and protected CI are owned by the paired integrator and their original owners. No new registry or shared TripView edits.

Rollback: remove the feature's new files/project references and precise Profile/Session additions; keep established grants and other journals. Do not silently discard an unresolved device journal during an operational rollback.
