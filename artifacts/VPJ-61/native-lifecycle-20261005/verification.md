# Native Trip lifecycle A1/A2

Product source checkpoint: `b49af9f9cfb9e182c755e172cc537f82ea08da1d`, fresh-main base `85e7ec6b7969a9a5796d07c58c8b8880bada1d73`. Wire: paired TS immutable `d6925af1` (terminal applied/declined + original-byte abandon). Sole TS integrator unions normal main updates, including notification journals/PBX and the independent translation entry; this source checkpoint did not overwrite those newer files.

Implemented: server-authoritative 3-draft/1-Active display; explicit switch confirmation; legacy reconciliation choices; fresh empty Trip title only; archive with individually selected existing consented preference references or explicit skip; read failures distinguished from no candidates; same-Trip read/result return; honest unavailable service status and existing service-access link. Selection records this archive's retention intent; it neither copies/regrants Memory nor withdraws global Memory on skip. All new/changed Memory stays with #199's original writer. New lifecycle requests never patch Trip content.

Recovery: endpoint/owner/mobile epoch Keychain journal is written and read back before send, one pending operation, original bytes retained across unknown ACK. Empty operation recovery never clears the journal. Digest/action/op/target/session-matched applied/declined receipt or same-byte abandonment terminal releases it. Current state is read again; a historical receipt does not set current Active. Automatic denied preserves the new journal; explicit cleanup erases it with a checked storage failure boundary. Late account/session/generation responses cannot update the feature.

## Actual validation

- PASS: `plutil -lint ios/VisePanda/VisePanda.xcodeproj/project.pbxproj`.
- PASS: initial and incremental generic Simulator `build-for-testing`; final affected entry/UI-test-step delta also compiled (`/tmp/vpj61-native-build-20261005-r3.log`, `TEST BUILD SUCCEEDED`). Xcode 27.0 / 27A266a.
- PASS: actual owned iOS 26.5 Simulator `F0A74EE8-9F0C-4677-B407-3B54A4207065`, six `NativeTripLifecycleTests`, zero failure/skip, `TEST SUCCEEDED`. Raw summary: `unit-test-summary.txt`; result bundle was `/tmp/vpj61-native-tests-20261005.xcresult`.
- PASS: final diff whitespace review. Existing result card is read-only; removal of the archive-only display/load gates keeps existing deletion/session/current-source rights guards.

Exact commands:

```sh
xcodebuild build-for-testing -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/vpj61-native-build-20261005 CODE_SIGNING_ALLOWED=NO
xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=F0A74EE8-9F0C-4677-B407-3B54A4207065' -derivedDataPath /tmp/vpj61-native-build-20261005 -resultBundlePath /tmp/vpj61-native-tests-20261005.xcresult -only-testing:VisePandaTests/NativeTripLifecycleTests -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-
```

The six cases cover default-empty preference choice/inferred/constraint/revoked exclusions; changed row/Trip/epoch and duplicate rejection; original whitespace/digest bytes and journal replacement CAS; unknown network/null recovery then matching durable decline; late replacement preserving the journal; strict boolean revisions and false empty-service rejection. They use local synthetic transports and an in-memory vault, not target Auth or SQL capacity evidence.

Following these tests, only the already leased visible entry busy/draft/pending guard and the two existing `NativeTripUITests` creation steps changed. Their original confirmation/content/same-Trip/relaunch assertions remain intact. Those deltas received incremental compilation; unchanged six unit cases were not repeated. Native UI creation succeeds only on a matching applied receipt, then selects the fresh Trip on the original planning screen; a fixed original Trip reference remains fixed.

## Unrun and external source facts

UNRUN: actual local/target Auth→Native rendered lifecycle→API→SQL joint flow, deployed migrations, provider/fees, real user export/delete, physical device/VoiceOver/human discovery and complete existing UI integration tests. The existing UI tests now navigate lifecycle→capacity→title→create→original screen and still require their disposable authenticated environment. No target schema, provider, credentials, grants, production or phone action occurred.

#224 has no authoritative same-Trip unfinished-service projection in the accepted source. Native displays unavailable instead of an invented empty service list; archiving does not cancel any existing service. Native source delivery and the six local tests do not close the full parent or prove target capacity concurrency. SQL authority, migration/data-rights/capacity tests and final integration/CI are the appointed SQL/TS owners' deliverables.


## Same-task archive reader finding and correction

The earlier card-only UI gate removal did not complete actual archived-result reading: existing v1 Trip loading still required `current:true`, and the v2 Trip-reference decoder accepted only four keys. Main granted only these Trip-reference/Trip-load hunks and affected tests. Source fix: `bd232e6f7ecae50988d45bb09f00c89acf4f71d9`.

Both versions accept the original reference shape or its exact extension `archiveHistorical:true`, provided only by the server after its archive/owner/deletion/original-reader checks. False, null, number, string, extra keys and a flag on Task references are rejected. The v1 Trip consumer requires the second exact artifact/revision/same-Trip read to return `current:false` and `historicalReadable:true` for that flagged historical branch. Ordinary Trip references retain the current-only rule. The v2 exact content reader already required historical readability, and its content/action gates are unchanged. The global v1 `loadExact` and all current-only decision/amendment/confirmation gates remain unchanged. Existing UI labels old revisions as historical read-only results.

Actual affected validation on owned iOS 26.5 Simulator `0265359A-EE05-495E-83D3-7480EC377503`:

- PASS: existing `NativeKnowledgeTests/testTripResultOpensOnlyExactCurrentReference` expanded with archive history positive, wrong artifact/revision/Trip, revoked/read-denied history, malformed proof and global exact-current negative cases; 1 test, 0 failure, 0 skip, `TEST SUCCEEDED`.
- PASS: new `NativeFiveResultTests/testArchiveReferenceProofIsTripOnlyStrictBooleanAndExactShape`; original/archived Trip refs, wrong expected Trip, malformed proof, extra keys and Task isolation; 1 test, 0 failure, 0 skip, `TEST SUCCEEDED`.
- PASS: affected code/tests compiled in these actual test runs; final diff check. Original six lifecycle tests were not repeated because their source and inputs were unchanged.

Commands reused the original project/scheme/derivedData/ad-hoc signing, with destination `platform=iOS Simulator,id=0265359A-EE05-495E-83D3-7480EC377503`, one `-only-testing:` path as named above per run, `-parallel-testing-enabled NO`, and result bundles `/tmp/vpj61-native-archive-read-20261005.xcresult` and `/tmp/vpj61-native-archive-v2-20261005.xcresult`. Raw summaries are in `archive-reader-test-summary.txt`. The owned Simulator was deleted afterward. This is native synthetic reader/proof evidence; SQL authority, Auth/HTTP joint target and real result rights are still the designated TS/SQL owners' integration evidence, not proved by these tests.
