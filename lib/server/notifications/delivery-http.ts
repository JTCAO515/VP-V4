import type { NextRequest } from 'next/server';
import { nativeRequestScope } from '../identity/native-request.ts';
import { getNativeRuntimeConfig } from '../identity/native-config.ts';
import { verifyNativeCredentials } from '../identity/native-credentials.ts';
import { uuid, object, exact, integer, parseNoticeCommand, noticeErrorCodes } from './wire.ts';
import { decodeNoticeView, decodeNoticeResolution } from './codec.ts';
import { configuredNotificationTransport } from './runtime.ts';

const reply = (v: unknown, status = 200) => Response.json(v, { status, headers: { 'Cache-Control': 'private, no-store' } });
const fail = (code: string, status: number) => reply({ error: { code } }, status);
const validSession = (s: unknown): s is Record<string, unknown> => object(s) && s.version === 2 && uuid(s.subject) && uuid(s.sessionId) && integer(s.mobileEpoch, 1, Number.MAX_SAFE_INTEGER);
function rpcFailure(error: Readonly<{ message: string }>) {
  const code = noticeErrorCodes.find(c => c === error.message) ?? 'PROVIDER_UNAVAILABLE';
  return fail(code, code === 'UNAUTHENTICATED' ? 401 : code === 'INVALID_INPUT' ? 400 : code === 'TRIP_NOT_FOUND' ? 404 : code === 'PROVIDER_UNAVAILABLE' ? 503 : 409);
}
export async function nativeNoticeHTTP(request: NextRequest, tripId: string | null) {
  const resolve = tripId === null;
  if (!resolve && !uuid(tripId) || request.headers.has('cookie') || request.headers.has('origin') || [...request.nextUrl.searchParams].length || !['GET', 'POST'].includes(request.method) || resolve && request.method !== 'POST') return fail('INVALID_INPUT', 400);
  const config = getNativeRuntimeConfig(request, 'trip');
  if (!config) return fail('PROVIDER_UNAVAILABLE', 503);
  const scope = nativeRequestScope(request.signal);
  try {
    return await scope.run(async () => {
      const credentials = await verifyNativeCredentials(request, config, scope.fetch, scope.unavailable);
      scope.check();
      if (!credentials) return fail('UNAUTHENTICATED', 401);
      const before = await credentials.client.rpc('native_session_v2', { p_action: 'session' });
      scope.check();
      const s = before.data;
      if (before.error) return rpcFailure(before.error);
      if (!validSession(s)) return fail('PROVIDER_UNAVAILABLE', 503);
      if (s.subject !== credentials.subject || s.sessionId !== credentials.sessionId) return fail('SESSION_REPLACED', 409);
      let value: unknown = null;
      if (request.method === 'POST') {
        const bytes = await scope.body(request, 8192);
        if (!bytes) return fail('INVALID_INPUT', 400);
        try { value = JSON.parse(bytes); } catch { return fail('INVALID_INPUT', 400); }
      }
      const command = !resolve && request.method === 'POST' ? parseNoticeCommand(value) : null;
      if (!resolve && request.method === 'POST' && (!command || command.action === 'resolve')) return fail('INVALID_INPUT', 400);
      if (resolve && (!object(value) || !exact(value, ['notificationRef']) || !uuid(value.notificationRef))) return fail('INVALID_INPUT', 400);
      const result = resolve
        ? await credentials.client.rpc('resolve_travel_notification_v2', { p_notification: (value as { notificationRef: string }).notificationRef })
        : await credentials.client.rpc('travel_reminders_v2', { p_trip: tripId, p_action: command?.action ?? 'list', p_input: command?.input ?? {} });
      scope.check();
      if (result.error) return rpcFailure(result.error);
      const after = await credentials.client.rpc('native_session_v2', { p_action: 'session' });
      scope.check();
      if (after.error) return rpcFailure(after.error);
      if (!validSession(after.data)) return fail('PROVIDER_UNAVAILABLE', 503);
      if (after.data.subject !== s.subject || after.data.sessionId !== s.sessionId || after.data.mobileEpoch !== s.mobileEpoch) return fail('SESSION_REPLACED', 409);
      const decoded = resolve
        ? decodeNoticeResolution(result.data, (value as { notificationRef: string }).notificationRef)
        : decodeNoticeView(result.data, tripId!, command);
      if (!decoded) return fail('PROVIDER_UNAVAILABLE', 503);
      if ('transport' in decoded && !configuredNotificationTransport().available) return reply({ ...decoded, transport: 'disabled' });
      return reply(decoded);
    });
  } catch { return fail('PROVIDER_UNAVAILABLE', 503); }
  finally { scope.dispose(); }
}
