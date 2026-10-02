# Native cross-conversation Journeys — 2026-10-02

## Delivered behavior

Journeys reads the merged v5 goal index, replacing one bounded page at a time. Each row carries its own conversation ID and opens the existing exact goal entry with the full native scope and expected goal version. The #614 borderless button and draft/pending protection are preserved. No index row submits a message, changes a goal, links a Trip or confirms a Proposal. Legacy latest-conversation reads remain available to existing callers; the new Journeys entry reports index unavailability instead of substituting a different conversation's goals.

The decoder enforces version 5, closed fields, 20 rows, snapshot/cursor consistency, raw canonical UUID order and scope versions through 10001. Future relation states project to unknown without retaining a Trip ID. The index store and host check request-start monotonic TTL, current scope, accepted/unexpired policy, before/after policy equality and generation. Page changes remove old rows, unavailable continuation discards its cursor, and refresh explicitly starts at page one. A late old request cannot erase a newer qualified index page.

NativeSession adds only `journeysGoalIndexRequest`: a fixed GET, validated cursor, bounded response and existing credential/session fence. No Ask, task activity, Proposal, Knowledge or backend writer changes are included. Project registration adds only the six reserved `A9832000` IDs.

## Evidence

| Check | Result | Scope |
| --- | --- | --- |
| Component checkpoint tests | PASS 8/8, 0 skip | Closed schema, bounds/order, unknown relation, continuation/snapshot, request-start TTL, actor/consent/foreground, expired qualification and late generation; retained matching checkpoint evidence |
| Affected Journeys tests | PASS 23/23, 0 skip | Existing `NativeJourneysTests` plus new host integration case; native build and legacy compatibility |
| Final late-host tests | PASS 2/2, 0 skip | New generation cannot be erased by old completion; unavailable continuation discards the page |
| Actual local Auth/UI | PASS 1/1, 0 skip, both runs | Disposable Supabase Auth/Postgres + actual native login/session + HTTP API + app UI, with seeded goal facts; older and newer conversation goal taps open exact VP goal/version, next page removes old rows, stale cursor and withdrawal hide all goals, explicit first-page refresh recovers |
| `pnpm docs:check`, `pnpm lint`, `pnpm typecheck`, `git diff --check` | PASS | Docs/source policy/TypeScript/diff; native compile is included in the test/build-for-testing commands |
| Owned environment cleanup | PASS | Patched credential-bearing xctestrun removed; owned disposable server/stack stopped; all allocated 64020 ports bind free afterward |

The Auth runner summary records `conversationPosts: 0`, `providerCalls: 0`, exact old/new entry, stale-page rejection and withdrawal rejection. It uses real local authentication and API qualification against controlled facts; it is not a live traveller/provider demonstration. The first run was briefly misdescribed in commentary before completion; its actual exit and xcresult are PASS, not a preserved test failure. No test assertion was weakened.

## Commands and local outputs

Dedicated device: `7ACEC42A-E6A1-4574-AB0B-50B7A0029A10` (VP-JourneyIndex-20261002, iPhone 17 Pro, iOS 26.5). DerivedData: `/tmp/vpj83-native-goal-index-20261002`.

```sh
xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=7ACEC42A-E6A1-4574-AB0B-50B7A0029A10' -derivedDataPath /tmp/vpj83-native-goal-index-20261002 -only-testing:VisePandaTests/NativeJourneysTests -only-testing:VisePandaTests/NativeJourneyGoalIndexTests/testJourneysHostUsesEachConversationAndDropsUnavailableContinuation CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- -resultBundlePath /tmp/vpj83-index-host-regression.xcresult -quiet
xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=7ACEC42A-E6A1-4574-AB0B-50B7A0029A10' -derivedDataPath /tmp/vpj83-native-goal-index-20261002 -only-testing:VisePandaTests/NativeJourneyGoalIndexTests/testLateHostReadCannotEraseNewerIndexPage -only-testing:VisePandaTests/NativeJourneyGoalIndexTests/testJourneysHostUsesEachConversationAndDropsUnavailableContinuation CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- -resultBundlePath /tmp/vpj83-index-late-generation.xcresult -quiet
VP_JOURNEY_INDEX_OUTPUT=/tmp/vpj83-index-auth-final-20261002 VP_JOURNEY_INDEX_SIMULATOR=7ACEC42A-E6A1-4574-AB0B-50B7A0029A10 VP_NATIVE_HTTP_PORT_BASE=64020 node --experimental-strip-types tests/local/run-journey-goal-index-ui.mjs
```

Auth result bundle: `/tmp/vpj83-index-auth-final-20261002/tests.xcresult`; summary: `goal-index-summary.json`; content-free route/status observations: `goal-routes.json`. The harness refuses an occupied port set and touches only its owned stack/device/DerivedData. Next-generated AGENTS/next-env changes were excluded from the PR.

## Remaining acceptance and rollback

Staging/hosted/provider and physical-device/full language/accessibility/Memory journey acceptance are UNRUN. Parent #564 remains open. #613's prior Ops CI issue was resolved for its merge by the exact permitted rerun; its original cause is UNKNOWN and this PR claims no Ops repair.

Rollback reverts this consumer entry while retaining the merged server reader and existing goals/Trips. Old latest-only and exact goal reader semantics are unchanged. No new persistence or migration is introduced here.
