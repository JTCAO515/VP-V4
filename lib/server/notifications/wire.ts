import type { DeliveryOutcome, QuietHours, ReminderPurpose } from './delivery-contract.ts';
import { createHash } from 'node:crypto';

export type NoticeSource = Readonly<{ kind: 'current_trip' | 'user_reminder' | 'task_result' | 'qualified_watch'; sourceId: string; revision: number; contentDigest: string }>;
export type NextStep = Readonly<{ id: string; source: NoticeSource; reasonCode: 'review_trip' | 'user_requested' | 'result_ready' | 'watch_available' | 'watch_changed'; reason: string | null; expiresAt: string }>;
export type NoticeRecord = Readonly<{ id: string; operationId: string; baseVersion: number; purpose: ReminderPurpose; source: NoticeSource; reason: string | null; dueAt: string; expiresAt: string; timeZone: string; quietHours: QuietHours; status: 'saved' | 'cancelled' | 'completed'; deliveryState: 'scheduled' | 'suppressed' | 'attempting' | 'accepted' | 'unknown' | 'error'; outcome: DeliveryOutcome | null }>;
export type WatchRecord = Readonly<{ id: string; source: NoticeSource; expiresAt: string; status: 'active' | 'cancelled'; timeZone: string; quietHours: QuietHours }>;
export type NoticeMutationReceipt = Readonly<{ operationId: string; action: NoticeMutationCommand['action']; requestDigest: string; resultId: string; revision: number; terminal: boolean; outcome: 'applied' | 'cancelled' }>;
export type NoticeView = Readonly<{ version: 2; tripId: string; tripVersion: number; transport: 'disabled' | 'configured'; watchAvailability: 'qualified_only'; nextSteps: readonly NextStep[]; reminders: readonly NoticeRecord[]; watches: readonly WatchRecord[]; device: Readonly<{ deviceId: string; revision: number; permission: 'authorized' | 'denied' | 'not_determined'; active: boolean }> | null; complete: boolean; mutationReceipt: NoticeMutationReceipt | null }>;
export type NoticeMutationCommand = Readonly<
  | { action: 'schedule'; input: { operationId: string; id: string; baseVersion: number; purpose: ReminderPurpose; source: NoticeSource; reason: string | null; dueAt: string; expiresAt: string; timeZone: string; quietHours: QuietHours; consent: true } }
  | { action: 'cancel' | 'complete'; input: { operationId: string; id: string } }
  | { action: 'dismiss'; input: { operationId: string; nextStepId: string; source: NoticeSource } }
  | { action: 'watch'; input: { operationId: string; id: string; baseVersion: number; source: NoticeSource; expiresAt: string; timeZone: string; quietHours: QuietHours; consent: true } }
  | { action: 'unwatch'; input: { operationId: string; id: string } }
  | { action: 'register_device'; input: { operationId: string; deviceId: string; token: string; environment: 'sandbox' | 'production'; permission: 'authorized'; timeZone: string } }
  | { action: 'revoke_device'; input: { operationId: string; deviceId: string; permission: 'authorized' | 'denied' | 'not_determined' } }
>;
export type NoticeCommand = NoticeMutationCommand | Readonly<{ action: 'resolve'; input: { notificationId: string } } | { action: 'abandon'; input: { command: NoticeMutationCommand } }>;
export type NoticeResolution = Readonly<{ version: 2; kind: 'resolved'; notificationId: string; tripId: string; tripVersion: number; source: NoticeSource; expiresAt: string; current: boolean }>;
export const noticeErrorCodes = ['INVALID_INPUT', 'UNAUTHENTICATED', 'SESSION_REPLACED', 'TRIP_NOT_FOUND', 'STALE_TRIP_VERSION', 'SOURCE_UNAVAILABLE', 'IDEMPOTENCY_KEY_REUSE', 'PROVIDER_UNAVAILABLE'] as const;

