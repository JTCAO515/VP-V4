# VPJ-02 authorized Staging apply — 2026-09-10

User explicitly extended the existing same-target Staging grant to `20260909033302_vpj_02_repair_local_rpc_runtime.sql`. This supplements the original13 migration and two ordinary temporary-account authorization; it does not authorize Production, Vault/config changes or wider recipients.

## Observed migration result

- Live CLI target name/region/status matched the selected `VP - V4` Singapore test project.
- Fresh baseline:3 Auth records,2 Trips,11 matching migration versions/names.
- All25 local SQL files are byte-identical to reviewed merged RPC-repair commit6307d79; original24 history files were not rewritten.
- Fresh affected-schema dump(public/private/auth/supabase_migrations) streamed directly into AES-256-GCM encryption outside the repository. Keychain read-back and archive validity passed.
- A fresh no-network PostgreSQL17 container restored that backup; all Auth/Trip row digests and3/2/11 counts matched. Container removed. This proves affected-schema restoration, not full physical-project/Storage/role-password recovery.
- Native CLI dry-run via Session pooler/verify-full/official CA listed exactly original13 plus the approved repair. Execution used `--skip-vault`, no seeds or custom roles.
- Actual migration process exited0. Remote history now25, matching every local version/name. Existing Auth and Trip counts and full row digests are unchanged.
- Independent script review found a possible raw CLI initialization-error leak before execution. Fixed with sanitized transport errors; two injected failure canaries passed with zero external calls and no canary leakage.

## Remaining verification

The two-account ordinary JWT matrix passed16/16 checks: both ordinary roles/password logins/Auth user identities, owner create/read, other/anon denied reads and cross-owner creates, all three denied direct PATCH, and unchanged fixture. Cleanup removed only this run recorded Trip IDs and the two new Auth IDs; final original3 Auth/2 Trip complete row digests match. The first attempt failed before creating any account because CLI key metadata used a different JSON envelope; parsing was corrected and the actual full rerun passed. Auth attempts and negative INSERT IDs were recorded before requests to retain exact cleanup targets after ambiguous transport failures. Direct-host and worker paths are not inferred from maintenance Session pooler success. Parent#189 remains open until its acceptance is satisfied.

Private backup metadata, credentials, identities and raw database rows are not committed. Applied database migrations remain append-only; any recovery uses reviewed forward recovery, never migration-history repair or regranting revoked direct UPDATE.
