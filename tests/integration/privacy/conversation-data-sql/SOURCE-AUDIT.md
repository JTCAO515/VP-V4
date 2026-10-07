# Conversation SQL source audit: concrete source-graph finding

Base: `a1f70134fb6abf3672a94b956a4296b36c2c3d59`.
Independent branch/worktree: `vpj58-conversation-data-sql-20261006`.
Source contract: sole TS `lib/server/privacy/conversation-data/WIRE.md` in
`vpj58-conversation-data-server-20261006`, plus its closed contract/protocol;
subsequently aligned to fixed `9a91fe36de00e6b6f0392e5f6373a08e80a9d316`
and then to Mainc6548c refinement `1b169b2260f5fbb625201255b777fe5eeb72e9d8`. Synthetic Native envelopes do not supply
source-graph or signed Auth evidence.
No old SQL owner, dirty original checkout, shared registry or TS file changed.
Initial source finding preceded new SQL. A private-state migration prefix
has now been written and tested locally; no public RPC/source executor, target
grant, deployment or real-user erasure performed. This remains partial development.

## Finding: text redaction has an unlisted mixed-scope reverse effect

`20261003180000_vpj17_source_impact_outbox.sql:209-233` defines
`knowledge_review_private.clear_source_impact_private_turn(uuid)` and
`source_impact_text_lifecycle()`. The real `clear_source_impact_on_text_hide`
AFTER UPDATE trigger runs when selected retained text first becomes hidden.
Its dependency is JSON, so checking incoming FKs alone cannot discover it:

- `source_impact_sets.graph_snapshot[].target` where
  `kind=historical_answer` and `id=selectedTurn`;
- `source_impact_items.target` and copied projection targets;
- derived `source_impact_pages.receipt`, outbox and review requests.

The existing source producer is `knowledge_review_private.impact_graph(uuid)`;
it selects actual completed grounded answers with live public Turns and unhidden
text. These are real stored references, unlike the reservation validator's
unimplemented artifact-reference alternative.

The cleanup deletes selected historical-answer descendants, **all pages for
the whole set**, changes set graph/digest/version/status and marks **every
unacked outbox in that set** stale. A set can contain another conversation's
answer, wiki/statement or Trip-support target. That violates the approved
outside-selection preservation and exact effect-count contract if allowed to run
as an implicit side effect of the new text-redaction executor.

It also takes blocking `FOR UPDATE` locks on sets and deliveries inside the
trigger. The outside executor's sorted NOWAIT locks alone do not make these
unlisted effects nonblocking. Original impact delivery/application takes outbox
locks first; original cleanup takes set then delivery. No old guard or cleanup
function was modified to mask this mismatch.

## Actual baseline PostgreSQL reproduction

Command:

```sh
VP_CONVERSATION_SOURCE_AUDIT=1 node --test tests/integration/privacy/conversation-data-sql/source-audit.test.mjs
```

Initial audit run: **PASS 3 tests / 0 failures / 0 skipped**, 6452 ms including setup
and owned container cleanup. Final private-constructor run: **PASS 5 tests / 0 failures / 0
skipped**, 7721 ms. Four child cases plus the parent are Node's five tests.
Disposable local PostgreSQL 17.6.1.159, `--network none`, all migrations before
the reserved new slot applied transactionally from the exact baseline. SQL claims
and valid admin-seeded synthetic mixed-set rows; no signed Auth or new erasure RPC.
No trigger bypass, fake missing source, fixture target grant or provider call.

Observed effects after updating only selected text inside a rolled-back transaction:

| Observed source state | Result |
| --- | --- |
| Mixed set pages | 1 -> 0 |
| Unselected historical-answer outbox | queued -> stale |
| Unselected outbox error | private_source_removed |
| Mixed set status | pending -> invalidated |
| Selected historical-answer item | deleted |
| Unselected historical-answer item | retained |
| Unselected text | still unhidden |
| Rollback | complete before/after row inventory identical |

The test is a reproduction of the existing trigger, not evidence that an ordinary
user can create those impact records or that the new erase operation works.

## Catalog inspected

Generated local evidence: `artifacts/VPJ-58/conversation-data-sql/source-catalog.json`.
Includes exact migration hashes, all 40 mapped table columns/
constraints/ACL/RLS, all 125 inbound/outbound FKs, 83 existing mapped-table triggers
and their function bodies, 148 baseline application JSON columns and 11 directly
matched reverse-source function definitions. No user rows, foreign IDs, source
bodies or secrets are present in this saved evidence. This directory is ignored by
the baseline repository; the test regenerates the evidence locally.

Actual incoming FKs outside the mapped tables are Guide, readiness and scoped-edit
relations already identified by WIRE. The newly found source-impact edge is JSON/
trigger-based. JSON-column enumeration is evidence for further source inspection,
not a claim that every JSON value or future producer is semantically supported.

