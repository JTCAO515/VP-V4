# Main review request: existing notification/lifecycle owner export seam

No SQL has been authored. Candidate append-only slot `20261006010000` has no
match in the available V5 worktrees at this read. Main assigns sole SQL ownership
and rechecks the slot before any migration. This proposal is one bounded module
export seam, not a new all-account worker, backup system or account erasure engine.

## Existing source and the actual gap

- `notification_private.export_metadata_v1` (030000:523) closes the safe row
  projection to reminder/watch/dismissal/operation/device;10000+sentinel ceiling.
  It derives owner from a live `export_private.core_jobs_v1` lease, is service-only,
  and has no ordinary owner entry. No device push token or credentials are exported.
- `trip_lifecycle_export_v2` (040000:431) similarly requires service role + a live
  core lease and stores per-section progress; old completed jobs cannot enroll.
  Its Trip content comes from `privacy_core_export_v1('trip_page')`. We do not
  reinterpret a completed old artifact or send a client-supplied service lease.
- Existing projections reusable without exposing them: lifecycle
  `trip_lifecycle_private.trips_v1(owner,cursor,limit)`, original owner lock/head,
  ordinary mobile guard and reauth/session check; notification safe row shape,
  stamp/hash validators. The notification row union is currently inlined, so an
  append-only private helper with this exact closed row projection is required;
  the existing function and its privileges stay unchanged. Reuse the accepted TS
  row decoder via a new exported wrapper only after its sole original owner releases
  that precise hunk; otherwise the new seam owns an exact schema decoder.

## Closed RPC contract

Proposed new ordinary-owner RPC `privacy_coverage_module_export_v1(p_input jsonb)`;
only the new module owner HTTP path calls it using the original user's credentials.
Direct table access denied to all API roles; default RPC EXECUTE denied to
public/anon/authenticated/service_role. Fixture grant is separate from target UNRUN.
SQL derives owner/session/epoch from `auth.uid()` and existing mobile guard and
fresh sensitive-action identity; no owner/session/lease/generation claim in DTO.
Only scopes `notification-metadata/1` and `trip-lifecycle-metadata/1` are accepted.
The latter is lifecycle metadata/operations only; original Trip bodies continue in
the old core export and are explicitly not claimed here.

- Start exact input `{action:"start",requestId,scope,confirmed:true}`.
- Page exact input `{action:"page",requestId,scope,section,cursor,limit}`.
- Proof exact input `{action:"proof",requestId,scope}`.
- No delete, provider/Storage contact, user task or service lease creation.
- Notifications section=`notifications`,limit1..100,cursor=null or
  `{sourceDigest:sha256,afterKey:closed original key}`; lifecycle sections=
  `trips|operations`,limit1..50,cursor=null or `{sourceDigest:sha256,afterId:uuid}`.
- Reject unknown keys, SQL JSON null enums, foreign/deleted anchors, changed
  section/limit on replay, reordered/nonmonotonic rows and scope reuse before
  touching state. Scope/version changes require a new user-confirmed request.

Start response exact
`{schemaVersion:"coverage-module-export/1",kind:"started",requestId,scope,ownerId,sessionId,mobileEpoch,sourceDigest,capturedAt,expiresAt,sections,limits,allUserDataCompleted:false}`.
limits exact `{pageSize,maxPages,maxRows,maxBytes}`;notifications100/100/10000/1000000;
lifecycle50/400/20000/1000000 (max10000 per section).capturedAt/expiresAt epoch ms,
fixed absolute30s TTL, never extended by retries. SourceDigest includes schema,
scope, request, owner, current session/epoch and both source sections; no source
body is stored in the progress table. Cap is checked using a sentinel before
hashing/returning data. The start boundary has no artifact/download receipt.

Page response exact
`{schemaVersion:"coverage-module-export/1",kind:"page",requestId,scope,ownerId,sessionId,mobileEpoch,sourceDigest,section,items,hasMore,nextCursor,sectionComplete,pageNumber,capturedAt,expiresAt,allUserDataCompleted:false}`.
Rows are the existing closed notification metadata schema or exact lifecycle
Trip projection / source-free operation receipt metadata schema. Lifecycle title
is existing owner source; no new question/provider/source content added.
SQL re-proves owner/current session/epoch/TTL/sourceDigest for every page/proof;
source change returns typed `COVERAGE_SOURCE_CHANGED`, never partial data as success.
Keyset anchor must exist in this owner/section/digest. Track per-section lastCursor,
lastLimit,nextCursor,terminal,pages,rows; exact retry of the last page returns its
same projection without double-counting, a skipped/reordered cursor fails.

Proof response exact
`{schemaVersion:"coverage-module-export/1",kind:"proof",requestId,scope,ownerId,sessionId,mobileEpoch,sourceDigest,coverage:"complete"|"partial",pages,rows,capturedAt,expiresAt,allUserDataCompleted:false}`.
coverage complete only when every section has traversed from null to terminal on
the same sourceDigest. Source/current authority/TTL/caps must be checked again.
TS independently validates every row, count, monotonic cursor and exact start
binding; it calls proof only after its own complete traversal, compares SQL counts,
enforces aggregate1MB, and returns an owner-scoped bundle with exact section arrays.
Native decoder validates that version/digest/actor/epoch/TTL/bounded body before
presenting export success. Lost source/proof ACK is unavailable, never complete;
same request can continue only with its original binding and remaining absolute TTL.

## State and authority bounds

Reuse privacy owner/source locking order with NOWAIT, authority before UUID lookup
or source/version feedback. Request key globally unique; foreign reuse returns the
same forbidden/not-found shape as unknown; same-owner different scope conflicts.
Mobile session/epoch replacement or deleted source makes old progress unusable.
FK owner delete cascades the progress;expired source-free progress cleanup only.
Keep tombstones, operation fences and minimum audits according to original modules.
No consent override, role spoofing, service-role impersonation or `set_config` JWT.
No new default grants, deployment, flags, real data operation or provider budget.

Notification deletion is explicitly NOT part of this export-only seam. Existing
`notification_private.delete_for_trip_v1` requires separately authorized original
Trip-deletion orchestration; device registrations are another scope. Catalog keeps
delete unavailable until that exact selected scope has an accepted callable handler.
Lifecycle deletion remains selected original Trip handler; no archive/account sweep.
ALL2 restore/offline/device races remain independently UNRUN.

Necessary owned fixture checks: direct RPC invalid JSON null/keys/foreign owner,
default ACL unchanged vs fixture grants, session replacement/expiry/source changes,
same request changed scope, first/last/replayed/skipped page and proof count,
capacity no silent truncation, removed anchor, rollback and core worker/artifact
source/ACL unchanged. Existing stronger unchanged checks are reused; no invented
target enrollment from fixture grants. Sole SQL owner hands off fixed sources to
this integrator for one PR.
