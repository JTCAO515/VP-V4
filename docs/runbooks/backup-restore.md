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
