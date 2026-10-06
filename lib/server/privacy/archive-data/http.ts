import { getNativeRuntimeConfig } from '../../identity/native-config.ts';
import { verifyNativeCredentials } from '../../identity/native-credentials.ts';
import { nativeRequestScope } from '../../identity/native-request.ts';
import { record, uuid } from '../../guide/contract.ts';
import { ARCHIVE_LIMITS, parseArchiveCommand, archiveDigest, positive, type ArchiveActor } from './contract.ts';
import { collectArchiveExport, type ArchiveRPC } from './export.ts';
import { decodeArchiveList, decodeArchivePreview, decodeArchiveReceipt, decodeArchiveUnknown, decodeArchiveValidated } from './protocol.ts';

type Lifetime = ReturnType<typeof nativeRequestScope>;
export type ArchiveAuthority = Readonly<{ authenticate(): Promise<ArchiveActor | null>; current(actor: ArchiveActor): Promise<boolean>; rpc: ArchiveRPC }>;
export type ArchiveHTTPOptions = Readonly<{ enabled: boolean; authority(request: Request, lifetime: Lifetime): ArchiveAuthority; now?: () => number }>;
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: {
  'Cache-Control': 'private, no-store', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff',
} });
const fail = (code: string, status = 503) => reply({ error: { code } }, status);
const archiveErrors = ['ARCHIVE_DISABLED','ARCHIVE_UNAVAILABLE','ARCHIVE_CAPACITY','ARCHIVE_SOURCE_UNAVAILABLE','ARCHIVE_SOURCE_CHANGED','ARCHIVE_EXPIRED',
  'ARCHIVE_CONFLICT','ARCHIVE_ACK_UNKNOWN','UNAUTHENTICATED','SESSION_REPLACED','REAUTHENTICATION_REQUIRED','FORBIDDEN','INVALID_INPUT','STALE_TRIP_VERSION'];
