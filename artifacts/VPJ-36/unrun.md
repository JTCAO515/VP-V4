# VPJ-36 remaining acceptance

- Final isolated SQL deletion test passed in Privacy PostgreSQL CI run 35675303678
  on code SHA b7938c76. Local attempts remain recorded as failures; CI's disposable
  network-disabled container provided the actual successful deletion evidence.
- Full Quality PR CI/deployment status is tracked on PR #496. Missing database
  configuration or skipped broad integration tests do not become capability passes.
- Live native JWT/reauthentication + POST/worker/GET over a disposable full Supabase
  stack. SQL auth scaffolding and HTTP fixtures do not prove this integration.
- Native UI/cache eviction/lease expiration, offline old-phone observation, export,
  linked-chat deletion and other lifecycle handlers not implemented in this slice.
- Backup expiry/restore reconciliation, provider erasure and full financial retention
  acceptance remain unverified. No all-data completion or #228 closure.
