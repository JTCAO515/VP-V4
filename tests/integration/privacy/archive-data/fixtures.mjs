import { ARCHIVE_SCHEMA, ARCHIVE_BOUNDARIES, ARCHIVE_LIMITS, archiveDigest } from '../../../../lib/server/privacy/archive-data/contract.ts';
export const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const now = 1791237600000;
export const actor = { ownerId: id(1), sessionId: id(2), mobileEpoch: 4 };
export const selection = { scope: 'archived-trip-data/1', requestId: id(3), tripId: id(4), tripVersion: 1, objectIds: [] };
export const command = { action: 'export', ...selection, previewDigest: 'a'.repeat(64), confirmed: true };
export const bytes = JSON.stringify(command);
export const binding = { schemaVersion: ARCHIVE_SCHEMA, ...selection, ...actor, sourceDigest: 'b'.repeat(64), previewDigest: command.previewDigest,
  capturedAt: now, expiresAt: now + 30000, boundaries: ARCHIVE_BOUNDARIES[selection.scope], allUserDataCompleted: false };
export const content = { days: [{ id: 'day', date: '2026-10-06', timeZone: 'Asia/Shanghai', items: [{ id: 'item', dayId: 'day', title: '真实保留的行程' }] }] };
export const lifecycle = { tripId: selection.tripId, title: 'Archived', headVersion: 1, state: 'archived', archivedVersion: 1, archivedAt: '2026-10-06T00:00:00.000Z' };
export const trip = { tripId: selection.tripId, title: 'Archived', headVersion: 1, confirmationState: 'confirmed', content, lifecycle };
export const snapshots = [0, 1].map(version => ({ tripId: selection.tripId, version, title: version ? 'Archived' : 'Initial', createdAt: '2026-10-06T00:00:00.000Z', content: version ? content : null }));
export const sections = [{ section: 'trip', items: [trip] }, { section: 'snapshots', items: snapshots }, { section: 'operations', items: [] }];
export function rpcSource(mutate = v => v) {
  const calls = [];
  const rpc = async (action, originalBytes) => {
    const input = JSON.parse(originalBytes); calls.push({ action, input, originalBytes });
    const common = { ...binding, requestDigest: archiveDigest(bytes) };
    let result;
    if (action === 'export_start') result = { ...common, kind: 'started', sections: sections.map(v => v.section), limits: Object.fromEntries(['pageSize','maxPages','maxRows','maxBytes'].map(k => [k, ARCHIVE_LIMITS[k]])) };
    else if (action === 'page') result = { ...common, kind: 'page', section: input.section, items: structuredClone(sections.find(s => s.section === input.section).items), hasMore: false, nextCursor: null, sectionComplete: true, pageNumber: 1 };
    else result = { ...common, kind: 'proof', coverage: 'complete', pages: 3, rows: 3 };
    return mutate(result, action, input);
  };
  return { rpc, calls };
}
export const request = value => new Request('http://localhost/api/privacy/native/v1/archive-data', { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof value === 'string' ? value : JSON.stringify(value) });
