# Fixed-target platform coverage diagnosis — 2026-10-13

Official Go2China account `link_6acdbe0471c081919ff47de24ca53b0f`, fixed target `dzqdzetcctkhbrhlxxgn`. Two permitted reads: catalog inventory, then **one** aggregate COUNT query plus column/extension metadata. No SET ROLE, table-row values, secret values, plaintext backup, real archive or key creation. `platform-count-observation.json` and `platform-count-query.sql` preserve the exact scoped evidence. Official channel returned SELECT capability for each inventoried relation; this does not prove the future CLI effective-role path.

| Relation outside14 data schemas | Exact count | Classification / dependency |
| --- | ---: | --- |
| realtime.schema_migrations | 89 | Realtime service migration ledger. Columns are version bigint and inserted_at timestamp(0); raw versions/timestamps were **not read**. Preserve these original records with matching Realtime schema, owner/ACL and global roles. |
| realtime.messages | 0 | Partitioned Authorization/Broadcast service data. Empty at this observation only; any new records/partitions require renewed scope review and block the candidate. |
| realtime.subscription | 0 | Subscriber state, including claims-bearing columns. No claims read. Nonzero state is outside the minimal supplement and blocks. |
| vault.secrets | 0 | supabase_vault extension-config table; its rows may contain encrypted secrets. No secret/decrypted-secret query. Nonzero state blocks and requires a separately reviewed key/secret-recovery plan. |

No base table/materialized view was inventoried in pgbouncer, graphql or graphql_public. The predicate covers non-system namespaces outside the exact14 data schemas, not pg_catalog or pg_toast. Inventory may drift; candidate requires a fresh exact inventory.

The [official Realtime schema description](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/realtime/concepts.mdx) identifies schema_migrations as the service's migration tracking table, subscription as subscriber tracking and messages as Authorization/Broadcast state. [Realtime's migration implementation](https://github.com/supabase/realtime/blob/main/lib/realtime/tenants/migrations.ex) checks the migration table on restore to decide whether to bootstrap or run migrations. Therefore a matching schema-only restore plus a fabricated/empty migration ledger is insufficient. No claim is made that the89 actual versions are individually validated or recreated.

## Original gate result and correction

**FAIL_UNCOVERED_PLATFORM_DATA_NOT_EMPTY** is the honest result of the d9b2 policy on this real target: schema_migrations=89. The previous all-zero requirement was not verified before the execution proposal and cannot be described as ready. Five-extension/owner/ACL synthetic PASS remains valid for its independent scope. Writer quietness, real capture/restore and effective CLI permissions remain UNRUN.

## Minimal complete candidate for the observed scope

Keep the14 data-schema custom archive, full-schema archive and no-password globals archive. Add exactly one encrypted, data-only custom archive `platform-ledger.dump.age.partial`, selected only with `--table=realtime.schema_migrations --data-only --strict-names`. This adds one table in a15th schema, **not** a broad authorization to dump Realtime messages/subscriptions or Vault. Full-schema/globals already carry the ledger's structure, constraints, owner/ACL and role dependencies. Restore its original data between schema pre-data and schema post-data, with the14-schema data archive, then compare both count and a stable logical SHA256 of the version/timestamp pairs. Do not synthesize seed versions or delete rows to satisfy a count.

`platform-ledger.py` pins the observed four-relation inventory, kind/owner, exact two ledger columns and count89. Other three tables must stay zero; unknown tables, changed count/columns/owner/kind reject. The new verification contract is `qaw-restore-verification/2`; it requires four archives and an explicit ledger supplement descriptor. A three-file/old contract cannot silently omit the ledger. Supplemental TOC must contain exactly the one expected TABLE DATA item and no service/blob/sequence payload. Source/restored ledger digests are calculated only in a future explicitly approved capture/restore, never on this turn's target COUNT.

**Required authorization increment:** Main must ask JT to include `capture-realtime-schema-migrations-ledger` in capture actions, and `restore-realtime-schema-migrations-ledger` in local-restore actions. That permits original89 ledger records to flow directly to age under the same FileVault0700/0600 custody and approved retention, and be decrypted only for the owned no-network local restore. Source code hashes and the human confirmation phrase changed; old approvals cannot authorize the increment. Proposal or metadata observations do not grant it. No new credentials, privileges, paid project or target modification are needed for this candidate. The operator's actual ability to select all required data/ledger under postgres remains a future fresh check and may fail closed.

## Actual local validation and limits

`platform-ledger-restore-proof-01.json`: PASS_SYNTHETIC_RESTORE_ENTRY_ONLY. Generated89 explicitly fake ledger versions/timestamps, encrypted four archives, restored original fixture ledger with matching count/digest, and rejected wrong digest/count/altered ciphertext. These are not the target's89 values. This reruns only the affected bundle/data supplement path; the unchanged exact five-extension bootstrap proof is reused as its prerequisite, with no unrelated QA/migration/provider matrix. Both source and restore containers and synthetic key/ciphertexts cleaned. Full synthetic scenario7.881s; capture0.330s, positive restore1.844s. These are fixture timings, not a real target ETA.

Six platform-policy tests, seven restore gates, six capture gates, ten delayed-confirmation gates and four catalog-probe tests PASS. Defaults still invoke no network/archive/Docker; historical logs retained. Real platform records, real archive restore, quietness and upgrade acceptance remain UNRUN.

Capture preparation rejects unknown relation profiles before composing any outside14 COUNT, and rejects count drift before querying ledger values/digest. A focused mock test proves both refusals occur without that record query. Post-capture target checks now require at least2min of window for the bounded metadata/count/digest queries. None of those higher-role paths was executed on target.
