# Trip ServiceTask development settlement

Related to [AGENT-008 #227](https://github.com/JTCAO515/VP-V4/issues/227). This is an incomplete development slice, not billing enablement or full Issue closure. The original [ServiceTask contract](service-task-metering.md) remains authoritative.

The append-only migration `20261015020508_agent008_trip_service_task_settlement.sql` adds a nullable `service_tasks.trip_objective` reference record. A new task is born as `trip_modification`; existing text/reviewed tasks cannot convert. It records canonical conversation/goal/current message, exact confirmed goal-to-Trip link and version, scoped context, operation digest, immutable Proposal revision/digest and the original worker binding. It copies no conversation body or Trip content. The existing canonical message receives its one-time Task link, so existing lifecycle graph traversal can find the Task.

`trip_enabled=false` is the independent default admission gate. Original capacity `enabled=false` remains record-only. When explicitly enabled in an isolated development fixture, the original Free/Pass snapshot and account lock reserve the original capacity ledger; existing attempt budget/cost accounting remains separate. No real environment is enabled.

The existing Web/native scoped-edit routes accept explicit `schemaVersion: "trip-service-task/1"` requests:

- `trip_context`: `goal` is the exact canonical source tuple; `context` is the original closed context request. The Trip-only owner bridge validates current owner/session/consent/link.
- `trip_task`: `operationId`, original `basis`, `text`, and `goal` admit the new objective once. Same key/content replays; different content conflicts. Another key cannot create a second task for that same goal.
- `trip_select`: `selection` is the original closed candidate-selection request. The existing selector validates original settled attempt/completion and creates the original Proposal with its visible diff.
- `trip_read`: `operationId` reads the original operation. Unknown acknowledgement never causes automatic resubmission, replacement work, selection or confirmation.

`goal` contains `conversationId`, `goalId`, `goalVersion`, `messageId`, `messageSequence`, `linkVersion`, and `linkOperationId`. Callers obtain these through existing canonical goal/message and explicit goal-to-Trip link interfaces. Supplying IDs alone grants no authority. No end-user UI has been added in this slice.

`trip_service_task_owner_v1` exposes only qualified Trip context/selection/read/cancel. `trip_service_task_worker_v1` exposes a closed method/argument set for qualified Trip work; its claimer filters the original queue before leasing. Legacy scoped RPCs and all private functions retain their revoked ACLs. `tripTaskWorkerRPC` composes the new bridge with the original executor's injected RPC port; hosted worker entrypoint integration remains outstanding.

The original `confirm_and_apply_trip_proposal` retains exact confirmation digest, owner/session, original Patch, version conflict, scoped-source guards, snapshot and idempotency checks. Its entry hook acquires the original account capacity/grant lock before Proposal locks. The immediate original Trip-event trigger validates the producer binding, completed Turn, current source/consent and readable new snapshot and settles the already reserved task once in the same transaction. An error rolls back Trip, snapshot, event and capacity together. Record-only tasks retain business outcome without acquiring capacity. Manual unassociated proposals do not enter this ledger.

Rejection/expiry/conflict release only pending reservations. `cancel_trip_service_task_v1` returns `committed` after application; it does not undo the Trip or settlement. Original text admission/completion cannot reinterpret a Trip task. Provider usage/cost remains the original attempt authority; missing accounting is never synthesized as zero.

## Remaining gates

The new reference column needs reviewed exact lifecycle registry and export-schema integration. The candidate and baseline source fingerprints are in `artifacts/AGENT-008/trip-settlement-20261015/lifecycle-registration.*`; the candidate is not installed by the migration. Existing infrastructure/source fingerprints deliberately remain fail-closed; no observed schema hash is automatically adopted. Export/delete/revocation/restore-safe acceptance is incomplete, so this slice is not merge/release ready.

The existing scoped producer has no clarification/repair continuation protocol. Same-goal replacement admission and old-text continuation are rejected, preventing new-task budget resets; this does not implement a new continuation flow. Partial billing, revisions after delivery, waiting TTL and cross-period policies remain gated. Hosted executor integration, actual UI, remaining lifecycle/expiry/grant/deletion race suites, target Auth, provider costs, formal exact-head review and CI remain separate outstanding work. The parent Issue stays open.

Local tests use private PostgreSQL 17.11 with no TCP listener, private Unix socket and synthetic SQL auth/session fixtures. They are C0 role/transaction evidence, not signed GoTrue authentication, PostgreSQL 17.6 target compatibility, shared-database migration or production acceptance.
