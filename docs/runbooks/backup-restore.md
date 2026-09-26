# AI-49 backup and restore rehearsal

## Status and safety boundary

This runbook prepares an isolated rehearsal only. It neither authorizes a production connection,
selects a Supabase plan or region, sets an RPO/RTO target, nor creates a backup. Do not commit
database URLs, bucket names, object keys, backup identifiers, credentials, cookies, tokens, or
restore output containing user data.

The committed parameter-free plan is checked with:

```sh
node scripts/db/restore/rehearsal-plan.mjs --plan tests/integration/restore/fixtures/parameter-free-rehearsal-plan.json
```

It fail-closes unless the rehearsal is `isolated-staging`, has separate database restore,
roll-forward/PITR, and compensation exercises, leaves RPO/RTO `null` until plan and region are
accepted, and has a Storage policy with required deletion verification.
The committed validator accepts only the current no-backup TTL policy. It refuses every
S3-compatible choice until an independent, authoritative Storage-policy registry exists; bucket
names, object paths, endpoints, and credentials must never be put in this repository.

## Operator prerequisites

Before any real rehearsal, the operator records outside this repository:

1. the accepted plan, Supabase region, and an isolated staging project with synthetic data only;
2. the approved RPO/RTO targets and source backup/PITR coverage for that plan;
3. an intentional no-backup TTL, or an accepted future Storage-policy authority before considering
   an independent encrypted S3-compatible backup;
4. encryption, retention, deletion, access, and incident owners for every backup copy.

The operator must stop if any prerequisite is absent. No production account, DNS, payment,
credential, or external backup action is authorized by this runbook.

## Rehearsal sequence

Run each exercise separately in the isolated project and record only redacted timings, command
exit codes, and boolean postconditions in the protected operator record.

1. **Database restore:** restore the selected database backup to a fresh isolated target. Verify
   schema head, RLS policies, grants, functions, queue definitions, and secret references without
   printing secret values.
2. **Roll-forward/PITR:** restore to an agreed point, then apply the documented forward migration
   sequence. Check the resulting schema/data postconditions. A down migration is permitted only
   where its owning migration explicitly declares it reversible.
3. **Compensation:** exercise the documented compensating action independently. Do not call a
   PITR or database restore a compensation test.
4. **Storage:** database backups do not cover objects. For `s3-compatible-backup`, reconcile
   object metadata-to-file digest/count and test policy-bound deletion from every copy. For
   `no-backup-ttl`, verify expiry/deletion and disclose that recovery is unavailable after TTL.
   Ephemeral media must never become permanent because it is convenient to back up.

## Acceptance record

The operator record must identify the rehearsal environment, approved RPO/RTO values, start/end
times, redacted commands and exit codes, the three exercise results, schema/RLS/grant/function/
queue/secret-reference checks, Storage reconciliation or TTL deletion result, residual risk, and
rollback. Attach no raw user data or secrets. A failed or unrun exercise remains failed or unrun;
it does not establish beta recovery readiness.

## VPJ-38 K1: deny reads before reconciliation

This sequence is for a fresh **isolated synthetic** target. Keep its public API and Storage
ingress denied, and pause worker writes, before importing a database or object. An application
maintenance page alone is insufficient: direct database/RPC, signed object URLs and worker
credentials must remain blocked or invalidated. Confirm denial from an ordinary synthetic test
identity and from an anonymous client. Never attach this target to shared Staging or Production.

1. Preserve an integrity-checked deletion/revocation journal **outside the backup being
   restored**. Quiesce its writers, record the coverage watermark and verify it covers every
   event after the backup cutoff. Missing coverage stops recovery. The journal must include
   completed and queued Trip deletion requests, account erasure tombstones, StoreKit transaction
   revocations/erasure markers, licence withdrawals and object deletion obligations. A DB dump
   of the earlier point is not this source.
2. Restore the DB and required Storage files into the isolated target. Reconcile object metadata
   with actual files and digests. Classify data by backup or no-backup TTL; expired/no-backup
   files stay absent. Record backup cutoff, restore start/end, object coverage and missing files
   separately. Do not calculate a real RPO/RTO from a fixture.
3. With reads still denied, replay the journal through the sealed watermark. Reapply Trip
   tombstones and run the reviewed deletion executor where a restored Trip reappears; keep
   queued requests queued until their executor can finish. Reconcile account erasure, StoreKit
   revocations/refunds and licence withdrawals. Preserve StoreKit transaction tombstones so
   transaction replay cannot recreate a grant. Verify no deleted row or revoked entitlement is
   readable, including through cached/signed object access.
4. Verify schema head, RLS, table/function grants, security-definer functions, triggers, queues,
   owner isolation and object metadata/file parity independently. If a check is FAIL or UNRUN,
   ingress stays denied. Recheck the journal watermark if new deletion/revocation events can
   arrive during recovery; K2 owns interrupted/late-event recovery.
5. Record observed controls and UTC times in a protected operator record. The executable synthetic
   rehearsal is `node scripts/db/restore/synthetic-recovery.mjs --execute`; it uses two new local
   PostgreSQL containers without network access, an independent journal, real dump/restore,
   object files and SQL/FS probes. Its isolated read gate opens only after those actual checks;
   owner/other/anon probes then run against the restored container. No self-reported JSON alone
   authorizes a read. The synthetic run does not open shared ingress or establish service RPO/RTO.

Do not put IDs, paths, hostnames, backup names, credentials or raw query output in the committed
evidence JSON. Record actual measured RPO/RTO only after a permitted real backup/object source,
cutoff and restore endpoint exist; retain their calculation inputs in a protected operator log.
K1 is incomplete until that isolated runtime exercise and read matrix pass.
