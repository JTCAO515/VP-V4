# ProfileData sole source wire / VPJ-58 #239

Base bdb92b2b7dabf64b4d89fee1b657dcf06998dded. Sole TS/integrator owns
lib/server/privacy/profile-data/**, app/api/privacy/native/v1/profile-data/**,
tests/integration/privacy/profile-data/**. No SQL permission. SQL assignment only
after Main's complete wire/source review and unused migration-slot audit. Shared
writer/catalog/Native/CI hunks require actual prior-owner release + Main lease.
ResultData is an independent active writer; its files/evidence are untouched.

One visible result: an ordinary owner explicitly selects their whole saved
Profile, sees all seven preference fields and the original pace request/Undo,
confirms exact source within fixed30s, clears those saved values/revokes pace,
and obtains an immutable actual receipt or exact-original-bytes recovery. Account,
Auth/session, explicit Memory, confirmed Trip/history, financial/provider and
other domains stay under original controls. This is neither #199 Memory nor
account deletion. Full-account allUserDataCompleted is always false.

## Source and reverse graph audited on the fixed base

| Source / entry | Actual behavior | Consequence for this executor |
| --- | --- | --- |
| public.user_profiles / 20260828200000 + 20260909033302 | owner_id PK, seven saved fields, original NOT NULL enum/time defaults; service-role row write ACL, owner-only authenticated SELECT | retain row/owner/created_at; overwrite sensitive saved values with declared system fallback values, clear display_name; no default becomes consent |
| save_user_profile(7 arguments) / Web app/api/profile -> identity/user-data-adapter + ProfileWorkspace | authenticated explicit full-form save; no version binding; updates timestamp; pace change invokes legacy invalidation | precise additive CAS upgrade described below; unversioned delayed requests cannot cross a deletion floor |
| native_travel_pace_v1 / memory/native-http + lib/server/memory/travel-pace | real mobile session/epoch lock, save/pause/revoke/undo, expectedRevision, last operation/request, Undo before-value; idempotence check precedes revision check | clear pace_request/pace_undo/notice/operation, set revoked, increment retained pace revision; old exact requests fail CAS, Undo has no old source |
| native_task_travel_pace_v1 / NativeTaskTravelPaceReader | explicit current input overrides; saved only with state=explicit+notice; optional expectedSourceRevision | default balanced is never a newly consented profile projection; old expected revision stale |
| nativeIdentityHTTP action profile / original native identity profile GET | current ordinary owner session, selects owner_id/display_name only | read sees NULL name after clear, keep original response wire and login/session |
| NativeTravelPaceStore / NativeVPTravelPaceStore | pending same command retry only; read clears older pending/toast by monotonically newer revision; scope before/after await; local saved projection bound to revision/op | Native deletion success must additionally invalidate matching Profile/pace projection generation; do not rewrite unrelated explicit intake or Memory |
| service_brief_private.profile_field / 20261005060000 | only explicit pace; field source kind profile_pace, owner UUID/revision/op/update/full-row hash; sources.profilePace boolean | enumerate actual owned previews and shared Brief case IDs with profilePace=true; original user_profiles BEFORE trigger invalidates these cases |
| service_brief_private.source_changed -> invalidate -> erase | shared Brief revision++ state=invalidated, clears sources/selected keys; deletes all previews in affected Case; clears original operations bytes/receipt; preserves minimal audit/Case/recipient grant | allow exactly original invalidation side effects; receipt lists affected case IDs, retainedCopies.briefPreviews/sharedBriefs empty; do not separately cascade Case or mixed fields |
| scoped_edit_private.contexts_v1.source_basis / 20261005020000 | exact source_v1 hash includes recovery.profile_v1 (state/notice/pace/revision/updatedAt); contexts embed Trip and multiple independent sources | enumerate owner context IDs; retain complete mixed contexts and operations/lineage; new current_v1 and proposal confirm compare current source, so old candidates become stale |
| scoped_edit_private.work_v1 -> turn_private.work + text_content/dispatches/destinations | reads/authorize reserve-dispatch-publish/record output/complete/recover requalify service_current_v1 and worker_source_v1; profile passed to model only allow_profile; account lock precedes source comparison | enumerate exact owner work/turn IDs by contexts; active leased source use blocks clear with ACTIVE_PROFILE_USE, immutable completed copies retained; ordinary existing worker locks serialize terminal publication vs Profile update; never clear budget/provider records |
| recovery_private.contexts_v1.profile_basis / 20261004030000 | explicit pace + present/update/revision/state/notice; immutable context also contains Trip snapshot/orders/traffic; submit/read pending/confirm compare profile_basis | enumerate owner contexts, retain mixed rows/operations/proofs/lineage; source changes make old proposal stale; Trip confirm rule unchanged |
| core export export-worker/export-modules / 20261003170000 | CORE_EXPORT_MODULES names profile, but actual worker only registers conversations/results/trip/memory/entitlements; profile is HANDLER_MISSING, no current Profile source exporter | preserve catalog core export, do not claim Profile export complete or add a new exporter in this task; inventory owner core_jobs/artifacts/tickets with actual modules profile pages/rows >0 (legacy/custom copies); CORE_EXPORT_COPY blocks opaque mixed artifact, no shared artifact deletion. Active unknown/custom Profile exporter = SOURCE_UNSUPPORTED. Existing missing-handler jobs are not falsely labelled Profile copies |
| original assistant intake/planning-v2 | explicitly confirmed current-goal intake pace, not account Profile; execution profileId is worker config, not user_profiles | preserve these records; no broad JSON-text match on word profile or pace |
| feasibility/native-http -> planPreferenceContext / today/recovery/http | getUserProfile double-read before response; feasibility previously treated fallback pace/currency/departure as current saved hints; recovery accepts pace only matching lawful SQL basis | new saved-field mask suppresses cleared fallback hints under exact lease; retain independent needs, Trip source and temporary already delivered client copies; no new DB body source |
| explicit Memory, Trip/history/proposals, financial/provider, other modules | independent authority; no owned FK cascade from Profile | retain and compare exact snapshots in real SQL integration; no cross-domain erasure |

Complete sourceDigest includes entire selected profile row (including timestamps,
all pace management JSON), permanent owner watermark and complete qualified
reverse inventory/full row fingerprints; Brief original operations/audit/previews,
scoped contexts/work/publication rows, recovery contexts/operations/lineage and
known core job/artifact/ticket metadata changes are CAS inputs. No mere count hash,
last updatedAt heuristic, ignored expired copy or quantity truncation. Whole
10000+sentinel and1MB fail closed. Related row with foreign owner/unknown shape or
unqualified source is SOURCE_UNSUPPORTED; never leak foreign IDs/content. Actual
PG source audit must check this map against catalog and join every edge under lock.

## Closed public wire, same producer for TS/SQL/Native

POST /api/privacy/native/v1/profile-data, application/json, bearer only,
no Cookie/Origin/query, no service credential. Default local-disabled until
DATA_PROFILE_DATA_LOCAL=1 + original permitted local config; no Vercel activation.
RPC privacy_profile_data_v1(p_action text,p_input_bytes text,p_expected_epoch bigint).
PUBLIC/anon/authenticated/service_role EXECUTE default denied; owned disposable
fixture may grant only authenticated then revoke on cleanup. Private schema/table
ACLs default denied + RLS. No target grant implied.

Commands are EXACT parseProfileCommand keys. Identifiers lowercase UUID, hashes
lowercase SHA256, natural integer safe revisions <=9007199254740990. S={scope,
requestId,profileId,objectIds}. Sensitive scope profile-sensitive-data/1:
profileId=actual auth.uid, objectIds=[]; progress profile-delete-progress/1:
profileId=null, 1..20 sorted unique existing owned request IDs excluding own ID.
List={action:list,scope,cursor:null|{sourceDigest,afterId},limit:20}.
Preview={action:preview,...S}. Erase={action:erase,...S,sourceDigest,previewDigest,
confirmed:true}. Recover={action:recover,...S,mutationBytes:ORIGINAL_ERASE_UTF8}.
Recover reparses ORIGINAL erase and same S; never nested recovery/new mutation.
8192 bytes normal,16384 recover; mutation must fit eventual recovery wrapper.

B exact bindingKeys in contract.ts = schemaVersion:profile-data/1,...S,ownerId,
sessionId,mobileEpoch,sourceDigest,previewDigest,capturedAt,expiresAt,boundaries,
allUserDataCompleted:false. Times epoch ms, expiresAt=capturedAt+30000 exactly.
Fresh preview must capturedAt<=now<expiresAt; no renewal/rebuilt old op. Boundaries
EXACT ordered PROFILE_BOUNDARIES arrays; dynamic source fields cannot erase them.

Preview={...B,kind:preview,profile,summary,copies,conflicts,eligible,progressCount}.
Sensitive profile EXACT validProfile all keys includes original seven values,
paceNotice/paceOperation/paceRequest/paceUndo (owner only, no model management
input). summary EXACT summaryKeys: profileRevision,paceRevision,
profileErasureFloor,paceErasureFloor,paceState,presentFields,hasPaceRequest,
hasPaceUndo. presentFields is the ordered actual saved-field inventory, not
fallback values promoted to input. Old existing rows initially inventory the
seven saved values plus actually nonnull pace fields; post-clear list empty.
Revisions/floors remain visible even with no sensitive fields. Profile can be
absent before first save: sensitive list empty; explicit missing preview fails,
no fabricated default user record. Progress profile/summary=null,copies all empty,
progressCount=selected count; sensitive progressCount0. Copies EXACT COPY_KEYS
arrays sorted unique owner IDs (sharedBriefs=caseId,briefPreviews=previewId,
scopedEditContexts=contextId,scopedEditWork=turnId,recoveryContexts=contextId,
coreExports=requestId). Conflicts exact CONFLICTS enum order, eligible iff empty.
Profile values are delivered only transiently from actual current row; persist
summary/copy metadata, never raw field/pace-request/Undo bodies in new operations.

Receipt={...B,kind:receipt,state:erased,decision:D}. D EXACT decisionKeys in
protocol.ts, requestDigest SHA256 ORIGINAL bytes, capturedAt<=decidedAt<expiresAt
and decidedAt<=now. Sensitive before/after Profile/pace revisions each +1,
erasedFields EXACT PROFILE_FIELDS, sourceProfile=cleared,paceConsent=revoked,
clearedPreviews0,retainedFences1. briefCasesInvalidated sorted actual Case IDs;
retainedCopies lists exact declared surviving mixed references; no Brief source
references survive original trigger. Account/sourceTrip/explicitMemory/
financialProvider=not_modified, externalCopies=not_erased always. Progress all
four source revisions=null, erasedFields=[],affected Brief/copies empty,
sourceProfile/paceConsent=not_modified, clearedPreviews actual<=selection length,
retainedFences=selection length. Compare planned versus actual effects or rollback.
Immutable D contains no profile bodies/request/Undo, raw bytes or nested receipt.

Unknown EXACT={schemaVersion,kind:unknown,...S,...actor,requestDigest,
allUserDataCompleted:false}. Only original byte recovery with no committed
receipt; never report cleared. Lost/malformed/replaced-authority ACK after
mutation => PROFILE_ACK_UNKNOWN503, retain pending identical bytes. Recover can
return committed original D after preview TTL only under ORIGINAL current
owner/session/epoch+fresh reauth; never rerun effects/renew/rebind on a new session.

List exact decodeProfileList keys. Sensitive items={profileId,summary}, at most1.
Progress items EXACT operationKeys in protocol.ts (all stored fields): S,actor,
sourceDigest,previewDigest,capturedAt,expiresAt,requestDigest,state,previewErased,
summary,copies,conflicts,decision. State previewed|erased; no hidden field inventory.
Owner inventory across original sessions discoverable under fresh current actor;
terminal recovery still exact old actor. Sorted requestId20/page, whole source
hash and existing anchored afterId; no skipped rows. Full response1MB. Progress
clears ONLY selected transient summary/copies/conflicts=null,previewErased=true;
retains selection/actor/hash/time/decision forever. Own progress operation appears
in same list and can itself be selected next time, never recursive full receipts.
Sensitive erase also clears its own transient metadata. Capacity10000 before
insertion; no authenticated cleanup bypass erases permanent decisions/floors.

## Actual clear transaction, locks and non-revival

Before metadata/list/preview/recovery: ordinary auth.uid, role authenticated,
is_anonymous=false; original mobile_session_v2/current epoch; actual auth.users
+ auth.sessions, reauth <=5min. Never authorize with user_metadata. Lock original
mobile account/session first, then same owner advisory34 used by prior privacy
source executors, permanent Profile watermark and user_profiles NOWAIT; all
qualified reverse parents/leaves ordered UUID NOWAIT; request row last. Existing
opposite-order writers fail transaction locally, not hang. No session/Trip/grant
ownership transfer. Fresh authority and absolute clock after last CAS and effects
before return; any failure rolls back source/Brief/fences/receipt together.

Clear retains user_profiles owner_id and created_at. Set display_name=null,
travel_pace=balanced,locale=zh,currency=CNY,distance_unit=kilometre,
temperature_unit=celsius,default_departure_time=09:00:00 as SYSTEM FALLBACKS;
these literal fallback bytes remain, the user's prior saved values do not.
pace_state=revoked; pace_notice/operation/request/undo=null; pace_revision+=1,
profile_revision+=1; updated_at=clock_timestamp(). Set profile_saved_fields inventory (seven user field keys) empty. Original pre-migration rows start with the seven existing saved fields; native fresh pace save adds only travel_pace, leaving the other cleared fallback fields unclaimed. presentFields combines this mask with the four actually nonnull pace metadata fields.
Retain permanent owner watermark with max profile/pace revision and deletion
floors = those newly committed revisions. It is NOT a tombstone preventing all
future edits. Watermark lives independently of Profile FK, belongs only to auth
owner, no session cascade; qualified account deletion retains original behavior.
Sensitive list summary exposes it: no hidden new retention inventory.

New raw Profile updates/restore cannot reduce either watermark/revision/floor,
set old pace management bytes above an erasure floor, or remove watermark while
actual auth owner exists. Original RPC/precisely validated writer is only allowed
forward edit proof; no caller GUC/service role bypass. Existing legacy invalidation
and Brief source triggers remain in force. Restoration of a deleted row must
start from revoked/system defaults at watermark, not recreate revision0. Old exact
pace request expectedRevision < pace floor denied even on original idempotence
path; erased current op is null. Undo cannot see old before-value. Future fresh
native save with current expected pace revision + current explicit original notice
IS legitimate, can consent anew; pause/revoke/undo of that fresh save keeps existing
wire and semantics. Current-input intake remains independent, not new Profile
consent. Minimal per-request privacy fences + owner monotonic floor survive own
progress deletion, service restore and old-device stale saves. No unobservable
claim about historical operation IDs never retained by the original writer.

## Precise compatibility bridge for the unversioned Web writer

Required append-only SQL introduces save_user_profile_v2 with the SAME seven
arguments and p_expected_profile_revision bigint, returns original owner_id,
updated_at table. Original ordinary Web auth/session/epoch rules stay as observed;
no new mobile enrollment prerequisite for legitimate Web actors. Lock original
mobile-account compatibility guard (where applicable), owner watermark and row;
compare expected current profile revision before all updates, then use original
seven-value validation and original legacy pace invalidation semantics. Revision
advances atomically; default balanced saved through Web grants NO pace purpose.
CAS includes native pace writes (every change advances profile revision).

Original 7-arg save_user_profile remains compatible until an owner has crossed a
Profile clear floor. After that, its lack of source binding is explicitly rejected
PROFILE_WRITE_FENCE before insert/update, preventing queued old clients/restore
from reviving saved values. It is NOT globally disabled. New Web caller reads
profile_revision, submits expectedProfileRevision, invokes v2. After a clear,
old snapshot expected revision fails; fresh GET + explicit user submit succeeds.
No transparent retry/rebase of a failed save. Unlike privacy erase, normal form
save does not acquire a new consent or an immutable user-visible delete receipt.
No extra writer-op ledger: original exact old bytes have a stale CAS revision;
permanent revision/floor plus privacy request fences are the retained inventory.

Candidate PROFILE-WRITER.patch contains only precise Web adapter/validator/form
and feasibility saved-field display changes, never applied until original owners release + Main grant. Existing POST
can accept the additive expectedProfileRevision key; old payload without it still
routes to original function subject to SQL per-owner floor. GET adds observed
profileRevision. GET also returns actual savedFields mask. Feasibility preferences suppress unsaved fallback fields and preserve actual independently saved fields; current double-read source checks stay. Existing native GET and pace request format untouched. Domain
writer.ts builds exact v2 parameters. Stale/fenced save maps to original DATA_EXPIRED409 taxonomy, no new
shared global code enum. User can explicitly reload on failed save; no silent rebase/retry, unsaved input retained until the user chooses reload.

## Shared registration and real completion gates

Own coverage descriptor is candidate: original profile module replaced only for
scoped delete=profile_data, exportHandler=core retained, same34 denominator.
Catalog .9 candidate follows independent ResultData .8, cannot land against
obsolete .7 and overwrite ResultData. Four precise shared TS catalog/selection/
registry/outcome hunks await ResultData final release/Main lease. Do not touch
identity/memory/coverage/registry files merely to meet concurrency. Native must
consume sole producer eight envelopes+commands, add currentactor/epoch/generation,
absolute monotonic30s, secure pending original bytes, immutable receipt, finite
own-progress UI and matching saved-pace/profile projection invalidation under lease.
No fake external recall or full-data badge. Original receipt/share/download notices
retain external-copy limits.

Actual local disposable PG must verify all fields/pace history cleared, unchanged
Auth/session/explicit Memory/complete Trip snapshots/events/proposals/financial,
Brief original invalidation, mixed scoped/recovery copies retained/stale, real
concurrent old save/native save/Undo vs clear, fresh v2/native save succeeds, ABA
restore cannot lower floors, conflict/TTL/actor failure rolls back all effects,
complete progress pagination and self-exit preserves immutable decisions/floors.
Signed local Auth -> actual SQL -> TS HTTP/decoder/coverage -> Native consumer
joins same fixed source. Fixtures alone do not satisfy it. Then one integrated PR,
Main whole-source review/formal final-head requiredCI/protected merge. Scope still
in development; full #239/ALL1/ALL2 not complete. Target grants/credentials/
provider/fees/deployment/real devices/backup remain UNRUN/unauthorized.

Initial TS evidence: own8 PASS0skip, typecheck PASS (initial two type errors fixed),
sole producer8 envelopes self-checked. SQL/runtime/Auth/Native/shared registration
not yet implemented in this package; no completion inference from this wire.

Main496620 approved fixed7780cdc6 complete wire; unused07020000 auditedb41683.
Sole SQL01a11608-fcd3 assigned append07020000/ownPG; Native receives sole producer.
Subsequent decoder consistency checks are same wire keys: last pace request op/revision
and Undo provenance must match actual row. No new SQL/Native envelope keys.
REGISTRATION.patch is precisely four shared hunks against read-only ResultData
98af2832 snapshot (.8), apply-check only; no ResultData shared write/release inferred.
PROFILE-WRITER.patch runtime guard rejects absent/malformed actual new revision/mask;
no silent default mask accepted from real upgraded DB. Both patches remain unapplied.

Main008264 precise leases consumed (same task, no whole-file lease): original219
integrator01a0df0f released feasibility/preferences.ts exact mask hunk; original240
TS01a10abc-c06b released ONLY user-data-adapter.ts Profile hunk. Applied matching
patch via git apply --include each file, preserved Trip/lifecycle/archive imports
and all other operations. request-guards/ProfileWorkspace/registration still pending.
Actual affected verification: original feasibility9 + own8 PASS0skip; original
Profile security1 PASS0skip; direct actual leased function clears fallback hints,
newly saved pace alone stays a soft reference, independent explicit needs unchanged;
typecheck/diff PASS. Four-file virtual overlay typecheck already PASS and reused.
Earlier Next API build PASS applies to own API source; no new source/PG/Auth claim.
Main008264 third precise lease consumed: request-guards.ts only isUserProfileInput
optional expectedProfileRevision type/check/allowed-key, original Memory and other
guards byte-unchanged. Original Profile contract1 PASS0skip, direct actual guard
accepts old payload and safe CAS0/5/max, rejects negative/fraction/string/null/array/
unsafe max; typecheck/diff PASS. ProfileWorkspace and catalog remain pending.

Stable integration and actual signed Auth r1: ProfileSQL928948d6 consumedfcd82b51,
07020000 SHA4e12c0b4 MATCH; normal fixedResult1229795b dependency preserved and
ProfileNativeb159 consumedb772284c. Entire ios equals b159; Result domain/API/
SQL/Auth equals1229795b. Main9ce573 four precise TS registration hunks applied
12+/2-, same34, profile only/.9, original Result/core/other33 retained. Registered
signed Auth **1PASS0skip + owned53955298 cleanupPASS** observed; raw facts and
boundaries in artifacts/VPJ-58/profile-data/server/AUTH-r1.md. Own8/typecheck PASS.
No dirty source copied. REGISTRATION.patch retired after actual grant/application.
Remaining Web form last hunk and catalog fixture metadata leases remain necessary
caller closure; existing PG24+gated4 and Native evidence stay separate. Full239 not
closed, target/provider/fees/device/backup UNRUN. Current source is no longer only
wire preparation; pending shared caller/fixture/CI entries do not imply new scope.
Main precise TS fixture lease consumed: only
 tests/fixtures/privacy/notification-data/native-catalog-v4.json .9/Profile row,
all other33 descriptors/order and all other root fields independently asserted
unchanged. Actual affected original coverage/notification consumers16PASS0skip,
old negative oracles unchanged. Native3 fixture update stays sole Native writer.
CI-REGISTRATION.patch is concrete PG env+two actual owned files and existing HTTP
lane tail63360 only; all original Result entries, two-shard algorithm and gates
preserved. Apply-check PASS; remains unapplied pending Main precise lease.

Final ordinary Web bridge lease consumed: Main located actual #549 owner01a0dd7a-
8709 and received explicit ProfileWorkspace release; only approved revision/read/
explicit save/reload/disable hunk applied, JourneyPass/payment/environment UI intact.
Old form no longer resubmits server metadata in its seven-field payload. Fresh
read revision is required; conflict does not silently rebase. Actual final Web/API
build, typecheck/lint/docs/diff and original Profile guards/security2 PASS. Earlier
four-file virtual overlay and direct CAS guard evidence reused. PROFILE-WRITER.patch
retired after all four exact leases applied.
PG CI env + two actual test files granted and applied. HTTP candidate63360 was
identified as overlapping original material-reference shard2; accidental local
application of that ungranted tail was immediately reversed before any lane run or
commit. New single-line candidate base63040, ports63060..63071, has zero overlap
against all37 current fixed runner/stack ranges and kernel preflight PASS. Existing
indices0..31/Resultindex31 remain unchanged; appendedindex32/shard1. Complete audit
is artifacts/VPJ-58/profile-data/server/CI-PORTS.json. HTTP tail remains unapplied
pending Main precise final grant; standalone63360 signedAuth PASS is retained and
not unnecessarily rerun for an allocation-only change.
Native final0725bac8 consumed79942212: entire ios byte-equal actual fixed Native,
13 shared hunks and3 catalog fixtures landed, same34 and original Result preserved.
Affected registry integration26PASS (own8, Conversation9, Result9) and original
coverage/notification16PASS separate; these are real unchanged negative oracles.
Product source/full user bridge is implemented; final CI tail/Main batch/onePR and
unmerged Result dependency integration remain engineering gates, not target or
whole239 completion. No target permission/deploy/provider/device/backup claim.

Main50e17b/7bb062/81d2ee/b19245 final HTTP lease consumed after original ResultTS
explicit release. Exactly one existing-lane tail base63040 applied, original32
indices unchanged; current33 split17/16, exact union and originalResult index31/
shard2, Profileindex32/shard1. Three gated files classify exactly postgres/ postgres/
supabase-http-native; no skip allowlist/classifier/matrix/timeout/gate change.
Original CI/ports governance17PASS0skip, source syntax/typecheck/lint/docs/diff PASS.
A manual snapshot first passed an object to executionSteps and its original strict
API rejected it; corrected to documented string '1/2'/'2/2' and exact union PASS,
without modifying the gate. Old allocation63360 conflict and its standalone Auth
PASS remain recorded. CI-REGISTRATION.patch retired after grant/application.

Frozen product+engineering source is now complete for this owned Profile outcome:
all original writer leases, actual source SQL, TS/API/registered HTTP, Native actual
caller/cache/receipt/pending and catalog fixtures, finite own progress and permanent
floors, real signed Auth plus scoped prior risk proofs. Main complete-source review,
Result same-source CI repair dependency, one final Profile PR and required checks/
protected merge remain. Whole239/ALL1/ALL2 stays Open; target/real device/backup/
provider/fees/deploy remain UNRUN. No approval/activity/fixture is represented as
an actual target or whole-account completion, and no new product work is invented.

Main78857/Result669 protected merge consumed by normal Git. Necessary same-source
increment verification is artifacts/VPJ-58/profile-data/server/AUTH-r2-main.md:
new full migration order actual signed Auth1PASS0skip + own e7a1f55f cleanupPASS,
prior actual PG dual-guard/Guide proofs reused. Profile SQL hash unchanged, entire
ios equals0725; Result/Conversation increment source equalsmain. Affected registry
11PASS/typecheck/lint/docs/diff PASS. No unmerged ProfileExport source consumed.
This closes the earlier unmerged Result dependency; unique main-base Profile PR
engineering follows, with exact final-head review/required CI separate from code
completion and target/full239 acceptance.

PR670 old3201 Quality/RLS/Ops/Native/PG FAIL retained and diagnosed individually.
Precise lease-only fixture compatibility and own cleanup c34db52c joined this
same-source repair, without changing any runtime guard/oracle or broadening a
lane. Actual receipts and cause distinctions:
artifacts/VPJ-58/profile-data/server/ci-fix-3201/README.md.
Original TIME24 boundary was a real preview defect: dedicated TS/Native3bc174
validators now preserve exact24:00:00 and1..6 zero fractions; invalid24-hour forms
still fail closed. New actual source-time24 signedAuth1PASS/cleanup and Native1
codec proof are necessary increments, not copied fixture-only confidence.
No ProfileExport source/SQL or other unmerged domain consumed. Main must renew
codecompletion/exactfinalformal/allCI on the fixed head; oldheadHOLD is not waived.

Fresh03a PG failures remain distinct from3201: progress capacity fails before its
exact bound error due to statement timeout, assigned solely to original ProfileSQL;
Brief audit9800 timeout at Auth FK has remote UNKNOWN cause. Main26e60d reviewed
owned originalprereq/bounds2PASS + actual9800 EXPLAIN/function/wait counterexample
(792ms,10active/noWait/noBlocker samples), without source or originalbounds changes.
Counterexample + first setupFAIL preserved under server/ci-03a-diagnosis; no further
local matrix/Brief source edit this turn. New actual progress source increment then
normal new-head requiredCI, with original Brief5s/9800 assertion still hard gate.
