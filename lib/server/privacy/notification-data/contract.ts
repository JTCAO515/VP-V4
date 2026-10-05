import { createHash } from 'node:crypto';
import { exact, record, uuid, hash } from '../../guide/contract.ts';

export const NOTIFICATION_DATA_SCHEMA = 'notification-data/1' as const;
export const NOTIFICATION_DATA_SCOPES = ['notification-trip-data/1', 'notification-device-data/1', 'notification-exit-progress/1'] as const;
export type NotificationDataScope = typeof NOTIFICATION_DATA_SCOPES[number];
export const NOTIFICATION_DATA_LIMITS = { selected: 20, pageSize: 5, maxPages: 4, maxRows: 20, tableRows: 10000, maxBytes: 1000000, lifetimeMs: 30000 } as const;
export const notificationDataDigest = (bytes: string) => createHash('sha256').update(bytes, 'utf8').digest('hex');
export const natural = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const positive = (v: unknown): v is number => natural(v) && v > 0;
export const notificationDataEffectCounts = ['reminders','watches','dismissals','outbox','attempts','operations','travelReminders','devices','pageProgress','fences','providerAccepted','providerUnknown','activeGrants'] as const;
export function validNotificationDataEffects(v: unknown): v is Record<string, unknown> {
  if (!record(v) || !exact(v, [...notificationDataEffectCounts,'drainedThrough','drainProof','tripMutation','businessResults','providerCopies','deviceCopies'])
    || !notificationDataEffectCounts.every(k => natural(v[k]) && v[k] <= NOTIFICATION_DATA_LIMITS.tableRows * NOTIFICATION_DATA_LIMITS.selected)
    || !natural(v.drainedThrough) || v.tripMutation !== 'none' || v.businessResults !== 'not_modified' || v.providerCopies !== 'not_recalled' || v.deviceCopies !== 'not_erased') return false;
  return v.drainProof === null ? v.drainedThrough === 0 : record(v.drainProof) && exact(v.drainProof, ['protocol','generation','waitMs','finishedAt'])
    && v.drainProof.protocol === 'monotonic-drain/1' && positive(v.drainProof.generation) && v.drainProof.waitMs === 5000
    && positive(v.drainProof.finishedAt) && v.drainProof.finishedAt === v.drainedThrough;
}
export const notificationDataScope = (v: unknown): v is NotificationDataScope => NOTIFICATION_DATA_SCOPES.includes(v as NotificationDataScope);
export const selectedIds = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.length <= NOTIFICATION_DATA_LIMITS.selected
  && v.every((id, i) => uuid(id) && id === id.toLowerCase() && (i === 0 || id > v[i - 1]));
export type NotificationDataActor = Readonly<{ ownerId: string; sessionId: string; mobileEpoch: number }>;
export type NotificationDataSelection = Readonly<{ scope: NotificationDataScope; requestId: string; objectIds: readonly string[] }>;
export type NotificationDataCommand =
  | Readonly<{ action: 'list'; scope: NotificationDataScope; cursor: Readonly<{ sourceDigest: string; afterId: string }> | null; limit: 20 }>
  | NotificationDataSelection & Readonly<{ action: 'preview' }>
  | NotificationDataSelection & Readonly<{ action: 'export' | 'erase'; previewDigest: string; confirmed: true }>
  | NotificationDataSelection & Readonly<{ action: 'recover'; mutationBytes: string }>;

/** Authenticated owner is derived from the current session, never accepted in a DTO. */
export function parseNotificationDataCommand(v: unknown, recovering = false): NotificationDataCommand | null {
  if (!record(v) || !notificationDataScope(v.scope)) return null;
  if (v.action === 'list') return exact(v, ['action','scope','cursor','limit']) && v.limit === 20 && (v.cursor === null
    || record(v.cursor) && exact(v.cursor, ['sourceDigest','afterId']) && hash(v.cursor.sourceDigest) && uuid(v.cursor.afterId)
      && v.cursor.afterId === v.cursor.afterId.toLowerCase()) ? v as NotificationDataCommand : null;
  if (!uuid(v.requestId) || v.requestId !== v.requestId.toLowerCase() || !selectedIds(v.objectIds)
    || v.scope === 'notification-exit-progress/1' && v.objectIds.includes(v.requestId)) return null;
  const keys = ['action','scope','requestId','objectIds'];
  if (v.action === 'preview') return exact(v, keys) ? v as NotificationDataCommand : null;
  if (v.action === 'export' || v.action === 'erase') return exact(v, [...keys,'previewDigest','confirmed'])
    && hash(v.previewDigest) && v.confirmed === true ? v as NotificationDataCommand : null;
  if (v.action !== 'recover' || recovering || !exact(v, [...keys,'mutationBytes']) || typeof v.mutationBytes !== 'string'
    || Buffer.byteLength(v.mutationBytes, 'utf8') > 8192) return null;
  let prior: unknown; try { prior = JSON.parse(v.mutationBytes); } catch { return null; }
  const command = parseNotificationDataCommand(prior, true);
  return command?.action === 'erase' && command.scope === v.scope && command.requestId === v.requestId
    && JSON.stringify(command.objectIds) === JSON.stringify(v.objectIds) ? v as NotificationDataCommand : null;
}

