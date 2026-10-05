import type { DeliveryOutcome } from './delivery-contract.ts';
import { object, exact, uuid, integer, digest, timestamp, source, quietHours, zone, noticeRequestDigest, type NoticeView, type NoticeCommand, type NoticeResolution } from './wire.ts';

export function deliveryOutcome(v: unknown): v is DeliveryOutcome {
  if (!object(v)) return false;
  if (v.kind === 'accepted') return exact(v, ['kind', 'apnsId', 'acceptedAt']) && uuid(v.apnsId) && timestamp(v.acceptedAt);
  if (v.kind === 'unknown') return exact(v, ['kind', 'code']) && v.code === 'ACK_UNKNOWN';
  return v.kind === 'error' && exact(v, ['kind', 'code']) && ['TOKEN_REVOKED', 'PROVIDER_REJECTED', 'TRANSPORT_UNAVAILABLE'].includes(String(v.code));
}
const reason = (v: unknown) => v === null || typeof v === 'string' && v.length <= 240 && v.trim().length > 0;
const uniqueIds = (v: readonly { id: string }[]) => new Set(v.map(x => x.id)).size === v.length;
export function decodeNoticeView(v: unknown, tripId: string, command: NoticeCommand | null): NoticeView | null {
  if (!object(v) || !exact(v, ['version', 'tripId', 'tripVersion', 'transport', 'watchAvailability', 'nextSteps', 'reminders', 'watches', 'device', 'complete', 'mutationReceipt']) || v.version !== 2 || v.tripId !== tripId || !integer(v.tripVersion) || !['disabled', 'configured'].includes(String(v.transport)) || v.watchAvailability !== 'qualified_only' || typeof v.complete !== 'boolean') return null;
  if (!Array.isArray(v.nextSteps) || v.nextSteps.length > 100 || !Array.isArray(v.reminders) || v.reminders.length > 100 || !Array.isArray(v.watches) || v.watches.length > 50) return null;
  if (!v.nextSteps.every(x => object(x) && exact(x, ['id', 'source', 'reasonCode', 'reason', 'expiresAt']) && uuid(x.id) && source(x.source) && timestamp(x.expiresAt) && reason(x.reason) && (x.source.kind === 'qualified_watch' ? ['watch_available', 'watch_changed'].includes(String(x.reasonCode)) : ({ current_trip: 'review_trip', user_reminder: 'user_requested', task_result: 'result_ready' }[x.source.kind]) === x.reasonCode) && (x.source.kind === 'user_reminder' || x.reason === null))) return null;
  if (!v.reminders.every(x => object(x) && exact(x, ['id', 'operationId', 'baseVersion', 'purpose', 'source', 'reason', 'dueAt', 'expiresAt', 'timeZone', 'quietHours', 'status', 'deliveryState', 'outcome']) && uuid(x.id) && uuid(x.operationId) && integer(x.baseVersion) && source(x.source) && reason(x.reason) && timestamp(x.dueAt) && timestamp(x.expiresAt) && Date.parse(x.expiresAt) > Date.parse(x.dueAt) && zone(x.timeZone) && quietHours(x.quietHours) && ['saved', 'cancelled', 'completed'].includes(String(x.status)) && ['scheduled', 'suppressed', 'attempting', 'accepted', 'unknown', 'error'].includes(String(x.deliveryState)) && (x.outcome === null || deliveryOutcome(x.outcome)) && (x.purpose === 'user_set_travel' && ['current_trip', 'user_reminder'].includes(x.source.kind) && x.reason !== null || x.purpose === 'accepted_task_result' && x.source.kind === 'task_result' && x.reason === null || x.purpose === 'qualified_watch' && x.source.kind === 'qualified_watch' && x.reason === null) && (['accepted', 'unknown', 'error'].includes(String(x.deliveryState)) ? object(x.outcome) && x.outcome.kind === x.deliveryState : x.outcome === null))) return null;
  if (!v.watches.every(x => object(x) && exact(x, ['id', 'source', 'expiresAt', 'status', 'timeZone', 'quietHours']) && uuid(x.id) && source(x.source) && x.source.kind === 'qualified_watch' && timestamp(x.expiresAt) && ['active', 'cancelled'].includes(String(x.status)) && zone(x.timeZone) && quietHours(x.quietHours))) return null;
  if (!uniqueIds(v.nextSteps) || !uniqueIds(v.reminders) || !uniqueIds(v.watches)) return null;
  if (v.device !== null && (!object(v.device) || !exact(v.device, ['deviceId', 'revision', 'permission', 'active']) || !uuid(v.device.deviceId) || !integer(v.device.revision, 1) || !['authorized', 'denied', 'not_determined'].includes(String(v.device.permission)) || typeof v.device.active !== 'boolean' || v.device.active && v.device.permission !== 'authorized')) return null;
  if (command === null) { if (v.mutationReceipt !== null) return null; }
  else {
    if (command.action === 'resolve') return null;
    const original = command.action === 'abandon' ? command.input.command : command;
    const r = v.mutationReceipt, x = original.input;
    if (!object(r) || !exact(r, ['operationId', 'action', 'requestDigest', 'resultId', 'revision', 'terminal', 'outcome']) || r.operationId !== x.operationId || r.action !== original.action || r.requestDigest !== noticeRequestDigest(original) || !digest(r.requestDigest) || !uuid(r.resultId) || !integer(r.revision) || r.terminal !== true || !['applied', 'cancelled'].includes(String(r.outcome))) return null;
    const expected = 'id' in x ? x.id : 'nextStepId' in x ? x.nextStepId : 'deviceId' in x ? x.deviceId : null;
    if (r.resultId !== expected) return null;
  }
  return v as NoticeView;
}
export function decodeNoticeResolution(v: unknown, notificationId: string): NoticeResolution | null {
  return object(v) && exact(v, ['version', 'kind', 'notificationId', 'tripId', 'tripVersion', 'source', 'expiresAt', 'current']) && v.version === 2 && v.kind === 'resolved' && v.notificationId === notificationId && uuid(v.tripId) && integer(v.tripVersion) && source(v.source) && timestamp(v.expiresAt) && typeof v.current === 'boolean' ? v as NoticeResolution : null;
}
