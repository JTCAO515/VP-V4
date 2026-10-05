# VPJ-58 selected data coverage

`GET/POST /api/privacy/native/v1/coverage` uses schema `data-coverage/1` and
catalog `data-coverage-catalog/2026-10-06.2`. The machine-readable
[`MODULE_CATALOG`](../../lib/server/privacy/coverage/catalog.ts) permanently names
31 current server/device/external domains. Unknown, unavailable and unimplemented
domains remain in the denominator. A scoped receipt never completes an account,
and every response has `allUserDataCompleted=false`.

The exact [wire](../../lib/server/privacy/coverage/WIRE.md) binds current actor,
session, mobile epoch, catalog/module version, selected original object/command,
operation and SHA256 of this outer request's actual UTF8 bytes. Only a closed
module/action/phase is accepted. Client endpoints/RPCs, service leases/owners,
device proofs and unknown fields are rejected. GET requires current identity;
POST additionally requires explicit confirmation and current scope before and
after the real original owner handler. Default server configuration is disabled;
the only enabled configuration is the existing local Native session plus
`DATA_COVERAGE_LOCAL=1`, without a deployed environment. Existing module flags,
SQL ACL, RLS, consent, CAS, reauthentication, TTL and source authority still apply.

## Registered caller/result paths

| Module | Actual dispatch/result consumer | Completion boundary |
| --- | --- | --- |
| Trip, conversations, results, Profile, Memory, Turn, user artifact, entitlements export | Original `coreExportHTTP` request/read; original `parseExportJob` | Queued/running remain queued. Ready core receipt is partial/`PROTECTED_DOWNLOAD_REQUIRED`; original ticket/download/digest/file consumer must prove delivery. Its fixed nine-module artifact is unchanged. |
| Selected Trip and archived Trip deletion | Original `tripDeletionHTTP` or linked plan/confirm/read | Exact Trip/request/plan/scopeDigest/selection and immutable original receipt; queued is not completed. |
| Selected Memory deletion | Original preview/confirm/read with source receipt/revision and exact original selection | Source tombstone with cleanup pending remains queued; only original completed cleanup receipt can complete selected scope. |
| Brief/Case | Original owner bundle export and selected delete/read-operation | Original closed schemas, double sourceDigest read,512KiB/10000-row cap,30s expiry and exact bytes/grant/revision. Attachments remain unavailable. |
| UGC, safety and publication | Original Native handler and its strict decode/matches contract | Own scoped export/delete only; operation recovery sends original mutationBytes and same operation. Absent/abandoned/malformed/unknown ACK cannot complete. |
| Guide | Original owner HTTP/service and selected Trip/reference/locale/interest parser/decoder | Selection metadata only. Source/use unavailable stays unavailable. Forget has no durable operation recovery; it is never replayed automatically as recovery. |
| Notifications/lifecycle metadata export | New ordinary owner start/page/proof RPC and bounded collector | Every page begins at null, maintains monotonic keys and exact scope/source/session/epoch/30s clock, then independently matches terminal proof/counts. Source/proof is preparation for the Native protected file delivery. |
| Device materials/AppGroup/local share/Guide cache/offline/local journals | Original selected Native consumer | Server accepts no caller-supplied device completion. Exact local verified receipts and cleanup remain distinct from server/global deletion. |
| Orders/PDF/attachments and external providers/backups/copies/financial retention | Honest missing/boundary entries | No invented handler, external erasure, copied-file recall or financial deletion. |

## Independent owner source export

The new append-only migration owns `privacy_coverage_module_export_v1(jsonb)`;
its default API-role EXECUTE is denied. It derives owner/live session/epoch and
the existing sensitive-action reauthentication from SQL authority. It never
creates or accepts an old core service lease, changes a core job/artifact/worker,
calls a provider/Storage or deletes source data. Lifecycle scope is
`trip-lifecycle-metadata/1`, excluding original Trip content.

Source-free `coverage_export_private.requests_v1` and `sections_v1` retain
request binding/source digest/absolute30s time and cursor/count/proof progress.
Expired progress is cleaned only by a freshly authorized own request after source
validation. `request_fences_v1` retains only request UUID/owner/session/scope/expiry
until original session/account revocation so expired keys cannot renew their TTL.
All three tables have RLS and no direct API grants, with owner/session cascades.
The catalog's `coverage_progress` entry explicitly describes this domain and its
single-request receipt export boundary. Full owner progress inventory exit is
unimplemented, never implied by one successful source bundle.

Both SQL and TS enforce source sentinels and1MB caps. TS also independently
decodes every original closed row, rejects hidden/new fields, verifies source
revision, ordered cursor continuation, section/total counts, terminal pages and
the final same-binding proof. Native must verify that same owner/epoch/version/
operation/TTL and protect/clear the delivered local file. Notification deletion
remains unavailable; lifecycle deletion remains selected original Trip deletion.

## Recovery and limits

Delete recovery preserves original operation and raw module bytes; only the
outer phase and its own request digest change. Source mutation, session/epoch,
selection/scope or catalog change cannot silently upgrade an old request or core
package. An uncertain or absent ACK keeps its original pending identity; starting
a flow or returning202 never proves deletion. A changed JSONB object key order
does not change an otherwise identical selected array set, while changed selected
IDs always fail matching. Export continuation/proof failure or absolute expiry
returns unavailable; retries cannot create a new generation or extend a clock.

External copies cannot be recalled. Financial minimum records/fences and provider
or backup retention remain their original explicit boundaries, with unknowns
preserved. ALL2 concurrent creation/publication/notification, backup restore,
offline old devices and target/device/human acceptance remain separate UNRUN.
No all-user-data or Beta/full-isolation acceptance follows from this source.

Rollback of this code removes the new endpoint/registry/consumer only. The new
SQL seam's isolated rollback drops its new RPC/private schema; the owned tests
verify original schemas/data/ACL stay unchanged. Applied remote migration rollback,
target grants/enrollment and production activation require their separate scope.
