# Coverage progress Native ownership

Owner: 01a10e1b-e851-7591-b79d-ac6dcf8eb0bf.
Branch/worktree: `vpj58-native-coverage-progress-20261006`.
Fixed base: `960f1ed761d0635769ce2a9a486b56efc94139f2` from notification TS.

Current implementation is the isolated lifetime, protected file and original-operation
Keychain journal. It is not a finished caller or inventory capability. The journal
validation boundary will consume only the sole TS closed erase command; no protocol
has been invented here. All shared files and source worktrees remain unchanged.

Required remaining inputs/actions:
- Main relay of the sole TS closed WIRE and producer rows/protocol.
- Main explicit release/precise lease for NativeSession, DataCoverageModuleView,
  DataCoverageCopy/Models only where necessary, and PBX new-file registrations.
- Selected owner inventory/preview/confirmation/recovery/private file/receipt consumer.
- Necessary affected build/runtime validation after the actual caller is registered;
  no physical device, target/provider/Storage/permission/fees are authorized here.

Current verification: Swift parser PASS for own three source files and own storage
test source; `git diff --check` PASS. Runtime tests and app build UNRUN at this point.
Storage fixture strings prove no producer wire or real data outcome.

Whole #239, full ALL1 missing and ALL2 remain Open.
