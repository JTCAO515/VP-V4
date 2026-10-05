import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { requestLifetime, type RequestLifetime } from '../../knowledge/review/request-lifetime.ts';
import { exact, record } from '../operations/contract.ts';
import { decodeBrief, decodeBriefAudit, decodeBriefDataBundle, decodeBriefReceipt, decodeBriefSourceOptions, decodeBriefLocator, decodeBriefOwnerState, parseBriefInput, type BriefInput, type BriefMutation } from './contract.ts';

export type BriefRPC = Readonly<{
  authenticate(): Promise<string | false>; sessionId(): string | null;
  call(name: 'service_case_brief_v1', params: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}>;
export const briefRequestDigest = (bytes: string) => createHash('sha256').update(bytes,'utf8').digest('hex');

/** No stored summary is trusted. Every call, recovery, old URL and final reply
 * goes through the current Case/source/consent/session qualifications in SQL. */
export async function handleTravelerBrief(request: Request, options: Readonly<{
  enabled: boolean; surface: 'owner' | 'staff'; sameOrigin?: boolean;
  createRpc: (lifetime: RequestLifetime) => BriefRPC;
}>) {
  let dispatched: string | null = null;
  const fail = (code: string, status = 503) => ({ status, body: { error: { code }, ...(dispatched ? { operationId: dispatched, acknowledgement: 'unknown', recoveryAction: 'read_original_operation' } : {}) } });
  if (!options.enabled) return fail('BRIEF_DISABLED');
  if (request.method !== 'POST' || new URL(request.url).search || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return fail('INVALID_INPUT',400);
  if (options.surface === 'owner' ? request.headers.has('cookie') || request.headers.has('origin') : request.headers.has('authorization') || !options.sameOrigin) return fail('CASE_FORBIDDEN',403);
  const lifetime = requestLifetime(request.signal,15000); let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    reader = request.body?.getReader(); if (!reader) return fail('INVALID_INPUT',400);
    const chunks: Uint8Array[] = []; let length = 0;
    for (;;) { const chunk = await lifetime.run(() => reader!.read()); if (chunk.done) break; length += chunk.value.byteLength; if (length > 48000) return fail('INVALID_INPUT',413); chunks.push(chunk.value); }
    let raw: string; let input: BriefInput | null;
    try { raw = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(Buffer.concat(chunks)); input = parseBriefInput(JSON.parse(raw)); } catch { return fail('INVALID_INPUT',400); }
    if (!input || input.action !== 'abandon' && length > 24000) return fail('INVALID_INPUT',400);
    if (options.surface === 'staff' && !['read','locate'].includes(input.action)) return fail('CASE_FORBIDDEN',403);
    const rpc = options.createRpc(lifetime); const actor = await lifetime.run(() => rpc.authenticate()), session = rpc.sessionId();
    if (!actor || !session) return fail('UNAUTHENTICATED',401);
    if (options.surface === 'staff' && (request.headers.get('x-ops-expected-actor') !== actor || request.headers.get('x-ops-expected-session') !== session)) return fail('CASE_FORBIDDEN',403);
    if (options.surface === 'staff' && input.action === 'read' && input.recipientId !== actor) return fail('CASE_FORBIDDEN',403);
    const call = (command: BriefInput, bytes: string) => lifetime.run(() => rpc.call('service_case_brief_v1',{p_input:command,p_request_bytes:bytes,p_surface:options.surface}));
    if (['share','withdraw','delete','abandon'].includes(input.action) && 'operationId' in input) dispatched = input.operationId;
    const initial = await call(input,raw);
    if (initial.error) {
      const statuses: Record<string,number> = { INVALID_INPUT:400,CASE_FORBIDDEN:403,BRIEF_FORBIDDEN:403,BRIEF_CONFLICT:409,BRIEF_BUSY:409,CASE_CONFLICT:409,CASE_BUSY:409,BRIEF_STALE:409,IDEMPOTENCY_KEY_REUSE:409,BRIEF_OPERATION_ERASED:410,BRIEF_NOT_FOUND:404,BRIEF_LIMIT:503,BRIEF_DISABLED:503,UNAUTHENTICATED:401,SESSION_REPLACED:401 };
      return Object.hasOwn(statuses,initial.error.message) ? fail(initial.error.message,statuses[initial.error.message]) : fail(dispatched ? 'BRIEF_ACK_UNKNOWN' : 'BRIEF_UNAVAILABLE');
    }
    let data: unknown, verify: BriefInput = input;
    if (input.action === 'owner_state') {
      const state = decodeBriefOwnerState(initial.data);
      if (!state || state.caseId !== input.caseId || state.ownerId !== actor) return fail('BRIEF_UNAVAILABLE');
      data = state;
    } else if (input.action === 'locate') {
      const locator = decodeBriefLocator(initial.data);
      if (!locator || locator.caseId !== input.caseId || locator.expiresAt <= Date.now() || (options.surface === 'owner' ? locator.ownerId !== actor : locator.recipientId !== actor || locator.ownerId === actor)) return fail('BRIEF_UNAVAILABLE');
      data = locator;
    } else if (input.action === 'source_options') {
      const sources = decodeBriefSourceOptions(initial.data);
      if (!sources || sources.ownerId !== actor || sources.caseId !== input.caseId || sources.expiresAt <= Date.now()) return fail('BRIEF_UNAVAILABLE');
      data = sources;
    } else if (input.action === 'preview' || input.action === 'read_preview' || input.action === 'read') {
      const projection = decodeBrief(initial.data);
      if (!projection || projection.kind !== (input.action === 'read' ? 'brief' : 'preview') || projection.expiresAt <= Date.now() || (options.surface === 'owner' ? projection.ownerId !== actor : projection.recipientId !== actor || projection.ownerId === actor)) return fail('BRIEF_UNAVAILABLE');
      if (input.action === 'read_preview') {
        if (projection.kind !== 'preview' || projection.previewId !== input.previewId) return fail('BRIEF_UNAVAILABLE');
      } else if (projection.caseId !== input.caseId || projection.recipientId !== input.recipientId || projection.grantRevision !== input.grantRevision || input.action === 'read' && projection.revision !== input.expectedRevision) return fail('BRIEF_UNAVAILABLE');
      data = projection;
      if (projection.kind === 'preview') verify = {action:'read_preview',previewId:projection.previewId};
    } else if (input.action === 'audit') {
      const audit = decodeBriefAudit(initial.data);
      if (!audit || audit.ownerId !== actor || audit.caseId !== input.caseId) return fail('BRIEF_UNAVAILABLE');
      data = audit;
    } else if (input.action === 'export') {
      const bundle = decodeBriefDataBundle(initial.data);
      if (!bundle || bundle.ownerId !== actor || bundle.sessionId !== session || bundle.requestId !== input.requestId || bundle.expiresAt <= Date.now() || Buffer.byteLength(JSON.stringify({data:bundle}),'utf8') > 524288) return fail('BRIEF_UNAVAILABLE');
      data = bundle;
    } else if (input.action === 'read_operation') {
      if (!record(initial.data) || !exact(initial.data,['receipt'])) return fail('BRIEF_UNAVAILABLE');
      const receipt = initial.data.receipt === null ? null : decodeBriefReceipt(initial.data.receipt);
      if (initial.data.receipt !== null && (!receipt || receipt.operationId !== input.operationId)) return fail('BRIEF_UNAVAILABLE');
      data = {receipt};
    } else {
      const original = input.action === 'abandon' ? parseBriefInput(JSON.parse(input.mutationBytes)) as BriefMutation : input;
      const bytes = input.action === 'abandon' ? input.mutationBytes : raw;
      const receipt = decodeBriefReceipt(initial.data);
      if (!receipt || receipt.operationId !== original.operationId || receipt.caseId !== original.caseId || receipt.grantRevision !== original.grantRevision || receipt.action !== original.action || receipt.requestDigest !== briefRequestDigest(bytes) || (receipt.outcome === 'applied' ? receipt.revision !== original.expectedRevision + 1 : receipt.revision < original.expectedRevision)) return fail('BRIEF_ACK_UNKNOWN');
      data = receipt; verify = {action:'read_operation',operationId:original.operationId};
    }
    const fresh = await call(verify,JSON.stringify(verify));
    if (fresh.error) return fail(dispatched ? 'BRIEF_ACK_UNKNOWN' : 'BRIEF_UNAVAILABLE');
    if (input.action === 'export') {
      const bundle = decodeBriefDataBundle(data)!, current = decodeBriefDataBundle(fresh.data);
      if (!current || current.ownerId !== actor || current.sessionId !== session || current.requestId !== input.requestId || current.sourceDigest !== bundle.sourceDigest || !isDeepStrictEqual(current.rows,bundle.rows) || !isDeepStrictEqual(current.coverage,bundle.coverage) || bundle.expiresAt <= Date.now()) return fail('BRIEF_UNAVAILABLE');
    } else if (dispatched) {
      if (!record(fresh.data) || !exact(fresh.data,['receipt']) || !isDeepStrictEqual(data,fresh.data.receipt)) return fail('BRIEF_ACK_UNKNOWN');
    } else if (!isDeepStrictEqual(data,fresh.data)) return fail('BRIEF_UNAVAILABLE');
    if (await lifetime.run(() => rpc.authenticate()) !== actor || rpc.sessionId() !== session) return fail(dispatched ? 'BRIEF_ACK_UNKNOWN' : 'UNAUTHENTICATED',dispatched ? 503 : 401);
    lifetime.check();
    const projection = decodeBrief(data), bundle = decodeBriefDataBundle(data), sources = decodeBriefSourceOptions(data), locator = decodeBriefLocator(data);
    if (projection && projection.expiresAt <= Date.now() || bundle && bundle.expiresAt <= Date.now() || sources && sources.expiresAt <= Date.now() || locator && locator.expiresAt <= Date.now()) return fail('BRIEF_UNAVAILABLE');
    return {status:200,body:{data}};
  } catch { return fail(dispatched ? 'BRIEF_ACK_UNKNOWN' : 'BRIEF_UNAVAILABLE'); }
  finally { lifetime.dispose(); try { void reader?.cancel().catch(() => {}); } catch { /* already closed */ } }
}
