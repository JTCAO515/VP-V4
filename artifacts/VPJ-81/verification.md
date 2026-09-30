# VPJ-81 first native VP slice — 2026-09-30

## Result and ownership

The opt-in v5 VP conversation now reads the existing planning policy, admits one bounded comparison through the existing `planning/tasks` writer, and keeps its ordinary composer available while that request is in flight. One card per conversation ServiceTask pairs its latest message `taskId` with the existing owner-scoped v2 ServiceTask history `serviceTaskId`; absent or truncated history stays unknown, and unrelated owner tasks never drive this conversation's polling. Cancellation uses the existing Turn cancel route and shows only the subsequent server readback state. Opening a completed task reads the existing result endpoint and requires an active, current artifact whose source `taskId` is the selected task. The exact accepted artifact ID is retained during the session; after relaunch only a latest owned result with matching source can be opened. No result is copied into a second store.

`NativeSession.askRequest` has only two assistant cross-version paths: exact `GET api/chat/native/v2/turns` and the existing UUID-scoped v1 `POST .../cancel`. The v5 producer remains opt-in; the existing Ask modes are the fallback. This PR does not change the server writer, database, Knowledge/Library, or the shared shell.

## Local verification

| Check | Result | Meaning |
| --- | --- | --- |
| `xcodebuild -list -project ios/VisePanda/VisePanda.xcodeproj` | PASS | Project and scheme present |
| `xcrun simctl list devices available` | PASS | iPhone 15 Pro iOS 17.5 UDID `B0AD77FD-33C3-4616-92CE-2E76ACD93148` available |
| `xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO -quiet` | PASS | Native compile |
| `xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=B0AD77FD-33C3-4616-92CE-2E76ACD93148' -only-testing:VisePandaTests/AssistantResultIdentityTests -only-testing:VisePandaTests/AssistantTaskProjectionTests -only-testing:VisePandaTests/NativeSessionIntegrationTests/testAssistantCrossVersionRoutesAreExactAndReadOnly CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- -resultBundlePath /tmp/vpj81-no-fallback.xcresult -quiet` | PASS, 3/3 | Wrong-task/stale/withdrawn result rejection; unrelated task polling, duplicate card and malformed-latest completion fallback rejection; exact cross-version route allowance |
| `pnpm docs:check`, `pnpm lint`, `pnpm typecheck` | PASS | Repository docs, source policy and TypeScript checks |
| `pnpm test:contract` | PASS, 695/695 | Repository contract suite |
| `git diff --check` | PASS | Patch whitespace |

`pnpm typecheck` and the first `pnpm test:contract` attempt encountered an absent local `node_modules`; `pnpm install --frozen-lockfile` restored the locked dependencies, after which both passed. The install made no tracked dependency changes.

After #563 merged, this commit was rebased onto main `93898f44b23817638b7ddb7f4526f73a9c41ef15` without conflicts. Native build, the two simulator tests, docs check and diff check passed again on the rebased tree; #563's Library/Knowledge files were preserved.

Independent PR review found that the owner-wide v2 history could trigger polling for another conversation and repeated messages could duplicate one task card. The final projection restricts both to unique ServiceTask IDs present in the current conversation; the three targeted simulator tests above include those negative cases.
The same review caught an impossible completed Turn with no outcome/output in the projection fixture. The newest raw history row for each visible task is selected before validation; an invalid latest row stays unknown and cannot fall back to an older completed Turn. Accepted rows require `NativeTextTurn.valid` and the current conversation's task association. The fixture includes a rejected malformed latest completion and an older valid answered completion. Future positive scope versions remain eligible.

## Acceptance limit

These are implementation and local simulator checks. The target environment has not yet shown a real authenticated direction → delegated provider/hosted work → return to the same artifact → correction flow. Consent, status and result presentation are guarded by actual server replies, but this record does not claim a provider execution or device acceptance. Parent #562 remains open for the remaining behavior and environment checks.
