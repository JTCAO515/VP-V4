# Conversation SQL source audit: concrete source-graph finding

Base: `a1f70134fb6abf3672a94b956a4296b36c2c3d59`.
Independent branch/worktree: `vpj58-conversation-data-sql-20261006`.
Source contract: sole TS `lib/server/privacy/conversation-data/WIRE.md` in
`vpj58-conversation-data-server-20261006`, plus its closed contract/protocol;
subsequently aligned to fixed `9a91fe36de00e6b6f0392e5f6373a08e80a9d316`
(protocol unchanged from `44c1d705`). Synthetic Native envelopes do not supply
source-graph or signed Auth evidence.
No old SQL owner, dirty original checkout, shared registry or TS file changed.
Initial source finding preceded new SQL. A 159-line private-state migration prefix
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
and owned container cleanup. Final prefix run: **PASS 4 tests / 0 failures / 0
skipped**, 7721 ms. Three child cases plus the parent are Node's four tests.
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
guard and flat operation projection. The additional PostgreSQL case verifies
transactional migration rollback, unchanged old function bodies/ACL/config,
default denied schema/functions/tables plus RLS, retained inert session UUID and
original owner-account cascade. Its directly seeded private binding row is a
metadata-lifetime fixture, not a validated graph/preview or erasure receipt.
No stub public RPC returns empty source relations or an erasure acknowledgment.
Source closure/locking/CAS/known JSON fences/effects/receipt/inventory executor
remain required work. Do not integrate this partial prefix as a completed migration.
Full executor permission/graph/CAS/late
rollback/replay/retention/concurrency/receipt/inventory tests remain **UNRUN**;
signed Auth and Native remain with their original owners. Whole #239/full missing/
ALL2 remains Open.

JT's 2026-10-06 08:27:35 CST freeze applies: finish this existing scope only;
no new development thread or reassignment to another scope after it closes.
