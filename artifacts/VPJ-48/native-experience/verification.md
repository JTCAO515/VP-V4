# Native J3/J4 checkpoint, 2026-10-06

Owner 01a10cc7-2f7f-7b92-bd91-4d69e95bc378; sole Native branch/worktree vpj48-native-community-experience-20261006. Started at c515848, normally merged fixed J1 acb5ea21/J2 ee211ecd, then latest J1 0a7ee316 and J2 d738d0e4. Original dirty checkout untouched. Audio changes are inherited only via the fixed upstream merge; this owner made no Audio edits.

Implemented actual callers: Profile authenticated entry; Explore Experience link; Library saved-reference sheet; J1 author submissionID-only preview. Session owns bounded publication transport with current actor/session and Bearer-only expected headers, no Cookie, response size/deadline/correlation checks, exact protected mutation bytes. Separate journal/export cleanup precedes the legacy preserve branch and fails closed with storageError. Native disallows rightsReview/publish/revoke/queue/inspect and their recovery; author requestPublication is explicitly confirmed after preview and own-text declaration. Qualified operators own publication; global public/retrieval flags remain false.

Own UI/Store performs current detail/search/saved/reference/preview/mine, explicit request/Save/Unsave/withdraw, original-operation read/abandon/exact-byte retry, and scoped real export/delete callers. Process-local bodies have server expiry and request-start30s ceiling; background, account/epoch/generation, denial, refresh and expiry clear body; receipt metadata does not grant display. References have no persisted body/rights. Current original saved-place reader supplies actual provider tuple only for matching canonical ID+mappingDigest; source requalifies before opening original place actions and Proposal diff/confirmation. No name/provider guesses or automatic confirmed-Trip deletion.

## Actual local evidence

- PASS full build-for-testing r6 (Xcode27.0 / iOS27.0 SDK, unsigned/ad-hoc Simulator product). Earlier r1 failed on own missing ViewBuilder; r3 failed on own test macro; failures retained. r2/r4/r5 build successes are intermediate evidence.
- Runtime-r1: five unchanged lifetime/generation/export/journal tests PASS; one actual Session test FAIL because URLProtocol fixture ignored body stream. Test fixture fixed without product/header/cleanup weakening.
- Runtime-r2: actual6PASS0skip — two affected Experience tests (actual NativeSession publication header/cleanup + typed Store Save/reference/denial/strict-wire chain), two original J1 Session cleanup tests, two original J2 Session cleanup tests. Reuse unchanged five PASS from r1, not a fresh whole11-run claim. Seven own tests total now have applicable PASS evidence; four original cases cover adjacent cleanup regression.
- Six Swift-generated request/save/unsave/delete/operation/abandon JSON fixtures copied from this task's owned Simulator into VisePandaTests/Fixtures/CommunityExperience. Current canonical TS parsePublicationInput accepted6/6 offline, `peer-native-wire-r1.log`. This proves fixture interoperability, not GoTrue/SQL permissions or published content.
- PASS pnpm docs:check and git diff --check.
- Owned Simulator A0F21FA2-7356-4D78-AA2F-3F9C200085B0; DerivedData /tmp/vpj48-native-community-experience-dd. Cleanup recorded separately before handoff. Fixture-only URLProtocol port65368 opens no listener.

## Remaining implementation and unrun scope

Exact-object Safety caller still awaits Main's precise original-owner lease: NativeCommunitySafetyView additive initialObjectID constructor + reload's existing store.read(objectID:) branch. Current general Safety link rereads legal objects but does not complete same-object integration. See Features/CommunityExperience/WIRE.md. This checkpoint is not Native J3/J4 code-complete, whole235/238 closure, or PR/CI completion.

UNRUN: final integrated producer/SQL/GoTrue path (sole TS/SQL owners); target controlled reader/grant/rights-review/publisher setup; target public audience/domain/roles/GRANT/credentials/Storage/provider and funds; physical phone/human/VoiceOver and target UI. Public target remains disabled. Local native mocks are not authorization or copyright verification. Full account export/delete dispatcher is not_enrolled; only explicit publication-module exits are claimed.
