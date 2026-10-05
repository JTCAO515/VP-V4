import { getNativeRuntimeConfig } from '../../identity/native-config.ts';
import { verifyNativeCredentials } from '../../identity/native-credentials.ts';
import { nativeRequestScope } from '../../identity/native-request.ts';
import { record, uuid } from '../../guide/contract.ts';
import { CATALOG_VERSION, MODULE_CATALOG, moduleById } from './catalog.ts';
import { COVERAGE_SCHEMA, parseCoverageInput, coverageResult, type SelectedCommand } from './contract.ts';
import { classifyOriginal } from './outcomes.ts';
import { OWNER_HANDLERS, ownerHandlerRequest, type OwnerHandler } from './registry.ts';

export type CoverageActor = Readonly<{ actorId: string; sessionId: string; mobileEpoch: number }>;
export type CoverageAuthority = Readonly<{ authenticate(): Promise<CoverageActor | null>; current(actor: CoverageActor): Promise<boolean> }>;
type Lifetime = ReturnType<typeof nativeRequestScope>;
export type CoverageOptions = Readonly<{
  enabled: boolean; authority(request: Request, lifetime: Lifetime): CoverageAuthority;
  handlers: Readonly<Record<string, OwnerHandler>>;
}>;
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: {
  'Cache-Control': 'private, no-store', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff',
} });
const fail = (code: string, status = 503) => reply({ error: { code } }, status);
const validActor = (v: CoverageActor | null): v is CoverageActor => !!v && uuid(v.actorId) && uuid(v.sessionId) && Number.isSafeInteger(v.mobileEpoch) && v.mobileEpoch > 0;
async function originalBody(response: Response, lifetime: Lifetime): Promise<unknown> {
  const reader = response.body?.getReader(); if (!reader) throw Error('INVALID_ORIGINAL_RESULT');
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const chunk = await lifetime.run(() => reader.read()); if (chunk.done) break;
      length += chunk.value.byteLength; if (length > 1000000) throw Error('RESPONSE_CAPACITY'); chunks.push(chunk.value);
    }
    return JSON.parse(new TextDecoder('utf8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks)));
  } finally { void reader.cancel().catch(() => {}); }
}

