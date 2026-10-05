import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMaterialReferences, materialReferenceNativeHTTP } from '../../../../lib/server/privacy/material-references/http.ts';
import { materialDigest } from '../../../../lib/server/privacy/material-references/contract.ts';
import { fixtureActor, fixtureNow, fixtureId, fixtureBinding, fixtureCommand, fixtureRPC, fixtureReceipt } from '../../../fixtures/privacy/material-references/source.mjs';
import { validMaterialCoverageSelection, materialCoverageRequestBody, materialCoverageOutcome } from '../../../../lib/server/privacy/material-references/coverage.ts';
const scope = 'reservation-reference-data/1';
const request = (body, headers = {}) => new Request('http://127.0.0.1/api/privacy/native/v1/material-references', {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body),
});
const options = (rpc = fixtureRPC(scope), current = async () => true, authenticate = async () => fixtureActor) => ({
  enabled: true, now: () => fixtureNow + 5, authority: () => ({ rpc, current, authenticate }),
});
const value = async response => ({ status: response.status, body: await response.json(), cache: response.headers.get('cache-control') });

test('owner HTTP validates real-handler protocol result separately from success status and preserves exact original bytes', async () => {
  const preview = await value(await handleMaterialReferences(request(fixtureCommand(scope, 'preview')), options()));
  assert.equal(preview.status, 200); assert.equal(preview.body.data.kind, 'preview'); assert.match(preview.cache, /private, no-store/);
  const command = fixtureCommand(scope), raw = '\n' + JSON.stringify(command);
  const bundle = await value(await handleMaterialReferences(request(raw), options()));
  assert.equal(bundle.status, 200); assert.equal(bundle.body.data.kind, 'bundle'); assert.equal(bundle.body.data.proof.rows, 6);
  assert.equal(bundle.body.data.requestDigest, materialDigest(raw)); assert.equal(bundle.body.data.allUserDataCompleted, false);
  const erase = fixtureCommand(scope, 'erase'), bytes = '\t' + JSON.stringify(erase);
  const deleted = await value(await handleMaterialReferences(request(bytes), options()));
  assert.equal(deleted.status, 200); assert.equal(deleted.body.data.state, 'erased'); assert.equal(deleted.body.data.requestDigest, materialDigest(bytes));
  const recover = { action: 'recover', scope, requestId: erase.requestId, tripId: erase.tripId, objectIds: erase.objectIds, mutationBytes: bytes };
  const result = await value(await handleMaterialReferences(request(recover), options()));
  assert.equal(result.status, 200); assert.deepEqual(result.body, deleted.body);
  const pastExpiry = { ...options(), now: () => fixtureNow + 60000 };
  assert.equal((await handleMaterialReferences(request(recover), pastExpiry)).status, 200, 'immutable committed receipt is readable after preview TTL');
  const forged = await value(await handleMaterialReferences(request(bytes), options(fixtureRPC(scope, r => { r.state = 'cancelled'; }))));
  assert.equal(forged.status, 503); assert.equal(forged.body.error.code, 'MATERIAL_ACK_UNKNOWN');
});

test('session switch/unknown ACK/retained exact recovery bytes never promote a terminal response to erasure completion', async () => {
  const erase = fixtureCommand(scope, 'erase'), bytes = JSON.stringify(erase); let calls = 0, applied = false;
  const result = await value(await handleMaterialReferences(request(bytes), options(async () => {
    calls++; applied = true; return fixtureReceipt(scope, bytes);
  }, async () => !applied)));
  assert.equal(calls, 1); assert.equal(result.status, 503); assert.equal(result.body.error.code, 'MATERIAL_ACK_UNKNOWN');
  const recover = { action: 'recover', scope, requestId: erase.requestId, tripId: erase.tripId, objectIds: erase.objectIds, mutationBytes: bytes };
  const unknown = { schemaVersion: 'material-reference-data/1', kind: 'unknown', scope, requestId: erase.requestId,
    tripId: erase.tripId, objectIds: erase.objectIds, ...fixtureActor, requestDigest: materialDigest(bytes), allUserDataCompleted: false };
  const unresolved = await value(await handleMaterialReferences(request(recover), options(async () => unknown)));
  assert.equal(unresolved.status, 200); assert.equal(unresolved.body.data.kind, 'unknown'); assert.ok(!('state' in unresolved.body.data));
  const wrongDigest = await value(await handleMaterialReferences(request(recover), options(async () => ({ ...unknown, requestDigest: materialDigest(' '+bytes) }))));
  assert.equal(wrongDigest.status, 503); assert.equal(wrongDigest.body.error.code, 'MATERIAL_ACK_UNKNOWN');
  const malformedRecovery = await handleMaterialReferences(request({ ...recover, requestId: fixtureId(999) }), options());
  assert.equal(malformedRecovery.status, 400);
});

