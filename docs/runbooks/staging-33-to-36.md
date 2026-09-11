# Staging 33 → 36: bounded Ask worker prerequisites

Related to #195 / #189; single integration PR325. Preparation only, no remote migration executed.
Target: existing VP - V4 Staging in ap-southeast-1. Production release remains separately owned.
This package advances the existing ordered migration history; it does not enable customer Ask,
install a provider policy, authorize Ops membership, publish knowledge or start a worker.

## Exact package

[Manifest](../../artifacts/VPJ-07/staging-36-preparation/migrations.json) freezes36 SQL files.
Its first33 entries are byte-identical to the previously executed33-file manifest; only these
three pending migrations may appear in the eventual dry-run:

| Ordinal | File | SHA256 |
| --- | --- | --- |
| 34 | `20260910200522_vpj_14_ops_candidate_review.sql` | `db19dafa4305d5344c9f5ca4e98647479edb454546591b99ddb2cee09f2a0fb9` |
| 35 | `20260910213151_vpj_15_private_source_assertion.sql` | `d70008af48f80c1159d0a76156dbc95fb30af17a6f0c8082bfe4ec32b641537d` |
| 36 | `20260911072414_vpj_07_scoped_text_claim.sql` | `894b3664176648d7fb4370d4c9bc2a158da67b660b53526285c7cc48b853345c` |

34 adds the private candidate-review workspace, disabled by default with no members.
35 adds private source assertions and preserves the current-actor gate; it creates no reviewed Fact.
36 adds the service-only owner/policy text claimer and its index; the global queue contract remains.
34/35 retain ordered shared-schema history, not permission to activate knowledge workflows.
There is no administrative normalization step: never replay the old pre27 ACL normalization.

```sh
node --test scripts/db/staging-36-package.test.mjs
node scripts/db/staging-36-package.mjs --out /absolute/new/unlinked-package
```

The new output directory is exclusive and private. Only frozen SQL and a minimal unlinked config
are copied; local secrets, link state and environment files are excluded. Existing directories,
hash drift and unknown earlier migrations fail closed; later migrations remain excluded.
Do not run db push from the moving source checkout. Use the reviewed package and compare its
hash to the committed manifest again immediately before the migration command.

## Current read-only observation

[Metadata](../../artifacts/VPJ-07/staging-36-preparation/staging-metadata.json) was obtained through
the existing official CLI Management API in a read-only transaction. Remote history matches33
version/name pairs;3 accounts and2 Trips remain. No text policies, enabled budget scopes, live
queued/leased work or pending budget attempts were observed. The new knowledge schema and scoped
claim function are absent. These counts do not establish future write quiescence, backup recovery,
provider eligibility or data-content equality. No original records were read into this artifact.

## Execution gate and concrete sequence

Development preparation is authorized. Actual application must satisfy the established
[maintenance procedure](staging-vercel-maintenance.md): the operator confirms other direct DB,
SDK, local and worker writers are stopped for this new window. The earlier27–33 window is not a
standing assertion that those writers are stopped now. Do not change Production release routing.
Before asking for this final window, retain this exact package, passed rehearsal and rollback
instructions so the operator can approve a concrete action.

1. Re-read target identity,33 history and current Vercel WAF/allowed hosts/config versions. Stop on
   drift; do not repair migration history or overwrite another configuration draft.
2. In the confirmed window, pause affected public entry points using the existing owned maintenance
   control and stop all direct workers. Observe in-flight work; retain unknown budget holds.
3. Create a new encrypted backup of all actual application/private/Auth/migration schemas, including
   identity_private and turn_private. Restore into a newly owned isolated UTF-8 PostgreSQL instance;
   compare every original table/column summary, function and grant inventory. No raw records,
   session data, secrets or database URLs enter repository logs. Old backup evidence is insufficient.
4. Recheck package hashes and use the existing secure credential channel, official CA and verified
   TLS connection. CLI help must confirm the installed options. A dry-run must list exactly34,35,36.
   Reject include-all, include-seed, include-roles, vault writes, repair or any extra migration.
5. Apply only that package using the same connection, `--skip-vault` and no data seed. If interrupted,
   inspect the actual committed history prefix and schema before any retry; three files are not
   claimed to be a single remote transaction. Do not force history entries for uncertain results.
6. Compare history36 against the manifest and preserve all original table/column summaries, including
   prior receipts and unresolved holds. Verify claim_text_work EXECUTE is service-only; new private
   candidate/source tables deny anon/authenticated direct access, settings remain disabled, members
   remain empty. Run security advisors; distinguish any pre-existing finding from new findings.
7. Restore only the previously permitted compatible entry points after their ordinary-user checks.
   Text activation, actual tariff/budget configuration, provider consent and worker execution remain
   separate until account/recipient qualification is complete. No fallback to global claiming.

## Failure and rollback

Stop the owned worker/new dispatch and preserve maintenance protection while resolving failure.
Before36, the scoped worker cannot claim; leave it disabled. After36, revoke only the new
service capability to prevent new scoped claims (an already claimed lease is not cancelled by
revocation alone). Stop processes and handle existing cancellation/unknown holds through the
accepted ledger. Keep the additive index/schema, applied migration history and retained records.
Do not delete tables, rewind history, release unknown charges or restore broad legacy permissions.

34/35's feature remains disabled and grants no membership. If application fails partway, inspect
its committed prefix and finish forward after review; never drop retained review/assertion records.
The disposable integration test verifies service-EXECUTE revocation/regrant only in its owned
local database. A production rollback or live Staging restore has not been executed by this package.