export const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
export const exact = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
export const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
export const integer = (v: unknown, min = 0, max = 2147483647) => Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
export const digest = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export function timestamp(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(v);
  if (!m || +m[1] < 1 || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[4] > 23 || +m[5] > 59 || +m[6] > 59) return false;
  const d = new Date(0); d.setUTCFullYear(+m[1], +m[2], 0);
  if (+m[3] > d.getUTCDate() || m[7] !== 'Z' && (+m[7].slice(1, 3) > 14 || +m[7].slice(4) > 59 || +m[7].slice(1, 3) === 14 && +m[7].slice(4) !== 0)) return false;
  return Number.isFinite(Date.parse(v));
}
export function zone(v: unknown): v is string { if (typeof v !== 'string' || v.length > 100) return false; try { new Intl.DateTimeFormat('en', { timeZone: v }); return true; } catch { return false; } }
export const quietHours = (v: unknown): v is QuietHours => object(v) && exact(v, ['startMinute', 'endMinute']) && integer(v.startMinute, 0, 1439) && integer(v.endMinute, 0, 1439);
export const source = (v: unknown): v is NoticeSource => object(v) && exact(v, ['kind', 'sourceId', 'revision', 'contentDigest']) && ['current_trip', 'user_reminder', 'task_result', 'qualified_watch'].includes(String(v.kind)) && uuid(v.sourceId) && integer(v.revision) && digest(v.contentDigest);
const reason = (v: unknown) => v === null || typeof v === 'string' && v.trim().length > 0 && v.length <= 240;
export function parseNoticeCommand(v: unknown): NoticeCommand | null {
  if (!object(v) || !exact(v, ['action', 'input']) || !object(v.input)) return null;
  const x = v.input;
  if (v.action === 'abandon') {
    if (!exact(x, ['command']) || !object(x.command) || ['abandon', 'resolve'].includes(String(x.command.action))) return null;
    return parseNoticeCommand(x.command) ? v as NoticeCommand : null;
  }
  if (v.action === 'resolve') return exact(x, ['notificationId']) && uuid(x.notificationId) ? v as NoticeCommand : null;
  if (!uuid(x.operationId)) return null;
  if (['cancel', 'complete', 'unwatch'].includes(String(v.action))) return exact(x, ['operationId', 'id']) && uuid(x.id) ? v as NoticeCommand : null;
  if (v.action === 'dismiss') return exact(x, ['operationId', 'nextStepId', 'source']) && uuid(x.nextStepId) && source(x.source) ? v as NoticeCommand : null;
  if (v.action === 'register_device') return exact(x, ['operationId', 'deviceId', 'token', 'environment', 'permission', 'timeZone']) && uuid(x.deviceId) && typeof x.token === 'string' && /^[a-f0-9]{2,512}$/.test(x.token) && x.token.length % 2 === 0 && ['sandbox', 'production'].includes(String(x.environment)) && x.permission === 'authorized' && zone(x.timeZone) ? v as NoticeCommand : null;
  if (v.action === 'revoke_device') return exact(x, ['operationId', 'deviceId', 'permission']) && uuid(x.deviceId) && ['authorized', 'denied', 'not_determined'].includes(String(x.permission)) ? v as NoticeCommand : null;
  if (v.action === 'watch') return exact(x, ['operationId', 'id', 'baseVersion', 'source', 'expiresAt', 'timeZone', 'quietHours', 'consent']) && uuid(x.id) && integer(x.baseVersion) && source(x.source) && x.source.kind === 'qualified_watch' && timestamp(x.expiresAt) && zone(x.timeZone) && quietHours(x.quietHours) && x.consent === true ? v as NoticeCommand : null;
  if (v.action !== 'schedule' || !exact(x, ['operationId', 'id', 'baseVersion', 'purpose', 'source', 'reason', 'dueAt', 'expiresAt', 'timeZone', 'quietHours', 'consent']) || !uuid(x.id) || !integer(x.baseVersion) || !source(x.source) || !reason(x.reason) || !timestamp(x.dueAt) || !timestamp(x.expiresAt) || Date.parse(x.expiresAt) <= Date.parse(x.dueAt) || Date.parse(x.expiresAt) - Date.parse(x.dueAt) > 86400000 || !zone(x.timeZone) || !quietHours(x.quietHours) || x.consent !== true) return null;
  if (!(x.purpose === 'user_set_travel' && ['current_trip', 'user_reminder'].includes(x.source.kind) && x.reason !== null || x.purpose === 'accepted_task_result' && x.source.kind === 'task_result' && x.reason === null || x.purpose === 'qualified_watch' && x.source.kind === 'qualified_watch' && x.reason === null)) return null;
  return v as NoticeCommand;
}
/** Canonical JSON: recursive ASCII key sort, compact UTF-8, literal Unicode/slash. */
export function canonicalNoticeJSON(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalNoticeJSON).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalNoticeJSON(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export const noticeRequestDigest = (command: NoticeCommand) => createHash('sha256').update(canonicalNoticeJSON(command)).digest('hex');