test('authentication/admission precedes source dispatch, sensitive RPC defaults disabled, and explicit selected list is source bound', async () => {
  let calls = 0; const rpc = async () => { calls++; throw Error('must not dispatch'); };
  assert.equal((await handleMaterialReferences(request(fixtureCommand(scope)), options(rpc, async () => true, async () => null))).status, 401);
  assert.equal((await handleMaterialReferences(request(fixtureCommand(scope)), options(rpc, async () => false))).status, 401);
  assert.equal((await handleMaterialReferences(request({ ...fixtureCommand(scope), confirmed: false }), options(rpc))).status, 400);
  assert.equal((await handleMaterialReferences(request(fixtureCommand(scope), { Cookie: 'ambiguous=1' }), options(rpc))).status, 400);
  assert.equal((await handleMaterialReferences(request(fixtureCommand(scope), { Origin: 'http://other.example' }), options(rpc))).status, 400);
  assert.equal(calls, 0);
  assert.equal((await materialReferenceNativeHTTP(request(fixtureCommand(scope)))).status, 503);
  const b = fixtureBinding(scope), list = { action: 'list', scope, tripId: b.tripId, cursor: null, limit: 20 };
  const rows = { schemaVersion: b.schemaVersion, kind: 'list', scope, tripId: b.tripId, ...fixtureActor,
    sourceDigest: b.sourceDigest, capturedAt: b.capturedAt, expiresAt: b.expiresAt,
    items: [{ objectId: b.objectIds[0], revision: 1, label: 'Real fixture field', materialExpiresAt: null, sourceState: 'active' }],
    hasMore: false, nextCursor: null, allUserDataCompleted: false };
  const listed = await value(await handleMaterialReferences(request(list), options(async () => rows)));
  assert.equal(listed.status, 200); assert.equal(listed.body.data.items.length, 1);
  const changedSource = await handleMaterialReferences(request({ ...list, cursor: { sourceDigest: 'c'.repeat(64), afterId: b.objectIds[0] } }), options(async () => rows));
  assert.equal(changedSource.status, 503);
  assert.equal((await handleMaterialReferences(request(list), options(async () => ({ ...rows, ownerId: fixtureId(999) })))).status, 503);
});

test('coverage consumes the selected actual metadata/erasure receipt and preserves original bytes on unknown recovery', async () => {
  const command = fixtureCommand(scope,'erase'), bytes = '\n'+JSON.stringify(command);
  const input = { schemaVersion: 'data-coverage/1',catalogVersion: 'data-coverage-catalog/2026-10-06.3',actorId: fixtureActor.ownerId,
    sessionId: fixtureActor.sessionId,mobileEpoch: fixtureActor.mobileEpoch,moduleId: 'order_references',moduleVersion: 'material-reference-data/1',
    operationId: command.requestId,action: 'delete',phase: 'execute',confirmed: true,tripId: command.tripId,commandBytes: bytes };
  const selected = { input,command,handler: 'materials' };
  assert.ok(validMaterialCoverageSelection(input,command));
  assert.equal(validMaterialCoverageSelection({ ...input,moduleId: 'pdf_intake' },command),false);
  const receipt = fixtureReceipt(scope,bytes);
  assert.equal(materialCoverageOutcome(selected,receipt,fixtureNow+5).state,'scoped_complete');
  assert.equal(materialCoverageOutcome(selected,{ ...receipt,ownerId: fixtureId(900) },fixtureNow+5),null);
  assert.equal(materialCoverageOutcome(selected,{ ...receipt,state: 'cancelled' },fixtureNow+5),null);
  const recoveryInput = { ...input,phase: 'recover' }, recovery = JSON.parse(materialCoverageRequestBody(recoveryInput));
  assert.equal(recovery.mutationBytes,bytes); assert.equal(recovery.action,'recover');
  const unknown = { schemaVersion: 'material-reference-data/1',kind: 'unknown',scope,requestId: command.requestId,
    tripId: command.tripId,objectIds: command.objectIds,...fixtureActor,requestDigest: materialDigest(bytes),allUserDataCompleted: false };
  assert.equal(materialCoverageOutcome({ ...selected,input: recoveryInput },unknown,fixtureNow+5).state,'unknown');
  assert.equal(materialCoverageOutcome(selected,unknown,fixtureNow+5),null);
  assert.equal(materialCoverageOutcome({ ...selected,input: recoveryInput },receipt,fixtureNow+60000).state,'scoped_complete');
});
