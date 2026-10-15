# AGENT-009 P2 same-snapshot repair

Stable source: `e60f809b0b7672a8ed99613b6bb8d5b3767f4c1c`. Main requested repair from independent spec review 9b1a6187; no new domain, role, GRANT, legacy source or runtime activation.

`read_owner_v1` previously issued an active-period count SELECT and a separate period-selection SELECT. Default VOLATILE PL/pgSQL under READ COMMITTED may obtain a later statement snapshot for the latter. A second family committed between them could therefore produce count=1 from the old snapshot but select the newly committed family and return active.

Fix: the original join/filter/order/limit now obtains `count(*) FILTER(active) OVER()` alongside the selected period in one SELECT. Both use the same statement snapshot. No row is still none; active count >1 still returns reconciliation_required with owner/period/checkedAt null, lifetimeMs 0. Original expiry, checkedAt/lifetime clamp, privacy, revoked/erased rules and role denial are preserved. No new locks are added to the product reader.

## Deterministic real PG regression

The migrated reader function is executed without replacing or editing it. In the private synthetic fixture only, periods is temporarily renamed and exposed through an identically shaped, one-to-one updatable view. Its volatile WHERE predicate is an execution barrier: for the marked reader session's first scan it waits on an advisory lock held by the fixture writer. All other sessions pass through the predicate; apply_period_v1 remains the real writer.

1. Seed one active family with transaction 12001 for a dedicated synthetic owner.
2. Start the real reader at READ COMMITTED. Observe `pg_blocking_pids(readerPID)` containing the exact gate-holder PID. A bounded metadata poll waits for this explicit dependency; it does not retry the race or guess completion from a sleep.
3. While that actual scan is paused, the real apply function commits a second active family with later purchase time, transaction 12002. Confirm two committed families, then release the gate.
4. A consistent before-commit snapshot can count one and return only 12001. The original implementation instead counted one, then selected 12002 in its next statement snapshot. The regression asserts the returned identity, so that implementation deterministically fails. The repaired implementation returns 12001 with its original positive bounded lease.
5. The next real read sees both families and must return reconciliation_required, owner/period/checkedAt null and lifetimeMs 0.

The test neither duplicates the projection algorithm nor asserts SQL source strings. Its view predicate provides only a scheduling hook; all state/selection/lease assertions exercise the actual migrated reader. Cleanup releases the gate, waits for the reader, drops the fixture view/function/sequence and renames the backing table back. Existing restore/restart/ACL and legacy fingerprints still pass afterward. All data is synthetic in the owned PG17 nonce fixture; no shared DB operation or GRANT occurs.

## Observed evidence

- Expected RED: `baseline-red.log`, exact old unapplied migration from 7f2c1bea, SHA256 `5c0ffe10aa2b5d183897aa45a1928db98477d301022a444a648c8eab39806b1a`. Deterministic snapshot subcase fails `12002 !== 12001`; 20 PASS / 2 FAIL including the parent. This is regression proof, not an unresolved final failure.
- GREEN: `fixed-green.log`, current migration, 22/22 PASS (21 subcases + parent), zero skips. Same concurrency schedule and assertion; all persistence/role/privacy/restore/restart cases pass.
- PASS: affected contract/security 18/18, zero skips: `contracts.log`. Unchanged legacy contract evidence is reused from the prior delivery.
- PASS: targeted strict TSC on subscription-ledger TS modules, no diagnostics: `typecheck.log`.
- PASS: repository source lint, 887 files: `lint.log`.
- PASS: git diff --check. hashes.json pins the repaired migration and test source; specified legacy sources remain byte-identical.

Reproduce GREEN with the previously documented SUBSCRIPTION_LEDGER_PG=1, SUBSCRIPTION_PG_BIN and SUBSCRIPTION_PG_MODULE values. Reproduce the expected RED with the same invocation plus SUBSCRIPTION_SNAPSHOT_BASELINE=1; that flag selects only this pinned baseline.sql inside the artifact directory and is never a runtime option. Ordinary gated invocation still starts no resource.

Source fix was sent early to Main at e60f809b. This evidence commit follows without changing the tested product source. The temporary dependency symlink is removed after verification; no installs or lock/global changes. Owned PG resources are cleaned. Future rights remain necessary repairs in the same namespace. Shared migration/true Apple/API/Auth/ordinary Native/runtime/physical/release remain NOT APPLIED or UNRUN, and cross-legacy bidirectional uniqueness remains NOT_READY. Main alone owns integration, CI, migration ordering and HANDOFF.