export const archiveError = (message: string) => archiveErrors.includes(message) ? message : 'ARCHIVE_UNAVAILABLE';
/** Ordinary actor credentials; exact raw mutation bytes survive unknown ACK. */
export async function handleArchiveData(request: Request, options: ArchiveHTTPOptions): Promise<Response> {
  if (request.method !== 'POST' || new URL(request.url).search || request.headers.has('cookie') || request.headers.has('origin')
    || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return fail('INVALID_INPUT', 400);
  if (!options.enabled) return fail('ARCHIVE_DISABLED');
  const lifetime = nativeRequestScope(request.signal, ARCHIVE_LIMITS.lifetimeMs); const now = options.now ?? Date.now;
  let mutationDispatched = false;
  try { return await lifetime.run(async () => {
    const authority = options.authority(request, lifetime); const actor = await authority.authenticate();
    if (!actor || !uuid(actor.ownerId) || !uuid(actor.sessionId) || !positive(actor.mobileEpoch)) return fail('UNAUTHENTICATED', 401);
    const raw = await lifetime.body(request, 16384) ?? ''; let value: unknown;
    try { value = JSON.parse(raw); } catch { return fail('INVALID_INPUT', 400); }
    const command = parseArchiveCommand(value);
    if (!command || Buffer.byteLength(raw, 'utf8') > (command.action === 'recover' ? 16384 : 8192)) return fail('INVALID_INPUT', 400);
    if (command.action === 'erase' && Buffer.byteLength(JSON.stringify({ action: 'recover', scope: command.scope, requestId: command.requestId,
      tripId: command.tripId, tripVersion: command.tripVersion, objectIds: command.objectIds, mutationBytes: raw }), 'utf8') > 16384) return fail('INVALID_INPUT', 400);
    if (!await authority.current(actor)) return fail('SESSION_REPLACED', 401);
    const current = () => authority.current(actor);
    if (command.action === 'export') {
      const data = await collectArchiveExport(command, raw, actor, authority.rpc, lifetime.signal, current, now);
      if (Buffer.byteLength(JSON.stringify({ data }), 'utf8') > ARCHIVE_LIMITS.maxBytes || lifetime.signal.aborted || !await current() || now() >= data.expiresAt) return fail('ARCHIVE_SOURCE_UNAVAILABLE');
      return reply({ data });
    }
    mutationDispatched = command.action === 'erase' || command.action === 'recover';
    const result = await authority.rpc(command.action, raw, lifetime.signal);
    if (lifetime.signal.aborted || !await current()) return fail(mutationDispatched ? 'ARCHIVE_ACK_UNKNOWN' : 'SESSION_REPLACED', mutationDispatched ? 503 : 401);
    if (Buffer.byteLength(JSON.stringify({ data: result }), 'utf8') > ARCHIVE_LIMITS.maxBytes) return fail(mutationDispatched ? 'ARCHIVE_ACK_UNKNOWN' : 'ARCHIVE_CAPACITY');
    if (command.action === 'list') return decodeArchiveList(result, command, actor, now()) ? reply({ data: result }) : fail('ARCHIVE_SOURCE_UNAVAILABLE');
    if (command.action === 'preview') return decodeArchivePreview(result, command, actor, now()) ? reply({ data: result }) : fail('ARCHIVE_SOURCE_UNAVAILABLE');
    if (command.action === 'validate') return decodeArchiveValidated(result, command, actor, now()) ? reply({ data: result }) : fail('ARCHIVE_SOURCE_UNAVAILABLE');
    const bytes = command.action === 'recover' ? command.mutationBytes : raw;
    const receipt = decodeArchiveReceipt(result, command, actor, archiveDigest(bytes), now());
    if (receipt) {
      const mutation = command.action === 'recover' ? parseArchiveCommand(JSON.parse(bytes)) : command;
      return mutation && 'previewDigest' in mutation && mutation.previewDigest === receipt.previewDigest ? reply({ data: receipt }) : fail('ARCHIVE_ACK_UNKNOWN');
    }
    if (command.action === 'recover' && decodeArchiveUnknown(result, command, actor, archiveDigest(bytes))) return reply({ data: result });
    return fail('ARCHIVE_ACK_UNKNOWN');
  }); } catch (error) {
    const code = archiveError(error instanceof Error ? error.message : 'ARCHIVE_UNAVAILABLE');
    if (mutationDispatched) return fail('ARCHIVE_ACK_UNKNOWN');
    return fail(code, ['UNAUTHENTICATED','SESSION_REPLACED','REAUTHENTICATION_REQUIRED'].includes(code) ? 401 : code === 'FORBIDDEN' ? 403 : code === 'INVALID_INPUT' ? 400 : 503);
  } finally { lifetime.dispose(); }
}

export async function archiveDataNativeHTTP(request: Request): Promise<Response> {
  const config = getNativeRuntimeConfig(request, 'session');
  return handleArchiveData(request, {
    enabled: !!config && !config.environment && !process.env.VERCEL_ENV && process.env.DATA_ARCHIVE_DATA_LOCAL === '1',
    authority(original, lifetime) {
      let credentials: Awaited<ReturnType<typeof verifyNativeCredentials>>;
      async function session(): Promise<ArchiveActor | null> {
        if (!credentials) return null;
        const response = await credentials.client.rpc('native_session_v2', { p_action: 'session' }).abortSignal(lifetime.signal);
        const value = response.data;
        if (response.error || !record(value) || value.subject !== credentials.subject || value.sessionId !== credentials.sessionId || !positive(value.mobileEpoch)) return null;
        return { ownerId: credentials.subject, sessionId: credentials.sessionId, mobileEpoch: value.mobileEpoch };
      }
      let actor: ArchiveActor | null = null;
      return {
        async authenticate() { credentials = await verifyNativeCredentials(original, config!, lifetime.fetch, lifetime.unavailable); actor = await session(); return actor; },
        async current(expected) { const fresh = await session(); return !!fresh && fresh.ownerId === expected.ownerId && fresh.sessionId === expected.sessionId && fresh.mobileEpoch === expected.mobileEpoch; },
        async rpc(action, bytes, signal) {
          if (!credentials || !actor) throw Error('UNAUTHENTICATED');
          const result = await credentials.client.rpc('privacy_archive_data_v1', { p_action: action, p_input_bytes: bytes, p_expected_epoch: actor.mobileEpoch }).abortSignal(signal);
          if (result.error) throw Error(archiveError(result.error.message));
          return result.data;
        },
      };
    },
  });
}
