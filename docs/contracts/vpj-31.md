# VPJ-31 · Case-scoped Traveler Brief

Issue #223 B1/B2. Dependency #224 source is immutable PR #654 `8675b90c`
integrated normally; its merge and target activation must be checked separately.

## Closed wire

`lib/server/service-cases/brief/contract.ts` is the exact TS/native/SQL wire.
Native owner POST `/api/service-cases/native/brief/v1`; cookie-bound staff POST
`/api/ops/service-cases/brief/v1`. Both dispatch only
`service_case_brief_v1(p_input jsonb,p_request_bytes text,p_surface text)`.
Local-only `SERVICE_CASE_BRIEF_LOCAL=1`, normal verified credentials and original
mobile session guard. Database setting disabled by default; no staff enrollment
or authenticated/anonymous/servicerole EXECUTE grant is added by this package.
Disposable local fixtures may enroll their own synthetic actors and grant only
this RPC after separately proving default ACL denial. No target activation.
Use `service_brief_private.settings` for the new default-disabled local feature
switch. Source-options/preview/share/read-preview/locate/read require that switch;
owner-state/audit/export/withdraw/delete/read-operation/abandon remain available under
their own authority when the feature switch is disabled so privacy is operational.

Owner `source_options {caseId}` returns real eligible source candidates under the
current Case recipient/grant/TTL. Memory scope is explicitly latest three eligible
preferences, never a complete history claim. No client-generated source ID, title
or budget. Every candidate carries current revision, source receipt, consent,
update time and source basis digest. Selecting sources is preparation; selecting
individual available fields in a fresh preview and explicitly confirming `share`
is a new task/recipient-limited consent. Preview alone grants nothing. Existing
problem grant and Free basic Memory grant never authorize these new fields.

`preview` accepts only source references; returns a server-minted `previewId`,
Brief revision (zero before first share), grant binding, digest and fields. Lifetime
is at most five minutes and no later than Case expiry. `read_preview` is owner and
original-session-only and requalifies the current sources. `share` CASes the Brief
revision and matches preview owner/session/Case/recipient/grant/digest/TTL, then
stores only chosen references. Sharing never calls the Case grant or Memory writer.
Staff can submit `locate {caseId}` to obtain the actual current shared Brief
revision/grant binding without values, and `read` with exact
Case/recipient/grant/Brief revision. Both requalify explicit Brief share and
sources; ordinary problem-only Case grants deny. An old
revision URL gets stale/denied; a new preview/share is required after correction.

`withdraw` erases all selected references/previews/raw old operations and increments
Brief revision, preserving a minimal audit. `delete` also erases the Brief audit
and previews, retaining a non-content revision/tombstone and this deletion receipt.
Neither action requires an active Case grant: owner cleanup uses current Case
recipient/grant revision and Brief CAS after expiry/revocation. Applied mutation
receipts have exactly expected revision plus one; a cancelled abandonment fence
binds a revision at least expected. Neither action deletes original Memory/Trip/intake. Original Case or account delete
must cascade/scrub all Brief references, audits and raw operations. Original Case
grant replacement/revoke must synchronously invalidate Brief and erase old ops.

`owner_state {caseId}` returns only exact current owner/Case/current nullable
recipient/grant revision/Brief revision/state metadata. It is owner/session-bound,
feature-off/expired/revoked readable, contains no source values/digests/history and
never grants staff access. Absent Brief is revision zero/state `absent`; an owner
may explicitly delete first-preview references at revision zero. Cleanup CAS does
not depend on the audit being below its complete 200-event limit or an active
preview. A deleted Case has no owner_state; only its original minimal deletion
receipt recovery remains. Audit overflow stays honest unavailable, not truncated.

## Source qualification (SQL implementation requirements)

- `case`: exact owner/Case/category/purpose and revision; authoritative `problem`
  and created/updated timestamp, never a local title or invented source. The
  existing Case has no separate correction writer: preserve original authority.
- `profile_pace`: `public.user_profiles` owner, `pace_state='explicit'`,
  `pace_notice='local-planning-cross-trip-v1'`, non-null real `pace_operation`,
  current `pace_revision`, update time and allowed enum. That notice alone does
  not grant staff access: new explicit Brief field selection is mandatory.
