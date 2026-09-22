import { reminderDecision, type Reminder } from './contract.ts';
import type { NextRequest } from 'next/server';
import { nativeRequestScope } from '../identity/native-request.ts';
import { getNativeRuntimeConfig } from '../identity/native-config.ts';
import { verifyNativeCredentials } from '../identity/native-credentials.ts';
import { isUuid } from '../identity/request-guards.ts';
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
const fail = (code: string, status: number) => reply({ error: { code } }, status);
export async function nativeReminderHTTP(request: NextRequest, tripId: string) {
  if (!isUuid(tripId) || request.headers.has('cookie') || request.headers.has('origin') || [...request.nextUrl.searchParams].length) return fail('INVALID_INPUT', 400);
  const config = getNativeRuntimeConfig(request, 'trip');
  if (!config) return fail('PROVIDER_UNAVAILABLE', 503);
  const scope = nativeRequestScope(request.signal);
  try {
    return await scope.run(async () => {
      const credentials = await verifyNativeCredentials(request, config, scope.fetch, scope.unavailable);
      scope.check();
      if (!credentials) return fail('UNAUTHENTICATED', 401);
      let action = 'list', input: unknown = {};
      if (request.method === 'POST') {
        const body = await scope.body(request, 4096);
        if (!body) return fail('INVALID_INPUT', 400);
        let value;
        try { value = JSON.parse(body); } catch { return fail('INVALID_INPUT', 400); }
        if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'action,input'
          || !['create','cancel','complete'].includes(value.action)) return fail('INVALID_INPUT', 400);
        action = value.action; input = value.input;
      }
      const { data, error } = await credentials.client.rpc('travel_reminders_v1', { p_trip: tripId, p_action: action, p_input: input });
      scope.check();
      if (error) {
        const code = ['INVALID_INPUT','STALE_TRIP_VERSION','TRIP_NOT_FOUND','SESSION_REPLACED','UNAUTHENTICATED'].find(code => error.message === code);
        return fail(code ?? 'PROVIDER_UNAVAILABLE', code === 'UNAUTHENTICATED' ? 401 : code === 'SESSION_REPLACED' || code === 'STALE_TRIP_VERSION' ? 409 : code === 'TRIP_NOT_FOUND' ? 404 : code ? 400 : 503);
      }
      const session = await credentials.client.rpc('native_session_v2', { p_action: 'session' });
      scope.check();
      if (session.error || session.data?.subject !== credentials.subject || session.data?.sessionId !== credentials.sessionId) return fail('SESSION_REPLACED', 409);
      if (data?.version !== 1 || data?.tripId !== tripId || !Array.isArray(data?.reminders) || data?.delivery !== 'unavailable') return fail('PROVIDER_UNAVAILABLE', 503);
      return reply({ version: 1, tripId, delivery: 'unavailable', watch: 'not_enabled',
        reminders: data.reminders.map((row: Reminder & { currentTimeZone: string }) => ({
          id: row.id, reason: row.reason, dueAt: row.dueAt, expiresAt: row.expiresAt,
          timeZone: row.timeZone, baseVersion: row.baseVersion, status: row.status,
          eligibility: reminderDecision(row, { ownerId: credentials.subject, tripId,
            sessionId: credentials.sessionId, currentSession: true, tripVersion: data.tripVersion,
            consent: row.status === 'saved', systemPermission: false, timeZone: row.currentTimeZone,
            archived: data.archived, tripEndsAt: data.tripEndsAt }, new Date()),
        })),
      });
    });
  } catch { return fail('PROVIDER_UNAVAILABLE', 503); }
  finally { scope.dispose(); }
}
