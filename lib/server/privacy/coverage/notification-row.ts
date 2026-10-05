/** Original notification-metadata/1 closed row schema; no old lease or RPC enrollment. */
import { object, exact, uuid, integer, digest, source, timestamp, quietHours, zone } from '../../notifications/wire.ts';
import { deliveryOutcome } from '../../notifications/codec.ts';
const key = (v: unknown): v is string => typeof v === 'string' && /^(reminder|watch|dismissal|operation|device):[a-f0-9-]{36}$/.test(v) && uuid(v.split(':')[1]);
const reason = (v: unknown) => v === null || typeof v === 'string' && v.length > 0 && v.length <= 240;
export function notificationCoverageRow(v: unknown): v is Record<string, unknown> {
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
