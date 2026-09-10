# VPJ-02 Staging verification and frozen26→33 preparation

Related to #189; parent remains OPEN. Latest scoped read-only observation confirms the selected
VP - V4 Singapore Staging still has26 version/name-matched migrations. It has3 Auth/2 Trip records;
this preparation never reads their contents or mutates them.

The migration27 inventory prerequisite currently fails:15 frozen source hashes match, but three
additional authenticated-executable public definer functions produce an18-function inventory.
The [upgrade runbook](../runbooks/staging-26-to-33.md) owns exact evidence, narrowly guarded pre27
permission-normalization/rollback SQL, frozen33-file packaging, caller order and failure boundaries.
All existing migration bytes remain unchanged; no history repair or broadened inventory is allowed.

The [local rehearsal](../../artifacts/VPJ-02/staging-33-preparation/verification.md) uses only fresh
network-isolated synthetic PostgreSQL containers. It proves logical backup restore, unchanged27
rejection/transaction rollback, precise administrative normalization and data-preserving26→33 on
source and restored instances. Minimal Auth SQL fixtures do not establish real GoTrue/JWT, device,
worker, direct-host or remote upgrade acceptance.

Remote authorization must name the exact target, three-function permission normalization,
seven migrations, maintenance/caller cutover, backup and bounded validation/cleanup. No provider,
text policy, new account role or production action is enabled by this package. Native remote
configuration remains a separate implementation frontier; Web must use v2 after database28.
