# VPJ-78 first slice verification — 2026-09-27

## Result and boundary

Related to #559. `assistant-conversation/5` persists an owner-scoped conversation and a versioned goal. An independent question atomically enters the existing text Turn/worker path. Goal start, follow-up and amendment are record-only; two already admitted ServiceTasks can be linked to the same goal. The opt-in native consumer reads the persisted messages, goal version and current text answer. No Production migration, deployment, real provider call, purchase, Trip write or issue closure was performed.

Producer: native v5 composer. Transport: bearer-only `/api/chat/native/v5/conversation`, with existing text policy/consent. Persistence: `turn_private.assistant_{conversations,goals,messages}` plus the existing text Turn for independent questions. Consumer: native `assistant_conversation_v1` path. Validator: closed HTTP body, actor/session and consent gates, SQL owner/member/current scope checks. Rollback: remove the opt-in native mode and v5 route; retain private association rows and existing text Turns for later compatible read/erasure. Do not reverse an applied migration.

## Local evidence

| Check | Result | Scope |
| --- | --- | --- |
| `pnpm lint`, `pnpm typecheck`, `pnpm docs:check`, `git diff --check` | PASS | Source and docs |
| `pnpm test:contract`, `pnpm test:security` | PASS | Repository suite; skips remain as reported by runner |
| `pnpm test:integration` | PASS for always-on tests; gated tests UNRUN in this command | Runner reported `incomplete`, 117 skipped |
| `node tests/integration/turn/run-native-http.mjs` | PASS 2/2 | Disposable local Auth/Postgres/HTTP and synthetic local model; v5 answer/readback, multi-message order, exact retry/conflict, two existing Tasks, stale goal version, other actor, session replacement, withdrawal |
| `node scripts/ci-suites/db-integration.mjs --lane supabase-rls` | PASS 21/21 | Disposable local RLS and reviewed function ACL with all local migrations, including merged #566 Memory |
| `node scripts/ci-suites/db-integration.mjs --lane postgres` | PASS 128/128 | Disposable local Postgres, affected Turn and migration compatibility suites |
| `xcodebuild -quiet ... build` on iPhone 15 Pro iOS 17.5 simulator UDID `B0AD77FD-33C3-4616-92CE-2E76ACD93148` | PASS | Native compilation |
| `xcodebuild -quiet test ... -only-testing:VisePandaTests/NativeAskStateTests -only-testing:VisePandaTests/NativeAskPersistenceTests` on same simulator | PASS | Existing native Ask behavior |

## Not yet accepted

- UNRUN: native v5 UI on a signed-in simulator/physical device against a deployed API; build and server readback are separate evidence.
- UNRUN: Staging and real model/provider consumption. The local provider reply was synthetic.
- UNRUN: Production migration/deployment. The new mode is opt-in and existing modes remain available.
- Remaining #559 criteria: Trip and selected-artifact references, goal-aware model context assembly and real consumption, explicit ambiguity clarification and task amendment execution, full export/delete executor, native v5 request recovery across process death, and end-to-end device acceptance. The all-user-data privacy request currently records a request rather than executing export/erasure.
