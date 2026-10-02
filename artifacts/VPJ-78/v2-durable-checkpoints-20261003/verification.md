# Private v2 durable checkpoint verification

2026-10-03. Branch codex/vpj78-v2-durable-checkpoints-20261003 from main a9e02f3a196b8c299f79e680ace7cdac0f26c5c2. Old f9 HTTP worktree/branch untouched. Ports contract fixed c441e3b32830c9c2520818057bb4dc879fd49f5b, Git blob82c6756164e9d9af7ae22b46fd83fa36c07ad721, read directly from that Git object. Main approved additive40000, private test adapter and this new bounded service-only export. No mutable worker dependency.

## Actual checks

- PASS network-none baseline1/1,0skip: actual020000 qualified input with both false flags, absent durable store. baseline.log.gz.
- PASS new private SQL and adapter PG10/10,0skip: migration rollback, concurrency oneclaim, exact owner/Task/Turn/nonnull active lease/dual digests, started/unknown no replay, lost save acknowledgment/new-process read, new valid lease completed reuse, source/policy/Memory withdrawal, malformed/source-env/fresh observation, conservative readonly ledger, API ACL, completion fence, export/cascade isolation. pg.log.gz.
- PASS final stricter adapter PG1/1,0skip: targeted strict injected private ports, fresh process and lost save ack; final-adapter-pg.log.gz. SQL/test unchanged from full10; only stricter calendar/positive integral clock adapter validation followed that run.
- PASS final adapter contract5/5,0skip: malformed/array enums, identity, six-parameter single-call mapping, false/throw without fallback, cancellation, date/clock bounds. contract.log.gz.
- PASS typecheck/source lint/docs; JS syntax checks on both mjs tests; staged diff. type/lint/docs logs. No broad lane/full build repeated for private preparation-only scope.

Reproduce: VP_TURN_DB_TEST=1 node --experimental-strip-types --test tests/integration/turn/planning-v2-durable-checkpoints.test.mjs; node --experimental-strip-types --test tests/contract/turn/planning-v2-checkpoint-test-ports.test.ts. Baseline is separate preparation test excluding this owned40000 only. Each fixture starts pinned postgres17.6.1.159, network none/socket0700/no TCP, and removes only its random owned container. No provider call/external cost/model settlement/result/event/Trip write or Simulator. Ledger fixture admin seeded statuses only for negative evidence; helpers retained every original ledger row without release/update.

First FAIL: unparenthesized SQL CASE comparison, rolled-back migration. Second FAIL: table-returning Memory RPC fixture was parsed as JSON instead of aggregated rows. Both corrected; first-fail/fixture-fail logs preserved. No upstream SQL/contract weakened.

## Ownership and remaining gates

Exclusive additive40000/private test Ports/contract/PG/baseline tests/scoped docs and evidence. All private table/functions revoke API privilege. Only explicitly approved service_role owner-keyset export is granted: limit1..100+sentinel, exact metadata/closed bounded observation, no lease/digests/credentials/endpoints; old exports and privacy executor unchanged.

Claim once absent→started; duplicate/unknown cannot authorize another request. Save only original claim lease started→completed once; repeated savefalse, lost ack recovered through new-process qualified read. New active lease reuses completed only current/fresh. Correction/Memory/policy withdrawal blocks reuse/writes while retaining receipt. Started/unknown never reset. Model multiple/unknown/scope/owner ambiguity becomes pending, never none/permission; no ledger write.

Requiredregistration: Main owns final union addition of tests/integration/turn/planning-v2-durable-checkpoints.test.mjs to postgres isolated-postgres.files under existing VP_TURN_DB_TEST=1. This branch leaves sharedregistry unchanged. Formal union CI, joint worker integration, deployment/provider/model output, native/device/VoiceOver/user/full #559/#561 acceptance remain UNRUN. No release flags/claimer/permit/dispatch/publisher/completion-fence change.

## SHA-256 source fingerprints

- supabase/migrations/20261003040000_vpj78_v2_durable_checkpoints.sql: `030a277e8c2466462087ff56a13b98620848774ba33788bbbcb93e1386463278`
- lib/server/turn/planning-v2-checkpoint-test-ports.ts: `52690a3c01f17b1f9b5b30ffa31b98eca8ddd3def58b11c917554d9af817d874`
- tests/integration/turn/planning-v2-durable-checkpoints.test.mjs: `5d403e701b4715fb9e124dfee0ecacb2d42d4bab743604c3082cbb2119e7e047`
