/** Synthetic protocol fixture only. SQL/GoTrue/Native evidence is recorded separately. */
import { MATERIAL_BOUNDARIES, materialDigest } from '../../../../lib/server/privacy/material-references/contract.ts';
export const fixtureId = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const fixtureNow = Date.parse('2026-10-05T19:10:00.000Z');
export const fixtureActor = { ownerId: fixtureId(1), sessionId: fixtureId(2), mobileEpoch: 1 };
export const fixtureTrip = fixtureId(3);
const stamp = new Date(fixtureNow).toISOString(), later = new Date(fixtureNow + 600000).toISOString();
const h = 'a'.repeat(64);
function reservation(i) {
  const referenceId = fixtureId(i), operationId = fixtureId(1000 + i);
  return { current: { kind: 'reservation_reference/1', referenceId, tripId: fixtureTrip, tripVersion: 0, revision: 1,
    fields: { kind: 'lodging', supplier: 'other', externalReference: null, title: '合成订单 🐼 ' + i, startsAt: null, endsAt: null, timeZone: null, address: null, terms: null, status: 'unknown' },
    evidenceTier: 'user_reported', source: { kind: 'user_reported', localMaterialId: null, localContentHash: null, locator: null },
    sourceQualification: 'untrusted', confirmedBy: 'explicit_user', confirmedAt: stamp, contentDigest: h, sourceVersion: null, planningUse: 'confirmed_reference_only', tripMutation: 'none' },
    events: [{ revision: 1, operationId, tripVersion: 0, status: 'unknown', evidenceTier: 'user_reported', sourceKind: 'user_reported', contentDigest: h, confirmedAt: stamp }],
    operations: [{ operationId, referenceId, tripId: fixtureTrip, appliedRevision: 1 }], historical: true };
}
function pdf(i, confirmed = false) {
  const operationId = fixtureId(i), proposalId = fixtureId(2000 + i);
  const operation = { kind: 'pdf_intake_operation/1', operationId, tripId: fixtureTrip, sessionEpoch: 1,
    state: confirmed ? 'confirmed' : 'pending', requestDigest: h, commandDigest: h, previewDigest: h, expiresAt: later,
    proposalId, proposalRevision: 1, baseTripVersion: 0, confirmationEventId: confirmed ? fixtureId(3000 + i) : null, resultingVersion: confirmed ? 1 : null };
  return { operationId, tripId: fixtureTrip, sessionEpoch: 1, requestDigest: h, commandDigest: h, previewDigest: h,
    proposalId, proposalRevision: 1, baseTripVersion: 0, expiresAt: later, cancelled: false,
    fields: confirmed ? null : [{ kind: 'date', value: '2026-10-06', locator: { page: 1, line: 1, sourceTextHash: h } }], contentHash: confirmed ? null : h,
    rawPdfIncluded: false, fullTextIncluded: false, evidenceTier: 'user_checked_local_pdf', sourceAvailability: 'local_only', orderVerification: 'unavailable', operation };
}
export const fixtureSources = {
  'reservation-reference-data/1': Array.from({ length: 6 }, (_, i) => reservation(10 + i)),
  'pdf-intake-data/1': [pdf(20), pdf(21, true)],
  'material-exit-progress/1': [{ objectId: fixtureId(30), tripId: fixtureTrip, originalScope: 'reservation-reference-data/1',
    objectIds: [fixtureId(10)], referenceOperationIds: [fixtureId(1010)], sourceDigest: h, previewDigest: h, requestDigest: h,
    state: 'erased', capturedAt: fixtureNow - 60000, expiresAt: fixtureNow - 30000, decidedAt: fixtureNow - 50000,
    pages: 0, rows: 0, progressErased: true }],
};
export const fixtureKey = row => row.current?.referenceId ?? row.operationId ?? row.objectId;
export function fixtureBinding(scope) {
  return { schemaVersion: 'material-reference-data/1', scope, requestId: fixtureId(100), tripId: fixtureTrip,
    objectIds: fixtureSources[scope].map(fixtureKey), ...fixtureActor, sourceDigest: h, previewDigest: 'b'.repeat(64),
    capturedAt: fixtureNow, expiresAt: fixtureNow + 30000, tripVersion: 1,
    boundaries: structuredClone(MATERIAL_BOUNDARIES[scope]), allUserDataCompleted: false };
}
export const fixtureCommand = (scope, action = 'export') => {
  const b = fixtureBinding(scope);
  return { action, scope, requestId: b.requestId, tripId: b.tripId, objectIds: b.objectIds, ...(action === 'preview' ? {} : { previewDigest: b.previewDigest, confirmed: true }) };
};
export function fixtureReceipt(scope, bytes) {
  const b = fixtureBinding(scope);
  return { ...b, kind: 'receipt', state: 'erased', requestDigest: materialDigest(bytes), decidedAt: fixtureNow + 2,
    effects: { objects: b.objectIds.length, temporaryRecords: scope === 'pdf-intake-data/1' ? 1 : b.objectIds.length,
      unappliedProposals: scope === 'pdf-intake-data/1' ? 1 : 0, tripMutation: 'none', externalOrders: 'not_contacted', financialRecords: 'not_modified' } };
}
export function fixtureRPC(scope, change = () => {}) {
  let requestDigest; let pages = 0, rows = 0; const b = fixtureBinding(scope); const items = fixtureSources[scope];
  return async (action, bytes, signal) => {
    if (signal.aborted) throw Error('MATERIAL_UNAVAILABLE');
    const command = JSON.parse(bytes); let result;
    if (action === 'export_start') {
      requestDigest = materialDigest(bytes);
      result = { ...b, kind: 'started', requestDigest, limits: { pageSize: 5, maxPages: 4, maxRows: 20, maxBytes: 1000000 } };
    } else if (action === 'page') {
      const offset = command.cursor === null ? 0 : items.findIndex(row => fixtureKey(row) === command.cursor.afterId) + 1;
      const page = items.slice(offset, offset + 5), more = offset + page.length < items.length;
      pages++; rows += page.length;
      result = { ...b, kind: 'page', requestDigest, items: structuredClone(page), hasMore: more,
        nextCursor: more ? { sourceDigest: b.sourceDigest, afterId: fixtureKey(page.at(-1)) } : null, sectionComplete: !more, pageNumber: pages };
    } else if (action === 'proof') result = { ...b, kind: 'proof', requestDigest, coverage: 'complete', pages, rows };
    else if (action === 'preview') result = { ...b, kind: 'preview', items: structuredClone(items), requiresExplicitConfirmation: true };
    else if (action === 'erase') result = fixtureReceipt(scope, bytes);
    else if (action === 'recover') result = fixtureReceipt(scope, command.mutationBytes);
    else throw Error('INVALID_INPUT');
    change(result, action, command); return result;
  };
}
