import { exact, record, uuid, hash } from '../../guide/contract.ts';
import { materialRowKey } from './rows.ts';
import { MATERIAL_SCHEMA, MATERIAL_LIMITS, MATERIAL_BOUNDARIES, materialScope, materialBindingKeys, validMaterialBinding,
  sameMaterialSelection, natural, positive, type MaterialBinding, type MaterialSelection, type MaterialActor, type MaterialCommand } from './contract.ts';

export type MaterialPreview = MaterialBinding & Readonly<{ kind: 'preview'; items: readonly unknown[]; requiresExplicitConfirmation: true }>;
export type MaterialBundle = MaterialBinding & Readonly<{ kind: 'bundle'; requestDigest: string; items: readonly unknown[];
  proof: Readonly<{ coverage: 'complete'; pages: number; rows: number }> }>;
export type MaterialEraseReceipt = MaterialBinding & Readonly<{ kind: 'receipt'; state: 'erased'; requestDigest: string; decidedAt: number;
  effects: Readonly<{ objects: number; temporaryRecords: number; unappliedProposals: number; tripMutation: 'none'; externalOrders: 'not_contacted'; financialRecords: 'not_modified' }> }>;
export const sameMaterialBinding = (v: Record<string, unknown>, binding: MaterialBinding) => materialBindingKeys.every(k =>
  k === 'boundaries' ? true : k === 'objectIds' ? JSON.stringify(v[k]) === JSON.stringify(binding[k]) : v[k] === binding[k]);
function selectedRows(v: MaterialBinding, items: unknown, now: number): items is unknown[] {
  return Array.isArray(items) && items.length === v.objectIds.length && items.every((row, i) => materialRowKey(v.scope, row, v.tripId, v.mobileEpoch, now) === v.objectIds[i]);
}
export function decodeMaterialPreview(v: unknown, selection?: MaterialSelection, actor?: MaterialActor, now = Date.now()): MaterialPreview | null {
  return record(v) && exact(v, [...materialBindingKeys,'kind','items','requiresExplicitConfirmation']) && validMaterialBinding(v, now)
    && v.kind === 'preview' && v.requiresExplicitConfirmation === true && selectedRows(v, v.items, now)
    && (!selection || actor && sameMaterialSelection(v, selection, actor)) && Buffer.byteLength(JSON.stringify(v), 'utf8') <= MATERIAL_LIMITS.maxBytes ? v as MaterialPreview : null;
}
export function decodeMaterialBundle(v: unknown, selection?: MaterialSelection, actor?: MaterialActor, now = Date.now()): MaterialBundle | null {
  return record(v) && exact(v, [...materialBindingKeys,'kind','requestDigest','items','proof']) && validMaterialBinding(v, now)
    && v.kind === 'bundle' && hash(v.requestDigest) && selectedRows(v, v.items, now)
    && record(v.proof) && exact(v.proof, ['coverage','pages','rows']) && v.proof.coverage === 'complete'
    && v.proof.rows === v.objectIds.length && v.proof.pages === Math.ceil(v.objectIds.length / MATERIAL_LIMITS.pageSize)
    && (!selection || actor && sameMaterialSelection(v, selection, actor)) && Buffer.byteLength(JSON.stringify(v), 'utf8') <= MATERIAL_LIMITS.maxBytes ? v as MaterialBundle : null;
}
export function decodeMaterialReceipt(v: unknown, selection?: MaterialSelection, actor?: MaterialActor, requestDigest?: string, now = Date.now()): MaterialEraseReceipt | null {
  if (!record(v) || !exact(v, [...materialBindingKeys,'kind','state','requestDigest','decidedAt','effects']) || !validMaterialBinding(v, now, true)
    || v.kind !== 'receipt' || v.state !== 'erased' || !hash(v.requestDigest) || requestDigest && v.requestDigest !== requestDigest
    || !positive(v.decidedAt) || v.decidedAt < v.capturedAt || v.decidedAt > v.expiresAt || v.decidedAt > now
    || selection && (!actor || !sameMaterialSelection(v, selection, actor)) || !record(v.effects)
    || !exact(v.effects, ['objects','temporaryRecords','unappliedProposals','tripMutation','externalOrders','financialRecords'])
    || v.effects.objects !== v.objectIds.length || !natural(v.effects.temporaryRecords) || v.effects.temporaryRecords > v.objectIds.length
    || !natural(v.effects.unappliedProposals) || v.effects.unappliedProposals > v.objectIds.length
    || v.effects.tripMutation !== 'none' || v.effects.externalOrders !== 'not_contacted' || v.effects.financialRecords !== 'not_modified') return null;
  return v as MaterialEraseReceipt;
}
export function decodeMaterialList(v: unknown, command: Extract<MaterialCommand, { action: 'list' }>, actor: MaterialActor, now: number): Record<string, unknown> | null {
  if (!record(v) || !exact(v, ['schemaVersion','kind','scope','tripId','ownerId','sessionId','mobileEpoch','sourceDigest','capturedAt','expiresAt','items','hasMore','nextCursor','allUserDataCompleted'])
    || v.schemaVersion !== MATERIAL_SCHEMA || v.kind !== 'list' || !materialScope(v.scope) || v.scope !== command.scope || v.tripId !== command.tripId
    || v.ownerId !== actor.ownerId || v.sessionId !== actor.sessionId || v.mobileEpoch !== actor.mobileEpoch || !hash(v.sourceDigest)
    || !positive(v.capturedAt) || !positive(v.expiresAt) || v.capturedAt > now || v.expiresAt <= now || v.expiresAt !== v.capturedAt + MATERIAL_LIMITS.lifetimeMs
    || command.cursor && command.cursor.sourceDigest !== v.sourceDigest || !Array.isArray(v.items) || v.items.length > 20
    || typeof v.hasMore !== 'boolean' || v.allUserDataCompleted !== false) return null;
  let last = command.cursor?.afterId ?? '';
  for (const item of v.items) {
    if (!record(item) || !exact(item, ['objectId','revision','label','materialExpiresAt','sourceState']) || !uuid(item.objectId) || item.objectId <= last
      || !(item.revision === null || positive(item.revision)) || !(item.label === null || typeof item.label === 'string' && item.label.length <= 160)
      || !(item.materialExpiresAt === null || positive(item.materialExpiresAt)) || !['active','pending','confirmed','rejected','cancelled','expired','erased','retained','unknown'].includes(String(item.sourceState))) return null;
    if (command.scope !== 'reservation-reference-data/1' && (item.label !== null || item.revision !== null)) return null;
    last = item.objectId;
  }
  if (v.hasMore ? v.items.length !== 20 || !record(v.nextCursor) || !exact(v.nextCursor, ['sourceDigest','afterId'])
    || v.nextCursor.sourceDigest !== v.sourceDigest || v.nextCursor.afterId !== last : v.nextCursor !== null) return null;
  return v;
}
export { MATERIAL_BOUNDARIES };
