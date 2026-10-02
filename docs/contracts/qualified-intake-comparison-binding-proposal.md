# Qualified intake → comparison preparation and binding proposal

2026-10-03; #560. This is independent deterministic result-domain preparation, not a producer/publisher integration grant or a delivered accommodation recommendation. Three deferred result types are outside this branch.

## Implemented independent contract

`projectQualifiedIntakeComparison(basis, expectedBinding, place, locale, evaluatedAt, environment)` validates the frozen public `assistant-travel-current-basis/1` wire (version5), full explicit `stay-area-intake/1`, readiness `ready/transport_screening`, matching captured source/version/Memory/digest tuple and closed existing `planning-place/1` observation. Shanghai must be explicit; null remains unknown, [] remains explicitly none. No prose/Memory parsing or weights are inferred.

The returned preparation has separate request, binding, observation and coverage sections, plus unchanged inert `comparison/1` content. It retains ten-day/party/food/photo/pace selections as user input, not area facts. Only non-null rail minutes/transfers are observed coverage; unsupported food/photo/pace suitability/safety/quietness/hotel price/inventory remain unknown. Source/observedAt are visible; synthetic_fixture is accepted only in local_synthetic, AMap only in staging, with the original 13-call bound and five-minute/+five-second freshness window. Known configured area IDs determine neutral label/order; neither model highlight nor injected label claims become recommendations.

`validatesQualifiedIntakeComparison` accepts only that exact generated content (JSON object key order is irrelevant; array order is meaningful). No HTML/action/URL field or arbitrary model title/summary/tradeoff is accepted. Both readiness flags remain false: this pure function cannot establish owner/session authority, authorize dispatch, settle cost, publish an event or grant future eligibility. The caller must already have an authorised coherent intake read and separately captured expected binding. It is not imported by the live worker/API.

## Current executable seam facts

The frozen intake owner snapshot `05c0042c + 4728c18f` was read locally; it is not imported/cherry-picked as a runtime dependency. Its private `assistant_travel_current_basis_v1(owner,message)` requires the exact latest same-goal source and current goal/Memory/consent. `read_assistant_travel_intake_v1` exposes that current qualified projection/digest.

Existing planning admission appends an assistant message. Therefore the prior intake message no longer qualifies as current: reading/replaying its old digest after admission cannot authorise publication. Current planning worker uses its own raw planning_input contextDigest and remains fixed rail prose. No new SQL, admission, continuation, worker, NativeSession, intake200000 or provider flag has changed here.

## Minimal authoritative binding proposal for Main review — not implemented

Keep every latest-source/owner/lease/policy/consent/action/budget/settlement gate. Do not redefine the old helper to accept a historical message.

The smallest explicit integration is a reviewed **atomic admission binding**: the initiating owner submits the complete explicit projection and selected exact Memory refs, along with expected current intake/message/goal revision. Under the existing lock/CAS order, admission revalidates the original current intake and unchanged explicit values, appends its new message, and establishes a new immutable typed binding for that new source (new messageSequence/goalVersion/digest). Admission must not silently copy inferred changes from its free text. If values change, require the ordinary explicit correction seam; if no such binding is written, return unavailable instead of reusing an older digest.

Planning must carry both the intake binding identity/digest and its existing planning action/context digest; they are separate namespaces. Dispatch/checkpoint/publication reread both current authorities. Publisher projects from the qualified bound intake + validated rail checkpoint; completion still requires current lease, result.prepare action, observation environment/freshness, settled matching attempt and atomic Task/result/outbox commit. A newer correction/revoke makes the old worker stale; no fabricated paid replay, no full-lodging suitability claim.

Main must freeze exact admission/private intake-writer ownership, parameter/receipt shape, new-source revision semantics, correction behaviour and lock order with the #559/#561 owners before SQL implementation. This owner proposes only result-domain projection/validation; it does not take their admission/worker functions.

