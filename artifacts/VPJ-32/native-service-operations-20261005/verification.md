# VPJ-32 native service operations — 2026-10-05

Native ownership only; related to #224 S1/S2. This does not close the whole Issue.

## Implemented

- Existing Profile Case/grant/revoke flow now opens service progress and reads authoritative operational summaries. Missing or expired operations reads display unknown, never inferred queued/accepted.
- Owner service screen displays bounded current capacity, queued/accepted/assigned/waiting_external/resolved/unresolved/cancelled, actual acceptance/shift timestamps, and distinct tutorial/contact/external-resolution evidence. No ETA is invented. Recorded minutes are labeled `recorded_only`; actual total and charges remain unknown.
- Explicit user-selected owned Trip/head binding is independent of the current viewer. Staff grants still share only the issue. Brief/source qualification stays unknown because no qualifying producer exists in the audited baseline.
- Existing canonical pending proposal selection uses the owner `select_proposal` operation. Review fetches the exact original proposal ID, checks Trip/head/status and then opens the original Trip confirmation flow with the fetched revision/digest reference. No new Trip writer, patch, booking, refund or external contact.
- Actor-scoped synchronous Keychain journal retains the original UTF-8 mutation before dispatch. Receipts must match operation/case/action and SHA256 of those bytes. Missing receipts remain unknown; explicit retry reuses original bytes, and abandon sends their original text. HTTP `CASE_OPERATION_ERASED` never implies cancelled/unexecuted; explicit device recovery stop only erases the local journal.
- Reads expire after at most 30 seconds with both monotonic and wall-clock checks, and active grants expire locally. Scope/background/view changes hide state and fence late replies. Automatic session denial preserves pending journals; explicit logout erases this journal with storage failure fences while preserving existing cleanup behavior.
- Complete owner workspace is mandatory; duplicate rows, boolean counters/complete markers, unsupported staff authority, open wire shapes and mismatched Trip candidates are rejected.

## Actual checks

- PASS `git diff --check`.
- PASS `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj` on Xcode 27.0 / 27A266a.
- PASS unsigned full `build-for-testing` with generic iOS Simulator destination and own `/tmp/vpj32-native-dd`, including actual app source and unit/UI test compilation. Initial and final affected delta builds passed. Build success is not test execution.
- PASS 13 Swift Testing cases on macOS via real feature files and unchanged actor/error/vault declarations extracted from `NativeSession.swift`. Tests inject an in-memory vault and response bytes. Reproduce: `python3 tests/unit/service-cases/native-service-operations-host.py`. This does not exercise iOS UI, real Auth or Keychain runtime.
- Two additional actual `NativeSession` URLProtocol-injected tests compile with the app target: denial/relaunch/logout cleanup and service-journal erase failure. iOS execution is reported separately when run; excluded from the host package.

## Unrun and boundaries

Target deployment, staff membership/shift/role/GRANT activation, real operator/provider contacts, real account data, paid actions, real Brief/source producer, physical phone/accessibility and full #224 operational acceptance are UNRUN. Feature activation remains disabled and no staff was enrolled. Backend/RPC/SQL/Ops and protected CI are owned by the paired integrator and their original owners. No new registry or shared TripView edits.

Rollback: remove the feature's new files/project references and precise Profile/Session additions; keep established grants and other journals. Do not silently discard an unresolved device journal during an operational rollback.
