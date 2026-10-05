# VPJ-58 selected coverage progress metadata exit

The ordinary Native owner can discover their collector request/fence records,
explicitly select up to20 records, inspect all persisted metadata and retained
fences, export a bounded metadata bundle or clear the selected transient progress.
Historical/expired collector metadata does not renew its original request. The
original immutable request fences continue until their original session/account
is revoked. Notification/lifecycle source data remains in its existing domains.

The sole producer contract is [WIRE](../../lib/server/privacy/coverage-progress/WIRE.md).
The new [owner HTTP boundary](../../lib/server/privacy/coverage-progress/http.ts)
uses current owner/session/epoch and original sensitive-action reauthentication;
its API is `/api/privacy/native/v1/coverage-progress`. Client DTOs cannot supply an
actor, service lease or RPC. Runtime is local-only, disabled unless explicitly
configured. Default database EXECUTE/table/schema denial is independent of owned
fixture grants; no target enrollment or permissions are granted by this change.

Every response has `allUserDataCompleted:false`. The [existing coverage catalog](../../lib/server/privacy/coverage/catalog.ts)
keeps all34 server/device/external IDs and upgrades only `coverage_progress` to
`coverage-progress-data/1` in catalog `.5`. Original `.4` packages cannot be
promoted. Its [registered caller/outcome](../../lib/server/privacy/coverage-progress/coverage.ts)
correlates the exact selection, request bytes, current authority, TTL and independent
proof before reporting selected completion in the mother coverage result.

New exit state is also discoverable in this module: flat selected UUIDs,
source/preview/request hashes, decision/time/effects and source-free page counters.
Export includes every persisted field; selected cleanup removes page progress and
retains minimal replay bindings/receipts. It never recursively stores/export-follows
previous selected row bundles. Inventory reads create no persistent list state.

Confirmation applies only to the reviewed selected transients. Original collector
requests/sections may be cleared while their original fences stay unchanged; new
exit bindings/decisions remain, and their selected page counters can be cleared.
Known erase recovery returns the immutable receipt with the exact original byte
hash under current authority, even after preview expiry. Foreign/absent recovery
returns the same unknown shape. Missing/invalid ACK remains unknown and does not
trigger an automatic destructive replay.

Delivery, evidence and boundaries are separate: a validated server bundle is not
an already delivered Native file. The Native consumer owns consent/private-file
creation/verification/cleanup. External downloads are not erased; source modules,
original session/account fence cleanup, D2 artifacts/worker, business results and
all-account operations retain their accepted semantics. Whole #239 ALL1 missing
domains and ALL2 restore/old-device/account acceptance remain OPEN/UNRUN.
