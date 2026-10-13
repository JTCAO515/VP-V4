# Scheme B — bounded shared read-only snapshot candidate

Root selected this technical mode in the original owner chat. Base e8db27278cfe56752ee1ec0400d416426136a5a5, same worktree and sole writer. Preparation, local fake data and evidence only. No fixed-target connection/SET ROLE/export/dump/key/provider/pause or target80-version operation was performed.

## Stable interface and authority boundary

Original controlled-backup.py and controlled-restore.py are byte-identical to base (SHA256 respectively599c532dbf1c9043b4ae82da7a1975e59d97fb91ba2bc5df4c2c5d1c04ecaf7f and fccdfc77f7fdb05ee75e2623b452a016f23008f6e16a7dade3ef62216cb5e665). Their strict writer gate, original hash logic and33/five-extension proofs are preserved. New defaults:

- `python3 scripts/qa-agent-staging-replay/controlled-snapshot-backup.py --dry-run`
- `python3 scripts/qa-agent-staging-replay/controlled-snapshot-restore.py --dry-run`

Neither default invokes network/credentials/Docker/archive operations. Future opt-in capture uses `--snapshot-execute <Main-prepared-mode-approval.json> <fresh-official-metadata.json>`; future restore uses `--restore-snapshot-approved <Main-prepared-restore-approval.json> <mode-B-manifest.json> <identity>`. These require human TTY confirmation and renewed post-prompt checks. Root's mode selection, a JSON file or a synthetic PASS does not grant actual JT authority; the agent must not generate an approved record or type confirmation without the real scoped authorization.

Capture requires the existing six fixed-target scopes plus holding a bounded readonly exporter, accepting concurrent DML at a fixed recovery point and sequence-safety verification with no live authority. Explicit code hash/mode, Root decision evidence reference+SHA, and five current owner-confirmation reference+SHA/time intervals are mandatory: application DDL/migrations, managed Realtime migrations, roles/memberships, ACL/policy DDL, extensions/ledger schema. This mode never fabricates writersAndMigratorsQuiesced=true. It validates the unchanged target/destination/one-time UUID/fresh official pins/window rules separately. Current owner confirmations/shared Production binding remain UNRUN, not silently ready.

## Snapshot and transport implementation

shared-snapshot.py owns one PSQL exporter transaction, REPEATABLE READ READ ONLY. It records the export server timestamp and hashes the ID in the manifest, keeps the exporter live through every import, and has an absolute30–600s bound plus server idle-transaction timeout. Every three pg_dump command gets the exact --snapshot ID; a missing/different argument rejects before process/file creation. Counts, platform-count checks, ledger logical digest, database facts, snapshot row maxima and metadata use importing readonly transactions. There is no retry using a later live snapshot and no old-result fallback.

Dump output flows directly into age. A watchdog probes exporter health, cancels/reaps producer and encryption children on loss/expiry and refuses a partial group. Full ciphertext integrity/TOCs remain verified. Globals use the same fixed roles-only/no-password stream independently; they are NOT claimed to be MVCC-synchronized. Live catalog/role/schema evidence before the exporter and after the streams must match, including server-side structural/function hashes. Role/ACL/DDL owner control remains a separate precondition: two probes cannot detect an unobserved change-and-revert race or physically fence unknown administrators.

New contract qaw-shared-snapshot-restoration/1 keeps the same four archives and14+one-ledger scope. Original restore rejects this contract; the dedicated adapter verifies scheme-B evidence first and maps to the private reused restore engine only afterward. It checks sequences before deleting the owned restored copy. Original owner/ACL/role/count/schema and managed-extension checks are reused, without source edits or error suppression.

PSQL/TLS/temporary CLI transport uses existing pinned hostname/CA and credentials in child environment memory. SSL is checked on the same connection as session_user before SET ROLE, since the fixture showed role-switched pg_stat_ssl visibility can return null; no extra role permission was granted to fix this. All subsequent connections are still client verify-full. Real direct TLS/credential/exporter behavior and long-duration remote capture remain UNRUN.

## Sequence and later-authority limits

Sequence state is not MVCC table data. This implementation supports only positive, noncycling sequences owned by known14-scope integer columns. The maximum restored/snapshot column value must match, and restored next value must exceed it and remain in bounds. Unknown/unowned/cyclic/descending profiles reject. A sequence advance during live DML can produce a safe gap; it is not falsely labeled exact point-in-time sequence state. A rewind that would collide fails restore. No target sequence is reset or repaired automatically.

The point copy excludes later rows/ledger timestamp updates and does not become current consent. Concurrent policy revocation is kept separate: the fixture sees original revoked=false through the snapshot while live revoked=true, and the manifest declares dispatchAuthority/liveRestoreAuthority NONE. Shared snapshot does not authorize activating provider use, overwriting a newer shared target, reviving withdrawn data or executing80 target migrations. Ordinary DML allowance is for making a bounded offline recovery-point copy only.

## Actual local evidence

shared-snapshot-proof-11.json: PASS_LOCAL_SHARED_SNAPSHOT_ONLY,12 named stages,10.054s total. Own cached PostgreSQL17.6.1.155, unique owned no-network/no-port/no-mount container. Verify-full TLS with a generated one-day localhost fixture certificate and a synthetic passworded cli_login_postgres role exercises the existing role-switch/PSQL path; wrong certificate hostname rejects. Neither certificate nor password is a real credential. Password is never in argv/output; synthetic TLS/age files are removed, container cleanup PASS.

Three database dumps, counts and ledger digest retain one point despite concurrent fixture inserts, payload changes, policy revocation and ledger timestamp update. Complete owned isolated restore matches schema/role/ACL/count/ledger checks. A sequence advances after point selection but before data14 dump; the restored next value has a verified safe gap above the snapshot row maximum. A concurrent rewind after point selection still produces the collision negative; rewound nextval fails and cleanup succeeds. Independent role DDL and table DDL drift reject the entire group. Killing exporter after the first file prevents the second file from starting. Lost and expired exporters refuse imports without fallback. Synthetic data/versions are fixtures, not actual target75 business records or real ledger values.

shared-snapshot-mode-tests.log:10 PASS checks for default no-I/O, human TTY gates, exact authority and current owner evidence, expired observation/window/confirmation rejection, independent catalog mismatch, original restore-contract refusal, mandatory snapshot argument, unchanged strict source, unsupported sequence profiles and exhausted next-value bounds. Syntax, original byte identity, docs and diff checks PASS. The older33 checks and five-extension evidence were not rerun as an unrelated matrix.

Earlier failures01–07 are retained. First TLS boot attempts found openssl absent in the cached image; fixture uses the existing host LibreSSL tool and stdin transfer without installing software. An initial --rm boot failure reported cleanup unverified; daemon label inventory showed no retained matching resources, later fixture startup preserves its own container until label-checked removal. Missing fake storage tables, switched-role TLS-view nullability and a nested-import indentation error were corrected. No failure was made green by weakening timeout, TLS, scope or privilege assertions.

## Remaining conditions for Main

This is code/local protocol evidence, not an overall real-execution PASS. Main must prepare genuine mode authority and current DDL/DCL owner boundary evidence, recheck public DB bindings/Production sharing, and review exact new code hashes. Fixed-target source sequence profiles, actual export/import permissions, account/transport lifetime, managed migration control, real encrypted capture/restore, services and actual80-version rollout remain UNRUN. If those DDL/role/sequence boundaries cannot be established, reject actual mode B instead of declaring the shared project safe.
