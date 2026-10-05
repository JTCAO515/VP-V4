import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMaterialCommand, materialDigest } from '../../../lib/server/privacy/material-references/contract.ts';
import { collectMaterialExport } from '../../../lib/server/privacy/material-references/export.ts';
import { decodeMaterialBundle, decodeMaterialPreview, decodeMaterialReceipt } from '../../../lib/server/privacy/material-references/protocol.ts';
import { fixtureActor, fixtureNow, fixtureId, fixtureSources, fixtureRPC, fixtureBinding, fixtureCommand, fixtureReceipt } from '../../fixtures/privacy/material-references/source.mjs';
const signal = () => new AbortController().signal;
const scopes = Object.keys(fixtureSources);

test('exact object selection, immutable original erase bytes, no implicit bulk/provider/lease/owner scope', () => {
  const c = fixtureCommand(scopes[0], 'erase'), raw = '\n' + JSON.stringify(c);
  assert.ok(parseMaterialCommand(c));
  const recover = { action: 'recover', scope: c.scope, requestId: c.requestId, tripId: c.tripId, objectIds: c.objectIds, mutationBytes: raw };
  assert.ok(parseMaterialCommand(recover));
  for (const changed of [ { ...c, objectIds: [] }, { ...c, objectIds: [...c.objectIds].reverse() }, { ...c, objectIds: [c.objectIds[0],c.objectIds[0]] },
    { ...c, confirmed: false }, { ...c, tripId: null }, { ...c, ownerId: fixtureId(1) }, { ...c, leaseId: fixtureId(4) }, { ...c, provider: 'other' },
    { ...recover, objectIds: [fixtureId(99)] }, { ...recover, mutationBytes: JSON.stringify({ ...c, action: 'export' }) },
    { ...fixtureCommand(scopes[2], 'erase'), objectIds: [fixtureBinding(scopes[2]).requestId] } ]) assert.equal(parseMaterialCommand(changed), null);
  assert.notEqual(materialDigest(raw), materialDigest(raw.trim()));
});

for (const scope of scopes) test(`${scope}: selected restricted row traversal, current proof and explicit field/retention boundary`, async () => {
  const command = fixtureCommand(scope), bytes = ' ' + JSON.stringify(command);
  const bundle = await collectMaterialExport(command, bytes, fixtureActor, fixtureRPC(scope), signal(), async () => true, () => fixtureNow + 1);
  assert.ok(decodeMaterialBundle(bundle, command, fixtureActor, fixtureNow + 1));
  assert.equal(bundle.proof.rows, command.objectIds.length); assert.equal(bundle.proof.pages, Math.ceil(command.objectIds.length / 5));
  assert.equal(bundle.requestDigest, materialDigest(bytes)); assert.equal(bundle.allUserDataCompleted, false);
  assert.equal(decodeMaterialBundle(bundle, command, fixtureActor, fixtureNow + 30000), null);
  assert.equal(decodeMaterialBundle({ ...bundle, allUserDataCompleted: true }, command, fixtureActor, fixtureNow + 1), null);
  assert.equal(decodeMaterialBundle({ ...bundle, items: [] }, command, fixtureActor, fixtureNow + 1), null);
  const preview = { ...fixtureBinding(scope), kind: 'preview', items: fixtureSources[scope], requiresExplicitConfirmation: true };
  assert.ok(decodeMaterialPreview(preview, command, fixtureActor, fixtureNow + 1));
  assert.equal(decodeMaterialPreview({ ...preview, boundaries: { ...preview.boundaries, missing: [] } }, command, fixtureActor, fixtureNow + 1), null);
  const mutationBytes = JSON.stringify(fixtureCommand(scope, 'erase')), receipt = fixtureReceipt(scope, mutationBytes);
  assert.ok(decodeMaterialReceipt(receipt, command, fixtureActor, materialDigest(mutationBytes), fixtureNow + 60000), 'actual committed receipt can recover beyond preview TTL');
  assert.equal(decodeMaterialReceipt({ ...receipt, state: 'cancelled' }, command, fixtureActor, materialDigest(mutationBytes), fixtureNow + 5), null);
  assert.equal(decodeMaterialReceipt(receipt, command, fixtureActor, materialDigest(' '+mutationBytes), fixtureNow + 5), null);
});

test('partial/mismatched source/authority/proof/cursor, hidden sensitive fields, truncated histories and expired live PDF never complete', async () => {
  const changes = [
    (r,a) => { if (a === 'proof') r.coverage = 'partial'; },
    (r,a) => { if (a === 'proof') r.rows++; },
    (r,a) => { if (a === 'page') r.sourceDigest = 'c'.repeat(64); },
    (r,a) => { if (a === 'page') r.ownerId = fixtureId(90); },
    (r,a) => { if (a === 'page') r.mobileEpoch++; },
    (r,a) => { if (a === 'page') r.previewDigest = 'c'.repeat(64); },
    (r,a) => { if (a === 'page') r.items.reverse(); },
    (r,a) => { if (a === 'page' && r.nextCursor) r.nextCursor.afterId = fixtureId(99); },
    (r,a) => { if (a === 'page') r.items[0].rawSourceBody = 'forbidden'; },
    (r,a) => { if (a === 'page') r.items[0].events = []; },
    (r,a) => { if (a === 'export_start') r.limits.pageSize = 100; },
  ];
  const command = fixtureCommand(scopes[0]), bytes = JSON.stringify(command);
  for (const change of changes) await assert.rejects(collectMaterialExport(command, bytes, fixtureActor, fixtureRPC(scopes[0], change), signal(), async () => true, () => fixtureNow + 1));
  const pdf = fixtureCommand(scopes[1]);
  for (const change of [
    (r,a) => { if (a === 'page') r.items[1].operation.confirmationEventId = null; },
    (r,a) => { if (a === 'page') r.items[0].sessionEpoch++; },
    (r,a) => { if (a === 'page') { r.items[0].expiresAt = new Date(fixtureNow).toISOString(); r.items[0].operation.expiresAt = r.items[0].expiresAt; } },
  ]) await assert.rejects(collectMaterialExport(pdf, JSON.stringify(pdf), fixtureActor, fixtureRPC(scopes[1], change), signal(), async () => true, () => fixtureNow + 1));
  await assert.rejects(collectMaterialExport(command, bytes, fixtureActor, fixtureRPC(scopes[0]), signal(), async () => false, () => fixtureNow + 1));
  const controller = new AbortController(); let calls = 0;
  await assert.rejects(collectMaterialExport(command, bytes, fixtureActor, fixtureRPC(scopes[0], () => { calls++; controller.abort(); }), controller.signal, async () => true, () => fixtureNow + 1));
  assert.equal(calls, 1);
});
