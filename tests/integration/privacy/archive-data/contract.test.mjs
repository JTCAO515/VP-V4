import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArchiveCommand, archiveDigest, ARCHIVE_BOUNDARIES } from '../../../../lib/server/privacy/archive-data/contract.ts';
import { archiveRowKey } from '../../../../lib/server/privacy/archive-data/rows.ts';
import { decodeArchiveBundle, decodeArchivePreview, decodeArchiveReceipt } from '../../../../lib/server/privacy/archive-data/protocol.ts';
import { collectArchiveExport } from '../../../../lib/server/privacy/archive-data/export.ts';
import { handleArchiveData } from '../../../../lib/server/privacy/archive-data/http.ts';
import { archiveCoverageOutcome, validArchiveCoverageSelection } from '../../../../lib/server/privacy/archive-data/coverage.ts';
import { id, now, actor, selection, command, bytes, binding, rpcSource, request } from './fixtures.mjs';
const signal = new AbortController().signal;

test('closed command rejects coerced array action, archive erasure and caller authority', () => {
  assert.deepEqual(parseArchiveCommand(command), command);
  for (const v of [{ ...command, action: ['export'] }, { ...command, action: ['erase'] }, { ...command, action: 'erase' },
    { ...command, ownerId: actor.ownerId }, { ...command, tripVersion: 0 }, { ...command, objectIds: [id(8)] }, { ...command, confirmed: false }]) assert.equal(parseArchiveCommand(v), null);
  const erase = { action: 'erase', scope: 'archive-export-progress/1', requestId: id(7), tripId: null, tripVersion: null, objectIds: [id(3)], previewDigest: command.previewDigest, confirmed: true };
  const raw = '  ' + JSON.stringify(erase) + '\n';
  const recover = { action: 'recover', scope: erase.scope, requestId: erase.requestId, tripId: null, tripVersion: null, objectIds: erase.objectIds, mutationBytes: raw };
  assert.equal(parseArchiveCommand(recover).mutationBytes, raw);
  assert.equal(parseArchiveCommand({ ...recover, objectIds: [id(9)] }), null);
});

test('all actual safe content and available history traverse independently; proof is file preparation', async () => {
  const source = rpcSource();
  const bundle = await collectArchiveExport(command, bytes, actor, source.rpc, signal, async () => true, () => now + 1);
  assert.equal(bundle.sections[0].items[0].content.days[0].items[0].title, '真实保留的行程');
  assert.equal(bundle.sections[1].items.length, 2); assert.equal(bundle.sections[2].items.length, 0);
  assert.deepEqual(source.calls.map(c => c.action), ['export_start','page','page','page','proof']);
  assert.ok(source.calls.filter(c => c.action === 'page').every(c => c.input.cursor === null));
  assert.equal(source.calls[0].originalBytes, bytes); assert.equal(bundle.allUserDataCompleted, false);
  assert.ok(decodeArchiveBundle(bundle, command, actor, now + 1));
  const input = { actorId: actor.ownerId, sessionId: actor.sessionId, mobileEpoch: actor.mobileEpoch, moduleId: 'archive', moduleVersion: 'archive-data/1', operationId: selection.requestId,
    action: 'export', phase: 'execute', tripId: selection.tripId, commandBytes: bytes };
  assert.ok(validArchiveCoverageSelection(input, command));
  assert.deepEqual(archiveCoverageOutcome({ input, command, handler: 'archive_data' }, bundle, now + 1), { state: 'partial', reason: 'PROTECTED_ARCHIVE_FILE_REQUIRED' });
});

test('source changes, foreign bindings and forged terminal counts never become delivered bytes', async () => {
  for (const mutate of [
    (v, a) => a === 'page' ? { ...v, sourceDigest: 'c'.repeat(64) } : v,
    v => ({ ...v, ownerId: id(90) }),
    (v, a) => a === 'proof' ? { ...v, rows: 999 } : v,
    (v, a) => a === 'page' ? { ...v, leaseId: id(90) } : v,
    (v, a) => a === 'page' ? { ...v, pageNumber: 2 } : v,
    (v, a) => { if (a === 'page' && v.section === 'trip') v.items[0].confirmationState = ['confirmed']; return v; },
  ]) await assert.rejects(() => collectArchiveExport(command, bytes, actor, rpcSource(mutate).rpc, signal, async () => true, () => now + 1), /ARCHIVE_SOURCE_UNAVAILABLE/);
  const source = rpcSource(); let active = true;
  await assert.rejects(() => collectArchiveExport(command, bytes, actor, async (...args) => { const result = await source.rpc(...args); active = false; return result; }, signal, async () => active, () => now + 1), /ARCHIVE_SOURCE_UNAVAILABLE/);
  await assert.rejects(() => collectArchiveExport(command, bytes, actor, source.rpc, signal, async () => true, () => binding.expiresAt), /ARCHIVE_SOURCE_UNAVAILABLE/);
});

