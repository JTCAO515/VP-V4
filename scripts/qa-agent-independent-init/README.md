# QA database review preparation

Current JT direction: continue the original shared Production/test project `dzqdzetcctkhbrhlxxgn`. Independent project direction is cancelled. This path/name and its earlier evidence are retained; no project/ref/key is created. Main remains the only integration/target operator. The tool never connects to a DB, exports data, reads credentials or applies DDL.

Default **existing-shared** review-only command:

```
node scripts/qa-agent-independent-init/prepare.mjs --approved-ref dzqdzetcctkhbrhlxxgn
```

Binding is explicit operator input, exactly the approved shared reference and canonical URL, with a SHA-256 sealed binding descriptor. Missing/different ref or URL refuses; no fallback. Default output gives the fixed original75 + reviewed missing80 -> complete155 source list and checks, but reports `FRESH_MAIN_OBSERVATION_REQUIRED`, unreviewed managed platform/data compatibility and maintenance approval. It cannot grant runtime readiness or DB writes.

Main-controlled **content-free** metadata, after the separately approved read, may be supplied as a regular nonsymlink JSON file with exact SHA-256:

```
node scripts/qa-agent-independent-init/prepare.mjs --mode existing-shared --approved-ref dzqdzetcctkhbrhlxxgn --observation /approved/metadata.json --observation-sha <sha256>
```

Closed observation schema `qa-shared-observation/1`: projectRef, observedAt, authority=`main-controlled-readonly`, exact ordered migrations75; optional platformFingerprint/dataCompatibility evidence. Seal is integrity, not a cryptographic attestation of who collected it. Unknown/missing/extra/reordered versions, wrong authority/ref, wrong seal, future/stale (>1h) time and extra fields refuse. Existing schema/data/managed Auth facts remain UNRUN until Main independently reviews actual evidence; accepting the version observation does NOT make readyToApply true. No role/archive/key payload is accepted. DDL/window/high-privilege read/data export/AGE key/service stop actions require their separate specific approval packages.

`migration-sources.json` remains the immutable reviewed complete155 byte hashes from 8b5975e4. `shared-baseline.json` freezes original75/missing80 version sets only; no Production rows, roles/passwords, Storage or archive are copied. Source names/order/count/hash/symlink drift refuses. Managed engine/Auth definitions are still unknown: `platform(...,'managed')` refuses, never strips/normalizes unknown definitions or imports a role archive. `platform-probe.sql` and `postconditions.sql` are review-only content-free SELECTs for a later separately authorized Main read.

Historical fresh0->155 survives strictly as **owned local proof**, with no project binding:

```
node scripts/qa-agent-independent-init/prepare.mjs --mode fresh-local-proof
node scripts/qa-agent-independent-init/prove-empty-pg.mjs --prove-empty-pg
node scripts/qa-agent-independent-init/prove-shared-pg.mjs --prove-shared-pg
node --test tests/contract/qa-agent-independent-init/*.test.mjs
```

The shared simulation starts a NEW own cached PG17.6 container, exact local Auth/role fingerprints, then original75 application DDL. It creates only synthetic retained Auth/input/disabled budget rows, replays only missing80, and compares every original retained field exactly. The sole reviewed structural addition is work.execution_mode='text' from 20260927060000 (source SHA pinned); it is explicitly asserted, not broadly masked. Actual proof ledger ends exact155 version/name/source-hash records. All10 gates, QA-v2 ACL, original export/delete presence, disabled original budgets and host switch, consumer/replay/reconciliation/withdrawal smoke are checked. No real shared data is loaded or overwritten, no provider fetch occurs.

Both local proofs use unique owner-labelled UNIX-context containers, cached image pull-never/network-none/no ports/no mounts, label-verified own cleanup; CLI45s/SQL30s deadlines. Minimal SQL-claim Auth is NOT managed Supabase/GoTrue/SSR/JWT acceptance. Proof-only ledger hash column is not a managed migration ABI proposal. Existing fresh PASS/raw FAIL and old WT remain intact. No actualData/target managed Auth normalization, Production outage, real budget/provider, new secret or cloud action follows from these local proofs.
