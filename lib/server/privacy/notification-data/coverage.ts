import type { CoverageInput, SelectedCommand, CoverageState } from '../coverage/contract.ts';
import { NOTIFICATION_DATA_SCHEMA, NOTIFICATION_DATA_BOUNDARIES, parseNotificationDataCommand, notificationDataDigest, type NotificationDataScope } from './contract.ts';
import { decodeNotificationDataBundle, decodeNotificationDataPreview, decodeNotificationDataReceipt, decodeNotificationDataUnknown } from './protocol.ts';

export const NOTIFICATION_CATALOG_VERSION = 'data-coverage-catalog/2026-10-06.4' as const;
export const NOTIFICATION_MODULE_ORDER = ['notifications','notification_devices','notification_exit_progress'] as const;
export const NOTIFICATION_MODULE_SCOPES: Readonly<Record<typeof NOTIFICATION_MODULE_ORDER[number], NotificationDataScope>> = {
  notifications: 'notification-trip-data/1', notification_devices: 'notification-device-data/1', notification_exit_progress: 'notification-exit-progress/1',
};
export const NOTIFICATION_MODULES = NOTIFICATION_MODULE_ORDER.map(id => {
  const scope = NOTIFICATION_MODULE_SCOPES[id];
  return { id, location: 'server' as const, version: NOTIFICATION_DATA_SCHEMA, scope, exportHandler: 'notification_data', deleteHandler: 'notification_data',
    selection: 'notification_records' as const,
    capacity: '1..20 explicitly selected owner UUIDs; Trip notifications / device bindings / exit records; full field preview, exact bytes, source CAS, 5/page, 4 pages, 1MB; fixed30s source consent; monotonic drain before data erasure receipt',
    retention: [...NOTIFICATION_DATA_BOUNDARIES[scope].retained], missing: [...NOTIFICATION_DATA_BOUNDARIES[scope].missing],
  };
});

/** Upgrade the existing notifications denominator; device/progress are adjacent
 * new scopes. No alias accepts the old metadata-only command as full erasure. */
export function validNotificationDataCoverageSelection(input: CoverageInput, value: unknown): boolean {
  const command = parseNotificationDataCommand(value);
  if (!command || command.action === 'list' || command.action === 'recover' || input.tripId !== null
    || input.moduleVersion !== NOTIFICATION_DATA_SCHEMA || command.requestId !== input.operationId
    || command.scope !== NOTIFICATION_MODULE_SCOPES[input.moduleId as keyof typeof NOTIFICATION_MODULE_SCOPES]
    || Buffer.byteLength(input.commandBytes, 'utf8') > 8192) return false;
  if (input.phase === 'preview') return command.action === 'preview';
  if (input.action === 'export') return input.phase === 'execute' && command.action === 'export';
  return input.action === 'delete' && command.action === 'erase' && (input.phase === 'execute' || input.phase === 'recover')
    && Buffer.byteLength(JSON.stringify({ action: 'recover', scope: command.scope, requestId: command.requestId,
      objectIds: command.objectIds, mutationBytes: input.commandBytes }), 'utf8') <= 16384;
}
export function notificationDataCoverageRequestBody(input: CoverageInput): string {
  if (input.phase !== 'recover') return input.commandBytes;
  const command = parseNotificationDataCommand(JSON.parse(input.commandBytes));
  if (!command || command.action !== 'erase' || !validNotificationDataCoverageSelection(input, command)) throw Error('INVALID_INPUT');
  return JSON.stringify({ action: 'recover', scope: command.scope, requestId: command.requestId, objectIds: command.objectIds, mutationBytes: input.commandBytes });
}
export function notificationDataCoverageOutcome(selected: SelectedCommand, data: unknown, now: number): Readonly<{ state: CoverageState; reason: string }> | null {
  const { input } = selected; const command = parseNotificationDataCommand(selected.command);
  if (!command || command.action === 'list' || command.action === 'recover' || !validNotificationDataCoverageSelection(input, command)) return null;
  const actor = { ownerId: input.actorId, sessionId: input.sessionId, mobileEpoch: input.mobileEpoch };
  if (command.action === 'preview') return decodeNotificationDataPreview(data, command, actor, now) ? { state: 'preview', reason: 'EXPLICIT_SELECTION_REQUIRED' } : null;
  const digest = notificationDataDigest(input.commandBytes);
  if (command.action === 'export') {
    const bundle = decodeNotificationDataBundle(data, command, actor, now);
    return bundle?.requestDigest === digest && bundle.previewDigest === command.previewDigest ? { state: 'scoped_complete', reason: 'SELECTED_NOTIFICATION_DATA_WITH_DECLARED_BOUNDARIES' } : null;
  }
  const receipt = decodeNotificationDataReceipt(data, command, actor, digest, now);
  if (receipt?.previewDigest === command.previewDigest) return { state: 'scoped_complete', reason: 'SELECTED_ERASURE_WITH_DECLARED_RETENTION' };
  return input.phase === 'recover' && decodeNotificationDataUnknown(data, command, actor, digest) ? { state: 'unknown', reason: 'NOTIFICATION_DATA_ACK_UNKNOWN' } : null;
}
