# Explicit travel intake and current basis v1 — contract for Main review

Status: proposed, not implemented or a provider capability. 2026-10-03.
Related to #559; follows ADR-0027 and the stay-area producer/publisher frozen seams.

## Ownership and initial scope

Ordinary-auth admission of typed explicit travel input, correction, authoritative read/readiness and digest only. No Task/Turn admission, continuation, capacity reservation, ledger changes, worker/tool/provider call, result publication, Memory save or Trip write. Existing message/goal v1 and planning v1 signatures remain unchanged. Native consumers and planning-input integration are subsequent owners after this contract freezes.

Proposed additive migration20261002200000. New private immutable intake-version rows reference owner/conversation/goal/message with deletion cascades. Their exact goal/message versions and input revision are stored, not reconstructed from current_text. An additive paginated service-only intake export seam preserves the existing bounded account-export boundary; it does not authorize or complete an export request. No applied migration edit.

## Closed full projection

Every key is required. Missing/extra keys are INVALID_INPUT; no free-text/model parsing. Arrays cannot contain duplicates. Null means explicitly unknown/cleared; an empty array means explicitly selected no entries.

```json
{
  "schemaVersion":"stay-area-intake/1",
  "city":"shanghai",
  "comparisonTarget":"area_transport",
  "durationDays":10,
  "partySize":2,
  "interests":["food","photography"],
  "pace":"relaxed",
  "lodgingBudget":null,
  "dates":null,
  "mobilityConstraints":null
}
```

- city: null or explicit trimmed bounded text1–80; Shanghai is never a default or inferred keyword. v1 producer coverage is exactly the explicit canonical city `shanghai`; other supplied cities persist but read as unsupported coverage.
- comparisonTarget: null, area_transport or lodging_budget_filter.
- durationDays: null or integer1–30; partySize null or integer1–10.
- interests: null or ≤8 distinct entries from food/photography/culture/nature. These are user priorities, not facts about areas.
- pace: null or relaxed/balanced/fast.
- lodgingBudget: null or exactly {currency,perNightMinorUnits}; currency from CNY/USD/EUR/GBP, amount integer1–10000000. No currency conversion or claim of hotel price coverage.
- dates: null or exactly {startDate,endDate}, real ISO dates with end≥start and duration≤30days; no implicit inventory/date binding.
- mobilityConstraints: null or ≤6 distinct explicit text strings1–120. No inferred diagnosis/accessibility fact, and no claim current route evidence satisfies them.

### Correction semantics

This is FULL_REPLACEMENT only: the caller reads the current qualified full projection, changes only the user's explicit selections, then resubmits every field. Fields the user has not changed must be explicitly resubmitted with their selected values; the user may explicitly change multiple fields at once, and the server does not guess which were changed; omission is rejected rather than defaulted or silently merged. Null explicitly clears a value to unknown. The server stores this full corrected projection and a new input revision atomically with its source message/goal version. Two competing full corrections cannot silently clobber each other: stale expected input revision or goal version conflicts.

The SQL writer does not derive long-term preferences from prose or selected Memory summaries. All typed field values are explicit_current_input; memoryBasis records only separately, explicitly selected contextual references. It does not assert that any field value was parsed from Memory. No Profile travel-pace adoption or Memory mutation is implied.

## POST wire and atomic compatibility

`POST /api/chat/native/v5/travel-intake`, active native Bearer session; no cookies/Origin/arbitrary owner. Current configured text policy must equal policyId. Same producer eligibility switch as assistant message writes; producer-off does not imply authorizing a write.

```json
{
  "conversationId":"uuid","goalId":"uuid","messageId":"uuid",
  "idempotencyKey":"uuid","policyId":"uuid","locale":"en",
  "text":"Explicitly corrected current travel input",
  "relationship":"amendment","parentMessageId":"uuid",
  "expectedGoalVersion":2,"expectedIntakeRevision":1,
  "intake":{"schemaVersion":"stay-area-intake/1","city":"shanghai","comparisonTarget":"area_transport","durationDays":10,"partySize":2,"interests":["food","photography"],"pace":"relaxed","lodgingBudget":null,"dates":null,"mobilityConstraints":null},
  "memoryBasis":[{"id":"uuid","revision":3}]
}
```

