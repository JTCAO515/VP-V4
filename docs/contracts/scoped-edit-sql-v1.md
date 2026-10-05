# Scoped Trip edit SQL / #198

Migration `20261005020000_scoped_edit.sql` appends the scoped edit domain. It does not enable a host, policy, recipient, budget, grant or provider. All new tables use RLS and revoke access from PUBLIC, anon, authenticated and service_role. All new public/private function EXECUTE privileges are revoked. The original Proposal creation and confirmation signatures and existing ACLs remain unchanged.

## Actor and lifecycle

Context preparation and all user mutations use the original live account/session/mobile epoch and owner Trip authority. Scope is explicit dayIds (≤7), itemIds (≤64), with ≤64 selected existing items. The snapshot supports ≤366 days and ≤500 items. The context seals actual actor, base/head, order, Profile metadata, Memory revision/consent metadata, exact reservation revisions and hard-lock revision. TTL is at most ten minutes; worker admission also requires it to fit within every enrolled source-policy deadline.

Reservation bindings are explicit `{itemId,referenceId,referenceRevision}` declarations preserving a current same-Trip reference. They do not verify a supplier. Missing bindings return current references requiring binding; unknown/incomplete/unavailable authority remains unavailable. Existing explicit #220 preservation bindings may be reused. No title matching.

Original `create_trip_proposal_patch` creates pending scoped proposals. A permanent lineage row binds exact patch/digest/revision/base/context/op. Marked revision/successor creation is rejected. Expiring/deleting a context cannot make its marked proposal ordinary. The original confirm writer has one checked prewrite hook and one projection-column extension; reversing both restores its body byte for byte and preserves signature/ACL. A deferred event trigger repeats source/epoch/TTL/head/order checks in the same transaction. Ordinary proposals take the original path.

Archive, deletion requests and account erasure remove scoped contexts, operations, locks, work and lineage. Bounded expiry cleanup removes contexts, preserving permanent lineage and operation recovery. Export is an exact live core-export lease/generation seam with record-key pagination across contexts, operations, locks and lineage. It retains `enrolled:false`, `inventoryStatus:partial`; old export packages are not retrofitted.

## Ordering and mutation recovery

`trip_items.manual_order` is optional. Absent values retain the original id order. Effective order is manual rank, otherwise legacy id rank; ties use id. `reorder_items(dayId,itemIds)` is a closed full-day permutation. Only changed selected positions gain explicit ranks; unmoved missing metadata remains absent. Inexpressible sparse permutations are refused. Snapshots, old-client content edits and rollback retain persisted ranks.

Manual `move_item`, `set_time`, `reorder_items` never create hard locks. Reordering fixes protected absolute slots. Moving a selected unlocked item allows natural index shifts, retaining every protected field and protected relative order. `lock` is an explicit independent CAS action and invalidates old contexts.

Operation keys lock owner+operation before the original actor lock. Retries require the exact full body and actor basis; an absent receipt is unknown. `abandon` takes the original full mutation and the same lock: absence becomes a cancelled-before-submit tombstone; an already committed result returns its original receipt without Undo/rejection/external cancellation.

## Worker and explicit selection

The existing ServiceTask/text_content/turn_private.work/budget framework is reused with `execution_mode=scoped_trip_edit_v1`. The private, empty worker settings registry requires the global host switch, current original text/planning consent and policy, explicit source use, reviewed recipient/endpoint, price/scope and source egress choices. No current-input consent is repurposed as Trip/Memory permission.

Worker RPCs use the fixed executor binding tuple: owner/task/turn/lease/op/context/digests/Trip/base/policy/scope/attempt/provider/model/price. Claim/reclaim keeps one permanent budget attempt, projects a fresh lease, and never redispatches an unknown prior provider request. Destination records bind the exact current prompt/body digest, stable identity tuple digest, server configuration and ordered configured→attempted→response_buffered phases. Raw request bodies are not retained. Output and usage remain tied to the original attempt; accounting can settle known output after lease recovery without another provider call.

`complete_scoped_trip_edit_work_v1` derives and guards a single candidate from settled typed output, returns `candidate_saved`, and creates no Proposal or Trip write. `read_operation` and completion reads are read-only. The authenticated user's `select_candidate` is a new independently idempotent operation and invokes original Proposal creation under current actor/source/TTL validation.

Candidate edits are the three manual edits plus remove/replace/add from items already present in the original context. Add requires an explicitly selected day and generates `edit-` + the first 32 hex characters of SHA256(JSON.stringify(["scoped-trip-edit-item/1",contextId,askOperationId,candidateId,zeroBasedEditOrdinal])). The candidate ID is the permanent attempt ID. No model/client authors a title, identity, external source or availability claim. The worker patch must equal SQL's derived patch exactly. Diff reports transfer impact pending, walking improvement unverified and external order effect none.

## Validation boundary

`VP_TURN_DB_TEST=1 node --test tests/integration/scoped-edit/scoped-edit-postgres.test.mjs` uses disposable network-none PostgreSQL and synthetic auth/session rows. The optional source-root environment variables select the exact integration TypeScript/worker checkout for local cross-owner tests; the default is the integrated repository. This is not signed GoTrue, target HTTP, real provider, device or production acceptance. Historical SQL alias/operator failures and archive-fixture version mistakes remain distinguished from repaired passing runs.
