# Frozen v2 worker protocol ports — local preparation

Interface checkpoint, not live execution permission. #561 owns the new TypeScript protocol and dedicated tests; #559 owns new private checkpoint SQL40000. No public claimer/discovery, model dispatch/settlement, publisher or completion-trigger change is included. Private020000/03030000 reads/projection remain permission-false data.

## Trusted lease / source descriptor

`V2Lease = {ownerId,taskId,turnId,leaseToken,artifactId,planningPolicyId,intakeContextDigest,planningContextDigest,source,environment,locale}`. IDs are canonical UUIDs; Task and Turn differ. Digests are separate lower SHA-256 strings, captured from admission, never substituted. `source = {conversationId,goalId,goalVersion,messageId,messageSequence,intakeRevision,memoryBasis}`; refs are at most3 unique canonical UUID/revision entries sorted by ID. This is a trusted synthetic/current future claim descriptor, not client-issued permission. The read port always revalidates the active exact lease in SQL; the JSON response has no lease field to independently prove its validity.

## Stable ports

All current ports receive the same descriptor; implementations map its six fields `(ownerId,taskId,turnId,leaseToken,intakeContextDigest,planningContextDigest)` to the private helpers.

- `read(lease,signal): Promise<unknown>` — exact `planning_intake_input / planning-intake-context/2` from020000 private read. Reject owner/Task/Turn/artifact/policy/source or either namespace mismatch. Both source flags stay false; qualification is not dispatch authorization.
- `checkpoints(lease,signal): Promise<snapshot>` — shape below. No historical fallback or invented missing state on read/transport error.
- `claimPlace(lease,signal): Promise<'claimed'|'duplicate'|'unknown'>` — only durable missing→started succeeds. Current TypeScript treats duplicate/unknown conservatively and does not issue the request; next invocation must read the completed checkpoint.
- `savePlace(lease,observation,signal): Promise<boolean>` — true only for an authoritative completed acknowledgment under original started lease. False/lost acknowledgment gives checkpoint_pending, not automatic repeat; readback decides later.
- `unknownPlace(lease): Promise<void>` — attempt started→unknown under its original lease; failure leaves durable started and still blocks replay. Return body is not used as publication or release authority.

```json
{
  "schemaVersion": "planning-v2-checkpoints/1",
  "ownerId": "<uuid>", "taskId": "<uuid>", "turnId": "<uuid>",
  "intakeContextDigest": "<sha256>", "planningContextDigest": "<different sha256>",
  "place": {"state": "missing"},
  "modelAttempt": "none"
}
```

Place states are exactly missing/started/unknown/completed; missing/started/unknown have only `state`. Completed has exactly `{state:'completed',observation:<planning-place/1>}`. Readback under a new legal lease reuses completed place only for the same Task/Turn/current dual basis and fresh allowed observation. Started/unknown never replay. Model enum is exactly none/released/reserved/dispatched/pending/settled. No rows alone means none. The existing ledger is read-only; ANY unresolved/ambiguous prior attempt must not be hidden by a later released row. Dispatched/pending causes unknown_effect; reserved/settled causes blocked pending reconciliation/output, without claiming unknown prices or performing a new call.

## Preparation-only dependencies

`permit(lease,signal)` is a separate explicit test-only capability with exact `{kind:'local_protocol_permit',ownerId,taskId,turnId,leaseToken,intakeContextDigest,planningContextDigest}`. No current private SQL creates it, and false data flags cannot mint it. Runtime mode must be exactly local_protocol_test. `place(signal,beforeRequest)` is the bounded fake-provider protocol; the real normalization adapter calls beforeRequest before every request, which re-reads both current authorities and the independent fake permit. Scope/cancellation/lease failures retain unknown effects instead of retrying.

`prepare(lease,place,signal)` consumes private03030000 projection; `verifyPreparation(lease,place,content,signal)` consumes its private exact validator. Prepared request/binding/normalized observation/coverage are also checked against current data and original place before accepting content. A final fresh read precedes returning `{kind:'prepared',preparation,readyForPublication:false,executionAvailable:false}`. No artifact/event/terminal result is written. Other outcomes are blocked/unknown_effect/checkpoint_pending, with the same false flags.

## Deferred runtime SQL/service contract

Future claimer must atomically return this owned descriptor under the existing single worker lifecycle, with owner/session/stop/policy/current-source/cost eligibility. Future read/claim/save/unknown wrappers require exact six bindings and per-operation current checks; private helpers have no API EXECUTE until Main approves an explicit trusted wrapper. Model reserve/dispatch remains the existing ledger, but needs its own fresh dual-basis/recipient/scope/attempt gate, and a durable validated output/usage acknowledgment; no interface here authorizes it. Completion requires current dual basis, exact started result action, fresh verified preparation and real matching settled attempt, then atomic Task/artifact/outbox receipt. Missing/unknown accounting is not zero and cannot be replayed. None of those capabilities are implemented by this interface freeze.

All current PostgreSQL actors/provider replies are synthetic. Fixture checkpoint writes are isolated test infrastructure, not production schema/API. Network-none PostgreSQL plus loopback fake provider listen(0) are owned until teardown. Fixed f9cea173 private preparation SQL is loaded only locally until its actual migration merges. This freeze is not full producer, native, target or paid acceptance.
