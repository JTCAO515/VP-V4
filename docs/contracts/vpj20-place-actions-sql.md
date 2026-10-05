# #365 Place actions SQL

Base `2ce730eccb9a7e94f813768b89be45ebba98ee2a`. Append-only migration
`20261005010000_vpj20_place_actions.sql`; sole SQL writer. TS owns the combined
#365 PR and runnable registry. No target activation or permission enrollment.

`read_place_action_context_v1(p_trip uuid,p_input jsonb)` and
`execute_place_action_v1(p_trip uuid,p_input jsonb)` are SECURITY DEFINER with an
empty search path and UTC. PUBLIC, anon, authenticated and service_role have
no EXECUTE permission on either RPC or any private helper, and no private
schema/table access. RLS has no ordinary policies. The authenticated actor
must have a real Auth user/session, non-anonymous claims, existing mobile guard,
and current native v2 session/attempt epoch when enrolled; ordinary Web sessions
remain valid. These checks apply to history, absent receipts and abandon.

Inputs use the fixed TS contract: lowercase version 1–5 variant UUIDs, int32
integral versions, exact selection (canonical UUID, amap/tencent, provider ID
bounded to 128 UTF16 units), no unknown fields, strict calendar timestamps with
seconds, 1–3 fractional digits, Z or offsets at most 14:00, and positive windows
at most 24 hours. JSONB integral `1` and `1.0` compare equally. Unicode is not
normalized; PostgreSQL JSON rejects NUL and unpaired surrogates. Digests are
opaque server UTF8 SHA256 of JSONB text, never recomputed by clients. Every
request replay additionally compares the entire original JSONB and Trip ID.

Context returns the fixed 14 fields including snapshot, canonical display title,
referenceId, saved state, sourceCandidates and sourceCandidatesStatus. Context
digest binds owner/session, exact identity/mapping, snapshot, reference, saved
state and qualified candidates, excluding clocks. Validity is at most 30 seconds
and bounded by every included fact expiry. The old snapshot's timestamp format
is normalized to UTC Z in this new reader only, preserving the same instant.
At most 100 references/days, 500 items and 24 source candidates are admitted.

Mapping uses existing canonical/provider identity rows, with SHARE locks and a
digest of identity, mapping ID/time and canonical names. Supplier raw names,
body, geometry and secrets are never copied. Knowledge candidates reuse the
original approved entity mapping, mapping_basis/claim_basis/typed_claim and
locale qualification; no new source, inferred match or route qualification is
minted. Disabled knowledge publication or capacity returns unavailable; a real
qualified scan with no candidate returns complete and an empty list.

Save/unsave CAS updates only saved_places, unique by owner/Trip/canonical. Save
reuses the oldest canonical reference or creates one below capacity. Unsave
compares the exact saved reference, revision and original saved mapping digest,
even if current mapping has changed or disappeared; it never deletes a reference
used by support or traffic. New mutation requires active, undeleted owned Trip
and exact head. Add creates a reference without saving, requires an existing day
and new item ID, and calls the original create_trip_proposal_patch with exactly
one upsert_item using canonical title and the explicit user window. It never
confirms or applies a Trip. No evidence of whole-plan feasibility is implied.

The owner/operation advisory lock precedes Trip/map/sidecar locks. Operations
have a unique owner/operation key, complete metadata-only original request,
request digest and immutable frozen receipt. Same exact operation returns its
historical receipt before current head/map/archive checks; changed Trip, action,
identity, time, locale or any field gives IDEMPOTENCY_KEY_REUSE. Proposal and
receipt commit together. Unknown ACK never authorizes an automatic new operation.

