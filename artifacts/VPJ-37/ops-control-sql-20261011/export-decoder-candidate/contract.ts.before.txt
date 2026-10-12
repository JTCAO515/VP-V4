import { exact, record, hash } from '../../guide/contract.ts';
import { identifier, revision, PROFILE_FIELDS } from '../profile-data/contract.ts';
import { validProfile, validSummary, validOperationRow } from '../profile-data/protocol.ts';
import { validSavedFields } from '../profile-data/saved-fields.ts';
import type { ExportPage } from '../export-dispatcher.ts';

export const PROFILE_EXPORT_SCHEMA = 'profile-core-export/1' as const;
export const PROFILE_EXPORT_SECTIONS = ['snapshot'] as const;
export type ProfileExportPage = ExportPage & { sourceDigest: string };
const instant = (v: unknown): v is string => typeof v === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));

export function validExportProfileRow(v: Record<string, unknown>, owner: string): boolean {
  if (!exact(v, ['ownerId', 'profile', 'summary', 'savedFields', 'createdAt', 'updatedAt']) || v.ownerId !== owner
    || !validProfile(v.profile) || !validSummary(v.summary) || !validSavedFields(v.savedFields)
    || !instant(v.createdAt) || !instant(v.updatedAt) || Date.parse(v.createdAt) > Date.parse(v.updatedAt)) return false;
  const p = v.profile, s = v.summary;
  const present = [...v.savedFields, ...PROFILE_FIELDS.slice(7).filter((_, i) =>
    p[['paceNotice', 'paceOperation', 'paceRequest', 'paceUndo'][i]] !== null)];
  return JSON.stringify(s.presentFields) === JSON.stringify(present)
    && s.hasPaceRequest === (p.paceRequest !== null) && s.hasPaceUndo === (p.paceUndo !== null)
    && (['explicit', 'paused'].includes(String(s.paceState)) ? p.paceNotice === 'local-planning-cross-trip-v1' : p.paceNotice === null)
    && ((p.paceRequest === null) === (p.paceOperation === null))
    && (p.paceRequest === null || record(p.paceRequest) && String(p.paceRequest.operationId).toLowerCase() === p.paceOperation
      && Number(p.paceRequest.expectedRevision) + 1 === s.paceRevision)
    && (p.paceUndo === null || record(p.paceRequest) && p.paceRequest.action === 'save');
}
export function validExportWatermarkRow(v: Record<string, unknown>, owner: string): boolean {
  return exact(v, ['ownerId', 'profileRevision', 'paceRevision', 'profileErasureFloor', 'paceErasureFloor']) && v.ownerId === owner
    && revision(v.profileRevision) && revision(v.paceRevision) && revision(v.profileErasureFloor) && revision(v.paceErasureFloor)
    && v.profileErasureFloor <= v.profileRevision && v.paceErasureFloor <= v.paceRevision;
}

/** Closed source projection; no arbitrary row/JSON fallback, client owner, or synthesized defaults. */
export function decodeProfileExportPage(value: unknown, limit: number, owner: string, now: number): ProfileExportPage | null {
  if (!identifier(owner) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isFinite(now)
    || !record(value) || !exact(value, ['schemaVersion', 'section', 'sourceDigest', 'items', 'hasMore', 'nextCursor', 'sectionComplete'])
    || value.schemaVersion !== PROFILE_EXPORT_SCHEMA || value.section !== 'snapshot' || !hash(value.sourceDigest)
    || !Array.isArray(value.items) || value.items.length !== 1 || value.hasMore !== false || value.sectionComplete !== true || value.nextCursor !== null
    || Buffer.byteLength(JSON.stringify(value), 'utf8') > 1_000_000) return null;
  const item = value.items[0];
  if (!record(item) || !exact(item, ['ownerId', 'profile', 'watermark', 'operations', 'sourceRows']) || item.ownerId !== owner
    || (item.profile !== null && (!record(item.profile) || !validExportProfileRow(item.profile, owner)))
    || (item.watermark !== null && (!record(item.watermark) || !validExportWatermarkRow(item.watermark, owner)))
    || !Array.isArray(item.operations) || item.operations.length > 10000 || !record(item.sourceRows)
    || !exact(item.sourceRows, ['profiles', 'watermarks', 'operations']) || item.sourceRows.profiles !== (item.profile === null ? 0 : 1)
    || item.sourceRows.watermarks !== (item.watermark === null ? 0 : 1) || item.sourceRows.operations !== item.operations.length
    || Number(item.sourceRows.profiles) + Number(item.sourceRows.watermarks) + item.operations.length > 10000) return null;
  if (record(item.profile)) {
    const watermark = item.watermark, summary = item.profile.summary;
    if (!record(watermark) || !record(summary) ||
      ['profileRevision', 'paceRevision', 'profileErasureFloor', 'paceErasureFloor'].some(k => watermark[k] !== summary[k])) return null;
  }
  let previous = '';
  for (const operation of item.operations) {
    if (!record(operation) || !identifier(operation.requestId) || operation.requestId <= previous || !validOperationRow(operation, owner, now)) return null;
    previous = operation.requestId;
  }
  return { sourceDigest: value.sourceDigest, items: structuredClone(value.items), hasMore: false, nextCursor: null, sectionComplete: true };
}
