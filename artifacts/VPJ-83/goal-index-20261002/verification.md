# Journeys goal-index backend verification

Branch `codex/v5-journeys-goal-index-20261002`; original base `aaff761f4a7aa071886ede224cab5e5d17509194`. Scope: #564/#559 cross-conversation read API only. Dedicated new module/routes/migration/tests; no native/shared-owner edits. Protocol: [contract](../../../docs/contracts/journeys-goal-index-v1.md).

- PASS: `node --experimental-strip-types --test tests/contract/turn/journeys-goal-index.test.mjs` — 23/23, zero skips, closed payload/cursor, malformed/mismatched session 503/401, no-store and terminal 10001.
- PASS: `VP_TURN_DB_TEST=1 node --test tests/integration/turn/journeys-goal-index.test.mjs` — dedicated network-disabled random PostgreSQL container; all prior migrations plus transactional forward/rollback. Initial alias ambiguity was fixed; immutable-policy fixture was corrected to create an expired policy instead of changing it. Final expanded suite PASS 8/8, zero skips (including exact bounds, sparse overflow and queued Trip deletion).
- PASS: `node --experimental-strip-types tests/integration/turn/run-journeys-goal-index-http.mjs` — 1/1, zero skips, actual local GoTrue login → Next.js routes → PostgREST → PostgreSQL. `vp-native-ask-efca9c53`, base63820/API63851/Supabase63841; exact-owned cleanup PASS. Old/latest conversations differed, 27 goals crossed two pages, exact old goal reopened; foreign cursor, correction/deletion, real replacement session and withdrawn consent failed closed. Synthetic provider call count was zero.
- PASS: `pnpm lint`, `pnpm typecheck`, `pnpm build` — new standalone routes compiled in production build. Next-generated AGENTS/next-env changes are excluded from source changes.
- UNRUN: native consumer/Simulator/device/VoiceOver/user acceptance. This task owns only backend; no simulator was used.
- UNRUN: Staging/Production migrations, real provider, account/payment/release actions. Local disposable evidence does not establish target acceptance.
- Pending at preparation: shared ACL/DB-CI registration awaits Proposal owner release; coordinator has exact additions. Remote applicable CI and independent main review precede merge.

No goal/Trip writer/model/receipt copy or hidden-row count was introduced. Page consumers must restart after unavailable and use exact readers before acting. Parents #564/#559 remain open.
