# VPJ-81 confirmed composer during background refresh

Scope: S3 continuation of #562, from clean main34127dd7 (merged #590), new branch codex/vpj81-composer-refresh-20261002; original selection branch retained. Same accepted ADR-0027 and Issue contract. Final integration rebases onto main2ad3bc07 (#593 changes only Knowledge consumer/tests); no Library/Journeys/fixture/NativeSession/SQL/permissions/worker edits. #562 remains OPEN.

## Observed defect and result

PASS baseline reproduction before product edits: actual local native/Auth/HTTP/PostgreSQL, with a loopback proxy holding one completed history response. The conversation and consent had already been authoritatively read, a valid draft was present, yet Send was disabled by refreshBusy. The fixture starts no provider or paid task (modelCalls/taskAttempts0).

The revised gate distinguishes a confirmed current-scope/selected-ID conversation from an initial/switching read. The composer also directly matches boundScope to the active NativeDataScope, including actor/epoch/generation. Confirmed composer remains available while ancillary reads wait. Unknown selection, unavailable actor/policy, writer busy and immutable pending selection/policy mismatch still block admission. The existing writer and all expected goal-version/idempotency fields are reused. An authoritatively read empty default conversation retains its existing first-intake behavior.

A local refresh token coalesces background reads and is invalidated before mutation, scope or selection changes. Mutation readback immediately owns a new token; each await/catch checks actor, selection and refresh ownership before publishing. An old finally cannot clear a newer busy token. Existing consent/cancel/planning/Trip-association readbacks use the same replacement mechanism so coalescing does not drop their authoritative refresh. No writer payload/permission contract changed. Readback clears a draft only if it still equals the acknowledged immutable input, preserving later edits.

## Verification

- PASS baseline native UI1/1: /tmp/vpj81-composer-refresh-baseline/tests.xcresult; asserts Send disabled while the owned proxy holds history.
- PASS revised actual native UI1/1: /tmp/vpj81-composer-refresh-scoped-final/tests.xcresult. Individually hold history, summary list and goal-link responses captured before a send; Send remains enabled, each real writer admission/readback appears before releasing the old response, and the next draft survives late release. Pause selected-conversation read during switching: Send is disabled until authoritative readback, and no intake lands in the new selection. SQL asserts earlier conversation1/latest4 messages. modelCalls0/taskAttempts0/Trip writes0. The same reload path serves five-second polling; this test triggers it with explicit Refresh rather than creating a paid/background task.
- PASS lost-receipt regression native UI1/1: /tmp/vpj81-composer-retry-final/tests.xcresult. Actual writer201 replaced by503; first selected readback503; identical whole POST body/IDs/key retries with actual200 reused=true and one stored message. No new paid/provider work.
- PASS focused native7/7: /tmp/vpj81-composer-unit.log, including actual late-reader rejection with the refresh token, old completion/new busy ownership, selection/actor-related fences, current-conversation tasks and exact result lifetime.
- PASS pnpm test:contract698/698, lint, typecheck, docs:check and diff check. Signed Simulator builds are part of both native UI runs and focused unit run.
- Commands and small machine summaries: composer-refresh-20261002/. Large logs/screenshots/xcresult remain at the stated local paths. Exact-head CI is recorded in the PR; unrelated unchanged database lanes are reused through CI rather than rerun locally.

## Limits and rollback

UNRUN: real Staging/shared environment, real provider/worker, physical device, whole-issue zh/large-text/VoiceOver/Reduce Motion and user acceptance. Local synthetic gates are not target/full #562 acceptance. This change does not claim a real background task or planning result.

Rollback the UI/token change to restore the former refresh gate; persisted conversation/work/consent data and existing idempotency remain unchanged. No migration or target action is involved.