/** No persistent replacement executor: select one owner scope, call its original boundary and classify its real result. */
export async function handleCoverage(request: Request, options: CoverageOptions): Promise<Response> {
  if (!['GET','POST'].includes(request.method) || new URL(request.url).search || request.headers.has('cookie') || request.headers.has('origin')) return fail('INVALID_INPUT', 400);
  if (!options.enabled) return fail('COVERAGE_DISABLED');
  const lifetime = nativeRequestScope(request.signal, 60000);
  let selected: SelectedCommand | null = null; let raw = ''; let dispatched = false;
  try { return await lifetime.run(async () => {
    const authority = options.authority(request, lifetime); const actor = await authority.authenticate();
    if (!validActor(actor)) return fail('UNAUTHENTICATED', 401);
    if (request.method === 'GET') {
      if (!await authority.current(actor)) return fail('SESSION_REPLACED', 401);
      return reply({ schemaVersion: COVERAGE_SCHEMA, catalogVersion: CATALOG_VERSION, ...actor, modules: MODULE_CATALOG, allUserDataCompleted: false });
    }
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return fail('INVALID_INPUT', 400);
    raw = await lifetime.body(request, 192000) ?? '';
    let value: unknown; try { value = JSON.parse(raw); } catch { return fail('INVALID_INPUT', 400); }
    selected = parseCoverageInput(value); if (!selected) return fail('INVALID_INPUT', 400);
    const { input, handler } = selected;
    if (input.actorId !== actor.actorId || input.sessionId !== actor.sessionId || input.mobileEpoch !== actor.mobileEpoch) return fail('SCOPE_CHANGED', 409);
    if (!await authority.current(actor)) return fail('SESSION_REPLACED', 401);
    if (handler === null || !Object.hasOwn(options.handlers, handler)) return reply(coverageResult(input, raw, 'unavailable', moduleById(input.moduleId)?.missing[0]?.toUpperCase() ?? 'HANDLER_MISSING'));
    const original = ownerHandlerRequest(request, selected, lifetime.signal);
    dispatched = true;
    const response = await options.handlers[handler](original, selected);
    // Bound before consuming JSON as well as before returning any source content.
    let body: unknown; try { body = await originalBody(response, lifetime); }
    catch { return reply(coverageResult(input, raw, input.action === 'delete' ? 'unknown' : 'unavailable', 'RESPONSE_CAPACITY_OR_UNAVAILABLE')); }
    if (!await authority.current(actor)) return reply(coverageResult(input, raw, input.action === 'delete' ? 'unknown' : 'unavailable', 'SCOPE_CHANGED'));
    if (!response.ok) {
      const error = record(body) ? typeof body.error === 'string' ? body.error : record(body.error) ? body.error.code : null : null;
      const code = typeof error === 'string' && /^[A-Z0-9_]{1,120}$/.test(error) ? error : 'ORIGINAL_HANDLER_UNAVAILABLE';
      return reply(coverageResult(input, raw, input.action === 'delete' && (response.status >= 500 || code.includes('ACK_UNKNOWN')) ? 'unknown' : 'unavailable', code));
    }
    const outcome = classifyOriginal(selected, body); if (!outcome) return reply(coverageResult(input, raw, input.action === 'delete' ? 'unknown' : 'unavailable', 'INVALID_ORIGINAL_RESULT'));
    const receipt = coverageResult(input, raw, outcome.state, outcome.reason, body);
    if (Buffer.byteLength(JSON.stringify(receipt), 'utf8') > 1000000) return reply(coverageResult(input, raw, input.action === 'delete' ? 'unknown' : 'unavailable', 'COVERAGE_RESPONSE_CAPACITY'));
    return reply(receipt);
  }); } catch {
    const pending = selected as SelectedCommand | null;
    return pending ? reply(coverageResult(pending.input, raw, dispatched && pending.input.action === 'delete' ? 'unknown' : 'unavailable', 'COVERAGE_UNAVAILABLE')) : fail('COVERAGE_UNAVAILABLE');
  } finally { lifetime.dispose(); }
}

export async function coverageNativeHTTP(request: Request): Promise<Response> {
  const config = getNativeRuntimeConfig(request, 'session');
  return handleCoverage(request, {
    enabled: !!config && !config.environment && !process.env.VERCEL_ENV && process.env.DATA_COVERAGE_LOCAL === '1',
    handlers: OWNER_HANDLERS,
    authority(original, lifetime) {
      let credentials: Awaited<ReturnType<typeof verifyNativeCredentials>>;
      async function session(): Promise<CoverageActor | null> {
        if (!credentials) return null;
        const result = await credentials.client.rpc('native_session_v2', { p_action: 'session' }).abortSignal(lifetime.signal);
        if (result.error) { if (['UNAUTHENTICATED','SESSION_REPLACED'].includes(result.error.message)) return null; throw Error('COVERAGE_UNAVAILABLE'); }
        const value = result.data;
        if (!record(value) || value.subject !== credentials.subject || value.sessionId !== credentials.sessionId
          || !Number.isSafeInteger(value.mobileEpoch) || Number(value.mobileEpoch) < 1) return null;
        return { actorId: credentials.subject, sessionId: credentials.sessionId, mobileEpoch: Number(value.mobileEpoch) };
      }
      return {
        async authenticate() { credentials = await verifyNativeCredentials(original, config!, lifetime.fetch, lifetime.unavailable); return session(); },
        async current(actor) { const fresh = await session(); return !!fresh && fresh.actorId === actor.actorId && fresh.sessionId === actor.sessionId && fresh.mobileEpoch === actor.mobileEpoch; },
      };
    },
  });
}
