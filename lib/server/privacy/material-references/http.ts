import { getNativeRuntimeConfig } from '../../identity/native-config.ts';
import { verifyNativeCredentials } from '../../identity/native-credentials.ts';
import { nativeRequestScope } from '../../identity/native-request.ts';
import { record, uuid } from '../../guide/contract.ts';
import { MATERIAL_LIMITS, parseMaterialCommand, materialDigest, positive, type MaterialActor } from './contract.ts';
import { collectMaterialExport, type MaterialRPC } from './export.ts';
import { decodeMaterialList, decodeMaterialTrips, decodeMaterialPreview, decodeMaterialReceipt, decodeMaterialUnknown } from './protocol.ts';

type Lifetime = ReturnType<typeof nativeRequestScope>;
export type MaterialAuthority = Readonly<{ authenticate(): Promise<MaterialActor | null>; current(actor: MaterialActor): Promise<boolean>; rpc: MaterialRPC }>;
export type MaterialHTTPOptions = Readonly<{ enabled: boolean; authority(request: Request, lifetime: Lifetime): MaterialAuthority; now?: () => number }>;
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: {
  'Cache-Control': 'private, no-store', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff',
} });
const fail = (code: string, status = 503) => reply({ error: { code } }, status);
export function materialError(message: string): string {
  return /^(MATERIAL_[A-Z_]+|UNAUTHENTICATED|SESSION_REPLACED|REAUTHENTICATION_REQUIRED|FORBIDDEN|INVALID_INPUT|STALE_TRIP_VERSION)$/.test(message) ? message : 'MATERIAL_UNAVAILABLE';
}
/** Ordinary owner credentials only, with the original exact bytes carried to SQL. */
export async function handleMaterialReferences(request: Request, options: MaterialHTTPOptions): Promise<Response> {
  if (request.method !== 'POST' || new URL(request.url).search || request.headers.has('cookie') || request.headers.has('origin')
    || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return fail('INVALID_INPUT', 400);
  if (!options.enabled) return fail('MATERIAL_DISABLED');
  const lifetime = nativeRequestScope(request.signal, MATERIAL_LIMITS.lifetimeMs); const now = options.now ?? Date.now;
  let mutationDispatched = false;
  try { return await lifetime.run(async () => {
    const authority = options.authority(request, lifetime); const actor = await authority.authenticate();
    if (!actor || !uuid(actor.ownerId) || !uuid(actor.sessionId) || !positive(actor.mobileEpoch)) return fail('UNAUTHENTICATED', 401);
    const raw = await lifetime.body(request, 16384) ?? ''; let value: unknown;
    try { value = JSON.parse(raw); } catch { return fail('INVALID_INPUT', 400); }
    const command = parseMaterialCommand(value); if (!command || Buffer.byteLength(raw, 'utf8') > 16384
      || command.action !== 'recover' && Buffer.byteLength(raw, 'utf8') > 8192) return fail('INVALID_INPUT', 400);
    if (!await authority.current(actor)) return fail('SESSION_REPLACED', 401);
    const current = () => authority.current(actor);
    if (command.action === 'export') return reply({ data: await collectMaterialExport(command, raw, actor, authority.rpc, lifetime.signal, current, now) });
    mutationDispatched = command.action === 'erase';
    const result = await authority.rpc(command.action, raw, lifetime.signal);
    if (lifetime.signal.aborted || !await current()) return fail(mutationDispatched ? 'MATERIAL_ACK_UNKNOWN' : 'SESSION_REPLACED', mutationDispatched ? 503 : 401);
    if (Buffer.byteLength(JSON.stringify(result) ?? '', 'utf8') > MATERIAL_LIMITS.maxBytes) return fail(mutationDispatched ? 'MATERIAL_ACK_UNKNOWN' : 'MATERIAL_CAPACITY');
    if (command.action === 'trip_list') return decodeMaterialTrips(result, command, actor, now()) ? reply({ data: result }) : fail('MATERIAL_SOURCE_UNAVAILABLE');
    if (command.action === 'list') return decodeMaterialList(result, command, actor, now()) ? reply({ data: result }) : fail('MATERIAL_SOURCE_UNAVAILABLE');
    if (command.action === 'preview') return decodeMaterialPreview(result, command, actor, now()) ? reply({ data: result }) : fail('MATERIAL_SOURCE_UNAVAILABLE');
    const bytes = command.action === 'recover' ? command.mutationBytes : raw;
    const receipt = decodeMaterialReceipt(result, command, actor, materialDigest(bytes), now());
    if (receipt) {
      const mutation = command.action === 'recover' ? parseMaterialCommand(JSON.parse(bytes)) : command;
      return mutation && 'previewDigest' in mutation && mutation.previewDigest === receipt.previewDigest ? reply({ data: receipt }) : fail('MATERIAL_ACK_UNKNOWN');
    }
    if (command.action === 'recover' && decodeMaterialUnknown(result, command, actor, materialDigest(command.mutationBytes))) return reply({ data: result });
    return fail('MATERIAL_ACK_UNKNOWN');
  }); } catch (error) {
    const code = materialError(error instanceof Error ? error.message : 'MATERIAL_UNAVAILABLE');
    if (mutationDispatched) return fail('MATERIAL_ACK_UNKNOWN');
    return fail(code, ['UNAUTHENTICATED','SESSION_REPLACED','REAUTHENTICATION_REQUIRED'].includes(code) ? 401 : code === 'FORBIDDEN' ? 403 : code === 'INVALID_INPUT' ? 400 : 503);
  } finally { lifetime.dispose(); }
}

export async function materialReferenceNativeHTTP(request: Request): Promise<Response> {
  const config = getNativeRuntimeConfig(request, 'session');
  return handleMaterialReferences(request, {
    enabled: !!config && !config.environment && !process.env.VERCEL_ENV && process.env.DATA_MATERIAL_REFERENCES_LOCAL === '1',
    authority(original, lifetime) {
      let credentials: Awaited<ReturnType<typeof verifyNativeCredentials>>;
      async function session(): Promise<MaterialActor | null> {
        if (!credentials) return null;
        const response = await credentials.client.rpc('native_session_v2', { p_action: 'session' }).abortSignal(lifetime.signal);
        const value = response.data;
        if (response.error || !record(value) || value.subject !== credentials.subject || value.sessionId !== credentials.sessionId || !positive(value.mobileEpoch)) return null;
        return { ownerId: credentials.subject, sessionId: credentials.sessionId, mobileEpoch: value.mobileEpoch };
      }
      let actor: MaterialActor | null = null;
      return {
        async authenticate() { credentials = await verifyNativeCredentials(original, config!, lifetime.fetch, lifetime.unavailable); actor = await session(); return actor; },
        async current(expected) { const fresh = await session(); return !!fresh && fresh.ownerId === expected.ownerId && fresh.sessionId === expected.sessionId && fresh.mobileEpoch === expected.mobileEpoch; },
        async rpc(action, bytes, signal) {
          if (!credentials || !actor) throw Error('UNAUTHENTICATED');
          const result = await credentials.client.rpc('privacy_material_reference_v1', { p_action: action, p_input_bytes: bytes, p_expected_epoch: actor.mobileEpoch }).abortSignal(signal);
          if (result.error) throw Error(materialError(result.error.message));
          return result.data;
        },
      };
    },
  });
}
