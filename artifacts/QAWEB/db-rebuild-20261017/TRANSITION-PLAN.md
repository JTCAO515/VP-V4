# DB-REBUILD-20261017 — non-destructive transition proposal

Status: PLAN ONLY. No target observation, apply, switch, credential change, worker
activation, provider call or real-data access was performed. Source7f0352ac and its
synthetic proof are inputs, not deployment authority. Existing target remains
Go2China / dzqdzetcctkhbrhlxxgn; project, Origin, Auth issuer and public API signatures
are not replaced. No old snapshot restore or full historical replay is required
for development of this baseline.

## Fixed evidence and limits

- Source: 7f0352ac99affbb00c67e77ca1ff1b7196b769af.
- First proof: 9a34440a09c6a5d53d4ac9252e64ecfa4054c692.
- Current run: run-7b58be351544427399ec75a610f9da8b.json, 19 named groups on each
  of two fresh databases (38 observations, not38 distinct scenarios).
- Application SQL SHA256: f69bd4b8d8cbb9b16e1b2779dbcc25e8661f779a93e9211a5ac4f1c1701e39c8.
- Real managed Auth/JWT issuer, provider usage, target behavior and device UAT:
  UNRUN. The actual application/API consumer independently verifies its fixed
  caller path; catalog-name presence alone is not an end-to-end result.
- The previous c66/e225 read increment and all intermediate/failed runs remain
  separate. They are not accumulated into the38 result or relabeled as7f tests.

## Fixture-only endpoint and usage boundary

The7f producer fixture stores the DashScope international endpoint as SQL metadata.
The existing trusted service HTTP transport currently permits its existing Beijing/
workspace configuration. SQL tuple equality in this fixture therefore does **not**
prove HTTP worker compatibility, an approved operational endpoint or supplier
availability. Do not deploy WRITE-SEED values directly, relax the transport
allowlist, add an adapter or switch Workspace to make the fixture appear operational.
A later operational binding must reuse the actually approved service configuration
and match its policy/notice/endpoint/model/price/scope tuple under the original gates.

The value7 is a trusted-service synthetic settlement input. It exercises the DB
reservation/dispatch/settlement/completion state machine; it is not measured or
validated real provider usage, a billing receipt or permission to charge. Actual
operation must retain the original ModelGateway usage validation and durable
receipt authority. Unknown usage remains pending, never a manufactured zero.
The independent service owner can validate SQL worker/budget/result without real
HTTP/provider calls; those evidence classes remain separate.

## Proposed object treatment, before any target DDL

| Object group | Proposed treatment | Evidence needed before action |
| --- | --- | --- |
| auth users/sessions, auth helpers | Reuse managed Auth unchanged. Never deploy platform.sql. | Existing issuer/project/JWKS/session semantics and required column compatibility; no account export or token copying by default. |
| identity_private mobile accounts/attempts/proofs and Native identity RPCs | Reuse existing identity authority and epochs; no reset, duplicate authority or generic claims-echo replacement. | Exact signatures/ownership/ACL and behavior for active/replaced/revoked sessions; unresolved difference returns to identity owner with a precise lease. |
| user_profiles and canonical Trips | Preserve existing rows, IDs, extra columns, owners and policies. The small fixture definition is not a replacement schema. | Scoped current metadata and compatibility with existing consumers. No Trip writer or TripProposal confirmation is bypassed. |
| chat_threads, turns, chat_turn_events, chat_turn_idempotency | Prefer existing canonical objects and stable IDs. Create only genuinely missing objects after review; additive changes must preserve existing data and other consumers. | Exact before-shape/constraints/RLS/ACL, existing statuses and all references. No guessed defaults or blanket backfill. |
| text policies/consents/content, ServiceTask links/work, model budget/dispatch records | Keep one authority and all existing lineage/receipts. No broad copy, replacement, purge or requeue. | Policy/consent IDs, hidden/revoked/deleted states, original request text/digest, parent order, leases and every unresolved financial state must map losslessly. |
| QA RPCs and worker metadata | Review a finite ABI-preserving body delta against actual target definitions. Create absent ports or replace only explicitly leased bodies. | Before/after hashes, role/security-definer/search_path review, exact same-Session and Native atomic epoch tests. Non-QA branches and callers must retain their original behavior. |
| Grounded/Assistant/other private anchors | Fixture anchors are not a target feature implementation. Reuse real objects; do not deploy empty substitutes over live domains. | Any cross-domain dependency or lifecycle hook remains an explicit compatibility gap, not an always-true schema guard. |

baseline.sql is a fresh-fixture materialization. It is not an idempotent target
migration and must not be run wholesale against the existing project. In particular,
CREATE SCHEMA/TABLE statements, fixture ACL assumptions and missing broad product
hooks cannot be treated as an approved target delta.

