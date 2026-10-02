# Private model-attempt binding local checkpoint

2026-10-03. Dedicated branch codex/vpj78-v2-model-attempt-binding-20261003 from main f97ecc5d0461471d017111e8607a80f01b5ccbdd. Contract checkpoint69a73048d5c857dd6310d344ea5d1c3ed422fc01 / docs/contracts/planning-v2-model-attempt-binding.md fixes the exact13 tuple, JSON22/23/3-key results and state matrix before final SQL freeze. Main explicitly approved private050000 and final actor-prelude lock order. Frozen40000/020000/03030000/HTTP/native/worker/old grants remain unchanged.

## Actual checks

- PASS baseline1/1,0skip: actual current-checkout020000 v2 input + existing synthetic budget reserve/dispatch, no durable model binding, old v1-v2 dispatch fence blocked, no provider call or actual known model charge. baseline.log.gz.
- PASS actual isolated PostgreSQL11/11,0skip: BEGIN→ROLLBACK leaves050000 absent; apply actual checkout migrations; only first reserved/live/sole real attempt binds; all13 tuple substitutions/current basis/policy/session/scope/model/price/lease rejected; actualMicros NULL staysNULL.
- PASS identical concurrency onebound/onereused, cross real actor/Task/scope/attempt isolation, expired/NULL/old lease, duplicate no newattempt; stickyunknown even after actual fixture ledger settle.
- PASS existing reserved/dispatched/pending/settled/released state reads, no retrospective firstbind for nonreserved; readonly exact settled values even budget disabled/frozen/expired, never execution permission. Every helper operation leaves actual ledger rows byte-for-byte unchanged.
- PASS Task→scope held by existing reserve and scope→attempt held by existing finish: new helper NOWAIT blocks, no partial binding, no deadlock; same valid retry after release succeeds without new ledger write.
- PASS account-held synthetic old Auth-session deletion, controlled ordinary Memory/source corrections: qualifications wait/reject after current state commits, binding/ledger unchanged. This is PG Auth-session invalidation proof, not real native-session API/device acceptance.
- PASS ANY extra/unknown attempts blocked; API table/functions revoked; immutable tuple/unknown cannot clear; v2 completion fence and zero result artifact; existing v1 authorize path still authorized under its old exact proof, with zero provider call.
- PASS source lint, docs, bothmjs syntax, staged diff. No TS/runtime route changed, so no unrelated fullbuild/native/HTTP matrix repeated.

Full11 PG source is current actual migrations plus owned050000; no Git-object SQL injection. Pinned postgres17.6.1.159 uses networknone/socket0700/no ports or Simulator. Random owned container vpj78-model-binding is removed by the after-hook. Existing public reserve/dispatch/finish operations are legal synthetic fixture setup only; new helpers never call or write those ledger primitives. Real provider/output/settlement/fees remain UNRUN; seeded actualMicros3 is a synthetic recorded ledger value only.

Reproduce: VP_TURN_DB_TEST=1 node --experimental-strip-types --test tests/integration/turn/planning-v2-model-attempt-binding.test.mjs. Baseline tests/preparation/planning-v2-model-attempt-baseline.test.mjs excludes only owned050000 and preserves preimplementation absence proof.

## Boundaries and handoff

All private helper/table API access, including service_role, revoked. No public function/export/grant/claimer/providerpermit/dispatch/ledgerrewrite/release/modeloutput/settlement/completion capability added. Local fake-provider permit remains separate; all successful data results carry executionAllowed:false/executionAvailable:false/readyForProvider:false. Successfulread does not echolease; exact SQL invocation/current original binding supplies that lease proof, not standalone JSON.

Only one immutable correlation perTurn/actualscope-attempt; unknown timestamp is a one-way marker. Ledger status/money always comes from actualrow; settled still requires independent output/reconcile before any result action. Parent/ledger deletion cascade correlation, but no privacy executor/export/full-account acceptance claim.

Required final registration owned byMain: tests/integration/turn/planning-v2-model-attempt-binding.test.mjs in postgres isolated-postgres.files under existing VP_TURN_DB_TEST=1. Sharedregistry left unchanged. Formal union/worker/result-proof/API/deployment/provider/native/device/user/full #559/#561 acceptance remain UNRUN. Main independently reviews exact SQL/test snapshot before consumers use it.

## SHA-256 source fingerprints

- supabase/migrations/20261003050000_vpj78_v2_model_attempt_binding.sql: `124c1b37b33f8c89edcb3a0f65c8896add98fe9a47d69ff4dacd368d673f257c`
- tests/integration/turn/planning-v2-model-attempt-binding.test.mjs: `b3c23d49a89f7c22969ea26cacafd491469f99778a970cfbdbdd30bef033aca1`
