import { getNativeRuntimeConfig } from '../../identity/native-config.ts';
import { verifyNativeCredentials } from '../../identity/native-credentials.ts';
import { nativeRequestScope } from '../../identity/native-request.ts';
import { exact, record, uuid, hash } from '../../guide/contract.ts';
import { isLifecycleTrip, isLifecycleReceipt } from '../../trip/lifecycle/contract.ts';
import { notificationCoverageRow } from './notification-row.ts';

export type ModuleExportScope = 'notification-metadata/1' | 'trip-lifecycle-metadata/1';
type Binding = Readonly<{
  schemaVersion: 'coverage-module-export/1'; requestId: string; scope: ModuleExportScope;
  ownerId: string; sessionId: string; mobileEpoch: number; sourceDigest: string;
  capturedAt: number; expiresAt: number; allUserDataCompleted: false;
}>;
type Limits = Readonly<{ pageSize: number; maxPages: number; maxRows: number; maxBytes: 1000000 }>;
export type ModuleExportBundle = Binding & Readonly<{
  kind: 'bundle'; sections: Readonly<Record<string, readonly unknown[]>>; limits: Limits;
  proof: Readonly<{ coverage: 'complete'; pages: number; rows: number }>;
}>;
export type ModuleExportRPC = (input: Readonly<Record<string, unknown>>, signal: AbortSignal) => Promise<unknown>;
const schema = 'coverage-module-export/1' as const;
const bindingKeys = ['schemaVersion','requestId','scope','ownerId','sessionId','mobileEpoch','sourceDigest','capturedAt','expiresAt','allUserDataCompleted'];
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const natural = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const sectionsFor = (scope: ModuleExportScope) => scope === 'notification-metadata/1' ? ['notifications'] : ['trips','operations'];
const limitsFor = (scope: ModuleExportScope): Limits => ({ pageSize: scope === 'notification-metadata/1' ? 100 : 50, maxPages: scope === 'notification-metadata/1' ? 100 : 400, maxRows: scope === 'notification-metadata/1' ? 10000 : 20000, maxBytes: 1000000 });
const validBinding = (v: Record<string, unknown>, now: number): boolean => v.schemaVersion === schema
  && [v.requestId,v.ownerId,v.sessionId].every(uuid) && ['notification-metadata/1','trip-lifecycle-metadata/1'].includes(String(v.scope))
  && positive(v.mobileEpoch) && hash(v.sourceDigest) && positive(v.capturedAt) && positive(v.expiresAt)
  && v.capturedAt <= now && v.expiresAt === v.capturedAt + 30000 && v.expiresAt > now && v.allUserDataCompleted === false;
const bound = (v: Record<string, unknown>, binding: Binding, now: number) => validBinding(v, now) && bindingKeys.every(k => v[k] === binding[k as keyof Binding]);
const limitValid = (v: unknown, scope: ModuleExportScope): v is Limits => record(v) && exact(v, ['pageSize','maxPages','maxRows','maxBytes'])
  && Object.entries(limitsFor(scope)).every(([k, expected]) => v[k] === expected);
function rowKey(section: string, row: unknown, owner: string): string | null {
  if (section === 'notifications') return notificationCoverageRow(row) ? String(row.key) : null;
  if (section === 'trips') return isLifecycleTrip(row) ? row.tripId : null;
  if (!record(row) || !exact(row, ['operationId','sessionId','receipt','erasedReason']) || !uuid(row.operationId)) return null;
  if (row.erasedReason !== null) return ['FORBIDDEN','MEMORY_CONFLICT'].includes(String(row.erasedReason)) && row.receipt === null && row.sessionId === null ? row.operationId : null;
  return uuid(row.sessionId) && isLifecycleReceipt(row.receipt) && row.receipt.ownerId === owner
    && row.receipt.operationId === row.operationId && row.receipt.sessionId === row.sessionId ? row.operationId : null;
}
function unavailable(): never { throw Error('COVERAGE_MODULE_UNAVAILABLE'); }