New RPC: submit_assistant_travel_intake_v1 with those named scalar/JSON arguments. It invokes existing submit_assistant_message_v1 in the SAME transaction (taskId/turnId always null) and creates the immutable full projection/receipt. Any typed validation, Memory/CAS, storage or receipt failure after the legacy message succeeds raises inside that transaction: conversation creation/next_sequence, message insertion and goal.current_text/scope_version changes all roll back together; no partially admitted message is returned. Relationships:

- goal_start: new conversation/goal/message, expectedGoalVersion=null, parentMessageId=null, expectedIntakeRevision=0.
- follow_up: permits initial typed adoption for an already-existing goal, expectedGoalVersion=current, expectedIntakeRevision=0, parent=current goal message. It records a new source sequence without interpreting historical prose.
- amendment: correction, expectedGoalVersion=current, expectedIntakeRevision=current (0 if the old goal never had a typed projection), parent=current goal message. Existing v1 increments goal.scope_version and records the message; typed projection revision increments atomically. current_text remains the source text under the accepted legacy semantics; typed projection is the authority for structured travel fields.

A receipt covers the entire immutable request, including full projection and exact selected Memory revisions. Same owner/key + identical body returns the same message/sequence/goalVersion/intakeRevision; altered projection/Memory/key identity is IDEMPOTENCY_KEY_REUSE. A reused historical receipt is NOT a current-basis grant: reply is content-free and current=false when superseded, with no contextDigest, projection or Memory payload; and current readiness must be read separately. Current policies/consent/session and retained conversation/source ownership must still qualify; revocation/deletion cannot replay authority.

```json
{"version":5,"kind":"accepted","conversationId":"uuid","goalId":"uuid","messageId":"uuid","messageSequence":8,"goalVersion":3,"intakeRevision":2,"contextDigest":"sha256","reused":false,"current":true,"readyForProvider":false}
```

Only qualified, explicit/confirmed same-owner Memory profiles at the exact requested revision, with granted consent and authoritative source receipt, may be bound; max3. Missing/changed/revoked refs are blocked/conflict, never replaced by latest or filtered out to get ready. This validates their contextual eligibility, not an inferred field mapping.

## Authoritative current read and digest

`GET /api/chat/native/v5/travel-intake?conversationId=uuid&goalId=uuid`, ordinary active native session; current text policy/consent, owner/conversation/goal and nonterminal source qualify. New authenticated RPC read_assistant_travel_intake_v1(policyId,conversationId,goalId).

Current only when the row's goalVersion equals goal.scope_version, source is the latest same-goal message at its exact sequence, policy/consent bindings remain current, and each selected Memory revision/state/receipt/consent still qualifies. Legacy v1 amendment/follow-up or Trip-link scope changes without a corresponding typed row makes it stale; no historical fallback or keyword merge. No projection is returned for unrecorded/stale/revoked/unqualified basis. The client must explicitly review inputs again. A typed writer retry returns only its receipt, never turns an old revision into current.

```json
{"version":5,"kind":"travel_intake","schemaVersion":"assistant-travel-current-basis/1","conversationId":"uuid","goalId":"uuid","goalVersion":3,"messageId":"uuid","messageSequence":8,"intakeRevision":2,"sourceKind":"explicit_current_input","intake":{"schemaVersion":"stay-area-intake/1","city":"shanghai","comparisonTarget":"area_transport","durationDays":10,"partySize":2,"interests":["food","photography"],"pace":"relaxed","lodgingBudget":null,"dates":null,"mobilityConstraints":null},"memoryBasis":[{"id":"uuid","revision":3}],"contextDigest":"sha256","readiness":{"kind":"ready","scope":"transport_screening","unknown":["lodgingBudget","dates","mobilityConstraints"]},"readyForProvider":false}
```

SQL computes the exact digest from the versioned canonical projection, its intake revision, owner/conversation/goal, source message ID/sequence/version, current policy/consent identity and exact qualified Memory reference versions/receipt/consent/state. Selected Memory text is not returned or copied into intake storage. A private SQL basis helper can be used by a later service writer ONLY after that owner's lease/session/planning-policy checks. No new public service-role dispatch function is granted here. A later planning admission that creates another same-goal source message must explicitly bind/recompute the intake source in its own reviewed writer; it cannot silently relabel this older messageSequence as current. That consumer/writer integration is not included in this initial intake-only scope. Digest/readiness alone never authorizes a paid attempt.

Readiness, calculated only from qualified typed fields:

