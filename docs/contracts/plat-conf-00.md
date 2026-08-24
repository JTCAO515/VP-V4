# PLAT-CONF-00: local connection-path evidence

Status: local-only evidence, not a remote-project or production acceptance.

| Path | Configuration | Observed result | Status |
| --- | --- | --- | --- |
| UserDataAdapter | authenticated JWT -> public Data API + RLS | owner insert `201`; owner read `1`; other-user read `0` | passed locally |
| OpsDataAdapter | `app_metadata.role=ops_probe` -> authenticated security-invoker RPC | scoped RPC returned the reviewed local probe count | passed locally |
| SystemDataAdapter | local `service_role` -> private schema function with explicit table grant | private function executed only after explicit `service_role` SELECT grant | passed locally |
| transaction pooler | local Supavisor port 54329, transaction mode | missing tenant identifier rejected; tenant-qualified session allowed `PREPARE/EXECUTE` | **not accepted** |
| migration/direct | local direct DB port 54322 | migrations applied and direct query ran as `postgres` | passed locally |

## Frozen conclusions

- User and Ops paths do not use a service credential to impersonate the owner/reviewer.
- The worker path remains private-schema plus explicit resource/table grants; a function grant alone is insufficient.
- The current local pooler does not prove the required prepared-statement prohibition. It must remain unavailable to a VisePanda client until a connection/client configuration that disables preparation is implemented and tested.
- No command was run against a remote Supabase project. The intended new remote project is not linked to the current CLI account.

## Rollback

Stop the local Supabase project and revert these probe-only migrations. They contain only local connection-probe rows and no product data.
