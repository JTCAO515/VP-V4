import { exact, record, uuid, hash } from '../../guide/contract.ts';
import { coverageProgressRowKey } from './rows.ts';
import { COVERAGE_PROGRESS_SCHEMA, COVERAGE_PROGRESS_LIMITS, coverageProgressBindingKeys, validCoverageProgressBinding,
  sameCoverageProgressSelection, positive, natural, coverageProgressEffectCounts, validCoverageProgressEffects, type CoverageProgressBinding, type CoverageProgressActor,
  type CoverageProgressSelection, type CoverageProgressCommand } from './contract.ts';

export type CoverageProgressPreview = CoverageProgressBinding & Readonly<{ kind: 'preview'; items: readonly unknown[]; requiresExplicitConfirmation: true }>;
export type CoverageProgressBundle = CoverageProgressBinding & Readonly<{ kind: 'bundle'; requestDigest: string; items: readonly unknown[];
  proof: Readonly<{ coverage: 'complete'; pages: number; rows: number }> }>;
export { coverageProgressEffectCounts };
export type CoverageProgressEffects = Readonly<Record<typeof coverageProgressEffectCounts[number], number>> & Readonly<{
  sourceData: 'not_modified'; sessionAccountFences: 'retained'; externalCopies: 'not_erased';
}>;
export type CoverageProgressReceipt = CoverageProgressBinding & Readonly<{ kind: 'receipt'; state: 'erased'; requestDigest: string; committedAt: number; decidedAt: number; effects: CoverageProgressEffects }>;
export const sameCoverageProgressBinding = (v: Record<string, unknown>, binding: CoverageProgressBinding) => coverageProgressBindingKeys.every(k =>
  k === 'boundaries' || (k === 'objectIds' ? JSON.stringify(v[k]) === JSON.stringify(binding[k]) : v[k] === binding[k]));
function rows(v: CoverageProgressBinding, items: unknown): items is unknown[] {
  return Array.isArray(items) && items.length === v.objectIds.length
    && items.every((row, i) => coverageProgressRowKey(row, v) === v.objectIds[i]);
}
const size = (v: unknown) => Buffer.byteLength(JSON.stringify(v), 'utf8') <= COVERAGE_PROGRESS_LIMITS.maxBytes;
export function decodeCoverageProgressPreview(v: unknown, selection?: CoverageProgressSelection, actor?: CoverageProgressActor, now = Date.now()): CoverageProgressPreview | null {
  return record(v) && exact(v, [...coverageProgressBindingKeys,'kind','items','requiresExplicitConfirmation']) && validCoverageProgressBinding(v, now)
    && v.kind === 'preview' && v.requiresExplicitConfirmation === true && rows(v, v.items)
    && (!selection || actor && sameCoverageProgressSelection(v, selection, actor)) && size(v) ? v as CoverageProgressPreview : null;
}
export function decodeCoverageProgressBundle(v: unknown, selection?: CoverageProgressSelection, actor?: CoverageProgressActor, now = Date.now()): CoverageProgressBundle | null {
  return record(v) && exact(v, [...coverageProgressBindingKeys,'kind','requestDigest','items','proof']) && validCoverageProgressBinding(v, now)
    && v.kind === 'bundle' && hash(v.requestDigest) && rows(v, v.items) && record(v.proof) && exact(v.proof, ['coverage','pages','rows'])
    && v.proof.coverage === 'complete' && v.proof.rows === v.objectIds.length && v.proof.pages === Math.ceil(v.objectIds.length / COVERAGE_PROGRESS_LIMITS.pageSize)
    && (!selection || actor && sameCoverageProgressSelection(v, selection, actor)) && size(v) ? v as CoverageProgressBundle : null;
}
export function decodeCoverageProgressReceipt(v: unknown, selection?: CoverageProgressSelection, actor?: CoverageProgressActor, requestDigest?: string, now = Date.now()): CoverageProgressReceipt | null {
  if (!record(v) || !exact(v, [...coverageProgressBindingKeys,'kind','state','requestDigest','committedAt','decidedAt','effects']) || !validCoverageProgressBinding(v, now, true)
    || v.kind !== 'receipt' || v.state !== 'erased' || !hash(v.requestDigest) || requestDigest && v.requestDigest !== requestDigest
    || !positive(v.committedAt) || v.committedAt < v.capturedAt || v.committedAt >= v.expiresAt
    || !positive(v.decidedAt) || v.decidedAt !== v.committedAt || v.decidedAt > now
    || selection && (!actor || !sameCoverageProgressSelection(v, selection, actor)) || !validCoverageProgressEffects(v.effects)
    || v.effects.retainedFences !== (v.objectIds as readonly unknown[]).length || !size(v)) return null;
  return v as CoverageProgressReceipt;
}
export function decodeCoverageProgressUnknown(v: unknown, selection: CoverageProgressSelection, actor: CoverageProgressActor, digest: string): boolean {
  return record(v) && exact(v, ['schemaVersion','kind','scope','requestId','objectIds','ownerId','sessionId','mobileEpoch','requestDigest','allUserDataCompleted'])
    && v.schemaVersion === COVERAGE_PROGRESS_SCHEMA && v.kind === 'unknown' && sameCoverageProgressSelection(v, selection, actor)
    && v.requestDigest === digest && v.allUserDataCompleted === false;
}
export function decodeCoverageProgressList(v: unknown, command: Extract<CoverageProgressCommand, { action: 'list' }>, actor: CoverageProgressActor, now: number): Record<string, unknown> | null {
  if (!record(v) || !exact(v, ['schemaVersion','kind','scope','ownerId','sessionId','mobileEpoch','sourceDigest','capturedAt','expiresAt','items','hasMore','nextCursor','allUserDataCompleted'])
    || v.schemaVersion !== COVERAGE_PROGRESS_SCHEMA || v.kind !== 'list' || v.scope !== command.scope
    || v.ownerId !== actor.ownerId || v.sessionId !== actor.sessionId || v.mobileEpoch !== actor.mobileEpoch || !hash(v.sourceDigest)
    || !positive(v.capturedAt) || v.capturedAt > now || !positive(v.expiresAt) || v.expiresAt !== v.capturedAt + COVERAGE_PROGRESS_LIMITS.lifetimeMs
    || v.expiresAt <= now || command.cursor && command.cursor.sourceDigest !== v.sourceDigest || !Array.isArray(v.items) || v.items.length > 20
    || typeof v.hasMore !== 'boolean' || v.allUserDataCompleted !== false) return null;
  let last = command.cursor?.afterId ?? '';
  for (const row of v.items) {
    if (!record(row) || !exact(row, ['objectId','domain','state','rows']) || !uuid(row.objectId) || row.objectId <= last
      || !['collector','exit'].includes(String(row.domain)) || !['active','retained','erased'].includes(String(row.state))
      || !natural(row.rows) || row.rows > 3) return null;
    last = row.objectId;
  }
  if (v.hasMore ? v.items.length !== 20 || !record(v.nextCursor) || !exact(v.nextCursor, ['sourceDigest','afterId'])
    || v.nextCursor.sourceDigest !== v.sourceDigest || v.nextCursor.afterId !== last : v.nextCursor !== null) return null;
  return v;
}
