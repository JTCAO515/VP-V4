import { exact, record, uuid, hash } from '../../guide/contract.ts';
import { notificationDataRowKey } from './rows.ts';
import { NOTIFICATION_DATA_SCHEMA, NOTIFICATION_DATA_LIMITS, notificationDataBindingKeys, validNotificationDataBinding,
  sameNotificationDataSelection, positive, natural, notificationDataEffectCounts, validNotificationDataEffects, type NotificationDataBinding, type NotificationDataActor,
  type NotificationDataSelection, type NotificationDataCommand } from './contract.ts';

export type NotificationDataPreview = NotificationDataBinding & Readonly<{ kind: 'preview'; items: readonly unknown[]; requiresExplicitConfirmation: true }>;
export type NotificationDataBundle = NotificationDataBinding & Readonly<{ kind: 'bundle'; requestDigest: string; items: readonly unknown[];
  proof: Readonly<{ coverage: 'complete'; pages: number; rows: number }> }>;
export { notificationDataEffectCounts };
export type NotificationDrainProof = Readonly<{ protocol: 'monotonic-drain/1'; generation: number; waitMs: 5000; finishedAt: number }>;
export type NotificationDataEffects = Readonly<Record<typeof notificationDataEffectCounts[number], number>> & Readonly<{
  drainedThrough: number; drainProof: NotificationDrainProof | null; tripMutation: 'none'; businessResults: 'not_modified'; providerCopies: 'not_recalled'; deviceCopies: 'not_erased';
}>;
export type NotificationDataReceipt = NotificationDataBinding & Readonly<{ kind: 'receipt'; state: 'erased'; requestDigest: string; committedAt: number; decidedAt: number; effects: NotificationDataEffects }>;
export const sameNotificationDataBinding = (v: Record<string, unknown>, binding: NotificationDataBinding) => notificationDataBindingKeys.every(k =>
  k === 'boundaries' || (k === 'objectIds' ? JSON.stringify(v[k]) === JSON.stringify(binding[k]) : v[k] === binding[k]));
