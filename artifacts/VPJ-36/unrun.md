# VPJ-36 remaining acceptance

- Final disposable SQL test: `VP_PRIVACY_DB_TEST=1 node --test tests/integration/privacy/trip-deletion.test.mjs`.
  Previous attempt hit statement timeout under host load; Overall suspended new heavy
  tests. The test owns its network-disabled container and only synthetic accounts.
- Build, broad suites, CI and final migration/runtime checks pending PR execution.
- Live native JWT/reauthentication + POST/worker/GET over a disposable full Supabase
  stack. SQL auth scaffolding and HTTP fixtures do not prove this integration.
- Native UI/cache eviction/lease expiration, offline old-phone observation, export,
  linked-chat deletion and other lifecycle handlers not implemented in this slice.
- Backup expiry/restore reconciliation, provider erasure and full financial retention
  acceptance remain unverified. No all-data completion or #228 closure.
