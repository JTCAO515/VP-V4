/** Deterministic TS collector fixtures. This is synthetic source, not SQL/Auth/device evidence. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { ARCHIVE_BOUNDARIES, ARCHIVE_LIMITS, archiveDigest, sectionsFor } from '../../../../lib/server/privacy/archive-data/contract.ts';
import { collectArchiveExport } from '../../../../lib/server/privacy/archive-data/export.ts';
import { decodeArchiveList, decodeArchivePreview, decodeArchiveReceipt } from '../../../../lib/server/privacy/archive-data/protocol.ts';
import { binding as originalBinding, sections as archiveSections, lifecycle, id, now } from './fixtures.mjs';
const actor = { ownerId: '22222222-2222-4222-8222-222222222222', sessionId: '33333333-3333-4333-8333-333333333333', mobileEpoch: 2 };
const output = resolve(process.argv[2] ?? 'tests/fixtures/privacy/archive-data'); mkdirSync(output, { recursive: true });
const timestamp = now + 2;
const binding = { ...originalBinding, ...actor };
const archiveCommand = { action: 'export', scope: binding.scope, requestId: binding.requestId, tripId: binding.tripId, tripVersion: binding.tripVersion,
  objectIds: binding.objectIds, previewDigest: binding.previewDigest, confirmed: true };
async function collect(b, command, sections) {
  const bytes = JSON.stringify(command), digest = archiveDigest(bytes), common = { ...b, requestDigest: digest };
  const pages = sections.reduce((n, s) => n + Math.max(1, Math.ceil(s.items.length / 50)), 0), rows = sections.reduce((n, s) => n + s.items.length, 0);
  const rpc = async (action, bytes) => {
    if (action === 'export_start') return { ...common, kind: 'started', sections: sectionsFor(b.scope), limits: Object.fromEntries(['pageSize','maxPages','maxRows','maxBytes'].map(k => [k,ARCHIVE_LIMITS[k]])) };
    if (action === 'page') { const input = JSON.parse(bytes); return { ...common, kind: 'page', section: input.section, items: sections.find(s => s.section === input.section).items,
      hasMore: false, nextCursor: null, sectionComplete: true, pageNumber: 1 }; }
    return { ...common, kind: 'proof', coverage: 'complete', pages, rows };
  };
  return { bytes, bundle: await collectArchiveExport(command, bytes, actor, rpc, new AbortController().signal, async () => true, () => timestamp) };
}
const archive = await collect(binding, archiveCommand, archiveSections);
const list = (scope, items) => ({ schemaVersion: binding.schemaVersion, kind: 'list', scope, ...actor, sourceDigest: binding.sourceDigest,
  capturedAt: binding.capturedAt, expiresAt: binding.expiresAt, items, hasMore: false, nextCursor: null, allUserDataCompleted: false });
const archiveList = list(binding.scope, [lifecycle]);
const archivePreview = { ...binding, kind: 'preview', counts: { trip: 1, snapshots: 2, operations: 0, progress: 0 }, snapshotVersionGaps: 0 };
const archiveValidated = { ...binding, kind: 'validated', requestDigest: archiveDigest(archive.bytes), current: true };
const progressBinding = { ...binding, scope: 'archive-export-progress/1', requestId: id(9), tripId: null, tripVersion: null, objectIds: [binding.requestId],
  boundaries: ARCHIVE_BOUNDARIES['archive-export-progress/1'] };
const progressCommand = { action: 'export', scope: progressBinding.scope, requestId: progressBinding.requestId, tripId: null, tripVersion: null,
  objectIds: progressBinding.objectIds, previewDigest: progressBinding.previewDigest, confirmed: true };
const progressRow = { objectId: binding.requestId, ...actor, originalScope: binding.scope, tripId: binding.tripId, tripVersion: binding.tripVersion, objectIds: [],
  sourceDigest: binding.sourceDigest, previewDigest: binding.previewDigest, requestDigest: archiveDigest(archive.bytes), state: 'exported',
  capturedAt: binding.capturedAt, expiresAt: binding.expiresAt, decidedAt: now + 1, progressErased: false, receipt: null,
  progress: archiveSections.map(s => ({ section: s.section, pages: 1, rows: s.items.length, lastCursor: null, nextCursor: null, lastLimit: 50, terminal: true })) };
const progress = await collect(progressBinding, progressCommand, [{ section: 'progress', items: [progressRow] }]);
const progressList = list(progressBinding.scope, [{ objectId: binding.requestId, originalScope: binding.scope, tripId: binding.tripId, tripVersion: binding.tripVersion, state: 'exported', progressErased: false }]);
const progressPreview = { ...progressBinding, kind: 'preview', counts: { trip: 0, snapshots: 0, operations: 0, progress: 1 }, snapshotVersionGaps: 0 };
const eraseBinding = { ...progressBinding, requestId: id(10) };
const erase = { ...progressCommand, action: 'erase', requestId: eraseBinding.requestId }, eraseBytes = JSON.stringify(erase);
const receipt = { ...eraseBinding, kind: 'receipt', state: 'erased', requestDigest: archiveDigest(eraseBytes), decidedAt: now + 1,
  effects: { clearedProgress: 3, retainedFences: 1, sourceTrip: 'not_modified', externalCopies: 'not_erased' } };
const unknown = { schemaVersion: binding.schemaVersion, kind: 'unknown', scope: erase.scope, requestId: erase.requestId, tripId: null, tripVersion: null,
  objectIds: erase.objectIds, ...actor, requestDigest: archiveDigest(eraseBytes), allUserDataCompleted: false };
assert.ok(decodeArchiveList(archiveList, { action: 'list', scope: binding.scope, cursor: null, limit: 20 }, actor, timestamp));
assert.ok(decodeArchiveList(progressList, { action: 'list', scope: progressBinding.scope, cursor: null, limit: 20 }, actor, timestamp));
assert.ok(decodeArchivePreview(archivePreview, archiveCommand, actor, timestamp));
assert.ok(decodeArchivePreview(progressPreview, progressCommand, actor, timestamp));
assert.ok(decodeArchiveReceipt(receipt, erase, actor, archiveDigest(eraseBytes), timestamp));
for (const [name, data] of Object.entries({ 'archive-list': archiveList, 'archive-preview': archivePreview, 'archive-bundle': archive.bundle,
  'archive-validated': archiveValidated, 'progress-list': progressList, 'progress-preview': progressPreview, 'progress-bundle': progress.bundle,
  'progress-erase-preview': { ...progressPreview, requestId: erase.requestId }, 'progress-erase': receipt, 'progress-unknown': unknown })) {
  writeFileSync(join(output, name+'.json'), JSON.stringify({ data }, null, 2)+'\n');
}
writeFileSync(join(output, 'commands.json'), JSON.stringify({ syntheticSource: true, actor, now: timestamp, archiveBytes: archive.bytes,
  progressBytes: progress.bytes, eraseBytes, archiveValidate: { ...archiveCommand, action: 'validate' } }, null, 2)+'\n');
console.log('Synthetic collector Native fixtures written: ' + output);
