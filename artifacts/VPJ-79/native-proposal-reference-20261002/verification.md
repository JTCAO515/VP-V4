# Native Proposal reference consumer — 2026-10-02

Related to #560 / #563; both parent acceptance remains open. Backend exact contract #615 is merged at `87f2522b3ca92cc285a75ab851b880c3d5dffb9b`. Component checkpoint `8e9566e8` was rebased to `cdb9d9bd19042de6d93c3f91b69c320b239606d1` on that main.

## Implemented

Closed reference model, exact store and read-only native card. Reject unknown content/actions/confirmation material, require exact artifact/revision, current active receipt, nonnull Trip source and closed basis. Scope/generation invalidation and request-start monotonic 20-second cache cap apply. The cap does not infer canonical Proposal expiry; the card says eligibility was checked at this read and further use needs a new authoritative read. Task/goal association is not evidence of Proposal generation.

NativeSession adds only `proposalReferenceRequest(artifactID:revision:)`, fixed GET path and mandatory query parameters, through the established credential/identity fence. Existing activity/comparison/Trip/Task methods are unchanged. No Confirm/Apply/writer is introduced.

## PASS

- Dedicated simulator `7E54B1DB-FC14-45BD-8604-A789E5DD485C`, iOS 17.5; DerivedData `/tmp/vpj79-proposal-native-20261002`.
- Initial component compile failed because synchronous tests lacked MainActor annotations. Only those test annotations were repaired; focused rerun executed 6/6, zero failures/skips. Prior failure is retained, not called a test pass.
- Disposable native runner at prebound base 64220: actual local Auth/HTTP/Postgres-created pending Proposal, service-only reference publication, NativeSession login and exact GET, closed decode/store, actual UIHosting card render; owner success, logout hides content, foreign actor cannot read. Seven tests passed, zero failures/skips, build-for-testing passed.
- Trip title/head/event count unchanged across native reads; zero provider/model calls during native consumption. Synthetic source-worker preparation is not a real provider-produced reference claim.
- Actual authenticated card PNG visually inspected: `/tmp/vpj79-proposal-auth-20261002/images/228EBBB6-B9D5-4377-A663-C2865E3D1E41.png`. Result `/tmp/vpj79-proposal-auth-20261002/tests.xcresult`, bounded summary `/tmp/vpj79-proposal-auth-20261002/summary.json`.
- `pnpm lint`, `pnpm docs:check`, diff checks. Disposable stack/users/services removed; credential-bearing test launch file removed. No credential is committed or printed.

Command: set fresh absolute `VP_PROPOSAL_OUTPUT`, dedicated `VP_PROPOSAL_SIMULATOR`, and `VP_NATIVE_HTTP_PORT_BASE=64220`; run `node --experimental-strip-types tests/integration/artifacts/run-proposal-reference-native.mjs`. Test-only generated artifact identity is supplied to exact acceptance, never a product discovery input.

## Remaining / UNRUN

The merged exact API cannot discover a reference. Existing Library search and Task/Trip comparison APIs deliberately exclude Proposal references. Main assigned the original backend owner an independent owned Trip-to-current-reference discovery contract (bounded 64 + sentinel, exact eligibility recheck). Runtime discovery wiring and complete Library entry await that contract's normal merge. No user-entered internal ID, fixed fixture ID or comparison scan is used as an entry.

At the exact-reader checkpoint, complete product-entry acceptance remained UNRUN and no partial PR was submitted. Final Library entry evidence follows below; real provider producer, Staging, physical device, VoiceOver and production remain UNRUN.

## Frozen discovery checkpoint

Main supplied RPC `read_trip_change_proposal_reference_v1(p_trip_id uuid)` and GET `/api/results/native/v1/change-proposal-reference/trip?tripId=UUID`. Closed `{version:1,data:{kind:"result_reference",tripId,artifactId,revision}}`, revision 1..1000; terminal kinds have only `kind`. Latest current candidate ordering is created_at DESC/id DESC, 64 + sentinel; no comparison fallback.

Added only a dedicated NativeSession GET method and closed receipt decoder pinned to the expected selected Trip. Added focused decoder cases for later execution. Syntax parse and diff check passed; no backend runtime was consumed, no UI entry enabled and no test suite rerun for waiting. These additions remain UNRUN for typechecked/runtime validation until backend normal merge and complete wiring.

## Complete Library entry on merged discovery