/** Consume every bounded section and current proof. A terminal page alone is not completion. */
export async function collectOwnerModule(scope: ModuleExportScope, requestId: string, actor: Readonly<{ ownerId: string; sessionId: string; mobileEpoch: number }>,
  rpc: ModuleExportRPC, signal: AbortSignal, current: () => Promise<boolean>, now: () => number = Date.now): Promise<ModuleExportBundle> {
  if (!uuid(requestId) || ![actor.ownerId,actor.sessionId].every(uuid) || !positive(actor.mobileEpoch)) unavailable();
  const invoke = async (input: Record<string, unknown>) => {
    if (signal.aborted || !await current()) unavailable();
    const value = await rpc(input, signal);
    if (signal.aborted || !await current()) unavailable();
    return value;
  };
  const start = await invoke({ action: 'start', requestId, scope, confirmed: true });
  if (!record(start) || !exact(start, [...bindingKeys,'kind','sections','limits']) || start.kind !== 'started' || !validBinding(start, now())
    || start.requestId !== requestId || start.scope !== scope || start.ownerId !== actor.ownerId || start.sessionId !== actor.sessionId || start.mobileEpoch !== actor.mobileEpoch
    || JSON.stringify(start.sections) !== JSON.stringify(sectionsFor(scope)) || !limitValid(start.limits, scope)) unavailable();
  const binding = Object.fromEntries(bindingKeys.map(k => [k,start[k]])) as Binding;
  const limits = start.limits as Limits; const sections: Record<string, unknown[]> = {}; let pages = 0, rows = 0;
  for (const section of sectionsFor(scope)) {
    const collected: unknown[] = []; let cursor: unknown = null; let last: string | null = null; let sectionPages = 0;
    for (;;) {
      if (now() >= binding.expiresAt || pages >= limits.maxPages) unavailable();
      const page = await invoke({ action: 'page', requestId, scope, section, cursor, limit: limits.pageSize });
      if (!record(page) || !exact(page, [...bindingKeys,'kind','section','items','hasMore','nextCursor','sectionComplete','pageNumber'])
        || page.kind !== 'page' || !bound(page, binding, now()) || page.section !== section || !Array.isArray(page.items) || page.items.length > limits.pageSize
        || typeof page.hasMore !== 'boolean' || page.sectionComplete !== !page.hasMore || page.pageNumber !== sectionPages + 1) unavailable();
      for (const row of page.items) {
        const key = rowKey(section, row, actor.ownerId); if (!key || last !== null && key <= last) unavailable(); last = key;
      }
      if (page.hasMore) {
        const key = section === 'notifications' ? 'afterKey' : 'afterId';
        if (page.items.length !== limits.pageSize || !record(page.nextCursor) || !exact(page.nextCursor, ['sourceDigest',key])
          || page.nextCursor.sourceDigest !== binding.sourceDigest || page.nextCursor[key] !== last) unavailable();
      } else if (page.nextCursor !== null) unavailable();
      collected.push(...page.items); pages++; sectionPages++; rows += page.items.length;
      if (collected.length > 10000 || rows > limits.maxRows) unavailable();
      sections[section] = collected;
      if (Buffer.byteLength(JSON.stringify(sections), 'utf8') > limits.maxBytes) unavailable();
      if (!page.hasMore) break;
      cursor = page.nextCursor;
    }
  }
  const proof = await invoke({ action: 'proof', requestId, scope });
  if (!record(proof) || !exact(proof, [...bindingKeys,'kind','coverage','pages','rows']) || proof.kind !== 'proof' || !bound(proof, binding, now())
    || proof.coverage !== 'complete' || proof.pages !== pages || proof.rows !== rows) unavailable();
  const bundle: ModuleExportBundle = { ...binding, kind: 'bundle', sections, limits, proof: { coverage: 'complete', pages, rows } };
  if (!decodeModuleExportBundle(bundle, now())) unavailable();
  return bundle;
}

