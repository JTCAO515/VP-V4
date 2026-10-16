> Current local fence pointer: [cross-ledger verification](cross-ledger/VERIFICATION.md) and [hashes](cross-ledger/hashes.json) record the new QA-based candidate-only two-writer fence. Only this local identity boundary is verified; whole runtime/Auth/privacy/Apple enablement remains NOT_READY/UNRUN. Earlier source-head evidence below remains historical.

> Current candidate pointer (2026-10-16): SQL was moved byte-identically outside automatic migrations to `lib/server/entitlements/subscription-ledger/development-schema.sql`. See [current candidate verification](candidate-sql/VERIFICATION.md) and [current hashes](candidate-sql/hashes.json). The historical source-head evidence below retains its original paths and facts; legacy runtime composition remains NOT_READY.

# AGENT-009 subscription ledger development evidence

Source head: `ccd6ce0c4c0d013e18d6e785d3022c86e32abb98`. Exact base: `61caa52a03cb59ff0075b8cf59c63994c30821e1`.
Worktree: `/Users/jtsm5p/Documents/Codex/VP-V10-worktrees/subscription-ledger-20261016`.
Branch: `codex/subscription-ledger-20261016`.
First owned source file filesystem birth: `2026-10-15T21:05:25.247244+00:00` (filesystem evidence, not inferred from commit time).

The implemented result is an isolated development candidate: Apple-SDK Sandbox verification source, immutable in-process verified evidence, private durable transaction/family/period receipts, monotonic revocation/erasure fences and a closed server snapshot. New period capacity is a policy descriptor only. No runtime capacity balance, admission, sales offer, HTTP route, ordinary role access or true purchase is created.

## Validation

- PASS: `node --test tests/contract/entitlements/*.test.mjs tests/contract/subscription-ledger/*.test.mjs tests/security/subscription-ledger/*.test.mjs`: 27/27, zero skips. `contracts-hardened.log`.
- PASS: private PostgreSQL 17.11, existing pg 8.13.1, owned nonce socket/no TCP, synthetic only: 21/21 (20 subcases + parent), zero skips. `pg-owned-final.log`. Includes real database process restart, committed replay/CAS/concurrent writes, late/overlapping renewal, refund old period without changing new descriptor, revoked-first replay refusal, rollback/unknown ACK reconciliation, server expiry/short lease, role privileges and RLS force, bounded export/erasure, private schema dump/restore tombstones and epochs, legacy table/function/constraint/ACL/policy/data fingerprints unchanged.
- PASS: full repository `node node_modules/typescript/bin/tsc --noEmit --incremental false`: no diagnostics. `typecheck-hardened.log`.
- PASS: `node scripts/lint.mjs`: 887 files. `lint-hardened.log`.
- PASS: `node scripts/docs-check.mjs`: `docs-hardened.log`.
- PASS: `git diff --check`; source hash manifest pins all 10 original entitlement/StoreKit source files byte-identical to base and every owned source/test file.
- Default gate: integration invocation without SUBSCRIPTION_LEDGER_PG=1 produces 1 SKIP/INCOMPLETE and starts no resource. `default-gate-hardened.log` is not a PG PASS.

Commands for private PG reproduction (no install or shared server):

```sh
SUBSCRIPTION_LEDGER_PG=1 \
SUBSCRIPTION_PG_BIN=/opt/homebrew/opt/postgresql@17/bin \
SUBSCRIPTION_PG_MODULE=/Users/jtsm5p/Documents/Codex/2026-10-13/v10-main/agent008-pg-client-20261015/node_modules/pg/lib/index.js \
node --test tests/integration/subscription-ledger/postgres.test.mjs
```

Owned resources are cleaned by fixture identity guards, including partial startup or replacement-client failures. During extended fixture development, `pg-restart-restore.log` records initial FAIL: an invalid stale-time test setup violated the intended SQL check, raw COPY dump was submitted to the query API, and restart stdout was held open. Tests were corrected to preserve timestamp constraints, request INSERT-format dump and redirect owned server logs. A guarded stop of the exact owned test server raced normal cleanup and returned directory-already-removed; final run uses normal owned cleanup and passes. Historical failures remain recorded; final passing logs do not rewrite them. `pg-initial.log`, `pg-final.log`, `pg-final-acl.log` and `pg-final-renewal.log` are earlier narrower checkpoints.

## Main review fixes

