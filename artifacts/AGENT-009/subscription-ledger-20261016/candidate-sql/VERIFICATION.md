# Standalone development SQL candidate relocation

Source: `1eac98ec2173ebbd05739092c2ad577b01524f79`. Current SQL: `lib/server/entitlements/subscription-ledger/development-schema.sql`.
SHA256: `1c5b582b9b0ee890da9aa881f041baf4768360949894a6c66b540b2679f604f0`. The file is byte-identical to the pre-move unapplied SQL at `supabase/migrations/20261016051000_subscription_development_ledger.sql`. SQL semantics, privileges and all assertions remain unchanged.

The candidate is now outside the normal automatic migration chain and is not a deployable migration. Main reported that adding the private schema to its full migration run caused the accepted schema_supported_v1()/profile.schema_v1() guards to reject SOURCE_UNSUPPORTED and the canonical fixed-source migration inventory to reject the new unregistered migration. The correct scope here is standalone development exercise; no old guard, source schema catalog, migration inventory, privacy registry, role, GRANT or runtime entry was changed to make CI green.

The complete `supabase/migrations` source tree on this branch is now identical to base `61caa52a03cb59ff0075b8cf59c63994c30821e1` (git diff --exit-code verified). This is a source/inventory observation, not a claim of whole old-runtime schema compatibility. Legacy runtime composition, ordinary/auth access, reverse old-writer uniqueness and privacy integration remain NOT_READY. No SQL was applied to any shared database. Main owns final CI classification/registration, Profile/PBX, migration ordering and HANDOFF.

## Actual checks

- PASS private PostgreSQL17: 22/22, zero skips, `private-pg.log`. The test now loads development-schema.sql. It still creates the original legacy grant contract plus this candidate, validates real persistence/replay/renewal/revocation, role denial, same-snapshot deterministic concurrency, owned process restart, private synthetic restore and unchanged old table/function/ACL/policy/data fingerprint. No assertion, role negative or gate was removed.
- PASS affected contract/security: 18/18, zero skips, `contracts.log`. Those files had no old SQL path references and needed no edits.
- PASS affected strict TSC: `typecheck.log` (no diagnostics).
- PASS source lint: `lint.log`.
- PASS docs: `docs.log`.
- PASS git diff --check and byte-identical relocation/hash comparison.
- Default PG invocation: one gated SKIP/INCOMPLETE, no resource started; `default-gate.log` is not an integration PASS.

Dedicated test entry remains `tests/integration/subscription-ledger/postgres.test.mjs`, gated by SUBSCRIPTION_LEDGER_PG=1 and the existing explicit PG17 bin/pg client settings documented in the historical report. This owner did not edit shared CI registration; Main received the new candidate path to retain its dedicated classification.

## Historical evidence and ownership

Original source-hashes.json, earlier reports and snapshot-fix/baseline.sql retain their original paths and the facts at those heads. The optional SUBSCRIPTION_SNAPSHOT_BASELINE=1 selects that historical unapplied baseline only for private RED reproduction; the default test source is the new standalone development candidate. No historical SQL/evidence file was renamed or represented as applied. This report and hashes.json are the current candidate pointer.

Stable relocation 1eac98ec was sent to Main before evidence completion. At final handoff the owned fixture was cleaned, temporary read-only dependency symlink removed, and no background tool or database operation remains. Necessary repairs continue only in the original namespace; no broader source/permissions/runtime scope is inferred. Real Apple signature/API, real Sandbox/Auth/Native user access, target/runtime/physical/release remain UNRUN, and the overall issue is not declared complete.
