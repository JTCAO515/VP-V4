# Private v2 durable checkpoints — preparation only

2026-10-03. Base main a9e02f3a196b8c299f79e680ace7cdac0f26c5c2 / merged SQL020000. Main approved additive40000 on this branch; SQL03030000, HTTP/native, old exports, worker, flags and completion fences remain unchanged. Frozen Ports contract: c441e3b32830c9c2520818057bb4dc879fd49f5b, `docs/contracts/vpj80-v2-worker-protocol-ports.md` Git blob82c6756164e9d9af7ae22b46fd83fa36c07ad721. No dependency on a mutable worker checkout.

## Stored authority and lock order

New private RLS table `turn_private.planning_v2_place_checkpoints`: turn PK, owner/task FKs, immutable original claim lease, both distinct digests, state, timestamps, bounded closed observation. Insert trigger verifies all owner/Task/Turn keys against the same planning row. Update trigger preserves all identity/claim fields and permits only started→unknown/completed; completed observation must pass the frozen source/environment/time/range validator. There is no missing row inserted as a reset and no completed→started transition. Owner, Task and planning row deletion cascade; ordinary/API roles have no table privilege.

Six binding parameters in order: `(p_owner uuid,p_task uuid,p_turn uuid,p_lease uuid,p_intake_digest text,p_planning_digest text)`. NULL lease is always blocked, even when020000's admission-preview read could qualify a queued row. Every operation uses existing auth/account/session/Turn/thread→work locks and current qualified read, verifies exact owner/Task/Turn and both digest namespaces, then accesses the checkpoint. No checkpoint→work reverse order. Current input/Memory/consent/session/lease are requalified per operation; a stored receipt never grants provider permission.

| Private function | Result / behavior |
| --- | --- |
| `planning_v2_checkpoint_basis_v1(six)` | Current qualified payload or SQL NULL; private utility only |
| `read_planning_v2_checkpoints_v1(six)` | Strict snapshot below, or `{kind:'blocked'}`; no fallback on error |
| `claim_planning_v2_place_v1(six)` | `{kind:'claimed'}` only for one committed absent→started row; otherwise duplicate/unknown/blocked |
| `save_planning_v2_place_v1(six,p_observation jsonb)` | true only once for original claim lease and started→completed commit; every repeated save returns false |
| `unknown_planning_v2_place_v1(six)` | true only original claim lease and started→unknown; invalid authority leaves started untouched |
| `valid_planning_v2_place_v1(jsonb,text)` | Closed observation validator; no authority |
| `planning_v2_model_attempt_v1(owner,task)` | Read-only utility, no budget mutation/release |

All private functions revoke EXECUTE from public/anon/authenticated/service_role. No public wrapper, claimer, permit, provider dispatch, model output/settlement, publisher, scheduler or completion operation is added.

```json
{"schemaVersion":"planning-v2-checkpoints/1","ownerId":"uuid","taskId":"uuid","turnId":"uuid","intakeContextDigest":"64lowerhex","planningContextDigest":"different64lowerhex","place":{"state":"missing"},"modelAttempt":"none"}
```

Place has only state for missing/started/unknown; completed has exactly state and observation. Read of completed may use a new active lease only while source/dual digests and observation freshness still match. The original claim lease never rotates. Started/unknown under a new lease is a durable no-replay state; old/new lease writes cannot adopt that claim. Expired lease, correction, hidden source, revoked policy/Memory or stale observation is blocked; no receipt is moved or cleared. A lost claim ack retains started. A lost save ack is recovered only by current readback in another process; save is not idempotently acknowledged again.

Observation is exactly planning-place/1 (schemaVersion/source/observedAt/providerCalls/areas). Source is synthetic_fixture for local_synthetic and amap for staging; only current≤5min and future≤5sec observations qualify. Two unique jingan/peoples_square areas, labels1..80 UTF-16 units, nullable integer railMinutes0..180/transfers0..5, providerCalls0..13. No price/quietness/safety/availability inference. Staging source validation is schema evidence, not real Amap authorization or observation.

Model enum stays none/released/reserved/dispatched/pending/settled. Zero actual rows alone means none. The actual Task budget scope and scope owner are checked; any scope/owner mismatch, multiple rows, unknown status or ambiguity returns pending. A later released row cannot hide unresolved prior rows. Reserved/dispatched/pending/settled blocks new claim; settled is not a place permission or reconciled model output. No ledger field is written. This private point-in-time read does not supply future atomic provider authorization.

## Strict local test adapter

`planning-v2-checkpoint-test-ports.ts` only accepts an explicitly injected private transport in local_protocol_test mode; no client/credential/execution grant is configured. It supplies the four checkpoint Ports, forwards exact six bindings once, validates closed snapshot/identity/model/place states, and throws on blocked/malformed/transport failure. Claim is claimed/duplicate/unknown; save is boolean; unknown maps authoritative true to void and failure to throw, preserving durable started. No automatic retry or missing/none fallback. Separate permit/read/place/preparation Ports remain owned by561 and are not minted here.

## Bounded data rights

Main specifically approved new `public.planning_v2_checkpoint_export_owner_v1(owner,after_turn_id=NULL,limit=100)`: service_role-only EXECUTE plus explicit auth.role guard, owner-qualified UUID keyset cursor, limit1..100 and limit+1 sentinel. Exactly schemaVersion/items/hasMore/nextCursor/sectionComplete. Items contain only turnId/ownerId/taskId/state/startedAt/completedAt/closed observation; never claim lease, digests, credentials or endpoints. A foreign/missing cursor is rejected. This section's pagination completion is not a privacy executor/request completion claim. Existing exports are unchanged; executor wiring and full target account-deletion acceptance remain UNRUN.

## Verification boundary

Owned pinned PostgreSQL container uses network none/no ports/Simulator and all actual checkout migrations. Before40000, baseline proves valid020000 qualified input with both false flags and absent durable store. Migration BEGIN→ROLLBACK leaves table/export absent; final actual tests exercise concurrent claim, lease rotation/expiry, lost save acknowledgment/new process read, strict source/time/ranges, source/Memory/policy withdrawal, immutable identities, readonly ambiguous ledger, API ACL, completion fence and bounded export/cascade isolation. No external provider, real cost, result artifact/event or Trip write.

Formal union CI and worker adapter integration depend on Main's final frozen union. Deployment, real provider/model output, native/device/VoiceOver/user/paid acceptance are UNRUN. Preparation data retains executionAvailable=false and readyForProvider=false from020000; it does not close parent #559/#561.