`ebd4fe0a` adds checkedAt/lifetimeMs (0..300000) to wire1. Active lease is computed using server time: floor(min(300000, verified.checkedAt + 300000 - serverNow, period.expiresAt - serverNow)). Nonpositive becomes reconciliation_required; error/reconciliation have checkedAt null/lifetimeMs 0 and no private period. Native/Web subtract RTT and monotonic elapsed time and never infer eligibility from device calendar. UTF8 transport limit is 8192 bytes. Unknown schema/state/keys and nonpositive active lease fail closed.

Factory inputs are captured via plain property descriptors, validated against the direct #225 complete catalog, copied/frozen, and ports function references captured before await. SDK decoded fields are immutable scalar descriptor snapshots; getters/proxies are rejected without execution. The readback request transaction identity stays independently pinned. Tests cover mutation of catalog capacity to 1000, binding/ports swaps, prior decoded payload mutation, and getter counter zero.

AbortSignal/total deadline (default 10 seconds, bounded 1..30000ms) guard every await. Pre-abort calls zero ports; cancel after first verification starts no readback; stalled/late completions cannot mint evidence. A returned candidate's abort/deadline lease is checked again before SQL. SDK methods do not expose actual cancellation, so an already running verifier/API may finish with INFLIGHT_UNKNOWN; its result is ignored, with no automatic retry. A SQL request already sent remains separately subject to unknown acknowledgement/reconciliation.

## Dependencies and boundaries

Main authorized read-only consumption of #225 commits b438be04 + 1fd9669d, cherry-picked as 0aa1f37d + a5322b64. Those owner files were not edited; the verifier imports their nested index and exact validator. Core legacy source/StoreKit root/SDK/Free policy remain unchanged. Existing dependencies were reused via a temporary untracked node_modules symlink, removed after verification; no install, lockfile or global configuration changes.

New migration: `supabase/migrations/20261016051000_subscription_development_ledger.sql`; SHA256 `5c0ffe10aa2b5d183897aa45a1928db98477d301022a444a648c8eab39806b1a`; NOT APPLIED to shared databases. New private schema only; no GRANT, role membership, legacy table/function/queue edits, auth.users FK or old privacy-handler registration. Public/anon/authenticated/service_role are explicitly revoked; actual SQL denial and privilege/RLS vectors pass. Administrator fixture execution is not normal Native permission proof. Rollback before application is transactional; future applied compensation must retain financial and deletion/replay fences and revoke only.

The old validator requires NON_RENEWING_SUBSCRIPTION; the new verifier requires AUTO_RENEWABLE_SUBSCRIPTION on both signed sources. A genuine same Apple transaction cannot satisfy both types. Synthetic/admin cross-table inserts can still be constructed. New apply serializes a read-only legacy identity check, but an old writer after a new commit does not see the new domain. Cross-ledger bidirectional uniqueness remains NOT_READY. Main alone may coordinate an absent-schema-safe reverse guard under its shared lease; no new trigger/GRANT/old-function modification was made.

Privacy helpers are unregistered administrator-only source candidates. They do not extend old account-delete/export scope or claim all-user deletion. Erasure clears owner/token, retains family/transaction/receipt tombstones and advances epoch. Restore tests retain those records in a synthetic private dump; stale backup restore cannot prove it contains the newest fences. Future restore/enablement must reconcile authoritative tombstones, nondecreasing epochs and account lifecycle eligibility first.

UNRUN/NOT_READY: real Apple signature verification, actual Sandbox/API/Apple credentials, managed Auth and ordinary user access, current target/deployment, Native/Web end-to-end purchase, #227 runtime admission or consumption, economic/cost guarantees, physical device, TestFlight, production and release. No real Apple request or provider/model cost was incurred. Git network push succeeded through existing credential handling without printing credentials. Approval policy is never/danger-full-access as provided; no bypass or new privilege was attempted. Requested model/effort is not proof of effective configuration; effective model/tier was not exposed or verified.

## Stop / in-flight / future ownership

Stable source was sent to Main early at c0bfad52, 192cc94c and ebd4fe0a. At handoff this writer stops further independent scope expansion; no database/server/provider/background tool remains in flight after the final push. Future rights remain only necessary Main-requested repairs in the same exact namespace and reserved migration; no successor writer, shared scope, runtime activation, real transactions or release is inferred. Main remains sole integration, migration ordering, CI/roles and HANDOFF writer. Issue #226 is not closed by these synthetic/private results.