export const NOTIFICATION_DATA_BOUNDARIES = {
  'notification-trip-data/1': {
    exportFields: ['reminders_all_fields','watches_all_fields','dismissals_all_fields','outbox_all_fields','attempts_all_fields','operations_all_fields','travel_reminders_all_fields','retained_object_operation_dispatch_fences'],
    eraseFields: ['selected_trip_notification_rows','selected_trip_user_reminder_rows'],
    retained: ['nonreplayable_object_operation_dispatch_fences','minimal_exit_receipts','original_trip_and_business_results','device_bindings'],
    missing: ['provider_accepted_copies_not_recallable','provider_ack_unknown','device_delivered_notifications','device_local_journals','external_export_files','backup_restore_target_acceptance'],
  },
  'notification-device-data/1': {
    exportFields: ['devices_all_fields_including_push_token','associated_outbox_all_fields','associated_attempts_all_fields','retained_device_dispatch_fences'],
    eraseFields: ['selected_device_bindings','associated_attempt_rows','associated_outbox_rows'],
    retained: ['nonreplayable_device_dispatch_fences','minimal_exit_receipts','trip_reminder_watch_source_rows'],
    missing: ['provider_accepted_copies_not_recallable','provider_ack_unknown','device_os_permission','device_push_token_system_copy','device_delivered_notifications','device_local_journals','external_export_files','backup_restore_target_acceptance'],
  },
  'notification-exit-progress/1': {
    exportFields: ['selected_exit_request_metadata','selected_exit_page_progress','minimal_exit_receipts','retained_object_operation_device_dispatch_fences'],
    eraseFields: ['selected_transient_page_progress'],
    retained: ['nonreplayable_request_object_operation_device_dispatch_fences','source_preview_request_digests','minimal_exit_receipts'],
    missing: ['other_unselected_exit_requests','external_export_files','backup_restore_target_acceptance'],
  },
} as const;
export function validNotificationDataBoundaries(v: unknown, scope: NotificationDataScope): boolean {
  return record(v) && exact(v, ['exportFields','eraseFields','retained','missing'])
    && Object.entries(NOTIFICATION_DATA_BOUNDARIES[scope]).every(([k, values]) => JSON.stringify(v[k]) === JSON.stringify(values));
}
export const notificationDataBindingKeys = ['schemaVersion','scope','requestId','objectIds','ownerId','sessionId','mobileEpoch','sourceDigest','previewDigest','capturedAt','expiresAt','boundaries','allUserDataCompleted'] as const;
export type NotificationDataBinding = NotificationDataSelection & NotificationDataActor & Readonly<{
  schemaVersion: typeof NOTIFICATION_DATA_SCHEMA; sourceDigest: string; previewDigest: string; capturedAt: number; expiresAt: number;
  boundaries: typeof NOTIFICATION_DATA_BOUNDARIES[NotificationDataScope]; allUserDataCompleted: false;
}>;
export function validNotificationDataBinding(v: Record<string, unknown>, now: number, allowExpired = false): v is Record<string, unknown> & NotificationDataBinding {
  return v.schemaVersion === NOTIFICATION_DATA_SCHEMA && notificationDataScope(v.scope) && [v.requestId,v.ownerId,v.sessionId].every(uuid)
    && selectedIds(v.objectIds) && positive(v.mobileEpoch) && hash(v.sourceDigest) && hash(v.previewDigest)
    && positive(v.capturedAt) && positive(v.expiresAt) && v.capturedAt <= now && v.expiresAt === v.capturedAt + NOTIFICATION_DATA_LIMITS.lifetimeMs
    && (allowExpired || now < v.expiresAt) && validNotificationDataBoundaries(v.boundaries, v.scope) && v.allUserDataCompleted === false;
}
export function sameNotificationDataSelection(v: Record<string, unknown>, selection: NotificationDataSelection, actor: NotificationDataActor): boolean {
  return v.scope === selection.scope && v.requestId === selection.requestId && JSON.stringify(v.objectIds) === JSON.stringify(selection.objectIds)
    && v.ownerId === actor.ownerId && v.sessionId === actor.sessionId && v.mobileEpoch === actor.mobileEpoch;
}
