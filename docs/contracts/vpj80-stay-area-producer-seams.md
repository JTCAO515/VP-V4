# Stay-area producer seams for the complete-flow batch

Candidate integration contract, 2026-10-02. Main freezes each writer's scope before integration. This document does not install SQL, authorize a provider or claim the complete flow works.

## Available facts and user inputs

The existing AMap adapter verifies three exact Shanghai anchors and current route responses. Its persistent normalized facts are area ID/anchor label, transit minutes, transfers, observedAt, provider source and request count (maximum 13). POI names/search order do not establish food quality, photography suitability, noise, safety or hotel inventory. The approved knowledge reader currently emits `not_integrated`. Existing Qwen output is only a closed highlight enum; it cannot author facts.

First China visit, ten days, partner/party, food/photography interests and relaxed pace are user weights when explicitly supplied under the current authorized basis. They are not area facts. Lodging budget is distinct from the worker's model-cost scope. Missing budget is allowed for a transport-first comparison and displayed as unknown. City/comparison target must be explicit; a budget filter requires a specified budget. Dates may remain unknown for a non-inventory comparison. No Shanghai default, inferred preferences, exchange-rate conversion or fabricated sources.

## Seam 1 — authoritative typed intake, then readiness

Writer ownership: the ordinary-auth goal/intake/continuation writer, to be assigned by Main. Consumer ownership: #561 worker/typed adapter. Existing functions: `submit_assistant_message_v1`, `submit_planning_comparison_v1`, `read_planning_comparison_work_v1`. Native consumers are a later Main handoff.

Proposed private read payload adds an explicitly versioned `intake` to the existing SQL-derived planning input/context digest:

```json
{
  "schemaVersion": "stay-area-intake/1",
  "city": null,
  "comparisonTarget": "area_transport",
  "durationDays": 10,
  "partySize": 2,
  "interests": ["food", "photography"],
  "pace": "relaxed",
  "lodgingBudget": null,
  "dates": null,
  "mobilityConstraints": []
}
```

These example preferences are not defaults. `city` is null or explicit bounded text, never inferred from free-text keywords. Target is `area_transport` or `lodging_budget_filter`; budget is null or `{currency,perNightMinorUnits}` without conversion. Nullable days/party/pace/dates retain unknowns; interests/constraints retain only explicitly selected values. Writer must bind each corrected full projection to the ordinary user's current goal/message/Memory revisions; client JSON alone is not dispatch authority. SQL includes the projection in the exact context digest.

Readiness responses: `{kind:"ready",unknown:[...]}` for transport with city/target; `{kind:"waiting_user",questions:["city"|"comparison_target"|"lodging_budget"]}` when necessary inputs are missing; unsupported city/tool coverage is `unavailable`, not a Shanghai fallback. Waiting creates no new model/map attempt. Persisted waiting/recovery needs the writer seam; the current `pause_planning_comparison_v1` provides only `paused_unknown` and must not be relabelled as waiting-user. Malformed/unbound intake is unavailable; stale expected version is conflict; policy/revocation remains blocked.

## Seam 2 — comparison/1 publication

Writer ownership: #560 publisher/result owner. Consumer: #561 domain producer. Generic `comparison/1` schema/store remains unchanged. Existing planning validator `turn_private.valid_planning_comparison_v1` currently accepts only fixed rail-only title/summary/tradeoffs. `complete_planning_comparison_v1` checks current lease, all checkpoints, settled model attempt and basis, then calls `publish_comparison_result_v1` atomically.

Minimal extension: deterministic `comparison/1` text projection from authoritative current intake and validated observations. Summary states the user weights, actual source/observation time, exact transport-first coverage and unknown food/photo/noise/safety/prices/inventory. Option tradeoffs describe only measured route values and how an explicit transport preference changes their weight. No conclusion that an area suits food/photography without eligible facts. A non-transport preference cannot justify a definite area recommendation. Missing lodging budget is explicit; it does not prevent this limited comparison. Proposed richer facts require a separately approved eligible-source adapter, not arbitrary URLs or model prose.

Request retains exact `{turnId,leaseToken,resultActionKey,modelAttemptId,content}` plus SQL-derived digest/intake binding if the owner needs an explicit expected digest. Reply must bind `{kind:"published",artifactId,revision,taskId,turnId}` (or the equivalent exact durable receipt); domain code reports success only after it. Invalid projection is rejected; stale basis/lease/policy cannot publish; conflicting idempotency key does not create another artifact. Receipt loss is resolved by authorized readback, not another paid run.

## Seam 3 — ordinary-auth same-Task continuation

Writer ownership: Main will assign a separate function/migration owner; #561 does not change goal amendment semantics or result SQL. Existing `submit_planning_comparison_v1` always calls `submit_service_task_turn(...,1,'new_goal',null)` and generates a new artifact. Existing goal amendment replaces `current_text`. Therefore neither same-Task correction nor preservation of prior full preferences is currently implemented by this producer.

Candidate RPC `continue_planning_comparison_v1`: ordinary auth with `{taskId,expectedTaskVersion,goalId,expectedGoalVersion,parentMessageId,messageId,messageKey,newTurnId,requestKey,textPolicyId,planningPolicyId,currentIntake,memoryBasis}`. Ordinary user explicitly supplies the full corrected projection; do not silently merge conflicting historical prose or revive old consent. SQL validates owner/session/current policies/consents/version/CAS and binds the new Turn to the existing Task, original cost history and logical artifact. Returns `{kind:"accepted",reused,taskId,turnId,taskVersion,goalVersion,artifactId}` with stable logical artifact ID and the next authorized publication revision determined by the publisher. The original initial-admission path remains available.

Safety requirements: same immutable request retries return the same receipt; stale Task/goal versions conflict; terminal cancellation/revocation cannot be undone. Unknown/dispatched/pending supplier effects return `unknown_effect` and are not replayed. Known prior costs remain in the same Task ledger; clarification/correction does not reserve a second new-goal capacity purchase. Supersede old leased work so it cannot publish or use a new context under an old lease. Reuse completed observations only when their dependencies remain valid and fresh; changed dependencies get new bounded actions, not rewritten receipts. Never delete attempts, reset unknown actions or let one Task borrow another's scope/readiness. This requires explicit writer design because current action count is lifetime Task-bounded and the existing result validator assumes initial revision zero; worker cannot invent a safe reset.

## Repo-only regression and real-run gates

At the final tool checkpoint response barrier, ordinary-auth goal amendment changes version 1→2. The old worker then creates one model budget attempt despite model egress and artifact publication both being zero. Reserve-before-current-basis recheck regression fails `1 !== 0`. #561 adds the existing exact context/read gate and hosted scope gate after checkpoint completion, before reserve. Late changes after that gate still require dispatch/publication checks; no atomic distributed cost guarantee is claimed.

Local fake DB/Qwen/AMap HTTP ports use `listen(0,127.0.0.1)` OS leases; the PostgreSQL container is network-none. Teardown releases all ports/container resources. No fixed port or Simulator lease.

Real flow needs: reviewed union SHA with installed intake/continuation/publisher migrations; specific Staging target and ordinary-auth actor/current policy/notices/consents; explicit eligible tool coverage and secure purpose-matched credentials; exact host/image/profile and disabled-start checks; current price version/model budget scope/amount/expiry and separate map fee cap; an approved finite model/map count and recovery fault window; exact native build/target for cross-tab/close/relaunch readback. A credential does not authorize these operations. No current target/paid run is implied by this contract. Parent #561 remains open.