Main readback on2026-10-03: explicit atomic rebind is accepted in principle; exact runtime SQL is **not approved**. Original #561 owner owns the admission/worker bridge's exact parameter/receipt/version/lock-order proposal and local reproduction; original #559 owner checks existing intake locks/helpers. #560 owns only the publisher validator/result functions. The bridge receives a separately reserved migration; #560's010000 stays uncreated. No private intake append helper or admission change is authorised in this branch.

Reserved (Main conflict-checked, not created/applied): `20261003010000_vpj79_qualified_intake_comparison.sql`. Future local lease63420 requires fresh prebind; this pure-function phase starts no stack or Simulator. Real storage/admission/producer/native/target/provider/cost/full #560/#561 acceptance remain UNRUN. Existing #615/#617 evidence and `559dab77` pause note remain preserved.

## Approved private SQL preparation checkpoint

010000 remains uncreated and is retired for this batch. Main approved `20261003030000_vpj79_private_qualified_comparison.sql`, after intake200000 and bridge020000. The latter is consumed only as fixed local fixture at `9570497ce19fdbd26a1335a534547ad568db9b0f`; intake fixture is `4728c18f96d60138cbc6718fc31f5f10ae3ad20b`. Both dependency SQL sources are loaded unchanged by FULLSHA git show. #623 has now merged200000 into main;020000 is not yet integrated.

Private projection signature: `turn_private.project_planning_qualified_comparison_v1(owner uuid,turn uuid,lease uuid,expected_intake_digest text,expected_planning_digest text,place jsonb,locale text) → jsonb | NULL`. Private validator: `turn_private.valid_planning_qualified_comparison_v1(same seven parameters,content jsonb) → boolean`. PUBLIC/anon/authenticated/service_role all have no EXECUTE. No public publisher, admission, claim, helper append, trigger or completion change.

Every invocation calls fixed `read_planning_qualified_intake_v1(owner,turn,lease)`. It requires the closed current v2 context, exact owner/turn/task/source relations, both expected digests and matching qualifiedIntake.contextDigest, explicit source/readiness and false execution/provider flags. Locale matches the owned current source message; observation environment comes from current planning policy; server clock enforces freshness. Queued/null lease is private preparation only; a provided lease must satisfy the original leased state/expiry/lock checks. Place is a closed **parameter**, not proof of a persisted place.read receipt. Preparation never substitutes for a later checkpoint/action/settlement proof.

Actual isolated network-none PG4/4 PASS: en/zh SQL equals TS preparation, transactional migration rollback, source/owner/lease/digest/locale/observation failures, ordinary correction/source hiding/consent withdrawal invalidation, API-role execute denial and unchanged v2 completion hard fence. First negative test run failed decoding correct SQL NULL's empty psql output; that fixture parser was fixed without relaxing SQL, original FAIL retained.

## Remaining minimum execution/publication seam

Existing `complete_planning_comparison_v1` ties `planning_model_dispatches` to lease/turn/owner/task/scope/attempt and requires settled `model_budget_attempts` (actual_micros, owner/task and creation after admission). It also requires current result.prepare started action with matching lease/message/task/basis_digest, and completed immutable observations for evidence.lookup/place.read/constraints.evaluate. The original gate does not accept v2 and stays hard blocked.

A future reviewed dedicated v2 executor/completion must establish: (1) a validated dispatch receipt bound to **both** current intakeContextDigest and planningContextDigest plus owner/turn/task/lease/policy/scope/attempt; (2) completed matching action/checkpoint receipts from actual tools, including the place parameter's persisted observation and environment/freshness; (3) the existing settled cost/actual_micros proof for that same attempt; (4) current result.prepare action/basis and atomic terminal Task + result CAS/outbox transaction. Claim/dispatch/checkpoint/completion signatures and authority remain #561/Main integration work, not this private preparation. No legacy API fallback, fake settlement, manual gate removal or public writer is authorised by these functions.