test('head snapshot content/title equality and safe field projection are independently checked', async () => {
  for (const edit of [row => { row.content.days[0].items[0].title = 'Mismatched'; }, row => { row.title = 'Mismatched'; }, row => { row.content.secret = 'hidden'; }]) {
    const source = rpcSource((v, a) => { if (a === 'page' && v.section === 'snapshots') edit(v.items[1]); return v; });
    await assert.rejects(() => collectArchiveExport(command, bytes, actor, source.rpc, signal, async () => true, () => now + 1), /ARCHIVE_SOURCE_UNAVAILABLE/);
  }
  const preview = { ...binding, kind: 'preview', counts: { trip: 1, snapshots: 1, operations: 0, progress: 0 }, snapshotVersionGaps: 1 };
  assert.ok(decodeArchivePreview(preview, command, actor, now + 1));
  assert.equal(decodeArchivePreview({ ...preview, snapshotVersionGaps: 0 }, command, actor, now + 1), null);
});

test('retained progress exposes every finite field, while immutable erase recovery can cross preview TTL', () => {
  const erase = { action: 'erase', scope: 'archive-export-progress/1', requestId: id(7), tripId: null, tripVersion: null, objectIds: [id(3)], previewDigest: command.previewDigest, confirmed: true };
  const b = { ...binding, ...erase, boundaries: ARCHIVE_BOUNDARIES[erase.scope] }; delete b.action; delete b.confirmed;
  const row = { objectId: id(3), ...actor, originalScope: selection.scope, tripId: selection.tripId, tripVersion: 1, objectIds: [], sourceDigest: binding.sourceDigest,
    previewDigest: binding.previewDigest, requestDigest: archiveDigest(bytes), state: 'exported', capturedAt: now, expiresAt: now + 30000, decidedAt: null, progressErased: false,
    progress: [{ section: 'trip', pages: 1, rows: 1, lastCursor: null, nextCursor: null, lastLimit: 50, terminal: true }], receipt: null };
  assert.equal(archiveRowKey('progress', row, b), id(3));
  assert.equal(archiveRowKey('progress', { ...row, request_bytes: bytes }, b), null);
  assert.equal(archiveRowKey('progress', { ...row, progressErased: true }, b), null);
  const receipt = { ...b, kind: 'receipt', requestDigest: archiveDigest(JSON.stringify(erase)), state: 'erased', decidedAt: now + 10,
    effects: { clearedProgress: 1, retainedFences: 1, sourceTrip: 'not_modified', externalCopies: 'not_erased' } };
  assert.ok(decodeArchiveReceipt(receipt, erase, actor, receipt.requestDigest, now + 30001));
  assert.equal(decodeArchiveReceipt({ ...receipt, decidedAt: now + 30000 }, erase, actor, receipt.requestDigest, now + 30001), null);
  assert.equal(decodeArchiveReceipt(receipt, erase, { ...actor, mobileEpoch: 5 }, receipt.requestDigest, now + 30001), null);
});

test('HTTP preserves original bytes on dispatched erase unknown ACK and never promotes source proof to file delivery', async () => {
  const source = rpcSource(); const options = { enabled: true, now: () => now + 1, authority: () => ({ authenticate: async () => actor, current: async () => true, rpc: source.rpc }) };
  const response = await handleArchiveData(request(bytes), options);
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal((await response.json()).data.kind, 'bundle'); assert.equal(source.calls[0].originalBytes, bytes);
  const erase = { action: 'erase', scope: 'archive-export-progress/1', requestId: id(7), tripId: null, tripVersion: null, objectIds: [id(3)], previewDigest: command.previewDigest, confirmed: true };
  const raw = ' \n' + JSON.stringify(erase) + '\n'; let seen = null;
  const unknown = await handleArchiveData(request(raw), { ...options, authority: () => ({ authenticate: async () => actor, current: async () => true,
    rpc: async (_a, original) => { seen = original; throw Error('network lost'); } }) });
  assert.equal(seen, raw); assert.equal(unknown.status, 503); assert.equal((await unknown.json()).error.code, 'ARCHIVE_ACK_UNKNOWN');
  const denied = await handleArchiveData(request(command), { ...options, authority: () => ({ authenticate: async () => actor, current: async () => false, rpc: async () => assert.fail('stale session dispatched') }) });
  assert.equal(denied.status, 401);
  const invalid = await handleArchiveData(request({ ...command, action: ['erase'] }), options); assert.equal(invalid.status, 400);
});