Actual retained columns (not a complete-row-removal claim):

- `service_tasks`: id, owner_id, thread_id, goal_turn_id, last_turn_id, policy_id,
  consent_id, scope_version, expected_result, goal_digest, budget_scope_id,
  created_at, capacity_enforced.
- `service_task_turns`: turn_id, task_id, owner_id, parent_turn_id, relationship,
  idempotency_key, request_digest.
- `text_content`: turn_id, owner_id, thread_id, policy_id, consent_id, locale,
  input_text, output_kind, output_text, hidden_at, created_at; only the approved
  marker/null/permanent-hide fields may change.
- `service_task_capacity`: task_id, owner_id, policy_version, tier,
  grant_environment, grant_transaction_id, admitted_at, state, settled_turn_id,
  settled_at, released_at.
- `model_budget_attempts`: scope_id, attempt_id, task_id, provider, model,
  price_version, reserved_micros, actual_micros, status, created_at, updated_at.
- `text_dispatches`: lease_token, turn_id, consent_id, policy_id, dispatched_at.
- `assistant_goal_trip_receipts`: operation_id, owner_id, conversation_id, goal_id,
  session_id, request_digest, action, source_kind, source_message_id,
  before_link_version, after_link_version, before_goal_scope_version,
  after_goal_scope_version, trip_id, trip_head_version, created_at.

The retained task/text FKs deliberately point to retained text, not public Turns;
this part of the approved deletion boundary is structurally possible. The
source-impact side effects cannot be folded into those retention counts.

## Original policy/consent provenance finding and accepted correction

The original source supports real **record-only goal conversations with no
ServiceTask or text_content**. `20260927021000_vpj78_conversation_membership.sql`
stores mandatory policy_id/consent_id on the conversation and message. Its
`submit_assistant_message_v1` explicitly requires task_id=null/turn_id=null for
goal_start, and its own source reader requires the exact current source policy
and owner consent. This is a normal supported path, not a fabricated source.

Erasing its conversation/goals/messages removes all source-policy associations.
The fixed wire's EXACT operation fields, B, D and seven graph keys have no policy/
consent reference slot. Its six retained source categories cannot supply a task/
text policy association when no task/text existed. A sourceDigest is a one-way
whole-source hash, not an original policy/consent lookup. Another live owner
consent must not be treated as the erased source's original consent.

The current instructions require original live policy/consent qualification
before feedback, while the wire also promises terminal same-byte recovery even
after the original 30-second deadline. The original policy/consent gate for this
taskless path cannot be reconstructed from the permitted persisted fields after
erasure. Mainc6548c resolved the boundary without weakening terminal authority: the fixed
TS `1b169b22` adds inspectable flat sourceAuthorities, at most100 deduplicated pairs
sorted by policyId then consentId. SQL retains these IDs and requalifies the exact
original consent; progress uses the selected rows' finite union. No replacement
consent or policy summary may substitute. This correction is in the same frozen task.
This SQL owner has not silently weakened the source policy guard, invented a
retained task/text row, or stored hidden source bodies to obtain recovery.

This finding is source/closed-contract inspection, not a claim of a new ordinary
RPC failure. No extra test matrix or target action was run for it.

## Required correction before source executor can be accepted

Use the existing `SOURCE_UNSUPPORTED` conflict, with no IDs/body in feedback, for
selected historical-answer references in any of the six impact tables. Preserve
the domain; do not run its cleanup or delete mixed pages/outboxes under this scope.
Include whole matching reverse inventories in source CAS and the row ceiling;
cover the six tables' old/new target and set-graph JSON references in permanent
parent fences, including copied page/projection/receipt references. A stale
producer which captured the old graph must not insert that graph after erasure.
The original impact producer/cleanup/Trip business functions must remain intact.

This is the requested concrete source finding for Main/sole TS, rather than a
fabricated empty relation or a new supported deletion domain. The reserved
`20261006060000_conversation_data.sql` currently contains only the private state,
private xid proof shape, closed selection/input helpers, current actor/epoch/reauth
guard, flat operation projection, finite 40-table source registry, known nested
reference helpers, and drift checks for actual columns/types/PK/inbound/outbound
FKs. Its reconstructed tombstone lookup is not yet attached to source writers.
Own binding/decision immutability and deferred proof cleanup are enforced on the
new private tables. The additional PostgreSQL case verifies
transactional migration rollback, unchanged old function bodies/ACL/config,
default denied schema/functions/tables plus RLS, retained inert session UUID and
original owner-account cascade, source-column drift rejection, binding move
rejection and rollback of a leaked transaction proof. A PL/pgSQL alias ambiguity
found during this local extension was corrected before the final four-test PASS;
it is not a new source/data-policy failure. Its directly seeded private binding row is a
metadata-lifetime fixture, not a validated graph/preview or erasure receipt.
No stub public RPC returns empty source relations or an erasure acknowledgment.
Actual private fixed-point closure and source construction now exist. The
constructor gathers qualified actual mapped rows/counts, whole-row hashes and
original source authority IDs, then includes the six-table mixed source-impact
inventory in the source fingerprint and SOURCE_UNSUPPORTED conflict. The current
fifth PostgreSQL case calls this constructor on actual retained text/task/Turn
fixtures: original singleton authority/graph/counts match; outbox-only mutation
changes the digest and rollback restores it; revoking the original consent blocks
qualification. No source effect or new public RPC is exercised.

