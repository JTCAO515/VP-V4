# Private v2 model attempt binding — frozen interface, no execution authority

2026-10-03. Main-reviewed additive050000 on base f97ecc5d. No provider call, new public/API grant, ledger reserve/dispatch/settlement/release, model output, claimer, publisher or completion function is implemented. Qualification and this private binding never create the separate local fake-provider permit. Existing020000/03030000/40000 and nativeHTTP are unchanged.

## Exact shared tuple

All four private functions below take these thirteen parameters in this exact order. All are mandatory; SQL NULL rejects. All UUIDs refer to actual matching records, not caller-issued authority.

| Position | Name | SQL type | Exact authority |
| --- | --- | --- | --- |
| 1 | p_owner | uuid | Current work/account/Task/budget-scope owner |
| 2 | p_task | uuid | Canonical serviceTask, budget attempt.task_id |
| 3 | p_turn | uuid | Actual accepted v2 work/planning turn |
| 4 | p_lease | uuid | Non-NULL active work lease, equals immutable original binding lease |
| 5 | p_text_policy | uuid | Task policy and planning policy's text policy |
| 6 | p_planning_policy | uuid | Exact qualified planning policy/current consent |
| 7 | p_scope | uuid | Task.budget_scope_id and existing attempt scope |
| 8 | p_attempt | uuid | Existing scope/attempt PK, not a new attempt |
| 9 | p_provider | text | qwen, exact actual policy/ledger provider |
| 10 | p_model | text | Exact actual attempt and provider-limit model; bounded1..100 ASCII model key |
| 11 | p_price_version | text | Exact actual ledger and limit price version; bounded1..100 ASCII key |
| 12 | p_intake_digest | text | Current qualified intake lower SHA256 |
| 13 | p_planning_digest | text | Current qualified planning lower SHA256, distinct from intake digest |

Private signatures (same tuple above):

- `turn_private.planning_v2_model_binding_basis_v1(...) RETURNS jsonb` — internal qualified ledger projection or SQL NULL; not a completion receipt.
- `turn_private.bind_planning_v2_model_attempt_v1(...) RETURNS jsonb`.
- `turn_private.read_planning_v2_model_binding_v1(...) RETURNS jsonb`.
- `turn_private.unknown_planning_v2_model_attempt_v1(...) RETURNS jsonb`.

Every table/function has API privilege revoked, including service_role. No public wrapper is supplied. Consumers cannot invoke these via an ordinary or service API connection.

## Exact closed results

All failed/missing/invalid/current-basis/actor/lease/policy/tuple/scope/price/ambiguity/lock-conflict results:

```json
{"kind":"blocked"}
```

Successful **read** has exactly these22 keys. Names and types below are fixed; example status is reserved. `actualMicros` is integer or JSON null, never coerced to zero. `reservedMicros`/`actualMicros` are actual ledger values, not a quote or an inferred provider bill.

```json
{"kind":"model_attempt_binding","schemaVersion":"planning-v2-model-binding/1","ownerId":"uuid","taskId":"uuid","turnId":"uuid","textPolicyId":"uuid","planningPolicyId":"uuid","scopeId":"uuid","attemptId":"uuid","provider":"qwen","model":"bounded-model-key","priceVersion":"bounded-price-key","intakeContextDigest":"64lowerhex","planningContextDigest":"different64lowerhex","ledgerStatus":"reserved","reservedMicros":10,"actualMicros":null,"unknown":false,"reconciliationRequired":false,"executionAllowed":false,"executionAvailable":false,"readyForProvider":false}
```

Identity fields are UUID strings; provider/model/priceVersion and both digest strings come from the exact matching records/tuple. ledgerStatus is exactly reserved/dispatched/pending/settled/released. Unknown and reconciliationRequired are booleans; all three execution/provider flags are literally false. The lease is validated in SQL against actual work and immutable original claim lease, but is deliberately **not echoed** in this result. This JSON alone is not an independent lease proof; the trusted exact private call/current tuple supplies that proof. No model output/content/usage/endpoint/credential/currency conversion is returned.

