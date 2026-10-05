# VPJ-32 — human service operations

Owner Issue: [#224](https://github.com/JTCAO515/VP-V4/issues/224), accepted S1/S2.
The existing #222 Case request and explicit recipient grant remain the authority for sharing only the problem. No qualifying Brief or attachment producer exists in this baseline; both remain unavailable. A staff member receives no Trip context or Proposal access.

## Runtime surfaces

| Surface | Endpoint | Authority |
| --- | --- | --- |
| Native service progress | POST `/api/service-cases/native/operations/v1` | Verified ordinary owner JWT, current native session, owned Case |
| Staff workspace | `/ops/service`, POST `/api/ops/service-cases/v1` | Same-origin verified SSR cookie, expected actor/session, real service member/shift/slot and current recipient grant |
| Explicit owner service data | POST `/api/service-cases/native/data/v1` | Separate verified owner/session, confirmed request, original byte identity |

Transport activation is local-only and defaults off: `SERVICE_CASE_OPERATIONS_LOCAL=1` or independently `SERVICE_CASE_DATA_LOCAL=1`, plus the established native local-session configuration. Business operations also require the database settings switch. Every new public SQL RPC has denied default ACLs, and staffing/qualification/slots are empty. Activating a target, enrolling a staff member, applying a real permission grant or contacting a supplier is a separate authorized action. No target was activated.

## Commands and states

The closed wire is defined by `lib/server/service-cases/operations/contract.ts` and `data-contract.ts`. Request/revision/grant revisions are checked by the SQL transaction. Case, staff/shift and capacity locks serialize concurrent actions and legacy grant withdrawal. Only the current named recipient with an active service qualification, shift and slot can accept.

`queued → accepted → assigned → waiting_external → resolved | unresolved` is authoritative. Assigned cases can finish directly. Explicit owner cancellation or source withdrawal terminates unfinished work and releases capacity. Terminal service states remain accurate; archival does not delete unfinished service. No assignee or ETA is invented while queued. Real acceptance/shift timestamps are not an ETA.

Evidence types remain distinct: `tutorial`, `contacted_provider`, `external_resolution`. Contact alone cannot mark resolved; tutorial completion does not establish external resolution. Staff record only observed work intervals, with future/overlapping/out-of-shift intervals rejected. `manualMinutesScope=recorded_only` reports registered time only; actual total effort and costs remain unknown.

Trip binding is explicit, owned and current, including canonical initial head version zero. Staff updates must have `proposal:null`. The owner may explicitly associate an existing original pending Proposal after owner/head/currentness/digest qualification. Review opens its original diff and confirmation writer; service operations never create a patch, confirm a Proposal, book, refund or contact a supplier. A changed Trip head invalidates the old current reference instead of silently rebinding it.

Emergency and unavailable-capacity messaging directs the traveler to local official services and their original supplier's support. The mainland numbers displayed in Native match [the Shanghai government emergency hotlines](https://english.shanghai.gov.cn/en-EmergencyNumbers/20240104/8eec5a3d2b864187af8f383cc6b94ae5.html), checked 2026-10-05.

## Recovery and data lifecycle

Operation ID, caller/session/surface and SHA256 of original UTF-8 bytes identify a mutation. Exact replay returns the original receipt; changed bytes conflict. `read_operation` does not execute another mutation. An absent receipt does not prove nonexecution. `abandon` fences an unexecuted original command or returns its already applied receipt, without Undo. Fresh qualification precedes every staff read/replay and the HTTP reply. Grant withdrawal, replacement, TTL and account/session changes prevent stale body/receipt access. Erased receipts return an explicit minimal tombstone error; this never proves cancellation.

The Native secure journal retains original bytes. The staff browser stores only recovery metadata and keeps raw bytes in memory until its original freshness/grant/session/shift deadline. Page exit and authority loss clear sensitive state while retaining an unresolved marker. Reads expire from request start within 30 seconds; delayed responses do not renew freshness.

Confirmed owner deletion uses the independent data family and a permanent minimal digest-bound `deleted` or pre-apply `cancelled` receipt. It cascades the Case's service/grant/minute/evidence data and removes sensitive operation references. Recovery remains available after Case deletion and when business operations are disabled. Another caller/session cannot recover it or replay old authority. No real user's data was deleted.

Explicit export serves a real downloadable `service-case-data/1` companion JSON after two matching source snapshots and final current owner/session validation. It includes closed safe columns for Case, grant audit, service, recorded minutes, service audit and operation records, bounded by 10,000 rows and 512 KiB. Source changes/deletion, changed identity or expiry suppress the download. Brief/attachments remain unavailable, `corePackageEnrollment=not_enrolled`, and `allUserDataCompleted=false`. The original core export package and exact-lease service source enrollment remain independent and unchanged. Source qualification does not count as artifact delivery.

Native creates a separately digested temporary file only after the scoped download, with at most 30-second lifetime, explicit user sharing and controlled cleanup. Copies already obtained by a recipient cannot be recalled. No real account export or external share was performed.

## Evidence and rollback

See `artifacts/VPJ-32/verification.md` and the original SQL/Native/Ops evidence linked there. Local fixture qualification is explicitly separate from default ACL denial and target activation. Target deployment, real staff/provider actions, physical device/accessibility, real costs and complete product acceptance remain unrun.

Rollback is a normal source revert with unresolved device journals preserved for safe recovery. The append-only migration's disposable transaction rollback/replay is tested; it was not applied to any real target. Do not delete an applied target migration or discard an unconfirmed operation as a rollback shortcut.
