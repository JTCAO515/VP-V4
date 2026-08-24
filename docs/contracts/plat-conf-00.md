# PLAT-CONF-00: local connection-path evidence

Status: local and new-project evidence. This remains a non-production connection contract.

| Path | Configuration | Observed result | Status |
| --- | --- | --- | --- |
| UserDataAdapter | authenticated JWT -> public Data API + RLS | owner insert `201`; owner read `1`; other-user read `0` | passed locally |
| OpsDataAdapter | `app_metadata.role=ops_probe` -> authenticated security-invoker RPC | scoped RPC returned the reviewed local probe count | passed locally |
| SystemDataAdapter | local `service_role` -> private schema function with explicit table grant | private function executed only after explicit `service_role` SELECT grant | passed locally |
| transaction pooler | local Supavisor port 54329, transaction mode | missing tenant identifier rejected; tenant-qualified session allowed `PREPARE/EXECUTE` | **not accepted** |
| migration/direct | local direct DB port 54322 | migrations applied and direct query ran as `postgres` | passed locally |

## New-project remote evidence

The linked project is `dzqdzetcctkhbrhlxxgn` in `ap-southeast-1`. Four V4 migrations were dry-run and then applied through the Supabase CLI. Short-lived, email-confirmed probe users were created through the Auth admin API, tested, and deleted in the same command. The probe row was deleted through the linked database connection.

| Path | Observed remote result |
| --- | --- |
| User JWT + RLS | insert HTTP `201`; owner read `1`; other user read `0` |
| Ops role-scoped RPC | `app_metadata.role=ops_probe` JWT called the `security invoker` RPC and returned `1` |
| System worker | linked SQL `SET ROLE service_role` called the private function after its explicit table grant; the cleaned probe count was `0` |

## Frozen conclusions

- User and Ops paths do not use a service credential to impersonate the owner/reviewer.
- The worker path remains private-schema plus explicit resource/table grants; a function grant alone is insufficient.
- The current local `psql` probe does not prove the required prepared-statement prohibition. It is not an accepted VisePanda runtime configuration.
- VisePanda's future `SystemDataAdapter` transaction-pooler profile is frozen as shared Supavisor transaction mode on port `6543`, username `postgres.<project-ref>`, with prepared statements disabled in the client. A Postgres.js client must use `{ prepare: false }`; a node-postgres query definition must omit `name`. No SystemDataAdapter code may use a named prepared query against this path.
- Migrations, `pg_dump`, restore, and other native management operations remain direct-connection work. The new project direct endpoint is IPv6-only; the VPN split-DNS exception for `*.supabase.co` is a local operator prerequisite, not a product runtime dependency.
- Remote evidence applies only to the new linked project; no older Supabase project was linked or queried.

## Primary references

- [Supabase: disabling prepared statements in transaction mode](https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL)
- [Supabase: connection method matrix](https://supabase.com/docs/guides/database/connecting-to-postgres)

## Rollback

Stop the local Supabase project and revert these probe-only migrations. They contain only local connection-probe rows and no product data.