export function decodeModuleExportBundle(v: unknown, now = Date.now()): ModuleExportBundle | null {
  if (!record(v) || !exact(v, [...bindingKeys,'kind','sections','limits','proof']) || v.kind !== 'bundle' || !validBinding(v, now)
    || !limitValid(v.limits, v.scope as ModuleExportScope) || !record(v.sections) || !exact(v.sections, sectionsFor(v.scope as ModuleExportScope))
    || !record(v.proof) || !exact(v.proof, ['coverage','pages','rows']) || v.proof.coverage !== 'complete' || !positive(v.proof.pages) || !natural(v.proof.rows)) return null;
  let rows = 0; let pages = 0;
  for (const [section, items] of Object.entries(v.sections)) {
    if (!Array.isArray(items) || items.length > 10000) return null;
    const keys = items.map(row => rowKey(section, row, String(v.ownerId)));
    if (keys.some((key, i) => !key || i > 0 && key <= String(keys[i-1]))) return null;
    rows += items.length; pages += Math.max(1, Math.ceil(items.length / v.limits.pageSize));
  }
  // The SQL producer uses a true sentinel, so minimal full-page traversal and
  // its terminal page must match the independently computed count.
  if (v.proof.rows !== rows || v.proof.pages !== pages || pages > v.limits.maxPages || rows > v.limits.maxRows
    || Buffer.byteLength(JSON.stringify({ data: v }), 'utf8') > v.limits.maxBytes) return null;
  return v as ModuleExportBundle;
}

/** New ordinary owner seam, default ACL still denies; no service-role lease or old job mutation. */
export async function ownerModuleExportHTTP(request: Request, scope: ModuleExportScope): Promise<Response> {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
  const fail = (code: string, status = 503) => reply({ error: { code } }, status);
  const config = getNativeRuntimeConfig(request, 'session'); if (!config || config.environment || process.env.VERCEL_ENV) return fail('COVERAGE_MODULE_UNAVAILABLE');
  if (request.method !== 'POST' || new URL(request.url).search || request.headers.has('cookie') || request.headers.has('origin')
    || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return fail('INVALID_INPUT', 400);
  const lifetime = nativeRequestScope(request.signal, 30000);
  try { return await lifetime.run(async () => {
    let input: unknown; try { input = JSON.parse(await lifetime.body(request, 4096) ?? ''); } catch { return fail('INVALID_INPUT', 400); }
    if (!record(input) || !exact(input, ['action','requestId','confirmed']) || input.action !== 'export' || !uuid(input.requestId) || input.confirmed !== true) return fail('INVALID_INPUT', 400);
    const credentials = await verifyNativeCredentials(request, config, lifetime.fetch, lifetime.unavailable); if (!credentials) return fail('UNAUTHENTICATED', 401);
    let epoch: number | undefined;
    const current = async () => {
      const r = await credentials.client.rpc('native_session_v2', { p_action: 'session' }).abortSignal(lifetime.signal);
      if (r.error || !record(r.data) || r.data.subject !== credentials.subject || r.data.sessionId !== credentials.sessionId || !positive(r.data.mobileEpoch)) return false;
      if (epoch === undefined) epoch = r.data.mobileEpoch; return epoch === r.data.mobileEpoch;
    };
    if (!await current()) return fail('SESSION_REPLACED', 401);
    const rpc: ModuleExportRPC = async (command, signal) => {
      const r = await credentials.client.rpc('privacy_coverage_module_export_v1', { p_input: command }).abortSignal(signal);
      if (r.error) {
        const code = r.error.message;
        throw Error(/^(COVERAGE_[A-Z_]+|UNAUTHENTICATED|SESSION_REPLACED|REAUTHENTICATION_REQUIRED|FORBIDDEN|INVALID_INPUT)$/.test(code) ? code : 'COVERAGE_MODULE_UNAVAILABLE');
      }
      return r.data;
    };
    const bundle = await collectOwnerModule(scope, input.requestId, { ownerId: credentials.subject, sessionId: credentials.sessionId, mobileEpoch: epoch! }, rpc, lifetime.signal, current);
    return reply({ data: bundle });
  }); } catch (error) {
    const code = error instanceof Error && /^[A-Z_]{1,100}$/.test(error.message) ? error.message : 'COVERAGE_MODULE_UNAVAILABLE';
    return fail(code, ['UNAUTHENTICATED','SESSION_REPLACED','REAUTHENTICATION_REQUIRED'].includes(code) ? 401 : code === 'FORBIDDEN' ? 403 : 503);
  } finally { lifetime.dispose(); }
}
