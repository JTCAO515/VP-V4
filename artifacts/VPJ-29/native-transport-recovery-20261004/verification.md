# #220 R2 native transport recovery — 2026-10-04

Independent branch `codex/vpj29-native-transport-recovery-20261004`, parent fixed
`5c2a657c96401a973657314863f7b3b9a57ad898`. Actual #366 API/context wire inspected
at fixed `f3fa1ec32eee6b2aa72be03170854c751210a95b`, whose final TS/evidence head is
`2970e4da9056e4255b457148fe966b3d3d628777`. Neither TS nor SQL is modified by this
native commit. `source-sha256.json` identifies all tested owned sources.

Implemented native flow: existing confirmed Today entry → current real Trip/day/item →
ordinary owner context with current labelled canonical place references → explicit
origin/destination/whole mode/now/foreground Maps consent → check/refresh/stop →
strict exact server receipt qualification → explicit optional/fixed/reservation
preservation selection → nested transport prepare → original candidate diff →
original selection journal → exact original NativeTripView Proposal review and original
confirm/reject → original operation ACK recovery. Missing context labels, references,
source/policy/capability, unsupported mode, first/no change, expiry or revocation remains
pending with the original Trip/address/navigation outlet. No manually entered receipt,
internal place ID, caller proof, raw provider response or local hash confers authority.
Movement is always zero here; explicit refresh uses the server's time threshold.
No automatic polling/refresh, background position, key/config/grant or provider action.

R1 remains the `user_report` branch. R2 requires `report=null`,
`sourceSemantics=qualified_foreground_transport` and exact `transportReference` receipt
and scope. Pending source semantics alone are never labelled as qualified. Times are
compared as UTC instants, including equivalent SQL `+00:00` and producer `Z` formatting.
Displayed duration/distance are fetch-time estimates; TMC is a returned-route aggregate
with the route-change caveat. Provider observation time is null. No closure, incident,
bus arrival, forecast, cancellation or refund is inferred. Expiry is server supplied;
there is no native TTL renewal. The SQL original writer retains the final authority.

Both preparation and selection persist/read back the exact bytes and operation before
sending. Transport preparation has no selection-operation receipt; unavailable reads
retain unknown state. The independent explicit replay uses the unchanged fresh real
Trip/session verifier, exact journal readback, then a receipt read. 401/403/malformed
ACK prevents replay that round. Network/unknown is not proof of absence; replay may
first perform the exact original operation. Selection persists receipt/scope locator
metadata only, so the original scope can be stopped after reopening without pretending
that metadata is new source qualification. No revision/successor path is added.

Main's same-flow review decision is implemented: only the exact original Proposal
id/revision/base/digest and original Trip/receipt extend the foreground viewed scope.
Entering review cancels in-flight checks and forbids refreshing or changing the scope;
it issues neither stop nor new authority/expiry. Leaving review, closing the flow,
background or actor change hides results and stops the old scope where current authority
permits. Lost/first ACK stops with nil epoch so the ordinary server reader obtains the
actual current epoch before one CAS. Concurrent stop requests for the same scope are
coalesced locally. A failed stop remains unknown; stop is not an undo of an applied
original confirmation. This lifecycle is source/store tested, not Simulator UI evidence.

Scoped existing-format repair: original SQL Proposal digests are
`trip-v2:<64 lowercase hex>`. A dedicated validator now accepts that real format in
original Proposal ACK/journal identity while context/content/source digests remain bare
64 hex. The original reference includes its full digest. The old outcome fixture uses
the real SQL prefix and rejects missing/wrong prefixes.

PASS: full Xcode 27 unsigned generic iOS Simulator build, arm64 and x86_64, independent
`/tmp/vpj29-native-transport-recovery-20261004-dd`. `generic-build-wire-final.log.gz`
is the final owned source build. Earlier full/incremental builds are retained separately
and are not additional capability coverage. No Simulator boot, install, UI or device.

PASS: 8 distinct R2 SwiftTesting source/store behavior cases, plus the one affected
existing original Proposal digest case. Initial source-tests ran six new cases; the
seven-case incremental run includes those plus the digest case. After context/journal/
review changes, only the four affected/new cases were run; after stop lifecycle and
UTC format changes, only their two/one affected cases were run. Logs preserve the
selection and result at each source revision; counts are not summed into unique coverage.
The harness reuses the existing R1 source projection, real Recovery/Traffic/Trip sources,
fake vault and selected unchanged NativeSession methods with unrelated-domain shims.
No R1 full-suite, backend/PG or provider matrix was repeated.

PASS: current NativeRecoveryTests.swift typechecked against the final compiled full
VisePanda arm64 iOS Simulator module, including installed TestingMacros. This is
compilation only. Initial typecheck FAIL (`no such module Testing`) came from the omitted
platform Developer framework search path; adding the installed framework path fixed it.
The first pbx insertion was caught by plutil, corrected before any build; final pbx lint
and `git diff --check` PASS. No source policy/permission denial was bypassed.

UNRUN: full iOS tests, rendered/interactive Simulator UI, physical device/VoiceOver,
real signed native Auth/HTTP/SQL recovery, #646 installed reservation capability,
#366 target policy/source/producer activation, actual provider and unified target/
human/production acceptance. Development source does not claim these capabilities.
Shared final SQL/TS integration, registry entries and whole Issue disposition remain
with #220 integrator/Main. No micro PR or whole #220/#366 close is made here.

Reproduce only the R2 source cases and affected old digest case:

```sh
python3 artifacts/VPJ-29/native-transport-recovery-20261004/prepare_harness.py "$PWD" /tmp/vpj29-transport-source-check
swift test --package-path /tmp/vpj29-transport-source-check --filter 'NativeTransportRecoveryTests|receiptMustIdentifyOriginalOperationProposalAndAppliedVersion'
```

NativeSession, Hotel, Reservations, registry, backend, SQL, real-user data, phone,
production and external-message/publication actions were not changed by this native commit.
Rollback is removal of the bounded native consumer commit; no server migration or data
rollback is introduced.
