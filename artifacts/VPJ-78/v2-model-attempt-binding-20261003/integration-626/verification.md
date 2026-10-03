# 626 + private model binding integration checkpoint

2026-10-03. Independent branch codex/vpj78-v2-model-binding-integration-20261003 from exact626 head e6f66d703d730c7858412079fb5295cc49d37284. Original554 branch/worktree is preserved clean. Only original contract69a73048→7a4a3ea3 and SQL/test/evidence554189c2→33a68084 were cherry-picked; no source implementation changed.

PASS actual network-none PostgreSQL11/11,0skip. Every actual checkout migration, including40000 and050000, loaded;050000 transactional rollback/application and affected binding/ledger/lock negative cases remain valid with40000 present. Private/grant/completion fences unchanged, zero provider calls/result writes. Owned random container removed by fixture after-hook. pg.log.gz.

PASS DB registry governance5/5,0skip; node --check scripts/ci-suites/db-integration.mjs; staged diff check. Only approved registration hunk adds tests/integration/turn/planning-v2-model-attempt-binding.test.mjs to existing postgres isolated-postgres.files. Existing VP_TURN_DB_TEST=1, images/other lane entries unchanged. registry.log.gz.

No unrelated full lane, build, native, deployment or provider tests repeated. Read JSON does not echo lease; exact private SQL invocation verifies original active lease. Existing readonly expired budget scope/settled receipt and sticky unknown never grant execution or model output. No ledger write/release or completion capability added.

PR condition:626 must merge normally first. Before publishing the next binding batch, sync actual main and verify its diff contains only this contract/private050000/dedicated tests/evidence and single registration. Do not republish old626 worker/checkpoint changes. Formal new-batch CI and review, worker/result completion proof, public/API/target/provider/native/device/user acceptance remain UNRUN.
