# Local PLAT-CONF-00 results — 2026-08-24

Local Docker Supabase only; no remote project was linked or queried.

| Probe | Command outcome |
| --- | --- |
| User JWT + RLS | authenticated owner insert returned HTTP `201`; owner query returned `1`; a second authenticated user query returned `0` |
| Ops JWT + security-invoker RPC | user with locally assigned `app_metadata.role=ops_probe` invoked the scoped RPC; result was `3` |
| System worker private schema | private function first failed without table grant; after explicit `service_role` SELECT grant it returned `3` |
| Direct maintenance path | local direct query returned `postgres|off` |
| Pooler tenant isolation | connection without tenant identifier was rejected with `ENOIDENTIFIER` |
| Pooler prepared statement | tenant-qualified test allowed `PREPARE/EXECUTE`; required prohibition is therefore not proven and remains a release blocker |

No access token, API key, database password, connection URI, user ID, or raw response is preserved in this artifact.
