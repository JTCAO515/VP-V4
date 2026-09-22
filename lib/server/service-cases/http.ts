import { getNativeRuntimeConfig } from '../identity/native-config.ts';
import { verifyNativeCredentials } from '../identity/native-credentials.ts';
import { nativeRequestScope } from '../identity/native-request.ts';

export async function serviceCaseHTTP(request: Request): Promise<Response> {
  const reply = (data: unknown, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'private, no-store'}});
  const fail = (code: string, status: number) => reply({error: {code}}, status);
  const config = getNativeRuntimeConfig(request, 'session');
  // Local development only until the reviewed migration receives a deployment window.
  if (!config || config.environment || process.env.SERVICE_CASES_LOCAL !== '1') return fail('CASE_DISABLED', 503);
  if (request.headers.has('cookie') || request.headers.has('origin')) return fail('INVALID_INPUT', 400);
  const scope = nativeRequestScope(request.signal);
  try {
    return await scope.run(async () => {
      const credentials = await verifyNativeCredentials(request, config, scope.fetch, scope.unavailable);
      if (!credentials) return fail('UNAUTHENTICATED', 401);
      const session = await credentials.client.rpc('native_session_v2', {p_action: 'session'}).abortSignal(scope.signal);
      if (session.error) {
        return ['UNAUTHENTICATED', 'SESSION_REPLACED'].includes(session.error.message)
          ? fail(session.error.message, 401) : fail('CASE_UNAVAILABLE', 503);
      }
      if (session.data?.subject !== credentials.subject || session.data?.sessionId !== credentials.sessionId) return fail('UNAUTHENTICATED', 401);
      const raw = await scope.body(request, 8000);
      let input: unknown;
      try { input = JSON.parse(raw ?? ''); } catch { return fail('INVALID_INPUT', 400); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('INVALID_INPUT', 400);
      const {data, error} = await credentials.client.rpc('service_case_v1', {p_input: input}).abortSignal(scope.signal);
      scope.check();
      if (error) {
        const statuses: Record<string, number> = {INVALID_INPUT: 400, CASE_FORBIDDEN: 403, CASE_CONFLICT: 409, UNAUTHENTICATED: 401, SESSION_REPLACED: 401};
        return Object.hasOwn(statuses, error.message) ? fail(error.message, statuses[error.message]) : fail('CASE_UNAVAILABLE', 503);
      }
      return reply({data});
    });
  } catch { return fail('CASE_UNAVAILABLE', 503); }
  finally { scope.dispose(); }
}
