import { exact, record, uuid, hash } from '../../guide/contract.ts';
import { isLifecycleTrip, isLifecycleReceipt } from '../../trip/lifecycle/contract.ts';
import { ARCHIVE_LIMITS, archiveScope, natural, positive, ids, sectionsFor, type ArchiveBinding } from './contract.ts';

const text = (v: unknown, limit = 160): v is string => typeof v === 'string' && v.length > 0 && v.length <= limit;
const instant = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
const known = (v: Record<string, unknown>, required: string[], optional: string[]) => exact(v, [...required,...optional.filter(k => Object.hasOwn(v, k))]);
/** Exact original core safe projection, not arbitrary snapshot JSON. */
export function archiveContent(v: unknown): boolean {
  return record(v) && exact(v, ['days']) && Array.isArray(v.days) && v.days.every(day => record(day)
    && known(day, ['id','date','items'], ['timeZone']) && text(day.id) && typeof day.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day.date)
    && (!Object.hasOwn(day, 'timeZone') || text(day.timeZone)) && Array.isArray(day.items) && day.items.every(item => record(item)
      && known(item, ['id','dayId','title'], ['startsAt','endsAt']) && text(item.id) && item.dayId === day.id && text(item.title)
      && ['startsAt','endsAt'].every(k => !Object.hasOwn(item, k) || instant(item[k]))));
}
export function archiveCursor(v: unknown, section: string, digest: string): boolean {
  return v === null || record(v) && exact(v, ['sourceDigest','afterKey']) && v.sourceDigest === digest
    && (section === 'snapshots' ? typeof v.afterKey === 'string' && /^\d{10}$/.test(v.afterKey) && Number(v.afterKey) <= 2147483647 : uuid(v.afterKey));
}
export function archiveProgressReceipt(v: unknown): boolean {
  return record(v) && exact(v, ['requestDigest','decidedAt','clearedProgress','sourceTrip','externalCopies']) && hash(v.requestDigest)
    && positive(v.decidedAt) && natural(v.clearedProgress) && v.clearedProgress <= 60 && v.sourceTrip === 'not_modified' && v.externalCopies === 'not_erased';
}
export function archiveRowKey(section: string, v: unknown, binding: ArchiveBinding): string | null {
  if (!record(v)) return null;
  if (section === 'trip') {
    if (!exact(v, ['tripId','title','headVersion','confirmationState','content','lifecycle']) || v.tripId !== binding.tripId
      || v.headVersion !== binding.tripVersion || typeof v.confirmationState !== 'string' || !['initial','confirmed','unknown'].includes(v.confirmationState)
      || !isLifecycleTrip(v.lifecycle) || v.lifecycle.state !== 'archived' || v.lifecycle.tripId !== v.tripId
      || v.title !== v.lifecycle.title || v.headVersion !== v.lifecycle.headVersion || !archiveContent(v.content)) return null;
    return v.lifecycle.tripId;
  }
  if (section === 'snapshots') {
    return exact(v, ['tripId','version','title','createdAt','content']) && v.tripId === binding.tripId && natural(v.version)
      && v.version <= Number(binding.tripVersion) && text(v.title) && instant(v.createdAt)
      && archiveContent(v.content) ? String(v.version).padStart(10, '0') : null;
  }
  if (section === 'operations') {
    if (!exact(v, ['operationId','sessionId','receipt','erasedReason']) || !uuid(v.operationId)) return null;
    if (v.erasedReason !== null) return typeof v.erasedReason === 'string' && ['FORBIDDEN','MEMORY_CONFLICT'].includes(v.erasedReason) && v.receipt === null && v.sessionId === null ? v.operationId : null;
    return uuid(v.sessionId) && isLifecycleReceipt(v.receipt) && v.receipt.ownerId === binding.ownerId && v.receipt.operationId === v.operationId
      && v.receipt.sessionId === v.sessionId && v.receipt.tripId === binding.tripId ? v.operationId : null;
  }
  if (section !== 'progress' || !exact(v, ['objectId','ownerId','sessionId','mobileEpoch','originalScope','tripId','tripVersion','objectIds','sourceDigest',
    'previewDigest','requestDigest','state','capturedAt','expiresAt','decidedAt','progressErased','progress','receipt'])
    || !uuid(v.objectId) || !binding.objectIds.includes(v.objectId) || v.ownerId !== binding.ownerId || !uuid(v.sessionId) || !positive(v.mobileEpoch)
    || !archiveScope(v.originalScope) || !hash(v.sourceDigest) || !hash(v.previewDigest) || !(v.requestDigest === null || hash(v.requestDigest))
    || typeof v.state !== 'string' || !['previewed','exporting','exported','erased'].includes(v.state) || !positive(v.capturedAt) || !positive(v.expiresAt)
    || v.expiresAt !== v.capturedAt + ARCHIVE_LIMITS.lifetimeMs || !(v.decidedAt === null || positive(v.decidedAt) && v.decidedAt >= v.capturedAt && v.decidedAt < v.expiresAt)
    || typeof v.progressErased !== 'boolean' || !Array.isArray(v.progress) || v.progress.length > 3) return null;
  if (v.originalScope === 'archived-trip-data/1' ? !uuid(v.tripId) || !positive(v.tripVersion) || v.tripVersion > 2147483647 || !Array.isArray(v.objectIds) || v.objectIds.length !== 0
    : v.tripId !== null || v.tripVersion !== null || !ids(v.objectIds) || v.objectIds.includes(v.objectId)) return null;
  const sections = sectionsFor(v.originalScope); let previous = -1; let totalRows = 0; let totalPages = 0;
  for (const p of v.progress) {
    if (!record(p) || !exact(p, ['section','pages','rows','lastCursor','nextCursor','lastLimit','terminal']) || typeof p.section !== 'string'
      || sections.indexOf(p.section) <= previous || !natural(p.pages) || p.pages > 201 || !natural(p.rows) || p.rows > (p.section === 'trip' ? 1 : 10000)
      || typeof p.terminal !== 'boolean' || !archiveCursor(p.lastCursor, p.section, v.sourceDigest) || !archiveCursor(p.nextCursor, p.section, v.sourceDigest)
      || !(p.lastLimit === null || p.lastLimit === 50) || p.pages === 0 && (p.rows !== 0 || p.terminal || p.lastCursor !== null || p.nextCursor !== null || p.lastLimit !== null)
      || p.pages > 0 && p.lastLimit !== 50 || p.terminal && p.nextCursor !== null) return null;
    previous = sections.indexOf(p.section); totalRows += p.rows; totalPages += p.pages;
  }
  if (totalRows > ARCHIVE_LIMITS.maxRows || totalPages > ARCHIVE_LIMITS.maxPages || v.progressErased && v.progress.length !== 0
    || v.state === 'previewed' && (v.requestDigest !== null || v.decidedAt !== null || v.receipt !== null)
    || v.state !== 'previewed' && v.requestDigest === null || v.state === 'erased' && (!archiveProgressReceipt(v.receipt) || !record(v.receipt)
      || v.receipt.requestDigest !== v.requestDigest || v.receipt.decidedAt !== v.decidedAt || v.originalScope !== 'archive-export-progress/1')
    || v.state !== 'erased' && v.receipt !== null) return null;
  return v.objectId;
}
