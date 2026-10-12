import { createHash } from 'node:crypto';
import { getNativeRuntimeConfig } from '../../identity/native-config.ts';
import { verifyNativeCredentials } from '../../identity/native-credentials.ts';
import { nativeRequestScope } from '../../identity/native-request.ts';
import { parseCommand, record, uuid, positive, type Actor, type Command } from './contract.ts';
import { decode } from './protocol.ts';
import { MEASUREMENT_NOTICE } from './notice.ts';
import { parseClosedJSON } from './json.ts';
type Lifetime = ReturnType<typeof nativeRequestScope>;
export type Authority = Readonly<{ authenticate(): Promise<Actor | null>; current(actor: Actor): Promise<boolean>;
  rpc(action: Command['action'], bytes: string, signal: AbortSignal): Promise<unknown> }>;
export type Options = Readonly<{ enabled: boolean; authority(request: Request, lifetime: Lifetime): Authority; now?: () => number }>;
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: {
  'Cache-Control': 'private, no-store', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff',
} });
const fail = (code: string, status = 503) => reply({ error: { code } }, status);
const codes = ['MEASUREMENT_DISABLED', 'MEASUREMENT_UNAVAILABLE', 'MEASUREMENT_SOURCE_UNAVAILABLE', 'MEASUREMENT_SOURCE_CHANGED',
  'MEASUREMENT_CAPACITY', 'MEASUREMENT_ACK_UNKNOWN', 'CONSENT_REQUIRED', 'DATA_POLICY_BLOCKED', 'INVALID_INPUT', 'UNAUTHENTICATED',
  'SESSION_REPLACED', 'REAUTHENTICATION_REQUIRED', 'FORBIDDEN', 'IDEMPOTENCY_KEY_REUSE'] as const;
export const measurementError = (message: string) => codes.find(code => code === message) ?? 'MEASUREMENT_UNAVAILABLE';
const status = (code: string) => ['UNAUTHENTICATED', 'SESSION_REPLACED', 'REAUTHENTICATION_REQUIRED'].includes(code) ? 401
  : ['FORBIDDEN', 'CONSENT_REQUIRED', 'DATA_POLICY_BLOCKED'].includes(code) ? 403 : code === 'INVALID_INPUT' ? 400
    : ['MEASUREMENT_SOURCE_CHANGED', 'IDEMPOTENCY_KEY_REUSE'].includes(code) ? 409 : 503;
/** Protected SQL owns atomic source/consent/fence qualification and persistence.
 * No provider invocation, business mutation retry or operational outbox sink. */
export async function handleMeasurement(request: Request, options: Options): Promise<Response> {
  if (request.method !== 'POST' || new URL(request.url).search || request.headers.has('cookie') || request.headers.has('origin')
    || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return fail('INVALID_INPUT', 400);
  if (!options.enabled) return fail('MEASUREMENT_DISABLED');
  const lifetime = nativeRequestScope(request.signal, 20000); let dispatched = false;
  try { return await lifetime.run(async () => {
    const authority = options.authority(request, lifetime); const actor = await authority.authenticate();
    if (!actor || !uuid(actor.ownerId) || !uuid(actor.sessionId) || !positive(actor.mobileEpoch)) return fail('UNAUTHENTICATED', 401);
    const raw = await lifetime.body(request, 8192); if (raw === null) return fail('INVALID_INPUT', 400);
    let input: unknown; try { input = parseClosedJSON(raw); } catch { return fail('INVALID_INPUT', 400); }
    const command = parseCommand(input); if (!command) return fail('INVALID_INPUT', 400);
    if (!await authority.current(actor)) return fail('SESSION_REPLACED', 401);
    dispatched = !['policy', 'aggregate', 'preview'].includes(command.action);
    const value = await authority.rpc(command.action, raw, lifetime.signal);
    if (lifetime.signal.aborted || !await authority.current(actor)) return fail(dispatched ? 'MEASUREMENT_ACK_UNKNOWN' : 'SESSION_REPLACED', dispatched ? 503 : 401);
    const requestDigest = ['erase', 'withdraw', 'recover'].includes(command.action)
      ? createHash('sha256').update(command.action === 'recover' ? command.mutationBytes : raw).digest('hex') : undefined;
    const data = decode(value, command, actor, (options.now ?? Date.now)(), requestDigest);
    if (!data) return fail(dispatched ? 'MEASUREMENT_ACK_UNKNOWN' : 'MEASUREMENT_SOURCE_UNAVAILABLE');
    return reply({ data, ...(command.action === 'policy' ? { notice: MEASUREMENT_NOTICE } : {}) });
  }); } catch (error) {
    const code = measurementError(error instanceof Error ? error.message : 'MEASUREMENT_UNAVAILABLE');
    // A known SQL denial is safe to expose. Transport/invalid ACK is unknown,
    // never permission to re-run the original travel writer.
    if (dispatched && code === 'MEASUREMENT_UNAVAILABLE') return fail('MEASUREMENT_ACK_UNKNOWN');
    return fail(code, status(code));
  } finally { lifetime.dispose(); }
}
export async function measurementNativeHTTP(request: Request): Promise<Response> {
  const config = getNativeRuntimeConfig(request, 'session');
  return handleMeasurement(request, {
    // Source-only local gate. The SQL policy additionally checks all lifecycle
    // consumers, current purge qualification and D2/coverage registration.
    enabled: !!config && !config.environment && !process.env.VERCEL_ENV && process.env.JOURNEY_MEASUREMENT_LOCAL === '1',
    authority(original, lifetime) {
      let credentials: Awaited<ReturnType<typeof verifyNativeCredentials>>; let actor: Actor | null = null;
      async function session(): Promise<Actor | null> {
        if (!credentials) return null;
        const response = await credentials.client.rpc('native_session_v2', { p_action: 'session' }).abortSignal(lifetime.signal);
        const value = response.data;
        if (response.error || !record(value) || value.subject !== credentials.subject || value.sessionId !== credentials.sessionId || !positive(value.mobileEpoch)) return null;
        return { ownerId: credentials.subject, sessionId: credentials.sessionId, mobileEpoch: value.mobileEpoch };
      }
      return {
        async authenticate() { credentials = await verifyNativeCredentials(original, config!, lifetime.fetch, lifetime.unavailable); actor = await session(); return actor; },
        async current(expected) { const fresh = await session(); return !!fresh && fresh.ownerId === expected.ownerId && fresh.sessionId === expected.sessionId && fresh.mobileEpoch === expected.mobileEpoch; },
        async rpc(action, bytes, signal) {
          if (!credentials || !actor) throw Error('UNAUTHENTICATED');
          const response = await credentials.client.rpc('native_journey_measurement_v1', { p_action: action, p_input_bytes: bytes, p_expected_epoch: actor.mobileEpoch }).abortSignal(signal);
          if (response.error) throw Error(measurementError(response.error.message));
          return response.data;
        },
      };
    },
  });
}