Remaining implementation: complete reverse-domain/copy/source inventory review,
source/advisory/row locking, attached permanent old/new-parent/known-JSON guards,
whole-source CAS with absolute deadline, atomic exact-count effects, immutable
receipt/recovery, owner list/progress inventory and public RPC. Do not integrate
this partial checkpoint as a completed migration.
Full executor permission/graph/CAS/late
rollback/replay/retention/concurrency/receipt/inventory tests remain **UNRUN**;
signed Auth and Native remain with their original owners. Whole #239/full missing/
ALL2 remains Open.

JT's 2026-10-06 08:27:35 CST freeze applies: finish this existing scope only;
no new development thread or reassignment to another scope after it closes.

Current private source checkpoint consumes fixed `1b169b22` and is not scopeComplete.
The source-authority and impact findings are resolved at the agreed contract level;
remaining SQL implementation is work in progress, not a new approval blocker.


## Fixed complete SQL checkpoint, 2026-10-07

The earlier partial checkpoints above are historical. The complete source now
implements source/advisory/NOWAIT locks, old/new-parent permanent guards,
full-row CAS, bounded child-first effects, exact immutable-byte recovery,
original sourceAuthorities requalification, and finite list/preview/erase/recover
operation/progress inventory. Default ACLs remain revoked; no target grant,
provider, deployment, Storage, or real-user deletion is included.

Final review found a concrete remaining copy gap: the original impact schema's
individual FKs permit outbox.set_id to differ from item.set_id, projection.set_id
to differ from delivery.set_id, and receipt/review links to reach another set.
The six-table reverse inventory now closes those actual links in both directions,
includes complete connected sets in CAS/4100-row capacity, and keeps every copy
under SOURCE_UNSUPPORTED. Both OLD and NEW source-parent guards use this same
bounded closure, including copied receipt references. No impact cleanup or
original producer/immutable-effect function was changed.

Affected local command:
`VP_CONVERSATION_SOURCE_AUDIT=1 VP_CONVERSATION_MIXED_COPY_ONLY=1 node --test tests/integration/privacy/conversation-data-sql/source-audit.test.mjs`.
Actual marker c09426: exit0, 6 PASS, 0 fail/skip, 8918 ms including disposable
PostgreSQL setup and cleanup. Five child cases plus parent; the focused selector
does not register unrelated cases. All six table inventories affect CAS; rollback
restores the digest, old-parent move/new copied-parent inserts fail closed, and
no copies are erased. ACL/RLS/default denial, migration rollback, unchanged
original function bodies/ACL/config, and the existing source reproduction are
also checked. Evidence: ignored `artifacts/VPJ-58/conversation-data-sql/mixed-copy-catalog.json`.

Retain prior actual a395a845 11 PASS/0skip (42616 ms), including actual RPC,
taskless authority/progress, retained task/text/capacity/budget, real 30-second
late rollback, CAS/foreign/NOWAIT, and complete confirmed Trip/explicit Memory
row retention; no handoff-only rerun of those cases. Original D4 marker1832096e
7 PASS/0skip and separately reported D3 six PASS are retained evidence, not new
runs. The focused run does not claim final combined TS/Auth/Native acceptance.

Failures retained: 483769 failed before PostgreSQL setup because local Docker
socket was absent; Docker was started. 046622 had 4 PASS/2 FAIL including parent:
the new fixture attempted an UPDATE prohibited by original immutable impact-item
rules. Corrected to a legal INSERT without changing any oracle/guard; c09426 passed.
Earlier syntax/array/lock-order failures remain in original evidence/history.

Sole TS still owns actual PG consumer/signed Auth integration and the one PR;
Main owns whole-source/exact-head formal review, required CI and protected merge.
Target grant/config/credentials, backup/old devices/ALL2 and whole #239 remain
UNRUN/Open as applicable. This fixed SQL checkpoint closes the owned SQL
implementation, not the whole integrated ConversationData delivery.
