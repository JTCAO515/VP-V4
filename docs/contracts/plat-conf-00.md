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
- The current local pooler does not prove the required prepared-statement prohibition. It must remain unavailable to a VisePanda client until a connection/client configuration that disables preparation is implemented and tested.
- Remote evidence applies only to the new linked project; no older Supabase project was linked or queried.

## Rollback

Stop the local Supabase project and revert these probe-only migrations. They contain only local connection-probe rows and no product data.
