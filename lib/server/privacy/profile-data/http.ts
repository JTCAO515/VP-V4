import { getNativeRuntimeConfig } from '../../identity/native-config.ts';
import { verifyNativeCredentials } from '../../identity/native-credentials.ts';
import { nativeRequestScope } from '../../identity/native-request.ts';
import { record } from '../../guide/contract.ts';
import { PROFILE_LIMITS, parseProfileCommand, profileDigest, identifier, positive, type ProfileActor } from './contract.ts';
import { decodeProfileList, decodeProfilePreview, decodeProfileReceipt, decodeProfileUnknown } from './protocol.ts';

type Lifetime = ReturnType<typeof nativeRequestScope>;
export type ProfileAuthority = Readonly<{ authenticate(): Promise<ProfileActor | null>; current(actor: ProfileActor): Promise<boolean>;
  rpc(action: string, bytes: string, signal: AbortSignal): Promise<unknown> }>;
export type ProfileHTTPOptions = Readonly<{ enabled: boolean; authority(request: Request, lifetime: Lifetime): ProfileAuthority; now?: () => number }>;
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff' } });
const fail = (code: string, status = 503) => reply({ error: { code } }, status);
const errors = ['PROFILE_DISABLED', 'PROFILE_UNAVAILABLE', 'PROFILE_CAPACITY', 'PROFILE_SOURCE_UNAVAILABLE', 'PROFILE_SOURCE_CHANGED', 'PROFILE_WRITE_FENCE',
  'PROFILE_EXPIRED', 'PROFILE_CONFLICT', 'PROFILE_ACK_UNKNOWN', 'UNAUTHENTICATED', 'SESSION_REPLACED', 'REAUTHENTICATION_REQUIRED', 'DATA_POLICY_BLOCKED', 'FORBIDDEN', 'INVALID_INPUT'];
export const profileError = (message: string) => errors.includes(message) ? message : 'PROFILE_UNAVAILABLE';
/** Ordinary owner credentials; mutation dispatch never authorizes a rebuilt retry. */
export async function handleProfileData(request: Request, options: ProfileHTTPOptions): Promise<Response> {
  if (request.method !== 'POST' || new URL(request.url).search || request.headers.has('cookie') || request.headers.has('origin')
    || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return fail('INVALID_INPUT', 400);
  if (!options.enabled) return fail('PROFILE_DISABLED');
  const lifetime = nativeRequestScope(request.signal, PROFILE_LIMITS.lifetimeMs); const now = options.now ?? Date.now;
  let dispatched = false;
  try { return await lifetime.run(async () => {
    const authority = options.authority(request, lifetime); const actor = await authority.authenticate();
    if (!actor || !identifier(actor.ownerId) || !identifier(actor.sessionId) || !positive(actor.mobileEpoch)) return fail('UNAUTHENTICATED', 401);
    const raw = await lifetime.body(request, 16384); if (raw === null) return fail('INVALID_INPUT', 400);
    let value: unknown; try { value = JSON.parse(raw); } catch { return fail('INVALID_INPUT', 400); }
    const command = parseProfileCommand(value);
    if (!command || Buffer.byteLength(raw, 'utf8') > (command.action === 'recover' ? 16384 : 8192)) return fail('INVALID_INPUT', 400);
    if (command.action === 'erase' && Buffer.byteLength(JSON.stringify({ action: 'recover', scope: command.scope, requestId: command.requestId,
      profileId: command.profileId, objectIds: command.objectIds, mutationBytes: raw }), 'utf8') > 16384) return fail('INVALID_INPUT', 400);
    if (!await authority.current(actor)) return fail('SESSION_REPLACED', 401);
    dispatched = command.action === 'erase' || command.action === 'recover';
    const result = await authority.rpc(command.action, raw, lifetime.signal);
    if (lifetime.signal.aborted || !await authority.current(actor)) return fail(dispatched ? 'PROFILE_ACK_UNKNOWN' : 'SESSION_REPLACED', dispatched ? 503 : 401);
    if (Buffer.byteLength(JSON.stringify({ data: result }), 'utf8') > PROFILE_LIMITS.maxBytes) return fail(dispatched ? 'PROFILE_ACK_UNKNOWN' : 'PROFILE_CAPACITY');
    if (command.action === 'list') return decodeProfileList(result, command, actor, now()) ? reply({ data: result }) : fail('PROFILE_SOURCE_UNAVAILABLE');
    if (command.action === 'preview') return decodeProfilePreview(result, command, actor, now()) ? reply({ data: result }) : fail('PROFILE_SOURCE_UNAVAILABLE');
    const mutationBytes = command.action === 'recover' ? command.mutationBytes : raw;
    const mutation = command.action === 'recover' ? parseProfileCommand(JSON.parse(mutationBytes)) : command;
    if (!mutation || mutation.action !== 'erase') return fail('PROFILE_ACK_UNKNOWN');
    // Validate ORIGINAL binding and digests on recovery, even after preview expiry.
    const receipt = decodeProfileReceipt(result, mutation, actor, profileDigest(mutationBytes), now());
    if (receipt) return reply({ data: receipt });
    if (command.action === 'recover' && decodeProfileUnknown(result, command, actor, profileDigest(mutationBytes))) return reply({ data: result });
    return fail('PROFILE_ACK_UNKNOWN');
  }); } catch (error) {
    if (dispatched) return fail('PROFILE_ACK_UNKNOWN');
    const code = profileError(error instanceof Error ? error.message : 'PROFILE_UNAVAILABLE');
    return fail(code, ['UNAUTHENTICATED', 'SESSION_REPLACED', 'REAUTHENTICATION_REQUIRED'].includes(code) ? 401 : ['FORBIDDEN', 'DATA_POLICY_BLOCKED'].includes(code) ? 403 : code === 'INVALID_INPUT' ? 400 : 503);
  } finally { lifetime.dispose(); }
}
export async function profileDataNativeHTTP(request: Request): Promise<Response> {
  const config = getNativeRuntimeConfig(request, 'session');
  return handleProfileData(request, {
    enabled: !!config && !config.environment && !process.env.VERCEL_ENV && process.env.DATA_PROFILE_DATA_LOCAL === '1',
    authority(original, lifetime) {
      let credentials: Awaited<ReturnType<typeof verifyNativeCredentials>>;
      let actor: ProfileActor | null = null;
      async function session(): Promise<ProfileActor | null> {
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
          const response = await credentials.client.rpc('privacy_profile_data_v1', { p_action: action, p_input_bytes: bytes, p_expected_epoch: actor.mobileEpoch }).abortSignal(signal);
          if (response.error) throw Error(profileError(response.error.message));
          return response.data;
        },
      };
    },
  });
}