Successful **bind** returns exactly that read object plus one boolean `reused` (23 keys). First committed binding has reused:false; identical existing tuple has reused:true. Reused means the correlation row already exists, not a provider dispatch or successful model effect. Any tuple change is blocked, including a new lease or attempt. First bind only accepts the sole existing reserved attempt with currently live budget scope/provider limit. No retrospective first bind is allowed for dispatched/pending/settled/released.

Successful **unknown** has exactly three keys:

```json
{"kind":"unknown","reused":false,"executionAllowed":false}
```

reused:false marks the first NULL→unknown_at transition; reused:true reports the same existing sticky marker. It updates only the binding marker. Failure returns only blocked. It never releases/replaces an attempt, writes ledger state, or clears unknown after settlement.

## Ledger state / scope matrix

| Actual ledger state | First bind | Existing exact binding read | reconciliationRequired |
| --- | --- | --- | --- |
| reserved | Only live enabled/notfrozen/unexpired scope+enabled matching limit | Report reserved and actualMicros:null | sticky unknown only |
| dispatched | blocked | Report actual status, actualMicros:null | true |
| pending | blocked | Report actual status, actualMicros:null | true |
| settled | blocked | Report exact recorded reservedMicros/actualMicros/priceVersion | true: no validated model output is implemented; sticky unknown never clears |
| released | blocked | Report released, actualMicros:null, never none | sticky unknown only |
| Unknown state / >1 actual Task attempt / mismatched scope/owner/price/model | blocked | blocked | No invented missing/none or selected latest row |

For an **existing exact binding**, disabled/frozen/expired scope or disabled provider limit does not hide the already recorded readonly status/settled amount. The original owner/Task/scope/provider/model/priceVersion and current actor/session/lease/policies/dual basis still must match; any permission/source change blocks even settled read. This readonly exception cannot restore scopeLive or grant dispatch. Missing binding always blocks read; zero rows are not reported as a free attempt. The sole row check includes all actual attempts for the Task, so a later released row cannot hide unresolved prior rows.

## Store and final lock order

New private table planning_v2_model_attempt_bindings has turn PK, unique(scope_id,attempt_id), owner/Task/planning-turn/policy/actual-ledger FKs, immutable original lease/identity/provider/model/price/digests/time, and only sticky unknown_at. Ledger status and money are not copied to this table. An insert trigger checks same owner/Task/Turn/policy/scope/attempt identity and reserved ledger state; update only allows the one-way unknown marker. Parent/ledger deletion cascades correlation; this is not a privacy executor hookup or full-account deletion acceptance. Future bounded service export is a separate pending contract, **not** added/granted here.

Final Main-approved sole lock order: auth.users KEY SHARE NOWAIT→mobile_accounts UPDATE→same-ownerTask UPDATE NOWAIT→020000 qualified helper (reentrant account, then session/Turn/thread/work/current dual basis)→scope SHARE NOWAIT→attempt SHARE NOWAIT→provider-limit SHARE NOWAIT→binding. Never acquire Task before first waiting on account; never take scope then Task. Scope/attempt/provider conflicts fail closed. lock_not_available and insert uniqueness conflicts return blocked with subtransaction rollback, never reused/partial binding. Existing reserve/settle/session/Memory functions remain unchanged.

## Evidence / remaining scope

Network-none pinned disposable PG, actual checkout migrations and legal synthetic ledger primitives only. Existing reserve/dispatch/finish are fixture setup to move the **actual** ledger row; the new helpers never call them. Provider calls/real fees/model output/result writes stay zero. First baseline proves ledger reservation/dispatch can exist without durable v2 binding while v1's v2 dispatch fence remains blocked. Final tests prove current tuple/policy/basis, one binding, readonly state and controlled lock failures. Formal worker integration/API/deployment/provider/native/device/user/full #559/#561 acceptance remains UNRUN.

Required final registry path: tests/integration/turn/planning-v2-model-attempt-binding.test.mjs under existing VP_TURN_DB_TEST=1. Main coordinates registration; this owner does not edit sharedregistry. This interface checkpoint precedes the final SQL/test/evidence freeze and is not a claim that every pending test already passed.
