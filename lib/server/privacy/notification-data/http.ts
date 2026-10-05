import { getNativeRuntimeConfig } from '../../identity/native-config.ts';
import { verifyNativeCredentials } from '../../identity/native-credentials.ts';
import { nativeRequestScope } from '../../identity/native-request.ts';
import { record, uuid } from '../../guide/contract.ts';
import { NOTIFICATION_DATA_LIMITS, parseNotificationDataCommand, notificationDataDigest, positive, type NotificationDataActor } from './contract.ts';
import { collectNotificationDataExport, type NotificationDataRPC } from './export.ts';
import { decodeNotificationDataList, decodeNotificationDataPreview, decodeNotificationDataReceipt, decodeNotificationDataUnknown } from './protocol.ts';
import { decodeNotificationDataDraining, completeNotificationDrain, notificationDrainRPC, type NotificationDrainRPC } from './drain.ts';

type Lifetime = ReturnType<typeof nativeRequestScope>;
export type NotificationDataAuthority = Readonly<{ authenticate(): Promise<NotificationDataActor | null>; current(actor: NotificationDataActor): Promise<boolean>; rpc: NotificationDataRPC; drainRPC?: NotificationDrainRPC | null }>;
export type NotificationDataHTTPOptions = Readonly<{ enabled: boolean; authority(request: Request, lifetime: Lifetime): NotificationDataAuthority; now?: () => number }>;
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: {
  'Cache-Control': 'private, no-store', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff',
} });
const fail = (code: string, status = 503) => reply({ error: { code } }, status);
export function notificationDataError(message: string): string {
  return /^(NOTIFICATION_DATA_[A-Z_]+|UNAUTHENTICATED|SESSION_REPLACED|REAUTHENTICATION_REQUIRED|FORBIDDEN|INVALID_INPUT|STALE_TRIP_VERSION)$/.test(message) ? message : 'NOTIFICATION_DATA_UNAVAILABLE';
}
/** Ordinary owner credentials only, with the original exact bytes carried to SQL. */
export async function handleNotificationData(request: Request, options: NotificationDataHTTPOptions): Promise<Response> {
  if (request.method !== 'POST' || new URL(request.url).search || request.headers.has('cookie') || request.headers.has('origin')
    || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return fail('INVALID_INPUT', 400);
  if (!options.enabled) return fail('NOTIFICATION_DATA_DISABLED');
  const lifetime = nativeRequestScope(request.signal, NOTIFICATION_DATA_LIMITS.lifetimeMs); const now = options.now ?? Date.now;
  let mutationDispatched = false;
  try { return await lifetime.run(async () => {
    const authority = options.authority(request, lifetime); const actor = await authority.authenticate();
    if (!actor || !uuid(actor.ownerId) || !uuid(actor.sessionId) || !positive(actor.mobileEpoch)) return fail('UNAUTHENTICATED', 401);
    const raw = await lifetime.body(request, 16384) ?? ''; let value: unknown;
    try { value = JSON.parse(raw); } catch { return fail('INVALID_INPUT', 400); }
    const command = parseNotificationDataCommand(value); if (!command || Buffer.byteLength(raw, 'utf8') > 16384
      || command.action !== 'recover' && Buffer.byteLength(raw, 'utf8') > 8192) return fail('INVALID_INPUT', 400);
    if (command.action === 'erase' && Buffer.byteLength(JSON.stringify({ action: 'recover', scope: command.scope,
      requestId: command.requestId, objectIds: command.objectIds, mutationBytes: raw }), 'utf8') > 16384) return fail('INVALID_INPUT', 400);
    if (!await authority.current(actor)) return fail('SESSION_REPLACED', 401);
    const current = () => authority.current(actor);
    if (command.action === 'export') return reply({ data: await collectNotificationDataExport(command, raw, actor, authority.rpc, lifetime.signal, current, now) });
    mutationDispatched = command.action === 'erase' || command.action === 'recover';
    let result = await authority.rpc(command.action, raw, lifetime.signal);
    if (lifetime.signal.aborted || !await current()) return fail(mutationDispatched ? 'NOTIFICATION_DATA_ACK_UNKNOWN' : 'SESSION_REPLACED', mutationDispatched ? 503 : 401);
    if (Buffer.byteLength(JSON.stringify(result) ?? '', 'utf8') > NOTIFICATION_DATA_LIMITS.maxBytes) return fail(mutationDispatched ? 'NOTIFICATION_DATA_ACK_UNKNOWN' : 'NOTIFICATION_DATA_CAPACITY');
    if (command.action === 'list') return decodeNotificationDataList(result, command, actor, now()) ? reply({ data: result }) : fail('NOTIFICATION_DATA_SOURCE_UNAVAILABLE');
    if (command.action === 'preview') return decodeNotificationDataPreview(result, command, actor, now()) ? reply({ data: result }) : fail('NOTIFICATION_DATA_SOURCE_UNAVAILABLE');
    const bytes = command.action === 'recover' ? command.mutationBytes : raw;
    if (decodeNotificationDataDraining(result, command, actor, bytes, now())) {
      const mutation = command.action === 'recover' ? parseNotificationDataCommand(JSON.parse(bytes)) : command;
      if (!authority.drainRPC || !record(result) || !mutation || !('previewDigest' in mutation) || result.previewDigest !== mutation.previewDigest) return fail('NOTIFICATION_DATA_ACK_UNKNOWN');
      result = await completeNotificationDrain(command, actor, bytes, authority.drainRPC, lifetime.signal, current, now);
    }
    const receipt = decodeNotificationDataReceipt(result, command, actor, notificationDataDigest(bytes), now());
    if (receipt) {
      const mutation = command.action === 'recover' ? parseNotificationDataCommand(JSON.parse(bytes)) : command;
      return mutation && 'previewDigest' in mutation && mutation.previewDigest === receipt.previewDigest ? reply({ data: receipt }) : fail('NOTIFICATION_DATA_ACK_UNKNOWN');
    }
    if (command.action === 'recover' && decodeNotificationDataUnknown(result, command, actor, notificationDataDigest(command.mutationBytes))) return reply({ data: result });
    return fail('NOTIFICATION_DATA_ACK_UNKNOWN');
  }); } catch (error) {
    const code = notificationDataError(error instanceof Error ? error.message : 'NOTIFICATION_DATA_UNAVAILABLE');
    if (mutationDispatched) return fail('NOTIFICATION_DATA_ACK_UNKNOWN');
    return fail(code, ['UNAUTHENTICATED','SESSION_REPLACED','REAUTHENTICATION_REQUIRED'].includes(code) ? 401 : code === 'FORBIDDEN' ? 403 : code === 'INVALID_INPUT' ? 400 : 503);
  } finally { lifetime.dispose(); }
}

export async function notificationDataNativeHTTP(request: Request): Promise<Response> {
  const config = getNativeRuntimeConfig(request, 'session');
  return handleNotificationData(request, {
    enabled: !!config && !config.environment && !process.env.VERCEL_ENV && process.env.DATA_NOTIFICATION_DATA_LOCAL === '1',
    authority(original, lifetime) {
      let credentials: Awaited<ReturnType<typeof verifyNativeCredentials>>;
      async function session(): Promise<NotificationDataActor | null> {
        if (!credentials) return null;
        const response = await credentials.client.rpc('native_session_v2', { p_action: 'session' }).abortSignal(lifetime.signal);
        const value = response.data;
        if (response.error || !record(value) || value.subject !== credentials.subject || value.sessionId !== credentials.sessionId || !positive(value.mobileEpoch)) return null;
        return { ownerId: credentials.subject, sessionId: credentials.sessionId, mobileEpoch: value.mobileEpoch };
      }
      let actor: NotificationDataActor | null = null;
      return {
        drainRPC: notificationDrainRPC({ enabled: process.env.DATA_NOTIFICATION_DATA_LOCAL === '1', url: config!.url, serviceKey: config!.serviceRoleKey }, lifetime.fetch),
        async authenticate() { credentials = await verifyNativeCredentials(original, config!, lifetime.fetch, lifetime.unavailable); actor = await session(); return actor; },
        async current(expected) { const fresh = await session(); return !!fresh && fresh.ownerId === expected.ownerId && fresh.sessionId === expected.sessionId && fresh.mobileEpoch === expected.mobileEpoch; },
        async rpc(action, bytes, signal) {
          if (!credentials || !actor) throw Error('UNAUTHENTICATED');
          const result = await credentials.client.rpc('privacy_notification_data_v1', { p_action: action, p_input_bytes: bytes, p_expected_epoch: actor.mobileEpoch }).abortSignal(signal);
          if (result.error) throw Error(notificationDataError(result.error.message));
          return result.data;
        },
      };
    },
  });
}