- `memory`: original `memory_profiles` owner/current positive revision,
  `constraint_kind='preference'`, `state in ('explicit','confirmed')`, non-null
  summary; owner-matching granted `memory_consents`, owner/memory/source-matching
  `memory_receipts`, current revision/receipt/consent and digest. No inferred or
  hard-constraint/personality inference is projected; owner-selected explicit
  preference text is displayed as explicit. Do not copy summaries to a new table.
- `intake`: real `assistant_travel_intakes` message/owner/current revision; use
  `assistant_travel_current_basis_v1(owner,message)` for current message frontier,
  goal/version, policy/consent and Memory basis qualification. Additionally prove
  actual `service_operations_private.services.trip_id/trip_version` against owner
  Trip current head/non-deletion/non-archive, original `assistant_goal_trip_links`
  current goal/conversation/Trip/head and original owner link receipt. Choose the
  unique current intake associated with that exact Case Trip; ambiguity is unknown.
  Requirements are allowlisted structured intake fields, budget is real lodging
  budget. Current explicit intake pace overrides saved profile pace. Missing/null
  intake fields remain unknown; no inferred budget, arbitrary text parsing or
  latest unrelated message. Expression-detail source is currently unknown.

Every source read rechecks the full authoritative fingerprint (not revision alone)
and current source consent/state. Preview/source-options may mark unavailable
sources unknown; an already shared selected source that becomes ineligible denies
the entire Brief until fresh preview/explicit share. A newer user intake frontier
must invalidate the older intake even if its row is immutable. No old source can
resurrect through a retry, old preview, old URL, receipt or cache.

SQL owner/source lifecycle triggers synchronously invalidate/scrub reference edges
on Profile/Memory/consent/receipt/intake/goal/link/Trip lifecycle changes or deletion.
Keep original writers unchanged. Serialize Case before Brief and source locks;
source writers have differing existing lock orders, so acquire conflicting source
locks NOWAIT and return busy rather than deadlock or weaken the original authority.
Include real concurrent read/correct/revoke/delete/session/account races. Verify
CAS, new input frontier and original writer outcomes, not only helper functions.

## Operations, audit and data

Mutation bytes reach SQL unchanged; actor/session/surface/operation key binds
SHA-256 of UTF-8 bytes. Same key with other whitespace/content is 409; no replacement
of old bytes. `read_operation` is pure reconciliation and never retries a mutation.
Post-dispatch errors retain unknown ACK and the original operation ID. `abandon`
contains the original bytes: an existing applied receipt stays applied; an absent
operation gets an immutable cancelled tombstone before any late retry can apply.
Receipt reads/replays must requalify current Case/purpose/recipient/grant/session
and relevant source eligibility. Erased operations return 410; content never revives.
Owner deletion receipts remain readable in their original session without relying
on the erased content. Export/read_operation are never staff actions.

Minimal audit includes event ID, actor, action, revision, recipient/grant, field keys
and time, never values/raw messages/summary/digests of source text. Staff access
records an event; owner `audit` returns complete at most 200 events or limit error
without silently truncating. Multiple transport qualifications may log separate
minimal read events; no event contains projected field values.

Owner `export {requestId,confirmed:true}` uses new independent versioned
`traveler-brief-data/1` exact source lease (30 seconds max) and bounded complete
reference/preview/audit/operation rows, 10000-row/512KiB limit or unavailable.
Capture/revalidate actual source qualification and data changes between dispatch
and delivery, including consent/TTL. Source values are `not_copied`; attachment
coverage is `unavailable`; `corePackageEnrollment='not_enrolled'` and
`allUserDataCompleted=false` preserve the existing core export enrollment contract.
Keep old service export coverage unchanged; this new handler is independently
usable. Do not retrofit #228 export wrappers or claim whole-account completion.

All reads are `private, no-store`; no server retained value cache, provider call,
external action, Trip writer or Memory writer exists in this feature. Consumers
clear visible content/selection on actor/session/Case/grant/source/revision changes,
request start/failure/expiry and logout. Recover pending operations by exact original
actor/session/bytes only; failed recovery is not an erased local journal.

## Verification boundary

TS HTTP/contract, actual disposable local PostgreSQL/Supabase authentication and
native tests verify their stated environment separately. Required CI remains.
Real employees, target migration/permissions, real user data, provider/funds,
Production, physical phone and human/VoiceOver acceptance remain UNRUN.
