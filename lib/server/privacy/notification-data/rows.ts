import { exact, record, uuid, hash } from '../../guide/contract.ts';
import { timestamp, source, quietHours, zone } from '../../notifications/wire.ts';
import { deliveryOutcome } from '../../notifications/codec.ts';
import { NOTIFICATION_DATA_LIMITS, notificationDataScope, selectedIds, positive, natural, validNotificationDataEffects, type NotificationDataBinding } from './contract.ts';

const nullable = (check: (v: unknown) => boolean) => (v: unknown) => v === null || check(v);
const text = (v: unknown) => typeof v === 'string' && v.length <= 512 && !v.includes('\0');
const oneOf = (...values: string[]) => (v: unknown) => typeof v === 'string' && values.includes(v);
const bool = (v: unknown) => typeof v === 'boolean';
type Check = (v: unknown) => boolean;
const fields = (v: unknown, checks: Record<string, Check>): v is Record<string, unknown> => record(v)
  && exact(v, Object.keys(checks)) && Object.entries(checks).every(([key, check]) => check(v[key]));

/** Direct table mirrors: every installed column is represented, including nulls. */
export const notificationTableFields: Readonly<Record<string, Readonly<Record<string, Check>>>> = {
  reminders: { id: uuid, owner_id: uuid, trip_id: uuid, user_reminder_id: nullable(uuid), operation_id: uuid, session_id: uuid, epoch: positive,
    base_version: natural, purpose: oneOf('user_set_travel','accepted_task_result','qualified_watch'), source, reason: nullable(text), due_at: timestamp,
    expires_at: timestamp, time_zone: zone, quiet_hours: quietHours, consent_at: timestamp, status: oneOf('saved','cancelled','completed'), revision: positive, created_at: timestamp },
  watches: { id: uuid, owner_id: uuid, trip_id: uuid, session_id: uuid, epoch: positive, base_version: natural, source, baseline_digest: hash,
    expires_at: timestamp, time_zone: zone, quiet_hours: quietHours, consent_at: timestamp, status: oneOf('active','cancelled'),
    stop_reason: nullable(oneOf('user','source_unavailable','recheck')), revision: positive, next_check_at: timestamp },
  dismissals: { owner_id: uuid, trip_id: uuid, next_step_id: uuid, source_kind: oneOf('current_trip','user_reminder','task_result','qualified_watch'), source_id: uuid, semantic_digest: hash, created_at: timestamp },
  outbox: { id: uuid, reminder_id: uuid, device_id: nullable(uuid), device_revision: nullable(positive), recheck_receipt_id: nullable(uuid), recheck_review_digest: nullable(hash),
    state: oneOf('scheduled','suppressed','attempting','accepted','unknown','error'), outcome: nullable(deliveryOutcome), watch_id: nullable(uuid), semantic_digest: nullable(hash), created_at: timestamp },
  attempts: { notification_id: uuid, attempt_id: uuid, device_id: uuid, device_revision: positive, state: oneOf('attempting','accepted','unknown','error'), outcome: nullable(deliveryOutcome), authorized_at: timestamp, lease_expires_at: timestamp },
  operations: { owner_id: uuid, operation_id: uuid, trip_id: uuid, action: oneOf('schedule','watch','cancel','complete','dismiss','unwatch','register_device','revoke_device'), request_digest: hash,
    receipt: v => fields(v, { operationId: uuid, action: oneOf('schedule','watch','cancel','complete','dismiss','unwatch','register_device','revoke_device'), requestDigest: hash, resultId: uuid, revision: natural, terminal: v => v === true, outcome: oneOf('applied','cancelled') }), created_at: timestamp },
  travelReminders: { id: uuid, owner_id: uuid, trip_id: uuid, session_id: uuid, base_version: natural, reason: text, due_at: timestamp, expires_at: timestamp, time_zone: zone,
    purpose: v => v === 'user_set_travel', consent_at: timestamp, status: oneOf('saved','cancelled','completed'), created_at: timestamp },
  device: { id: uuid, owner_id: uuid, session_id: uuid, epoch: positive, revision: positive, token: v => typeof v === 'string' && /^[a-f0-9]{2,512}$/.test(v) && v.length % 2 === 0,
    environment: oneOf('sandbox','production'), topic: v => typeof v === 'string' && /^[A-Za-z0-9.-]{1,200}$/.test(v), permission: oneOf('authorized','denied','not_determined'), time_zone: zone, active: bool, updated_at: timestamp },
};
export const notificationFenceKinds = ['reminder','watch','dismissal','operation','outbox','outbox_parent','watch_semantic','attempt','device','exit_request'] as const;
export function validNotificationFences(v: unknown): v is Record<string, unknown>[] {
  if (!Array.isArray(v) || v.length > NOTIFICATION_DATA_LIMITS.tableRows) return false;
  let previous = '';
  return v.every(fence => {
    if (!fields(fence, { kind: oneOf(...notificationFenceKinds), objectId: uuid, tripId: nullable(uuid), requestId: uuid, requestDigest: nullable(hash), erasedAt: positive })) return false;
    const key = fence.kind + ':' + fence.objectId;
    if (key <= previous) return false; previous = key; return true;
  });
}
const tables = ['reminders','watches','dismissals','outbox','attempts','operations','travelReminders'] as const;
const tableKey = (name: string, v: Record<string, unknown>): string => name === 'dismissals'
  ? `${v.source_kind}:${v.source_id}:${v.semantic_digest}` : String(v[name === 'operations' ? 'operation_id' : name === 'attempts' ? 'notification_id' : 'id']);
