# #198 scoped Trip editing — development evidence

Product source fixed at `ad3ef1b85f7e7749eeb19fa0ce2463c1d7aeb7a5`, based on main
`4dbde74126206e8ef4229497b21d1c46f85578e8` (includes #649). This evidence is
repository development, not target activation or user acceptance.

## Delivered scope

Native confirmed day/item selection → explicit Ask → bounded typed candidates and
before/after effects → explicit user selection → exact original Proposal review →
original confirmation → same object anchor/reload. Direct move, actual persistent
reordering and time changes remain separate from explicit user locks. Current
reservation references require explicit item/revision bindings when absent.
Add/replace reuse current same-Trip content; unsupported new venues remain explicit.

The original writer retains actor/session/RLS/CAS, exact digest/revision/base and
confirmation. Source/Memory/profile/reservation/lock/expiry currentness is checked
on marked reads and before the first Trip write and again in its transaction.
Marked successors are refused. Immutable operation recovery, abandonment fencing,
settled declined results and unknown ACKs stay distinct. None cancels external orders.

The existing ServiceTask/work/lease/budget/host/stop/usage-journal framework is reused.
A worker stores a settled candidate; only the user's independent select operation
creates a Proposal. The final internal usage wire has five closed fields including
`outcome`. The four-field intermediate codec was not integrated. All new SQL
callable seams are revoked by default; no target role, policy or budget was enabled.

## Actual checks

| Evidence | Result and limit |
| --- | --- |
| Scoped TS contracts | PASS: selected scope, protected fields/slots, direct edits, deterministic same-Trip add/replace/remove, explicit candidate selection, exact Proposal and immutable-operation/terminal retry. The final declined and marked-reader changes have their affected cases. |
| Original Patch/diff/snapshot regression | PASS: 4 patch/diff and 6 local protocol/capability cases. Sparse historical rollback uses the actual stored target, preserving rank 9 rather than normalizing it. |
| Actual original adapter path with synthetic transport | PASS: marked same-head stale/current qualification, wrong proposal-id rejection, no new RPC for unmarked proposals, and stored rollback target. This is not target RLS/Auth proof. |
| Worker/host source groups | PASS by affected source: one attempt, recipient/budget/stop/source guards, canonical destination/request identity, usage fsync/known zero/unknown cost, lost output/settlement/completion ACK recovery, explicit declined result, and existing host compatibility. Reused groups are not summed as new coverage. |
| Disposable PostgreSQL | Historical complete final suite: **24 PASS / 1 FAIL** out of 25. The failed item-only move exposed unspecified aggregate order. It was fixed with explicit ordinality; the affected final run is **5 PASS / 0 FAIL / 0 SKIP**. Other green cases were reused. This is not a claimed fresh 25/25 run. |
| Five affected PostgreSQL cases | PASS: move preserves untouched fields/relative order; six candidate kinds and deterministic source identity; actual TS service→SQL→exact Proposal→confirm/readback; actual executor→real SQL with a synthetic provider, one call, lost ACK recovery and declined settlement; reorder-before-removal preserves operation sequence. |
| Native source validation | PASS: generic build-for-testing/test-target compilation, 8 host behavior cases, actual TS producer→Native strict decoder/exact-reference comparison, plus the affected declined and PlaceActions optional-order compatibility cases. Simulator test execution was not performed. |
| Actual local Next HTTP | PASS: six scoped-route boundary cases (native cookie/origin rejection, invalid Trip, Web missing/wrong origin, unavailable operator config) with private/no-store responses. No authenticated target capability is inferred. |
| Integrated source checks | PASS: typecheck, source-policy lint, docs check, diff check, and production Next build on the fixed product source. DB registry adds only the exact scoped PostgreSQL file using the existing `VP_TURN_DB_TEST` gate and retains #649. |

SQL evidence was produced by its original owner using the frozen five-field executor
source equivalent to commit `36eff2f8ca45691e95299f6075d626743610698b`.
Native fixed sources are the complete `0cd29ea8` package plus `80192063`.
The real SQL/provider joint uses synthetic Auth/session rows and a synthetic provider
transport, not a paid or live model. Native decoder evidence is source-backed fixture
interoperability, not iOS runtime acceptance.

Relevant historical failures are retained: the initial SQL alias/operator/fixture
failures, the unspecified relative-order aggregate, strict internal four/five-field
codec mismatch during coordination, and Native host/compiler fixture failures.
Repairs and affected passing runs do not retroactively turn those runs green.

## UNRUN and rollout

Target GoTrue/native HTTP and actual account/mobile-session chain; actual provider
and tariff/charges; deployed worker/schema/permissions; iOS Simulator/device runtime,
VoiceOver/human observation and release/production acceptance are **UNRUN**. No phone
authorization, new credentials/roles, Storage, actual-user delete/export or production
operation occurred. Private export metadata remains unenrolled/partial, preserving
the existing package boundary.

Repository-required final-head CI and formal review precede normal protected merge.
Development closure is Main's whole-code decision and is separate from merge, rollout
and unified target/device/provider acceptance. Rollback disables scoped admission/host
configuration while retaining accepted Trips, ordering, operation receipts and
revocations; it does not rewrite the applied migration or undo external orders.