`{action:receipt,request:originalMutation}` only reads its exact operation. Absent
returns receipt_absent, which does not prove nonexecution. `{action:abandon,
request:originalMutation}` under the same lock returns an existing success or
atomically inserts a cancelled-before-apply fence. Cancelled terminal is exactly
`{kind:place_action_cancelled,tripId,operationId,action,selection,tripVersion,
 mappingDigest,requestDigest,
historicalOnly:true,currentEligibilityRequiresRead:true}`. Subsequent receipt,
execute or abandon returns it. Archive may abandon a still-missing operation;
it cannot create a product effect. Cancellation never reverses an earlier Save,
Proposal, confirmed Trip or external order. Clients release pending state only
from a matching authoritative terminal. Cross-owner/invalid session cannot mint
or recover a terminal.

Trip and account deletion cascade both private tables. The separately versioned
private export_metadata_v1 derives owner from the original live export job and
exact lease/generation. Bounded metadata pages bind all saved/operation rows to
sourceRevision; a changed source rejects the cursor. It has no grant or executor
enrollment, returns allUserDataCompleted=false, and does not change the accepted
core-export-d2/1 scope, prior partial artifacts or existing module inventory.
Rollback disables new RPC/consumer activation and preserves confirmed history.

Local validation: `VP_PLACE_ACTION_DB_TEST=1 node --test
 tests/integration/explore/place-actions-postgres.test.mjs` uses a disposable
network-none PostgreSQL 17 container, synthetic roles, claims and fixture-only
grants. This is SQL/Auth-table protocol evidence, not real GoTrue/JWT, target
permissions, provider, export delivery, physical device or user acceptance.

Validation result on the final runtime: **PASS 15/15, 0 skipped** (16.53 seconds),
including full main migration replay, transactional rollback of this append,
default ACL/RLS denial, source review/publication/mapping and withdrawal,
CAS/replay/proposal atomicity, abandon concurrency, deletion and export lease.
Docs check, test syntax and diff check also PASS. Initial same-session native
epoch drift was a genuine failed negative: the original mobile guard accepts
that drift. This new actor now also verifies current enrolled native session and
its original attempt epoch; the unchanged negative passes. Initial fixture
archive-required fields and Auth role claim omissions were corrected separately.
Real GoTrue/JWT, target deployment/permissions, provider/routes, export delivery,
and device/human acceptance remain **UNRUN**; no target operation was attempted.

Same-task saved reentry delta: the original read_place_action_context_v1 accepts
`{action:saved,expectedTripVersion,locale,limit,cursor}`. Limit is an integer
1–100; cursor is null or `{contextDigest,afterCanonicalPoiId}`. The closed reply
has `{kind:saved_place_actions,tripId,tripVersion,contextDigest,items,hasMore,
nextCursor}`. Each item has `{referenceId,revision,status:saved,selection,
mappingDigest,displayTitle,mappingStatus:current|changed|unavailable}`. A page is
complete only when hasMore=false and nextCursor=null. Cursor binds the entire
saved inventory, live mapping metadata, current Trip head, locale and actor;
drift is unavailable/MAPPING_CHANGED, never a mixed-version continuation.
Owner/session, exact head and original archive/deletion domain restrictions
remain. The scan is bounded at 10,000 saved rows; overflow is CAPACITY.

Save/resave now stores the exact original selection on the sidecar. Reentry
returns that saved identity and original mapping digest even when current mapping
has been changed or withdrawn, with a canonical metadata label or null. Unsave
uses that precise identity/reference/revision/digest without requiring a current
provider mapping. No missing mapping filters out a save. Unsaved rows remain
historical and are omitted from the current saved list. The private version-1
export seam, still unpublished and unenrolled, includes the stored selection.
No third public RPC, additional permission object or new grant was added.

Delta validation: **PASS 3/3, 0 skipped** in 8.44 seconds, using
`VP_PLACE_ACTION_DB_TEST=1 node --test --test-name-pattern='saved reload|saved
pages|saved metadata export' tests/integration/explore/place-actions-postgres.test.mjs`.
This replayed current migrations and tested the saved reentry/withdrawn-unsave,
paging and identity updates, owner/session negatives and changed export metadata.
The previous 15 affected tests were not rerun; their evidence is reused for the
unchanged behavior. Target and real service acceptance remain UNRUN.