Rebased onto discovery #617 merge `03e9627ee753ccc19a447e9edd8c55794b635368`. Project conflict resolution preserves main A983 references and app/test sources alongside only own B979 additions. NativeSession changes remain the two dedicated reference GET methods; no existing methods or Ask/Journeys source changed.

Library obtains titles/IDs solely through existing owned Trip list reads. User selection resolves through the dedicated Trip discovery receipt and reopens the exact artifact/revision. Source Trip must match the selected Trip. Both reads share the original request-start 20-second monotonic cache cap and scope/epoch, selected Trip, generation and cancellation checks. Refresh/selection/actor/background clear prior content; expired content cannot be displayed. No stored discovery pointer, legacy comparison fallback, internal-ID input, fixed-fixture entry or confirm/apply action exists.

PASS: three added frozen-discovery/combined-deadline/source-Trip/selection/authority tests in `/tmp/vpj79-proposal-entry-20261002/tests.xcresult`, zero failures/skips for those tests. The first UI attempt in that same result failed before entry while waiting for Profile's Sign out after login had selected legacy Ask. Effective original exact-component 7/7 evidence is reused.

PASS: final UI-only acceptance `/tmp/vpj79-proposal-entry-reader-ui-20261002/tests.xcresult`, 1 executed / 1 passed / 0 failures / 0 skips, plus build-for-testing. Actual owned local Auth/HTTP/SQL: user-selected owned Trip → discovery `result_reference` → exact `result_artifact` → actual read-only Library card; selection of a no-reference Trip clears old content; canonical Proposal revision **between discovery response and exact open** returns unavailable and prevents old card; real consent withdrawal plus refresh hides the card; switching actor through real logout/login renders only the second actor's owned Trip and no prior reference. Trip IDs, titles, heads and event counts remain unchanged; model/provider calls during UI consumption are zero. Disposable users, stack/services and credential-bearing launch file were removed. Bound base64220 / proxy64252, own simulator7E54 and dedicated DerivedData reused.

Failures were diagnosed rather than treated as passes: stale disposable session and keyboard obstructed submit; login waits were corrected to actual legacy Ask selection before cold four-tab launch. Container accessibility identifier overwrote child IDs; removed that actual projection conflict. Static read-only text was incorrectly tested for click hittability, causing excess scrolling until the 20-second cap hid it; existence/label and screenshot assertions now verify text, while buttons still require hittability. Logout similarly resets legacy navigation, so the helper reopens Profile. Failure bundles remain under `/tmp/vpj79-proposal-entry-fixed-20261002`, `...-ui-fixed-20261002`, `...-navigation-fixed-20261002`, `...-accessibility-fixed-20261002`. Only failed UI acceptance was rerun; the three passing boundary tests were reused.

Final success, revision-race and other-actor screenshots were visually inspected and are retained as [entry](entry.png), [revision race](revision-race.png), [other actor](other-actor.png). Consent-withdrawal visibility is supported by UI assertions and actual endpoint traces; that capture was scrolled to another section and is not used as visual card proof. Final summary and routes are at `/tmp/vpj79-proposal-entry-reader-ui-20261002/summary.json` and `routes-status.json` (no tokens/content logged).

`pnpm lint`, `pnpm docs:check` and final diff checks pass. Required CI and main independent review follow the final PR head. Parent #560/#563 stays OPEN; whole-ticket, real provider/Staging/device/VoiceOver/production acceptance remains UNRUN. No deployment, paid call or Proposal-confirm invocation occurred.

## PR #620 review repair — same Trip reselection

Main found that tapping the already-selected Trip cleared the store while leaving the task identity unchanged. The action now returns immediately for the same selection, preserving the current card. Explicit Refresh remains the separate re-read action; expiry still gates visibility.

Dedicated actual owned Auth/HTTP/SQL UI regression `testLibrarySameTripSelectionKeepsCurrentCard`: 1/1 PASS, zero failures/skips, build-for-testing PASS. The user selects the Trip, sees the eligible reference, selects that same Trip again and still sees the same read-only card with no unavailable state. Proxy trace proves **one discovery and one exact read total**, so the reselection neither clears nor refetches. Trip state unchanged, zero model calls during this test. `/tmp/vpj79-proposal-same-trip-20261002/tests.xcresult` and `summary.json`; all disposable resources/credential launch files removed. The unrelated 7/7 exact, 3/3 boundaries and complete invalidation-chain UI evidence were reused, not rerun. Required CI applies to the new review head.
