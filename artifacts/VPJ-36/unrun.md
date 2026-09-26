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

## D1 status after 2026-09-26 continuation

The earlier native UI/cache item above is historical: the D1 Trip screen and
Keychain recovery path are now implemented and passed a Simulator state test.
The synthetic local GoTrue JWT→Next HTTP→worker→DB→GET chain passed in a
disposable full stack. The following remain UNRUN for #504/#228:

- Shared Staging migration, bounded worker activation, real owner JWT and
  deployed HTTP/readback. No shared or Production deletion was performed.
- Physical iPhone display/accessibility and a real old phone staying offline,
  reconnecting and clearing every relevant feature cache. The Simulator test
  injects an offline status failure; it does not prove another device's lease
  expiration or a background purge.
- Provider copies, backup expiry and restore re-erasure; linked-chat Trip
  deletion, export and all-account deletion remain later slices. The single
  Trip executor cannot complete an all-user-data request.
- Independent review and PR CI on the final SHA. A broad security suite still
  has one unrelated gated AI-14 skip; the affected privacy security case passed.
