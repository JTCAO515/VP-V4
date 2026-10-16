# AGENT-009 cross-ledger development fence

Source head: `1e2ede440c51b5538bd69ec35b319f24deea6247`. Source commits: 7219358c, then 1e2ede44. Exact QA base: `cbedf3e07b526d63785791111e040b7735fbafc7`. Branch: codex/subscription-cross-ledger-20261016 in the reused subscription-ledger-20261016 worktree. Original codex/subscription-ledger-20261016 remains at a070f3d8; no reset or repeated old cherry-picks. Official list_threads verified this chat ID 01a14160-c704-78c0-a589-430980e0c650 belongs to VP-V10 project 4f2191db-3e04-4042-94b5-ec94ff67b427. Effective model/effort/tier is not exposed; target Sol6.1/medium is not presented as verified effective configuration.

## Delivered local result

The isolated `development-schema.sql` now guards and replaces the **actual** public.storekit_apply_verified_v1(jsonb), alongside the actual subscription_development.apply_period_v1(jsonb,bigint). A new wrapper cannot bypass the fence because the existing RPC identity itself is changed in the private candidate. No second identity/capacity ledger, trigger, grant, role membership, new credentials, provider request, runtime enabling or automatic migration is introduced. Legacy applied SQL, old TS/catalog, the current deep descriptor catalog, root CI, manifests, schema guards and privacy registries remain byte-identical to QA base. All changes stay in the granted new namespace/tests/artifacts.

Only the candidate's same environment+transaction double-grant NOT_READY is discharged by private synthetic evidence. Whole legacy runtime/schema guards, Auth/ordinary HTTP/Native access, privacy registration/lifecycle, Apple verification/purchase, runtime capacity/economics, deployment/physical/TestFlight/release remain NOT_READY or UNRUN. The candidate is outside automatic migrations and was not applied to any shared database. Real SKU and price remain null, purchaseEnabled/runtimeCapacityEnabled remain false; remaining capacity stays unknown null.

## Fixed preconditions and authored delta

Before replacing the old RPC, a fixed guard checks pg_get_functiondef/source SHA256, owner, ACL, language, kind, volatility/parallelism, SECURITY DEFINER, strict/leakproof/set-returning, result/arguments/identity, search_path, cost/rows/support/binary/sqlBody and the owner's RLS-bypass capability. Unknown definitions or metadata are rejected before schema creation. No hash is updated from an unknown live target to make a test green.

Known-before definition SHA256: `398e3c89c7f7563ffc05c39eed72f0030b83df79759f8c8079a3aa1a76cb54dc`.
Known-before source SHA256: `69086826dd72e28c1d8cb32dfe06bad399042ffb4d209e52fdd45548b344824e`.
Authored-after definition SHA256: `73b75471bb22c0abc291d6c806c65820ff1e018473cad9b596afdd76b28e9151`.
Authored-after source SHA256: `ff72abab5ac6de7af75686b9767358293cef82136acf9f273f2c4a8cb71207d6`.

The before pin comes from a fresh owned fixture applying the exact accepted legacy SQL. known-before.json and inspect-before.mjs preserve that observation. The after pin is the fixed authored body, not a runtime replace-string patch. SQL contains the explicit complete function body. Contract tests strip only the three approved fence/visibility/isolation additions and require exact before-definition equality and identical metadata. Installation checks the fixed after pin; CREATE OR REPLACE retains original signature, OID, owner/security/config/ACL and wire. Existing service_role EXECUTE remains unchanged; no new private role permission is allowed.

The prior blanket fingerprint comparison is narrowed only for that one exact authorized body: actual after pin is first fully checked; its definition is normalized to the fixed before definition solely for the original complete legacy fingerprint. Every pg_proc metadata field except the body already represented by pg_get_functiondef remains in the comparison, and other routines, table structure/constraints/ACL/RLS policy/data remain in the original comparison. Unknown body or metadata does not normalize away. Candidate transaction rollback restores the exact original function and namespace absence.

## Lock graph and snapshot qualification

Both actual writers use the same 64-bit transaction advisory key `hashtextextended('entitlement-transaction:'||environment||':'||transactionId,226)` before all owner/family/row locks. New apply removes the legacy table SHARE lock and redundant subscription-only tx lock. Other-ledger checks remain ordinary ACCESS SHARE reads, compatible with the old INSERT's ROW EXCLUSIVE. The same-ID mutex prevents a second writer from deciding until the first commits/rolls back; conflict checks then use a fresh command snapshot.

- Legacy: visibility eligibility -> original input/auth validation -> READ COMMITTED requirement -> shared identity -> original owner(seed34) -> old row/insert.
- Subscription: original input validation -> visibility eligibility -> READ COMMITTED requirement -> shared identity -> subscription owner -> family -> period/receipt rows.
- Subscription erasure: existing owner -> family -> rows; no reverse identity acquisition, and identities remain retained.
- Legacy erasure retains transaction rows and adds no identity acquisition.

Different IDs can progress across the two ledgers while the first writer's transaction remains open. Actual three-client chains legacy owner A -> old B holding identity -> new B, and erasure owner/family -> new B holding identity -> old B, are observed through exact pg_blocking_pids/advisory waits and complete without a cycle. Arbitrary externally batched multi-ID transactions are not newly supported or certified; a future batch contract would need canonical key ordering.

