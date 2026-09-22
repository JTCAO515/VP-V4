import { getNativeRuntimeConfig } from '../identity/native-config.ts';
import { verifyNativeCredentials } from '../identity/native-credentials.ts';
import { nativeRequestScope } from '../identity/native-request.ts';
import { isUuid } from '../identity/request-guards.ts';

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (code: string, status: number) => json({ error: { code } }, status);
export async function tripDeletionHTTP(request: Request) {
  const config = getNativeRuntimeConfig(request, 'trip');
  if (!config) return failure('UNAVAILABLE', 503);
  if (request.headers.has('cookie') || request.headers.has('origin')) return failure('AMBIGUOUS_CREDENTIALS', 400);
  if (!['GET', 'POST'].includes(request.method)) return failure('METHOD_NOT_ALLOWED', 405);
  const scope = nativeRequestScope(request.signal);
  try {
    const verified = await scope.run(() => verifyNativeCredentials(request, config, scope.fetch, scope.unavailable));
    if (!verified) return failure('UNAUTHENTICATED', 401);
    const params = new URL(request.url).searchParams;
    let name: string, input: Record<string, unknown>;
    if (request.method === 'GET') {
      const id = params.get('requestId');
      if (!id || !isUuid(id) || [...params].length !== 1) return failure('INVALID_INPUT', 400);
      name = 'read_trip_deletion_v1'; input = { p_request_id: id };
    } else {
      if ([...params].length) return failure('INVALID_INPUT', 400);
      const raw = await scope.body(request, 4096);
      let body;
      try { body = JSON.parse(raw ?? 'null'); } catch { return failure('INVALID_INPUT', 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join() !== 'confirmed,expectedVersion,requestId,tripId'
        || typeof body.requestId !== 'string' || !isUuid(body.requestId) || typeof body.tripId !== 'string' || !isUuid(body.tripId)
        || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0 || body.confirmed !== true) return failure('INVALID_INPUT', 400);
      name = 'request_trip_deletion_v1';
      input = { p_request_id: body.requestId, p_trip_id: body.tripId, p_expected_version: body.expectedVersion, p_confirmed: true };
    }
    const result = await scope.run(() => verified.client.rpc(name, input).abortSignal(scope.signal));
    if (result.error) {
      const message = result.error.message;
      for (const [code, status] of [['REAUTHENTICATION_REQUIRED', 401], ['SESSION_REPLACED', 401], ['FORBIDDEN', 403], ['INVALID_INPUT', 400], ['IDEMPOTENCY_KEY_REUSE', 409], ['STALE_TRIP_VERSION', 409], ['TRIP_HAS_CHAT_REFERENCES', 409], ['DELETION_ALREADY_REQUESTED', 409]] as const) {
        if (message.includes(code)) return failure(code, status);
      }
      return failure('UNAVAILABLE', 503);
    }
    return json(result.data, request.method === 'POST' && result.data?.state === 'queued' ? 202 : 200);
  } catch { return failure('UNAVAILABLE', 503); }
  finally { scope.dispose(); }
}
