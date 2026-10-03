import { getNativeRuntimeConfig, nativeTargetAllowed, type NativeConfig } from '../identity/native-config.ts';
import { verifyNativeCredentials } from '../identity/native-credentials.ts';
import { nativeRequestScope } from '../identity/native-request.ts';
import { isUuid } from '../identity/request-guards.ts';

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const reply = (v: unknown, status = 200) => Response.json(v, { status, headers: { 'Cache-Control': 'private, no-store' } });
class MemoryHTTPError extends Error {}
const failure = (code: string) => reply({ error: { code } }, code === 'INVALID_INPUT' ? 400 : code === 'UNAUTHENTICATED' ? 401 : code === 'FORBIDDEN' ? 403 : ['CONSENT_REQUIRED','MEMORY_CONFLICT','MEMORY_OPERATION_REUSE','MEMORY_ID_REUSE','MEMORY_UNDO_EXPIRED','TERMINAL_MEMORY','INVALID_MEMORY_TRANSITION'].includes(code) ? 409 : 503);
const mapped = (message: string) => ['UNAUTHENTICATED','SESSION_REPLACED'].includes(message) ? 'UNAUTHENTICATED' : ['FORBIDDEN','CONSENT_REQUIRED','MEMORY_CONFLICT','MEMORY_OPERATION_REUSE','MEMORY_ID_REUSE','INVALID_INPUT','MEMORY_UNDO_EXPIRED','TERMINAL_MEMORY','INVALID_MEMORY_TRANSITION'].includes(message) ? message : 'UNAVAILABLE';

/** Management only. Context consumers must use the authoritative retrieval projection. */
export async function nativeMemoryProfilesHTTP(request: Request, config: NativeConfig | null = getNativeRuntimeConfig(request, 'trip')): Promise<Response> {
  if (!config || !nativeTargetAllowed(config, request)) return failure('UNAVAILABLE');
  if (request.headers.has('cookie') || request.headers.has('origin') || new URL(request.url).search || !['GET','POST'].includes(request.method)) return failure('INVALID_INPUT');
  const scope = nativeRequestScope(request.signal);
  try {
    let input: Record<string, unknown> | null = null;
    if (request.method === 'POST') {
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return failure('INVALID_INPUT');
      const body = await scope.body(request, 4096);
      try { const parsed: unknown = JSON.parse(body ?? ''); if (record(parsed)) input = parsed; } catch { /* invalid JSON */ }
      if (!validNativeMemoryCommand(input)) return failure('INVALID_INPUT');
    }
    const actor = await scope.run(() => verifyNativeCredentials(request, config, scope.fetch, scope.unavailable));
    scope.check();
    if (!actor) return failure('UNAUTHENTICATED');
    const rpc = (name: string, args: Record<string, unknown>) => scope.run(() => actor.client.rpc(name, args).abortSignal(scope.signal));
    const session = async () => {
      const r = await rpc('native_session_v2', { p_action: 'session' });
      if (r.error) throw new MemoryHTTPError(mapped(r.error.message));
      if (!record(r.data) || typeof r.data.subject !== 'string' || !isUuid(r.data.subject) || typeof r.data.sessionId !== 'string' || !isUuid(r.data.sessionId)) throw new MemoryHTTPError('UNAVAILABLE');
      if (r.data.subject !== actor.subject || r.data.sessionId !== actor.sessionId) throw new MemoryHTTPError('UNAUTHENTICATED');
    };
    await session();
    const read = async (id?: string) => {
      let query = actor.client.from('memory_profiles').select('id,owner_id,revision,state,constraint_kind,summary,source_receipt_id,consent_id,created_at,updated_at').eq('owner_id', actor.subject).order('id').limit(101);
      if (id) query = query.eq('id', id);
      const p = await scope.run(() => query.abortSignal(scope.signal));
      const c = await scope.run(() => actor.client.from('memory_consents').select('id,owner_id,status').eq('owner_id', actor.subject).in('id', (p.data ?? []).map(v => v.consent_id)).abortSignal(scope.signal));
      if (p.error || c.error || !Array.isArray(p.data) || p.data.length > 100 || !Array.isArray(c.data)) throw new MemoryHTTPError('UNAVAILABLE');
      return p.data.map(v => {
        const consent = c.data.find(c => c.id === v.consent_id && c.owner_id === actor.subject);
        if (v.owner_id !== actor.subject || !isUuid(v.id) || !isUuid(v.source_receipt_id) || !isUuid(v.consent_id) || !Number.isSafeInteger(v.revision) || v.revision < 1 || !['explicit','confirmed','inferred','rejected','paused','deleted'].includes(v.state) || !['preference','hard_constraint'].includes(v.constraint_kind) || !consent || !['granted','revoked'].includes(consent.status) || typeof v.created_at !== 'string' || typeof v.updated_at !== 'string' || (v.state === 'deleted' ? v.summary !== null : typeof v.summary !== 'string' || v.summary.length < 1 || v.summary.length > 500)) throw new MemoryHTTPError('UNAVAILABLE');
        return { id:v.id,revision:v.revision,state:v.state,constraintKind:v.constraint_kind,summary:v.state === 'deleted' || consent.status === 'revoked' ? null : v.summary,sourceReceiptId:v.source_receipt_id,consentId:v.consent_id,consentStatus:consent.status,createdAt:v.created_at,updatedAt:v.updated_at };
      });
    };
    let value: unknown;
    if (!input) {
      const profiles = await read();
      const current = await read();
      if (JSON.stringify(profiles) !== JSON.stringify(current)) throw new MemoryHTTPError('MEMORY_CONFLICT');
      value = { version:1,ownerId:actor.subject,profiles };
    } else {
      const r = await rpc('native_memory_command_v1', {p_input:input});
      await session();
      if (r.error) throw new MemoryHTTPError(mapped(r.error.message));
      const receipt = r.data;
      if (!record(receipt) || !exact(receipt,['version','ownerId','action','operationId','memoryId','consentId','sourceReceiptId','revision','state','reused','undoAvailable']) || receipt.version!==1 || receipt.ownerId!==actor.subject || receipt.operationId!==input.operationId || receipt.action!==input.action || typeof receipt.reused!=='boolean' || typeof receipt.undoAvailable!=='boolean' || typeof receipt.consentId!=='string' || !isUuid(receipt.consentId)) throw new MemoryHTTPError('UNAVAILABLE');
      const consentCreate=input.action==='consentCreate';
      if (consentCreate ? receipt.memoryId!==null || receipt.sourceReceiptId!==null || receipt.revision!==null || receipt.state!==null || receipt.undoAvailable!==false : receipt.memoryId!==input.memoryId || receipt.sourceReceiptId!==(input.action==='create'?input.receiptId:input.sourceReceiptId) || !Number.isSafeInteger(receipt.revision) || Number(receipt.revision)<1 || !['explicit','confirmed','inferred','rejected','paused','deleted'].includes(String(receipt.state))) throw new MemoryHTTPError('UNAVAILABLE');
      if(input.action==='createUndo'&&(receipt.state!=='deleted'||receipt.revision!==2||receipt.undoAvailable!==false)) throw new MemoryHTTPError('UNAVAILABLE');
      if(['update','updateUndo'].includes(String(input.action))&&(!['explicit','confirmed'].includes(String(receipt.state))||receipt.revision!==Number(input.expectedRevision)+1)) throw new MemoryHTTPError('UNAVAILABLE');
      if(input.action==='revoke'&&(receipt.revision!==input.expectedRevision||receipt.undoAvailable!==false)) throw new MemoryHTTPError('UNAVAILABLE');
      const profiles=consentCreate?[]:await read(input.memoryId as string);
      if (!consentCreate && profiles.length!==1) throw new MemoryHTTPError('MEMORY_CONFLICT');
      const current=consentCreate?[]:await read(input.memoryId as string);
      if(JSON.stringify(profiles)!==JSON.stringify(current)) throw new MemoryHTTPError('MEMORY_CONFLICT');
      const p=profiles[0];
      const undoAvailable=receipt.undoAvailable && !!p && p.revision===receipt.revision && p.sourceReceiptId===receipt.sourceReceiptId && p.state===receipt.state && p.consentStatus==='granted' && ['explicit','confirmed'].includes(p.state);
      value = {version:1,receipt:{...receipt,undoAvailable},profiles};
    }
    await session();
    return reply(value, 200);
  } catch (e) { return failure(e instanceof MemoryHTTPError ? e.message : 'UNAVAILABLE'); }
  finally { scope.dispose(); }
}