function rows(v: NotificationDataBinding, items: unknown, now: number): items is unknown[] {
  return Array.isArray(items) && items.length === v.objectIds.length && items.every((row, i) => {
    if (notificationDataRowKey(row, v) !== v.objectIds[i]) return false;
    if (v.scope !== 'notification-exit-progress/1' || !record(row) || row.receipt === null) return true;
    const receipt = decodeNotificationDataReceipt(row.receipt, undefined, undefined, undefined, now);
    return !!receipt && receipt.requestId === row.objectId && receipt.ownerId === v.ownerId && receipt.scope === row.scope
      && JSON.stringify(receipt.objectIds) === JSON.stringify(row.objectIds) && receipt.sourceDigest === row.sourceDigest
      && receipt.previewDigest === row.previewDigest && receipt.requestDigest === row.requestDigest && row.state === 'erased';
  });
}
const size = (v: unknown) => Buffer.byteLength(JSON.stringify(v), 'utf8') <= NOTIFICATION_DATA_LIMITS.maxBytes;
export function decodeNotificationDataPreview(v: unknown, selection?: NotificationDataSelection, actor?: NotificationDataActor, now = Date.now()): NotificationDataPreview | null {
  return record(v) && exact(v, [...notificationDataBindingKeys,'kind','items','requiresExplicitConfirmation']) && validNotificationDataBinding(v, now)
    && v.kind === 'preview' && v.requiresExplicitConfirmation === true && rows(v, v.items, now)
    && (!selection || actor && sameNotificationDataSelection(v, selection, actor)) && size(v) ? v as NotificationDataPreview : null;
}
export function decodeNotificationDataBundle(v: unknown, selection?: NotificationDataSelection, actor?: NotificationDataActor, now = Date.now()): NotificationDataBundle | null {
  return record(v) && exact(v, [...notificationDataBindingKeys,'kind','requestDigest','items','proof']) && validNotificationDataBinding(v, now)
    && v.kind === 'bundle' && hash(v.requestDigest) && rows(v, v.items, now) && record(v.proof) && exact(v.proof, ['coverage','pages','rows'])
    && v.proof.coverage === 'complete' && v.proof.rows === v.objectIds.length && v.proof.pages === Math.ceil(v.objectIds.length / NOTIFICATION_DATA_LIMITS.pageSize)
    && (!selection || actor && sameNotificationDataSelection(v, selection, actor)) && size(v) ? v as NotificationDataBundle : null;
}
export function decodeNotificationDataReceipt(v: unknown, selection?: NotificationDataSelection, actor?: NotificationDataActor, requestDigest?: string, now = Date.now()): NotificationDataReceipt | null {
  if (!record(v) || !exact(v, [...notificationDataBindingKeys,'kind','state','requestDigest','committedAt','decidedAt','effects']) || !validNotificationDataBinding(v, now, true)
    || v.kind !== 'receipt' || v.state !== 'erased' || !hash(v.requestDigest) || requestDigest && v.requestDigest !== requestDigest
    || !positive(v.committedAt) || v.committedAt < v.capturedAt || v.committedAt >= v.expiresAt
    || !positive(v.decidedAt) || v.decidedAt < v.committedAt || v.decidedAt > now
    || selection && (!actor || !sameNotificationDataSelection(v, selection, actor)) || !validNotificationDataEffects(v.effects)
    || !natural(v.effects.drainedThrough) || v.effects.drainedThrough > v.decidedAt || !size(v)) return null;
  if (v.effects.drainProof === null ? v.effects.drainedThrough !== 0 : !record(v.effects.drainProof)
    || !exact(v.effects.drainProof, ['protocol','generation','waitMs','finishedAt']) || v.effects.drainProof.protocol !== 'monotonic-drain/1'
    || !positive(v.effects.drainProof.generation) || v.effects.drainProof.waitMs !== 5000
    || v.effects.drainProof.finishedAt !== v.effects.drainedThrough || v.effects.drainedThrough !== v.decidedAt) return null;
  if (v.scope === 'notification-exit-progress/1' ? v.effects.drainProof !== null : v.effects.drainProof === null) return null;
  if (v.scope === 'notification-exit-progress/1' && notificationDataEffectCounts.some(k => k !== 'pageProgress' && k !== 'fences' && record(v.effects) && v.effects[k] !== 0)) return null;
  return v as NotificationDataReceipt;
}
export function decodeNotificationDataUnknown(v: unknown, selection: NotificationDataSelection, actor: NotificationDataActor, digest: string): boolean {
  return record(v) && exact(v, ['schemaVersion','kind','scope','requestId','objectIds','ownerId','sessionId','mobileEpoch','requestDigest','allUserDataCompleted'])
    && v.schemaVersion === NOTIFICATION_DATA_SCHEMA && v.kind === 'unknown' && sameNotificationDataSelection(v, selection, actor)
    && v.requestDigest === digest && v.allUserDataCompleted === false;
}
export function decodeNotificationDataList(v: unknown, command: Extract<NotificationDataCommand, { action: 'list' }>, actor: NotificationDataActor, now: number): Record<string, unknown> | null {
  if (!record(v) || !exact(v, ['schemaVersion','kind','scope','ownerId','sessionId','mobileEpoch','sourceDigest','capturedAt','expiresAt','items','hasMore','nextCursor','allUserDataCompleted'])
    || v.schemaVersion !== NOTIFICATION_DATA_SCHEMA || v.kind !== 'list' || v.scope !== command.scope
    || v.ownerId !== actor.ownerId || v.sessionId !== actor.sessionId || v.mobileEpoch !== actor.mobileEpoch || !hash(v.sourceDigest)
    || !positive(v.capturedAt) || v.capturedAt > now || !positive(v.expiresAt) || v.expiresAt !== v.capturedAt + NOTIFICATION_DATA_LIMITS.lifetimeMs
    || v.expiresAt <= now || command.cursor && command.cursor.sourceDigest !== v.sourceDigest || !Array.isArray(v.items) || v.items.length > 20
    || typeof v.hasMore !== 'boolean' || v.allUserDataCompleted !== false) return null;
  let last = command.cursor?.afterId ?? '';
  for (const row of v.items) {
    if (!record(row) || !exact(row, ['objectId','label','state','rows']) || !uuid(row.objectId) || row.objectId <= last
      || !(row.label === null || typeof row.label === 'string' && row.label.length <= 1000) || !['active','archived','retained','erased'].includes(String(row.state))
      || !natural(row.rows) || row.rows > NOTIFICATION_DATA_LIMITS.tableRows || command.scope !== 'notification-trip-data/1' && row.label !== null
      || ['retained','erased'].includes(String(row.state)) && row.label !== null) return null;
    last = row.objectId;
  }
  if (v.hasMore ? v.items.length !== 20 || !record(v.nextCursor) || !exact(v.nextCursor, ['sourceDigest','afterId'])
    || v.nextCursor.sourceDigest !== v.sourceDigest || v.nextCursor.afterId !== last : v.nextCursor !== null) return null;
  return v;
}
