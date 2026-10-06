import { getNativeRuntimeConfig } from '../../identity/native-config.ts';
import { verifyNativeCredentials } from '../../identity/native-credentials.ts';
import { nativeRequestScope } from '../../identity/native-request.ts';
import { record } from '../../guide/contract.ts';
import { CONVERSATION_LIMITS, parseConversationCommand, conversationDigest, identifier, positive, type ConversationActor } from './contract.ts';
import { decodeConversationList, decodeConversationPreview, decodeConversationReceipt, decodeConversationUnknown } from './protocol.ts';

type Lifetime = ReturnType<typeof nativeRequestScope>;
export type ConversationAuthority = Readonly<{ authenticate(): Promise<ConversationActor | null>; current(actor: ConversationActor): Promise<boolean>;
  rpc(action: string, bytes: string, signal: AbortSignal): Promise<unknown> }>;
export type ConversationHTTPOptions = Readonly<{ enabled: boolean; authority(request: Request, lifetime: Lifetime): ConversationAuthority; now?: () => number }>;
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff' } });
const fail = (code: string, status = 503) => reply({ error: { code } }, status);
const errors = ['CONVERSATION_DISABLED', 'CONVERSATION_UNAVAILABLE', 'CONVERSATION_CAPACITY', 'CONVERSATION_SOURCE_UNAVAILABLE', 'CONVERSATION_SOURCE_CHANGED',
  'CONVERSATION_EXPIRED', 'CONVERSATION_CONFLICT', 'CONVERSATION_ACK_UNKNOWN', 'UNAUTHENTICATED', 'SESSION_REPLACED', 'REAUTHENTICATION_REQUIRED', 'DATA_POLICY_BLOCKED', 'FORBIDDEN', 'INVALID_INPUT'];
export const conversationError = (message: string) => errors.includes(message) ? message : 'CONVERSATION_UNAVAILABLE';
/** Ordinary owner credentials; mutation dispatch never authorizes a rebuilt retry. */
export async function handleConversationData(request: Request, options: ConversationHTTPOptions): Promise<Response> {
  if (request.method !== 'POST' || new URL(request.url).search || request.headers.has('cookie') || request.headers.has('origin')
    || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return fail('INVALID_INPUT', 400);
  if (!options.enabled) return fail('CONVERSATION_DISABLED');
  const lifetime = nativeRequestScope(request.signal, CONVERSATION_LIMITS.lifetimeMs); const now = options.now ?? Date.now;
  let dispatched = false;
  try { return await lifetime.run(async () => {
    const authority = options.authority(request, lifetime); const actor = await authority.authenticate();
    if (!actor || !identifier(actor.ownerId) || !identifier(actor.sessionId) || !positive(actor.mobileEpoch)) return fail('UNAUTHENTICATED', 401);
    const raw = await lifetime.body(request, 16384); if (raw === null) return fail('INVALID_INPUT', 400);
    let value: unknown; try { value = JSON.parse(raw); } catch { return fail('INVALID_INPUT', 400); }
    const command = parseConversationCommand(value);
    if (!command || Buffer.byteLength(raw, 'utf8') > (command.action === 'recover' ? 16384 : 8192)) return fail('INVALID_INPUT', 400);
    if (command.action === 'erase' && Buffer.byteLength(JSON.stringify({ action: 'recover', scope: command.scope, requestId: command.requestId,
      rootKind: command.rootKind, rootId: command.rootId, objectIds: command.objectIds, mutationBytes: raw }), 'utf8') > 16384) return fail('INVALID_INPUT', 400);
    if (!await authority.current(actor)) return fail('SESSION_REPLACED', 401);
    dispatched = command.action === 'erase' || command.action === 'recover';
    const result = await authority.rpc(command.action, raw, lifetime.signal);
    if (lifetime.signal.aborted || !await authority.current(actor)) return fail(dispatched ? 'CONVERSATION_ACK_UNKNOWN' : 'SESSION_REPLACED', dispatched ? 503 : 401);
    if (Buffer.byteLength(JSON.stringify({ data: result }), 'utf8') > CONVERSATION_LIMITS.maxBytes) return fail(dispatched ? 'CONVERSATION_ACK_UNKNOWN' : 'CONVERSATION_CAPACITY');
    if (command.action === 'list') return decodeConversationList(result, command, actor, now()) ? reply({ data: result }) : fail('CONVERSATION_SOURCE_UNAVAILABLE');
    if (command.action === 'preview') return decodeConversationPreview(result, command, actor, now()) ? reply({ data: result }) : fail('CONVERSATION_SOURCE_UNAVAILABLE');
    const mutationBytes = command.action === 'recover' ? command.mutationBytes : raw;
    const mutation = command.action === 'recover' ? parseConversationCommand(JSON.parse(mutationBytes)) : command;
    if (!mutation || mutation.action !== 'erase') return fail('CONVERSATION_ACK_UNKNOWN');
    // Validate ORIGINAL binding and digests on recovery, even after preview expiry.
    const receipt = decodeConversationReceipt(result, mutation, actor, conversationDigest(mutationBytes), now());
    if (receipt) return reply({ data: receipt });
    if (command.action === 'recover' && decodeConversationUnknown(result, command, actor, conversationDigest(mutationBytes))) return reply({ data: result });
    return fail('CONVERSATION_ACK_UNKNOWN');
  }); } catch (error) {
    if (dispatched) return fail('CONVERSATION_ACK_UNKNOWN');
    const code = conversationError(error instanceof Error ? error.message : 'CONVERSATION_UNAVAILABLE');
    return fail(code, ['UNAUTHENTICATED', 'SESSION_REPLACED', 'REAUTHENTICATION_REQUIRED'].includes(code) ? 401 : ['FORBIDDEN', 'DATA_POLICY_BLOCKED'].includes(code) ? 403 : code === 'INVALID_INPUT' ? 400 : 503);
  } finally { lifetime.dispose(); }
}
export async function conversationDataNativeHTTP(request: Request): Promise<Response> {
  const config = getNativeRuntimeConfig(request, 'session');
  return handleConversationData(request, {
    enabled: !!config && !config.environment && !process.env.VERCEL_ENV && process.env.DATA_CONVERSATION_DATA_LOCAL === '1',
    authority(original, lifetime) {
      let credentials: Awaited<ReturnType<typeof verifyNativeCredentials>>;
      let actor: ConversationActor | null = null;
      async function session(): Promise<ConversationActor | null> {
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
          const response = await credentials.client.rpc('privacy_conversation_data_v1', { p_action: action, p_input_bytes: bytes, p_expected_epoch: actor.mobileEpoch }).abortSignal(signal);
          if (response.error) throw Error(conversationError(response.error.message));
          return response.data;
        },
      };
    },
  });
}