A mutex cannot refresh a REPEATABLE READ transaction snapshot. Both candidate RPCs therefore reject any isolation other than READ COMMITTED as ENTITLEMENT_ISOLATION_UNAVAILABLE before writes. Tests pin a real transaction snapshot via a permitted pg_class query under REPEATABLE READ, SERIALIZABLE and READ UNCOMMITTED, call each actual RPC, and require refusal and zero rows in both ledgers. This explicitly conservative local requirement is not a claim that old whole-runtime isolation composition has been accepted.

## FORCE RLS visibility

The legacy definer owner is pinned postgres; installation requires that principal to be superuser or BYPASSRLS. Both writer paths check effective principal/visibility at runtime. The legacy visibility check precedes auth helper access, so unknown/non-bypass definers stop with ENTITLEMENT_VISIBILITY_UNAVAILABLE instead of interpreting an RLS-filtered scan as no conflict.

The private negative vector uses existing authenticated only, inside a rollback transaction: temporarily set periods table/view and legacy function owner to that non-bypass role. Administrator sees the retained row (count1), the actual view-owner FORCE-RLS scan sees count0, and the actual old RPC returns the visibility error. Rollback removes the view and restores table/function ownership/metadata; private row remains and no old grant was added. This is fault injection, not a new ordinary-role grant or supported positive access. Existing ordinary/service-role denial vectors still pass after rollback.

## Observed checks

- PASS private PG17.11 / existing pg8.13.1, no TCP, owned nonce only: **39/39, zero skips**, private-pg-isolation-final.log. Original22 includes persistence, epoch/replay/revoke/erasure, same-SQL-snapshot concurrency, lease/expiry, roles, rollback, private restore/restart and complete legacy fingerprint with exact authorized body normalization. Added cases cover fixed pre/post pins, eight unknown body/owner/ACL/flags/name faults, rollback restoration, the actual filtered FORCE-RLS role vector, unsupported snapshot isolation refusal, 12 sequential direction/owner/state combinations, exact replay, old720h queue/snapshot/refund, two actual RPCs with both winner directions and same/foreign owners, unrelated-ID progress, and owner/erase lock chains.
- PASS all related old/catalog/new contract and security: **38/38, zero skips**, contracts-final.log. No App/UI rerun; unchanged source evidence reused.
- PASS affected strict TSC, typecheck.log; source-policy lint, lint.log; docs-check, docs-final.log; git diff --check. TS implementation was unchanged by the final SQL-isolation-only refinement.
- Default integration invocation: **two gated SKIP/INCOMPLETE**, default-gate.log; starts no PG or selected fixture. These are not integration PASS results.
- PASS source diff against exact QA base for all old supabase migrations, old StoreKit TS/catalog and subscription-development catalog: empty. Git ls-remote and push succeeded using existing secure credential handling, no secret printed. Existing SDK/dependency/client paths were reused through a temporary untracked symlink; no install, lockfile or global/config mutation.

Tests do not race by repeated attempts. Each same-ID case starts a real winner RPC in an open transaction, starts the other real RPC, observes the exact advisory blocker through pg_blocking_pids, commits the first, then verifies the second's generic conflict and exactly one ledger row. Statement/lock timeouts bound failures. The only metadata polling waits for the specified lock dependency. All data, owner IDs and SKUs are synthetic; injected verifier tests are not Apple crypto or real purchase proof.

Historical attempts remain: private-pg-first.log is an earlier37-case PASS; private-pg-visibility.log records an initial rejected attempt to demote PostgreSQL's bootstrap superuser (server prohibits it). That approach was replaced with the rollback-only existing-role/table/view owner fault, not retried or bypassed with catalog writes. private-pg-isolation.log records the first isolation fixture's attempt to read the old table using service_role, correctly denied by existing ACL. The snapshot pin was moved to public metadata pg_class instead; no permission was added or assertion weakened. private-pg-final.log is the earlier38-case PASS before isolation qualification. Final39-case log is authoritative for the final source.

## Reproduce / stop boundary

Use the already documented SUBSCRIPTION_LEDGER_PG=1, SUBSCRIPTION_PG_BIN=/opt/homebrew/opt/postgresql@17/bin and existing SUBSCRIPTION_PG_MODULE path with node --test tests/integration/subscription-ledger/postgres.test.mjs. The dedicated entry/gate is retained, and Main alone owns any shared CI selector/registration changes. Candidate installation is exercised atomically in the owned fixture; it is not a deployment command or a grant for shared application.

Stable source commits were sent early to Main. At final handoff, owned PG resources were cleaned, dependency symlink removed and final push completed; no background fixture/provider/write remains in flight. Original branch and all historic artifacts remain. Future rights cover only necessary repairs in this task's same namespace and this isolated authored old-function body delta; no new Main, subagent, shared-file writer, migration, registry, runtime, real Apple/TF/provider, fee or permission action is inferred. Effective model/tier remain unverified. Main remains sole HANDOFF/integration/CI/interface owner, and #226 whole issue is not declared complete by this local fence.
