# Native Ask submitted-request recovery — 2026-09-12

Related to #195; baseline c638afe. Started 11:02 CST; two actual process-restart
scenarios observed by 11:30 CST. User acceptance and full S2 remain open.

Implemented one owner/endpoint/epoch-bound Keychain request record, synchronous
write before POST, persisted acknowledgement and original-payload explicit retry.
Matching history or confirmed policy withdrawal/session clear releases the record.
Keychain failures fail closed; notice/mode changes cannot rebind its consent.
See [the contract](../../../docs/contracts/vpj-07.md).

## Evidence

- PASS: complete native build-for-testing with ad-hoc signing, Xcode toolchain at
  `/Applications/Xcode.app/Contents/Developer`, owned iOS26.5 Simulator.
- PASS: 22 XCTest tests and 9 Swift Testing tests; 5 existing real API opt-ins
  skipped because this run did not configure their identity/Trip/text environments.
  All 10 new persistence tests executed, including actual Keychain attributes,
  same-payload retry, locked/read/write/delete failures and account/notice changes.
- PASS: 2 actual application-termination UI tests, backed by the separate synthetic
  loopback HTTP fixture. English loses a receipt; Chinese retains an acknowledged
  request while history is hidden across restart. Both recover the answer with
  exactly one POST. Chinese send/new-question stay disabled before reconciliation.
  Screenshots: [English](recovered-en.png), [Chinese](recovered-zh.png).
- PASS: independent data-integrity review, final Critical0 / Important0.
- PASS: docs check, diff check and Python fixture syntax check.
- Cleanup: fixture stopped; owned Simulator removed after both tests signed out.

The first review found an ack-before-history crash gap. Fixed by persisting the
ack state before loading history and tested with empty history across restart.
The original state test expected immediate local removal after ack; updated it to
require retained acknowledgement followed by removal on matching history. Initial
UI test compilation needed explicit XCTest Sendable conformance. Final builds pass.
Xcode reported a post-test optional diagnostic collection warning about inherited
CommandLineTools/simctl; all selected tests and their screenshots completed, exit0.

This fixture does not validate real Auth, RLS, supplier calls, worker crash recovery,
user charging or real-provider semantics. No remote, provider or Production actions
occurred. Existing real Staging evidence and retained semantic failures are unchanged.
Physical-device testing remains deferred. Required PR CI is pending at this report.

Raw xcresult bundles/logs remain in the private local cache
`native-pending-recovery-20260912`; no credentials are included in these artifacts.
Reproduction: [fixture guide](../../../tests/fixtures/native-pending/README.md).
