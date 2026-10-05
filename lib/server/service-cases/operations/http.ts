import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { requestLifetime, type RequestLifetime } from '../../knowledge/review/request-lifetime.ts';
import { decodeServiceProjection, decodeServiceReceipt, decodeServiceWorkspace, exact, parseServiceInput, record, type ServiceInput, type ServiceMutation, type ServiceProjection } from './contract.ts';

export type ServiceRPC = Readonly<{
  authenticate(): Promise<string | false>;
  sessionId(): string | null;
  call(name: 'service_case_operations_v1', params: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  proveOwnerInput?(input: ServiceInput, actor: string): Promise<boolean>;
  proveOwnerProjection?(projection: ServiceProjection, actor: string): Promise<boolean>;
}>;
export const serviceRequestDigest = (bytes: string) => createHash('sha256').update(bytes, 'utf8').digest('hex');
export function serviceSurfaceAllows(input: ServiceInput, surface: 'owner' | 'staff'): boolean {
  const action = input.action === 'abandon' ? (JSON.parse(input.mutationBytes) as ServiceMutation).action : input.action;
  return !['request', 'cancel', 'select_proposal', 'accept', 'assign', 'update'].includes(action) || (surface === 'owner' ? ['request', 'cancel', 'select_proposal'].includes(action) : ['accept', 'assign', 'update'].includes(action));
}

/** A single bounded request. Commands reach only the caller-bound RPC, then a
 * fresh authorized receipt read. Failure after dispatch retains unknown ACK. */
export async function handleServiceOperations(request: Request, options: Readonly<{
  enabled: boolean; surface: 'owner' | 'staff'; sameOrigin?: boolean;
  createRpc: (lifetime: RequestLifetime) => ServiceRPC;
}>) {
  let dispatched: string | null = null;
  const fail = (code: string, status = 503) => ({ status, body: { error: { code }, ...(dispatched ? { operationId: dispatched, acknowledgement: 'unknown', recoveryAction: 'read_original_operation' } : {}) } });
  if (!options.enabled) return fail('CASE_OPERATIONS_DISABLED');
  if (request.method !== 'POST' || new URL(request.url).search || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return fail('INVALID_INPUT', 400);
  if (options.surface === 'owner' ? request.headers.has('cookie') || request.headers.has('origin') : request.headers.has('authorization') || !options.sameOrigin) return fail('CASE_FORBIDDEN', 403);
  const lifetime = requestLifetime(request.signal, 15000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    reader = request.body?.getReader(); if (!reader) return fail('INVALID_INPUT', 400);
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const chunk = await lifetime.run(() => reader!.read()); if (chunk.done) break; size += chunk.value.byteLength; if (size > 48000) return fail('INVALID_INPUT', 413); chunks.push(chunk.value); }
    let raw: string; let input: ServiceInput | null;
    try { raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks)); input = parseServiceInput(JSON.parse(raw)); } catch { return fail('INVALID_INPUT', 400); }
    if (!input || !serviceSurfaceAllows(input, options.surface)) return fail('INVALID_INPUT', 400);
    if (input.action !== 'abandon' && size > 24000) return fail('INVALID_INPUT', 413);
    const rpc = options.createRpc(lifetime); const actor = await lifetime.run(() => rpc.authenticate());
    if (!actor) return fail('UNAUTHENTICATED', 401);
    const sessionId = rpc.sessionId(); if (!sessionId) return fail('UNAUTHENTICATED', 401);
    if (options.surface === 'staff' && (request.headers.get('x-ops-expected-actor') !== actor || request.headers.get('x-ops-expected-session') !== sessionId)) return fail('CASE_FORBIDDEN', 403);
    if (options.surface === 'owner' && ['request', 'select_proposal'].includes(input.action) && (!rpc.proveOwnerInput || !await lifetime.run(() => rpc.proveOwnerInput!(input!, actor)))) return fail('CASE_CONFLICT', 409);
    if ('operationId' in input && !['read_operation'].includes(input.action)) dispatched = input.operationId;
    const result = await lifetime.run(() => rpc.call('service_case_operations_v1', { p_input: input, p_request_bytes: raw, p_surface: options.surface }));
    if (result.error) {
      const codes: Record<string, number> = { INVALID_INPUT: 400, CASE_MINUTES_INVALID: 400, CASE_FORBIDDEN: 403, CASE_CONFLICT: 409, CASE_BUSY: 409, IDEMPOTENCY_KEY_REUSE: 409, CASE_CAPACITY_FULL: 409, CASE_CAPACITY_UNAVAILABLE: 409, CASE_TRIP_UNAVAILABLE: 409, CASE_NOT_FOUND: 404, CASE_OPERATION_ERASED: 410, CASE_WORKSPACE_LIMIT: 503, CASE_OPERATIONS_DISABLED: 503, SERVICE_OPERATIONS_DISABLED: 503, UNAUTHENTICATED: 401, SESSION_REPLACED: 401 };
      return Object.hasOwn(codes, result.error.message) ? fail(result.error.message, codes[result.error.message]) : fail(dispatched ? 'CASE_ACK_UNKNOWN' : 'CASE_UNAVAILABLE');
    }
    let data: unknown;
    if (input.action === 'workspace') {
      const workspace = decodeServiceWorkspace(result.data);
      if (!workspace || workspace.actorId !== actor || workspace.surface !== options.surface) return fail('CASE_UNAVAILABLE');
      data = workspace;
    } else if (input.action === 'read') {
      const projection = decodeServiceProjection(result.data);
      if (!projection || projection.caseId !== input.caseId || (options.surface === 'staff' && (projection.trip.kind !== 'unknown' || projection.proposal !== null))) return fail('CASE_UNAVAILABLE');
      data = projection;
    } else if (input.action === 'read_operation') {
      if (!record(result.data) || !exact(result.data, ['receipt'])) return fail('CASE_UNAVAILABLE');
      const receipt = result.data.receipt === null ? null : decodeServiceReceipt(result.data.receipt);
      if (result.data.receipt !== null && (!receipt || receipt.operationId !== input.operationId)) return fail('CASE_UNAVAILABLE');
      data = { receipt };
    } else {
      const receipt = decodeServiceReceipt(result.data);
      const original = input.action === 'abandon' ? parseServiceInput(JSON.parse(input.mutationBytes)) as ServiceMutation : input;
      const bytes = input.action === 'abandon' ? input.mutationBytes : raw;
      if (!receipt || receipt.operationId !== original.operationId || receipt.caseId !== original.caseId || receipt.action !== original.action || receipt.requestDigest !== serviceRequestDigest(bytes)) return fail('CASE_ACK_UNKNOWN');
      data = receipt;
    }
    // Eligibility is SQL-authoritative on this second call as well, including
    // grant/session/shift withdrawal between initial execution and the reply.
    const verificationInput = dispatched ? { action: 'read_operation', operationId: dispatched } : input;
    const verificationBytes = dispatched ? JSON.stringify(verificationInput) : raw;
    const fresh = await lifetime.run(() => rpc.call('service_case_operations_v1', { p_input: verificationInput, p_request_bytes: verificationBytes, p_surface: options.surface }));
    if (fresh.error) return fail(dispatched ? 'CASE_ACK_UNKNOWN' : 'CASE_UNAVAILABLE');
    if (dispatched ? !record(fresh.data) || !exact(fresh.data, ['receipt']) || !isDeepStrictEqual(data, fresh.data.receipt) : !sameAuthorizedRead(data, fresh.data, input)) return fail(dispatched ? 'CASE_ACK_UNKNOWN' : 'CASE_UNAVAILABLE');
    data = dispatched ? data : fresh.data;
    const projections = input.action === 'workspace' ? decodeServiceWorkspace(data)?.cases ?? [] : input.action === 'read' ? [decodeServiceProjection(data)!] : [];
    if (options.surface === 'owner' && projections.some(p => p.proposal !== null) && (!rpc.proveOwnerProjection || !(await lifetime.run(async () => { for (const p of projections) if (p.proposal && !await rpc.proveOwnerProjection!(p, actor)) return false; return true; })))) return fail('CASE_UNAVAILABLE');
    if (projections.some(p => options.surface === 'staff' && (p.grantState !== 'active' || p.expiresAt === null || p.expiresAt <= Date.now()))) return fail('CASE_UNAVAILABLE');
    if (options.surface === 'owner' && ['request', 'select_proposal'].includes(input.action) && !await lifetime.run(() => rpc.proveOwnerInput!(input!, actor))) return fail('CASE_ACK_UNKNOWN');
    if (await lifetime.run(() => rpc.authenticate()) !== actor || rpc.sessionId() !== sessionId) return fail(dispatched ? 'CASE_ACK_UNKNOWN' : 'UNAUTHENTICATED', dispatched ? 503 : 401);
    lifetime.check();
    return { status: 200, body: { data } };
  } catch { return fail(dispatched ? 'CASE_ACK_UNKNOWN' : 'CASE_UNAVAILABLE'); }
  finally { lifetime.dispose(); try { void reader?.cancel().catch(() => {}); } catch { /* already closed */ } }
}

function sameAuthorizedRead(before: unknown, after: unknown, input: ServiceInput) {
  if (input.action === 'workspace') {
    const b = decodeServiceWorkspace(before), a = decodeServiceWorkspace(after);
    return !!a && !!b && a.actorId === b.actorId && a.surface === b.surface;
  }
  if (input.action === 'read') return decodeServiceProjection(after)?.caseId === input.caseId;
  return isDeepStrictEqual(before, after);
}
