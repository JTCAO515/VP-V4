import { exact, record, uuid, hash } from '../../guide/contract.ts';
import { parseReservationCurrent } from '../../reservations/contract.ts';
import { instant, parsePdfField } from '../../intake/pdf/contract.ts';
import { natural, positive, selectedIds, type MaterialScope } from './contract.ts';

export const pdfRowKeys = ['operationId','tripId','sessionEpoch','requestDigest','commandDigest','previewDigest','proposalId','proposalRevision','baseTripVersion','expiresAt','cancelled','fields','contentHash','rawPdfIncluded','fullTextIncluded','evidenceTier','sourceAvailability','orderVerification'] as const;
export function materialRowKey(scope: MaterialScope, row: unknown, tripId: string, epoch: number, now: number): string | null {
  if (!record(row)) return null;
  if (scope === 'reservation-reference-data/1') {
    if (!exact(row, ['current','events','operations','historical'])) return null;
    const current = parseReservationCurrent(row.current);
    if (!current || current.tripId !== tripId || current.evidenceTier !== 'user_reported' || current.sourceQualification !== 'untrusted'
      || current.sourceVersion !== null || current.source.kind !== 'user_reported' || row.historical !== true
      || !Array.isArray(row.events) || !Array.isArray(row.operations) || row.events.length > 100 || row.operations.length > 100) return null;
    let revision = 0;
    for (const event of row.events) {
      if (!record(event) || !exact(event, ['revision','operationId','tripVersion','status','evidenceTier','sourceKind','contentDigest','confirmedAt'])
        || !positive(event.revision) || event.revision <= revision || event.revision > current.revision || !uuid(event.operationId) || !natural(event.tripVersion)
        || !['reserved','amended','cancelled','unknown'].includes(String(event.status)) || event.evidenceTier !== 'user_reported'
        || event.sourceKind !== 'user_reported' || !hash(event.contentDigest) || !instant(event.confirmedAt)) return null;
      revision = event.revision;
    }
    revision = 0; const operations = new Set<string>();
    for (const op of row.operations) {
      if (!record(op) || !exact(op, ['operationId','referenceId','tripId','appliedRevision']) || !uuid(op.operationId)
        || operations.has(op.operationId) || op.referenceId !== current.referenceId || op.tripId !== tripId
        || !positive(op.appliedRevision) || op.appliedRevision <= revision || op.appliedRevision > current.revision) return null;
      revision = op.appliedRevision; operations.add(op.operationId);
    }
    // No silent truncation of historical acknowledgements is accepted as proof.
    if (row.events.length !== current.revision || row.operations.length !== current.revision) return null;
    return current.referenceId;
  }
  if (scope === 'pdf-intake-data/1') {
    if (!exact(row, [...pdfRowKeys]) || !uuid(row.operationId) || row.tripId !== tripId || !positive(row.sessionEpoch)
      || ![row.requestDigest,row.commandDigest,row.previewDigest].every(v => v === null || hash(v))
      || !(row.proposalId === null || uuid(row.proposalId)) || !(row.proposalRevision === null || positive(row.proposalRevision))
      || !(row.baseTripVersion === null || natural(row.baseTripVersion)) || !(row.expiresAt === null || instant(row.expiresAt))
      || typeof row.cancelled !== 'boolean' || row.rawPdfIncluded !== false || row.fullTextIncluded !== false
      || row.evidenceTier !== 'user_checked_local_pdf' || row.sourceAvailability !== 'local_only' || row.orderVerification !== 'unavailable') return null;
    const proposalBinding = [row.proposalId,row.proposalRevision,row.baseTripVersion];
    if (proposalBinding.some(v => v === null) && !proposalBinding.every(v => v === null)) return null;
    if (row.fields === null) return row.contentHash === null ? row.operationId : null;
    if (row.sessionEpoch !== epoch || row.cancelled || !instant(row.expiresAt) || Date.parse(row.expiresAt) <= now || !hash(row.contentHash)
      || !Array.isArray(row.fields) || row.fields.length < 1 || row.fields.length > 4) return null;
    const fields = row.fields.map(v => parsePdfField(v, 10));
    return fields.every(Boolean) && new Set(fields.map(f => f!.kind)).size === fields.length && fields.some(f => f!.kind === 'date') ? row.operationId : null;
  }
  if (!exact(row, ['objectId','tripId','originalScope','objectIds','sourceDigest','previewDigest','requestDigest','state','capturedAt','expiresAt','decidedAt','pages','rows','progressErased'])
    || !uuid(row.objectId) || row.tripId !== tripId || !['reservation-reference-data/1','pdf-intake-data/1','material-exit-progress/1'].includes(String(row.originalScope))
    || !selectedIds(row.objectIds) || !hash(row.sourceDigest) || !hash(row.previewDigest) || !(row.requestDigest === null || hash(row.requestDigest))
    || !['previewed','exporting','exported','erased','expired'].includes(String(row.state)) || !positive(row.capturedAt) || !positive(row.expiresAt)
    || !(row.decidedAt === null || positive(row.decidedAt) && row.decidedAt >= row.capturedAt)
    || !natural(row.pages) || !natural(row.rows) || typeof row.progressErased !== 'boolean') return null;
  return row.objectId;
}
