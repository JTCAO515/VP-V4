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

Complete product-entry acceptance, real provider producer, Staging, physical device, VoiceOver and production remain UNRUN. No PR is submitted for this partial checkpoint.

## Frozen discovery checkpoint

Main supplied RPC `read_trip_change_proposal_reference_v1(p_trip_id uuid)` and GET `/api/results/native/v1/change-proposal-reference/trip?tripId=UUID`. Closed `{version:1,data:{kind:"result_reference",tripId,artifactId,revision}}`, revision 1..1000; terminal kinds have only `kind`. Latest current candidate ordering is created_at DESC/id DESC, 64 + sentinel; no comparison fallback.

Added only a dedicated NativeSession GET method and closed receipt decoder pinned to the expected selected Trip. Added focused decoder cases for later execution. Syntax parse and diff check passed; no backend runtime was consumed, no UI entry enabled and no test suite rerun for waiting. These additions remain UNRUN for typechecked/runtime validation until backend normal merge and complete wiring.
