# Exact persistent metadata seam

Source main4f3 / actual PG17 ordered154 baseline catalog, not a new D2 module.
This is a candidate plan with real bodies in lifecycle.candidate.sql and
shared-candidates/export_private-profile_source_v1.after.sql. No shared application
file, original function, Auth trigger or product migration has been applied.

Four private tables: root singleton; fixed12 operational controls; budget generation
fences; globally unique operations. Only operations.actor_id and budget_fences.owner_id
link to Auth users. No raw question, user input, model payload, provider secret or Auth
session token is retained. Operation receipt is immutable until complete de-identification.

Existing qualified Profile core-export snapshot `operations` gains one closed union arm,
`kind=ops_control_operation/1`. It contains ownerId and the existing immutable set or
budget_resume receipt fields, WITHOUT sessionId/sessionEpoch. Only the qualified caller's
own actor_id rows are read. Former Ops membership is not required to export one's own
metadata; this gives no controls or foreign-owner budget access. Profile operations remain
their original ordered prefix; Ops operations are a UUID-sorted suffix. IDs in different
typed arms do not alias, even if the UUID bytes collide.

No snapshot envelope, module order or sourceRows field is added. `sourceRows.operations`
is the actual count of both typed operation arms, bounded with profile/watermark counts
by the original10000 rows/1000000-byte cap. Existing record_profile_provenance_v1 stores
that original operation counter; profile_source_current_v1 compares the same counter
and exact sourceDigest including the Ops arm. Existing lease/re-authentication/policy/
owner/job/sourceState/provenance fences remain. Ops mutations take owner advisory34
with try-lock after current_actor, so a qualified export's owner snapshot cannot race
silently. Metadata decoder candidate must recognize ONLY this added closed union arm;
no arbitrary JSON fallback and no fake current-session values are introduced.

Deletion uses an exact new Auth before-delete hook, AFTER existing account-erasure
authorization has reached its original Auth deletion. It de-identifies actor linkage,
input and receipt while retaining immutable operation ID/action/revision/time tombstones.
Budget fences become retired; controls and stop revisions stay in force. Existing ledger
owner/deletion restrictions are preserved. Scope before-delete retirement additionally
retires budget operation payloads. The original Profile-sensitive erase contract continues
to erase only its accepted fields; it does not gain authority to mutate operational
controls or erase someone else's costs. This package does not claim whole-account erasure
outside the original account executor or shared target acceptance.

Known settlement remains possible after a fence retires: only an existing dispatched/
pending attempt's exact immutable tuple may become settled, and its original overrun
freeze may still be written. Retirement never authorizes new reserve/dispatch/resume,
reattaches an actor, changes price/limits, or releases unknown cost.

Restore private handler is postgres-only/all ordinary+service EXECUTE revoked. Existing
K1 checks independently sealed journal recency/coverage and supplies its expected digest;
SQL cannot derive newest revocations from an old backup. Exact controls, budget generation
floors, retired operation facts and erased actor markers are validated, deduplicated and
bounded. Original budget-before-control locks are retained with NOWAIT. Reconcile calls
original stop_model_budget and sets all controls disabled with monotonic stop floors.
It never enables a provider/host, resumes a budget or returns old receipt authorization.
Only after exact installed-source checks and reconciliation does it bind readiness to
the current DB boot and sealed manifest. Missing/old boot or unknown source fails closed.
Actor/subject/scoped-key recreation cannot revive tombstones. Actual restore proof is
still UNRUN until the owned synthetic test executes it; real targets remain UNRUN.

Shared review footprint: auth.users added erasure trigger; original budget tables added
generation-version triggers; turn_private.work deferred admission constraint trigger;
13 full source replacements including two explicit service-only invoker-to-definer
changes; affected privacy schema/digest/runtime/source-count functions and the narrow
Profile snapshot decoder union. All exact before/after/owner/ACL/config/source pins must
be supplied together for current-holder review and Main's append lease.