export function validNativeMemoryCommand(input: unknown): input is Record<string, unknown> {
  if(!record(input))return false;
  const keys:Record<string,string[]>={consentCreate:['operationId'],create:['operationId','memoryId','receiptId','consentId','constraintKind','summary','saveLongTerm'],createUndo:['operationId','memoryId','sourceReceiptId','expectedRevision'],update:['operationId','memoryId','sourceReceiptId','expectedRevision','summary','saveLongTerm'],updateUndo:['operationId','memoryId','sourceReceiptId','expectedRevision','updateOperationId'],state:['operationId','memoryId','sourceReceiptId','expectedRevision','state'],revoke:['operationId','memoryId','sourceReceiptId','expectedRevision']};
  const fields=typeof input.action==='string'&&Object.hasOwn(keys,input.action)?keys[input.action]:null;
  if(!fields||!exact(input,['action',...fields]))return false;
  for(const k of fields.filter(k=>k.endsWith('Id')))if(typeof input[k]!=='string'||!isUuid(input[k] as string)||input[k]!==String(input[k]).toLowerCase())return false;
  if(fields.includes('expectedRevision')&&(!Number.isSafeInteger(input.expectedRevision)||Number(input.expectedRevision)<1||Number(input.expectedRevision)>9007199254740990))return false;
  if(input.action==='createUndo'&&input.expectedRevision!==1)return false;
  if(fields.includes('summary')&&(typeof input.summary!=='string'||[...input.summary.trim()].length<1||[...input.summary.trim()].length>500||input.saveLongTerm!==true))return false;
  if(input.action==='create'&&!['preference','hard_constraint'].includes(String(input.constraintKind)))return false;
  if(input.action==='state'&&!['explicit','confirmed','rejected','paused','deleted'].includes(String(input.state)))return false;
  return true;
}
