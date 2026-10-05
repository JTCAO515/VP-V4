import type { ExportHandler, ExportLease, ExportPage } from '../privacy/export-dispatcher.ts';
import { object, exact, uuid, integer, digest, source, timestamp, quietHours, zone } from './wire.ts';
import { deliveryOutcome } from './codec.ts';

export type NotificationExportRPC = (name: 'notification_metadata_export_v1', input: Readonly<Record<string, unknown>>, signal: AbortSignal) => Promise<unknown>;
type Cursor = Readonly<{ sourceRevision: string; afterKey: string }>;
const key = (v: unknown): v is string => typeof v === 'string' && /^(reminder|watch|dismissal|operation|device):[a-f0-9-]{36}$/.test(v) && uuid(v.split(':')[1]);
const cursor = (v: unknown): v is Cursor => object(v) && exact(v, ['sourceRevision', 'afterKey']) && digest(v.sourceRevision) && key(v.afterKey);
const reason = (v: unknown) => v === null || typeof v === 'string' && v.length > 0 && v.length <= 240;
function row(v: unknown): v is Record<string, unknown> {
  if (!object(v) || !key(v.key) || typeof v.domain !== 'string' || !v.key.startsWith(v.domain + ':')) return false;
  if (v.domain === 'device') return exact(v, ['key', 'domain', 'deviceId', 'revision', 'permission', 'active', 'environment', 'timeZone']) && uuid(v.deviceId) && v.key.endsWith(v.deviceId) && integer(v.revision, 1) && ['authorized', 'denied', 'not_determined'].includes(String(v.permission)) && typeof v.active === 'boolean' && ['sandbox', 'production'].includes(String(v.environment)) && zone(v.timeZone);
  if (!uuid(v.tripId)) return false;
  if (v.domain === 'dismissal') return exact(v, ['key', 'domain', 'tripId', 'id', 'sourceKind', 'sourceId', 'semanticDigest']) && uuid(v.id) && v.key.endsWith(v.id) && ['current_trip', 'user_reminder', 'task_result', 'qualified_watch'].includes(String(v.sourceKind)) && uuid(v.sourceId) && digest(v.semanticDigest);
  if (v.domain === 'operation') {
    const r = v.receipt;
    return exact(v, ['key', 'domain', 'tripId', 'operationId', 'action', 'requestDigest', 'receipt']) && uuid(v.operationId) && v.key.endsWith(v.operationId) && digest(v.requestDigest) && ['schedule', 'watch', 'cancel', 'complete', 'dismiss', 'unwatch', 'register_device', 'revoke_device'].includes(String(v.action)) && object(r) && exact(r, ['operationId', 'action', 'requestDigest', 'resultId', 'revision', 'terminal', 'outcome']) && r.operationId === v.operationId && r.action === v.action && r.requestDigest === v.requestDigest && uuid(r.resultId) && integer(r.revision) && r.terminal === true && ['applied', 'cancelled'].includes(String(r.outcome));
  }
  if (!uuid(v.id) || !v.key.endsWith(v.id) || !source(v.source) || !timestamp(v.expiresAt) || !zone(v.timeZone) || !quietHours(v.quietHours) || !timestamp(v.consentAt)) return false;
  if (v.domain === 'watch') return exact(v, ['key', 'domain', 'tripId', 'id', 'source', 'baselineDigest', 'expiresAt', 'timeZone', 'quietHours', 'consentAt', 'status']) && v.source.kind === 'qualified_watch' && digest(v.baselineDigest) && ['active', 'cancelled'].includes(String(v.status));
  return v.domain === 'reminder' && exact(v, ['key', 'domain', 'tripId', 'id', 'baseVersion', 'purpose', 'source', 'reason', 'dueAt', 'expiresAt', 'timeZone', 'quietHours', 'consentAt', 'status', 'deliveryState', 'outcome']) && integer(v.baseVersion) && ['user_set_travel', 'accepted_task_result', 'qualified_watch'].includes(String(v.purpose)) && reason(v.reason) && timestamp(v.dueAt) && ['saved', 'cancelled', 'completed'].includes(String(v.status)) && ['scheduled', 'suppressed', 'attempting', 'accepted', 'unknown', 'error'].includes(String(v.deliveryState)) && (v.outcome === null || deliveryOutcome(v.outcome));
}
/** Independently versioned handler. No enrollment or change to prior core exports. */
export function notificationExportHandler(lease: ExportLease, rpc: NotificationExportRPC): ExportHandler {
  if (![lease.requestId, lease.ownerId, lease.leaseId].every(uuid) || !integer(lease.generation, 1, 3)) throw Error('Notification export unavailable');
  let sourceRevision: string | null = null;
  return { sections: ['notifications'], consistency: 'snapshot', async page(section, after, limit, signal): Promise<ExportPage> {
    if (section !== 'notifications' || after !== null && !cursor(after) || !integer(limit, 1, 100) || signal.aborted) throw Error('Notification export unavailable');
    const v = await rpc('notification_metadata_export_v1', { p_request: lease.requestId, p_lease: lease.leaseId, p_generation: lease.generation, p_cursor: after, p_limit: limit }, signal);
    if (!object(v) || !exact(v, ['kind', 'schemaVersion', 'requestId', 'generation', 'sourceRevision', 'items', 'hasMore', 'nextCursor', 'allUserDataCompleted']) || v.kind !== 'metadata' || v.schemaVersion !== 'notification-metadata/1' || v.requestId !== lease.requestId || v.generation !== lease.generation || !digest(v.sourceRevision) || sourceRevision !== null && v.sourceRevision !== sourceRevision || !Array.isArray(v.items) || v.items.length > limit || !v.items.every(row) || typeof v.hasMore !== 'boolean' || v.allUserDataCompleted !== false || (v.hasMore ? !cursor(v.nextCursor) || v.items.length === 0 || v.nextCursor.sourceRevision !== v.sourceRevision : v.nextCursor !== null)) throw Error('Notification export unavailable');
    let previous = after === null ? null : (after as Cursor).afterKey;
    for (const item of v.items) { if (previous !== null && String(item.key) <= previous) throw Error('Notification export unavailable'); previous = String(item.key); }
    if (v.hasMore && (v.nextCursor as Cursor).afterKey !== previous) throw Error('Notification export unavailable');
    sourceRevision = String(v.sourceRevision);
    return { items: structuredClone(v.items), hasMore: v.hasMore, nextCursor: structuredClone(v.nextCursor), sectionComplete: !v.hasMore };
  } };
}