function validTable(name: string, v: unknown, binding: NotificationDataBinding, objectId: string): v is Record<string, unknown>[] {
  if (!Array.isArray(v) || v.length > NOTIFICATION_DATA_LIMITS.tableRows) return false;
  let prior = '';
  return v.every(row => {
    if (!fields(row, notificationTableFields[name]) || 'owner_id' in row && row.owner_id !== binding.ownerId
      || 'trip_id' in row && row.trip_id !== objectId) return false;
    const key = tableKey(name, row); if (key <= prior) return false; prior = key;
    if (name === 'operations') {
      const receipt = row.receipt as Record<string, unknown>;
      if (receipt.operationId !== row.operation_id || receipt.action !== row.action || receipt.requestDigest !== row.request_digest) return false;
    }
    if (name === 'attempts' && (Date.parse(String(row.lease_expires_at)) <= Date.parse(String(row.authorized_at))
      || Date.parse(String(row.lease_expires_at)) - Date.parse(String(row.authorized_at)) > 5000)) return false;
    return true;
  });
}

export function notificationDataRowKey(v: unknown, binding: NotificationDataBinding): string | null {
  if (!record(v) || !uuid(v.objectId)) return null;
  if (binding.scope === 'notification-trip-data/1') {
    if (!exact(v, ['objectId', ...tables, 'fences']) || !tables.every(name => validTable(name, v[name], binding, String(v.objectId))) || !validNotificationFences(v.fences)) return null;
    const reminders = v.reminders as Record<string, unknown>[], watches = v.watches as Record<string, unknown>[], outbox = v.outbox as Record<string, unknown>[], attempts = v.attempts as Record<string, unknown>[];
    if (tables.reduce((n, name) => n + (v[name] as unknown[]).length, 0) + v.fences.length > NOTIFICATION_DATA_LIMITS.tableRows
      || outbox.some(row => !reminders.some(r => r.id === row.reminder_id) || row.watch_id !== null && !watches.some(w => w.id === row.watch_id))
      || attempts.some(row => !outbox.some(o => o.id === row.notification_id && o.device_id === row.device_id && o.device_revision === row.device_revision))
      || reminders.some(row => row.user_reminder_id !== null && !(v.travelReminders as Record<string, unknown>[]).some(r => r.id === row.user_reminder_id))
      || v.fences.some(f => f.tripId !== v.objectId)) return null;
    return v.objectId;
  }
  if (binding.scope === 'notification-device-data/1') {
    if (!exact(v, ['objectId','device','outbox','attempts','fences']) || !(v.device === null || fields(v.device, notificationTableFields.device)
      && v.device.owner_id === binding.ownerId && v.device.id === v.objectId) || !validTable('outbox', v.outbox, binding, v.objectId)
      || !validTable('attempts', v.attempts, binding, v.objectId) || !validNotificationFences(v.fences)
      || v.outbox.length + v.attempts.length + v.fences.length + (v.device ? 1 : 0) > NOTIFICATION_DATA_LIMITS.tableRows
      || v.outbox.some(o => o.device_id !== v.objectId) || v.attempts.some(a => a.device_id !== v.objectId
        || !(v.outbox as Record<string, unknown>[]).some(o => o.id === a.notification_id && o.device_revision === a.device_revision))) return null;
    return v.objectId;
  }
  if (!exact(v, ['objectId','scope','objectIds','originalSessionId','originalMobileEpoch','sourceDigest','previewDigest','requestDigest','state','capturedAt','expiresAt','committedAt','decidedAt','pages','rows','progressErased','pageProgress','effects','drain','receipt','fences'])
    || !notificationDataScope(v.scope) || !selectedIds(v.objectIds) || !hash(v.sourceDigest) || !hash(v.previewDigest)
    || !uuid(v.originalSessionId) || !positive(v.originalMobileEpoch)
    || !(v.requestDigest === null || hash(v.requestDigest)) || !['previewed','exporting','exported','fenced','erased','expired'].includes(String(v.state))
    || !positive(v.capturedAt) || !positive(v.expiresAt) || v.expiresAt !== v.capturedAt + NOTIFICATION_DATA_LIMITS.lifetimeMs
    || !(v.committedAt === null || positive(v.committedAt) && v.committedAt >= v.capturedAt && v.committedAt < v.expiresAt)
    || !(v.decidedAt === null || positive(v.decidedAt) && v.decidedAt >= v.capturedAt) || !natural(v.pages) || v.pages > NOTIFICATION_DATA_LIMITS.maxPages
    || !natural(v.rows) || v.rows > NOTIFICATION_DATA_LIMITS.maxRows || typeof v.progressErased !== 'boolean' || !validNotificationFences(v.fences)
    || !(v.receipt === null || record(v.receipt)) || !(v.effects === null || validNotificationDataEffects(v.effects))
    || !fields(v.drain, { state: oneOf('none','pending','complete'), generation: natural, waitMs: n => n === 0 || n === 5000, finishedAt: nullable(positive) })
    || !Array.isArray(v.pageProgress) || v.pageProgress.length > NOTIFICATION_DATA_LIMITS.maxPages) return null;
  let page = 0;
  if (!v.pageProgress.every(p => fields(p, { request_id: uuid, owner_id: uuid, page_number: positive, after_id: uuid, rows: positive,
    request_digest: hash, source_digest: hash, created_at: timestamp }) && p.request_id === v.objectId && p.owner_id === binding.ownerId
    && positive(p.page_number) && positive(p.rows) && p.page_number > page && p.page_number <= NOTIFICATION_DATA_LIMITS.maxPages && p.rows <= NOTIFICATION_DATA_LIMITS.pageSize
    && (page = p.page_number) > 0)) return null;
  if (v.progressErased && v.pageProgress.length !== 0 || v.state === 'fenced' && (v.committedAt === null || v.effects === null || v.receipt !== null || v.drain.state !== 'pending')
    || v.state === 'erased' && (v.committedAt === null || v.effects === null || !record(v.receipt)
      || v.receipt.committedAt !== v.committedAt || v.receipt.decidedAt !== v.decidedAt || JSON.stringify(v.receipt.effects) !== JSON.stringify(v.effects))) return null;
  return v.objectId;
}
