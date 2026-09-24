# VPJ-57 — CaseRequest and task-scoped AccessGrant

Related to #222. Local development slice; no acceptance, dispatch, capacity or response-time promise. Native Profile → Travel support records general support or a specific travel execution problem. Ordinary planning is not routed to staff.

## Boundary

`POST /api/service-cases/native/v1` accepts native v2 credentials and forwards to `service_case_v1`. It requires the existing local identity configuration plus `SERVICE_CASES_LOCAL=1`; deployed/Staging targets remain disabled. Ordinary authenticated database callers use the same RPC authorization. Private tables have RLS and no client table/schema privileges. No service-role runtime reads.

The separate, operator-provisioned `service_cases_private.staff` directory starts empty. Knowledge-review membership does not confer customer access. Only explicit active staff can be named; user metadata never grants a role. This PR provisions synthetic staff only in a unique disposable stack. Real roles need the existing account permission authorization.

## Protocol

- `list`: optional integer `offset`, pages of 50 owner-only requests, plus available staff labels/IDs. Native exposes subsequent pages.
- `create`: client UUID `caseId`, category `general|transport|accommodation|on_trip`, `problem` (1–1000 characters). Same ID and same content are idempotent; different content conflicts. Owner inferred from live identity. Response always `status=requested, accepted=false`.
- `grant`: `caseId`, `expectedRevision`, `recipientId`, `durationMinutes` (15, 60 or 1440), exact `sharedFields=["problem"]`. Preview displays the exact saved problem, recipient and duration before confirmation. No Trip, profile, contact, chat or Brief projection.
- `revoke`: `caseId`, `expectedRevision`. Revision increments atomically with audit. This fences delayed grant attempts, including stale retries after revocation.
- `read`: staff caller supplies `caseId` and `expectedRevision`. Returns only problem plus case/grant/expiry/request-status metadata. Every read checks current staff membership, live session, recipient, revision, revocation and server-clock expiry. No employee inbox or dispatch is implemented; VPJ-32 consumes this seam later.

A shared case row lock serializes employee reads and grant changes. After revocation/replacement commits, subsequent reads deny old authority. Information already read cannot be remotely erased. Changing employee requires a new owner-confirmed grant, immediately fencing the former employee.

## Lifecycle and rollback

Owner deletion cascades cases and audit. Staff deletion removes directory membership, so retained recipient IDs confer no access. Future #228 export/deletion handler must export owner cases plus grant/audit metadata and delete owner cases (cascading audit), without deleting unrelated staff/owners or replaying old grants. No dependency on its in-flight implementation.

Disable the local route flag or revert client/API code to roll back capability. Keep this append-only migration and stored revocations; do not restore revoked grants from old receipts/backups. An operator may revoke execute on the new public RPC to disable direct access. Shared Staging migration, real employees, native device interaction/accessibility and full VPJ-31/32 integration remain separate acceptance.