- city or comparisonTarget missing → waiting_user with only required questions city/comparison_target.
- area_transport + covered explicit city → ready transport_screening. Missing lodging budget/dates/other optional inputs remain in unknown and do NOT block traffic screening. Ready does not mean lodging suitability/inventory/food/photo facts are verified.
- lodging_budget_filter + missing budget → waiting_user lodging_budget.
- supplied budget still cannot enable unavailable price/inventory tools → unavailable budget_filter_not_integrated. Unsupported city → unavailable city_not_covered, never Shanghai fallback.
- unrecorded/stale basis → unavailable intake_unrecorded/stale_basis, no content. Revoked/foreign/malformed basis uniformly blocked; no field/title leak.

Responses private,no-store. Error taxonomy remains existing INVALID_INPUT400; active credential replacement401; policy/consent/owner qualification403; CAS/idempotency409; malformed/transient dependency503. No fallback on generic SQL errors.

## Gate plan and protected boundaries

After Main approves this exact seam: author one appended migration, new HTTP module/routes/closed parser and independent disposable runner/tests at registered base64720. Live Auth→HTTP→SQL tests cover initial waiting, transport-ready with unknown budget, full correction preserving untouched values, explicit clear, exact retry, stale/mismatched versions, concurrent CAS, cross actor/session replacement, Memory revision/consent withdrawal, text consent withdrawal, deletion and paginated export. No provider, shared target, native/UI, publisher validation, planning worker or same-Task/cost changes.

Shared ACL allowlist and DB lane registration require exact-hunk coordination before edit. Data rights use owner FK cascades and an additive bounded service export seam; no export completion/deletion claims from fixture preparation. All actual PASS/FAIL/UNRUN remain separate from #559 full acceptance.

## Frozen unavailable wire / error classification

GET valid unrecorded/stale returns HTTP200 with exactly `{version:5,kind:"unavailable",reason:"intake_unrecorded"|"stale_basis",readyForProvider:false}` and no IDs, projection, digest or Memory. Blocked returns HTTP403 `{error:{code:"DATA_POLICY_BLOCKED"}}`, replaced/missing session401, malformed or unknown RPC kind/reason/shape503 PROVIDER_UNAVAILABLE. Second read and POST current-qualification read use the same distinctions; they cannot turn blocked/malformed into stale or accepted. Every authenticated early response revalidates the session. Readiness-unavailable stays inside a qualified travel_intake and is distinct from top-level unavailable.

unknown is the closed camelCase projection field-path set: city/comparisonTarget/durationDays/partySize/interests/pace/lodgingBudget/dates/mobilityConstraints, nullable absent fields only, no duplicates. questions retains city/comparison_target/lodging_budget; reasons retain defined snake_case. Unknown spelling fails closed.

## Frozen write-basis wire

`GET /api/chat/native/v5/travel-intake/write-basis?conversationId=uuid&goalId=uuid` calls new authenticated `read_assistant_travel_intake_write_basis_v1(policyId,conversationId,goalId)`.

```json
{"version":5,"kind":"travel_intake_write_basis","conversationId":"uuid","goalId":"uuid","goalVersion":3,"parentMessageId":"uuid","messageSequence":8,"intakeRevision":2,"policyId":"uuid","readyForProvider":false}
```

Exactly these ten keys, no projection/Memory/digest/readiness. Current owner/native session/text policy+consent/nonterminal writable goal and latest actual same-goal owned parent qualify; current typed revision is max stored revision or0 even when its input/Memory basis is stale. Memory withdrawal alone does not revoke the text-domain metadata read. Text withdrawal/foreign/terminal/ordinary goal-version cap is blocked403; replaced session401; malformed dependency503. Two current reads must match or409 SERVICE_TASK_CONFLICT with no metadata. Every result still gets final native session verification.

This is only edit CAS metadata, not authorization to reuse old fields or Memory or start a provider. The caller supplies a newly explicit COMPLETE projection and newly selected exact Memory refs or[]; write rechecks all versions/qualifications under lock. If a Trip-link mutation raises goalVersion above the latest parent's historical scope, the response does not claim the parent has that scope; the new ordinary message wrapper must pass the unchanged legacy parent's relationship/owner/conversation/order rules and current goalVersion in actual compatibility tests.

Exact top-level unavailability examples (no alternative fields/spellings):

```json
{"version":5,"kind":"unavailable","reason":"intake_unrecorded","readyForProvider":false}
```

```json
{"version":5,"kind":"unavailable","reason":"stale_basis","readyForProvider":false}
```

```json
{"error":{"code":"DATA_POLICY_BLOCKED"}}
```
