# Independent QA initialization preparation

Scope: Main-reviewed source base `8b5975e48e850d0cbb1bf6f8ef7c4b0c9ff6b888`, 155 complete migration files. This is a fresh initialization preparation tool, not a restore tool, cloud provisioner, target migration runner or activation package. It never reads the old 75-project snapshot, encrypted archives, user rows, Storage objects or credentials. Earlier QA admission/discovery/reconciliation evidence is reused; the proof here tests only fresh empty initialization and a small original-RPC smoke path.

Default command (operator-supplied reviewed NEW reference; example is synthetic and not provisioned):

```
node scripts/qa-agent-independent-init/prepare.mjs --approved-ref abcdefghijklmnopqrst
```

It emits a review-only ordered DDL/source list with exact SHA-256, role/bootstrap preconditions and protected-runtime/lifecycle/ACL checks. No Docker, network or SQL runs on this default path. Missing/malformed/shared reference or mismatched optional `--public-url` fails closed; there is no fallback, DSN/password/backup/execute flag. The old shared reference is denied. A syntactically accepted reference does not prove a project exists or authorize its creation/fees/credentials/database write.

`migration-sources.json` is immutable source evidence, hashed in the code. Source names/order/count must be exactly 155; symlink, missing/extra/version/order/hash changes refuse. `ledger()` requires the observed final full version list in that same order, not just a count. No 75/80 split is used. Do not re-seal new hashes at runtime; Main must review a new source manifest if source changes.

Role/SDK/platform preflight is distinct from application DDL. Managed Supabase supplies its own Auth tables/functions and roles; this tool never creates/replaces them on a target. `platform-probe.sql` is a content-free SELECT of engine encoding/version, exact Auth function sources/security/owner/config, Auth column shapes and required role flags. It does not print JWTs, role passwords or user values. A new managed target has no reviewed engine/Auth profile yet: `platform(..., 'managed')` returns `MANAGED_PLATFORM_UNREVIEWED`. The original minimal local SQL-claim fixture is pinned separately as `local-pg-fixture/1`; an altered or overloaded/extra Auth function, role bypass flag, engine or columns fails. Pure-PG proof is NOT GoTrue/JWT/SSR/managed-target acceptance and cannot authorize target writes. Main must obtain a fresh approved new-target content-free profile and review exact source pins, not normalize unknown functions or copy old Auth/schema/data.

Before a future authorized initialization: verify independent URL binding, platform-owned required `anon`/`authenticated`/`service_role` roles and exact new managed fingerprint; application schemas must be empty, Auth user/session and Storage object counts must be zero, and no shared backup/import is involved. The review list uses unchanged original DDL bytes in version order. Afterwards verify real full migration ledger, all ten original schema/runtime/hook gates, QA v2 service-only ACL, original turn export/conversation+turn deletion entry/source guards and no installed policy/consent/budget/account/worker activation. `postconditions.sql` is read-only; presence checks are prechecks, not an end-user export/delete acceptance claim.

Explicit self-owned local proof:

```
node scripts/qa-agent-independent-init/prove-empty-pg.mjs --prove-empty-pg
node --test tests/contract/qa-agent-independent-init/prepare.test.mjs
```

The proof creates a unique own no-network/no-port/no-mount cached PG17.6.1.159 container, checks owner label/UNIX Docker context/image ID and actual initial empty application catalog, bootstraps only the pinned synthetic Auth prerequisites, replays all 155 unchanged source files and records each applied version/name/source hash in a proof-only local ledger. It checks exact original local Auth fingerprints before/after, empty/unactivated runtime state, all10 gates, QA v2 ACL and original export/delete presence, then uses only generated synthetic identities/consent/budget parameters to prove original protected QA admission/context/replay and durable unresolved-reply/withdrawal behavior. No provider fetch occurs. Synthetic roles, users and budget rows belong exclusively to this disposable proof and disappear with own cleanup.

The proof-only ledger adds a source hash column inside the disposable fixture; it is not a new managed migration-ledger ABI and must not be copied to a target. Actual target migration bookkeeping remains the existing platform/Main-owned process. This script has no network/apply/target connection option, cannot operate another container, and rejects Docker environment overrides. Unknown new managed engine/Auth/extension definitions, new reference existence, keys, reviewed worker image/binding, policy/notice, real Auth/Session/provider/account fees and actual target DB write remain UNRUN. Those are explicit next evidence/authorization requirements; this package does not resurrect StageB or alter Production.