## Finite candidate delta to prepare after scoped target access is authorized

D0. Read only the explicitly listed catalog/privilege/dependency metadata needed
for the above objects. Record exact source/target IDs, hashes, counts and mismatches;
request no rows, secrets, raw function bodies or full-catalog dump by default.
Actual before-values are currently UNKNOWN. This document does not invent them.

D1. Classify each required object as unchanged/reuse, genuinely absent/additive,
compatible replacement, or unresolved. Generate a separate reviewed change script
only for the selected absent/additive/leased replacements. Do not modify old
append-only migrations. Avoid unrelated schema rewrites or full-history replay.

D2. Validate the candidate on a newly authorized representative environment. First
use synthetic row shapes and deletion/unknown-state fixtures. If representative
real data is necessary, Main must identify its precise authorized source, fields,
privacy handling and retention before access. Preserve all canonical IDs; an
unmapped row/state is a stop, not a discard/default/anonymous conversion.

D3. Establish one writer during the bounded change interval: review actual worker
and request ingress state, drain or explicitly stop only the authorized writers,
and preserve unresolved requests as unknown. Do not assume a reported disabled
worker is still disabled. Do not turn it on as a side effect of schema installation.

D4. Apply only the exact approved delta using the authorized target writer, with
transaction/lock timeouts and pre/post assertions. Save the original executable
function definitions/ACL/RLS/owner fingerprints in their authorized private
location. No new public API, project, credentials, broad GRANT or privilege bypass.
Any effective persistent privilege expansion needs an explicit scope decision.

D5. Admit an explicitly scoped canary only after target/Auth/API gates pass. Real
provider work/fees and worker activation require the applicable authorization;
synthetic price/usage7 is not billing evidence. Verify actual login→Session→first
answer→save→reopen on the requested client before reporting service readiness.

## Data and deletion invariants

- Preserve owner/session/task/turn/request IDs and original parent links. Repeated
  requests keep the original bytes/digest and admission. No new UUID or automatic
  POST may substitute for unknown acknowledgement.
- Retain hidden_at, revoked_at, deleted/tombstone states and expiry semantics.
  Recreating an owner/ID must not revive hidden content or old consent. Do not
  reconstruct missing deletion state as active.
- Keep reserved/dispatched/pending/settled/released budget states and dispatch
  receipts coherent. Unknown usage is not zero, and cancellation is not settlement.
- Preserve immutable policy notices/recipients/consent IDs and existing role/RLS
  boundaries. The synthetic platform shim and local role creation confer no real
  Auth or persistent target privilege.
- Trip content still requires Proposal→visible diff→explicit confirmation→atomic
  patch. This QA baseline supplies no alternative Trip writer.

## Rollback and stop rules

Before changing target behavior, prove one of two honest outcomes:

1. **Executable rollback:** retained original routines/ACL/RLS and compatible data
   can resume without dropping post-change writes. Test this with synthetic
   post-cutover admissions, settled output and pending/unknown records. Added
   objects/columns remain; rollback does not drop them or erase new records.
2. **Safe stopped state:** if old code cannot interpret a new durable state, stop
   authorized ingress/dispatch and preserve the records for reconciliation. Do not
   label this service recovery or force a lossy reverse migration.

Rollback triggers include ownership/epoch isolation failure, response/digest
incompatibility, duplicate admission/dispatch, lost deletion state, unexplained
budget mismatch, source drift or inability to prove cleanup/state. Stop before
additional writes, preserve the original receipt, and investigate under a bounded
scope. Failed old restoration is not a proven rollback path; successful synthetic
restore/build is not a real-data recovery guarantee.

## Authorization boundaries: old A–D/E versus new direction

- DB-REBUILD authorizes this source/synthetic path and removes old snapshot restore
  and all-history application as development prerequisites. It does not assert that
  any old A–D step or conditional E gate has newly passed.
- Historical A–D evidence remains historical and object/scope limited. This plan
  does not reclassify its permissions or execute those operations again.
- The old conditional E runbook requires its own exact target/capture/restoration/
  replay/ownership/window evidence. A changed strategy does not make those old
  predicates true. Neither its old fixed-version plan nor E/163 apply follows from
  a green empty baseline.
- For any concrete target action, Main checks current applicable authorization and
  the exact environment/object/action delta. If it is outside that scope, resolve
  the difference before the action. Do not infer permission from source access.
- 795, bda and e133 remain closed/expired; no reset, restored HOLD, renewed clock or
  reuse of their used/grant records. Old material and retention remain unchanged.
- Production/TestFlight, new credentials, provider fees, real worker enablement,
  real-data access and online cutover are not performed or authorized by this proof.
