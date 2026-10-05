import { exact, record, uuid, hash } from '../../guide/contract.ts';
import { natural, positive, selectedIds, validCoverageProgressEffects, type CoverageProgressBinding } from './contract.ts';

const originalScopes = ['notification-metadata/1','trip-lifecycle-metadata/1'];
const sameRoot = (v: Record<string, unknown>, id: string, owner: string) => v.requestId === id && v.ownerId === owner && uuid(v.sessionId);
function cursor(v: unknown, scope: unknown, digest: unknown): boolean {
  if (v === null) return true;
  const key = scope === 'notification-metadata/1' ? 'afterKey' : 'afterId';
  return record(v) && exact(v, ['sourceDigest',key]) && v.sourceDigest === digest
    && (key === 'afterId' ? uuid(v[key]) : typeof v[key] === 'string' && /^(reminder|watch|dismissal|operation|device):[a-f0-9-]{36}$/.test(v[key]));
}
function collector(v: Record<string, unknown>, binding: CoverageProgressBinding): boolean {
  if (!record(v.fence) || !exact(v.fence, ['requestId','ownerId','sessionId','scope','expiresAt'])
    || !sameRoot(v.fence, String(v.objectId), binding.ownerId) || !originalScopes.includes(String(v.fence.scope)) || !positive(v.fence.expiresAt)
    || !Array.isArray(v.sections) || v.sections.length > 2) return false;
  if (v.request === null) return v.sections.length === 0;
  const r = v.request;
  if (!record(r) || !exact(r, ['requestId','ownerId','sessionId','mobileEpoch','scope','sourceDigest','capturedAt','expiresAt'])
    || !sameRoot(r, String(v.objectId), binding.ownerId) || r.sessionId !== v.fence.sessionId || r.scope !== v.fence.scope
    || r.expiresAt !== v.fence.expiresAt || !positive(r.mobileEpoch) || !hash(r.sourceDigest) || !positive(r.capturedAt)
    || r.expiresAt !== r.capturedAt + 30000) return false;
  const names = r.scope === 'notification-metadata/1' ? ['notifications'] : ['operations','trips'];
  return v.sections.length === names.length && v.sections.every((p, i) => record(p)
    && exact(p, ['requestId','section','lastCursor','nextCursor','lastLimit','pages','rows','bytes','terminal'])
    && p.requestId === v.objectId && p.section === names[i] && cursor(p.lastCursor, r.scope, r.sourceDigest) && cursor(p.nextCursor, r.scope, r.sourceDigest)
    && (p.lastLimit === null ? p.pages === 0 : positive(p.lastLimit) && p.lastLimit <= (r.scope === originalScopes[0] ? 100 : 50))
    && natural(p.pages) && p.pages <= 400 && natural(p.rows) && p.rows <= 10000 && natural(p.bytes) && p.bytes <= 1000000 && typeof p.terminal === 'boolean');
}
function exit(v: Record<string, unknown>, binding: CoverageProgressBinding): boolean {
  const r = v.request;
  if (!record(r) || !exact(r, ['requestId','ownerId','sessionId','mobileEpoch','scope','objectIds','sourceDigest','previewDigest','capturedAt','expiresAt','decision','requestDigest','decidedAt','effects'])
    || !sameRoot(r, String(v.objectId), binding.ownerId) || !positive(r.mobileEpoch) || r.scope !== 'coverage-progress-data/1' || !selectedIds(r.objectIds)
    || r.objectIds.includes(String(v.objectId)) || !hash(r.sourceDigest) || !hash(r.previewDigest) || !positive(r.capturedAt) || r.expiresAt !== r.capturedAt + 30000) return false;
  if (r.decision === null ? r.requestDigest !== null || r.decidedAt !== null || r.effects !== null
    : !['export','erase'].includes(String(r.decision)) || !hash(r.requestDigest) || !positive(r.decidedAt) || r.decidedAt < r.capturedAt
      || r.decidedAt >= Number(r.expiresAt) || (r.decision === 'erase' ? !validCoverageProgressEffects(r.effects) : r.effects !== null)) return false;
  if (v.progress === null) return true;
  const p = v.progress;
  return record(p) && exact(p, ['requestId','lastCursor','nextCursor','lastLimit','pages','rows','bytes','terminal']) && p.requestId === v.objectId
    && cursor(p.lastCursor, r.scope, r.sourceDigest) && cursor(p.nextCursor, r.scope, r.sourceDigest)
    && (p.lastLimit === null ? p.pages === 0 : p.lastLimit === 5) && natural(p.pages) && p.pages <= 4 && natural(p.rows) && p.rows <= 20
    && natural(p.bytes) && p.bytes <= 1000000 && typeof p.terminal === 'boolean' && r.decision === 'export';
}
/** Closed projection of every persisted field; never recursively embed selected rows. */
export function coverageProgressRowKey(v: unknown, binding: CoverageProgressBinding): string | null {
  if (!record(v) || !uuid(v.objectId) || v.objectId !== String(v.objectId).toLowerCase()) return null;
  return v.domain === 'collector' && exact(v, ['objectId','domain','request','sections','fence']) && collector(v, binding)
    || v.domain === 'exit' && exact(v, ['objectId','domain','request','progress']) && exit(v, binding) ? String(v.objectId) : null;
}
