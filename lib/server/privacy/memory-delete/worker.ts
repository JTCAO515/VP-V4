import { isUuid } from '../../identity/request-guards.ts';
import { memoryDeleteSelection,memoryDeleteReceipt } from './contract.ts';
type RPC=(action:string,input:Record<string,unknown>,signal:AbortSignal)=>Promise<unknown>;
/** Explicitly enabled server port only; no scheduler, credential lookup or SQL permission grant. */
export async function executeMemoryDeletion(requestId:string,rpc:RPC,signal:AbortSignal,enabled=false):Promise<'disabled'|'blocked'|'queued'|'completed'> {
 if(enabled!==true)return 'disabled';if(!isUuid(requestId)||signal.aborted)return 'blocked';
 try{
  const lease=await rpc('claim',{requestId,operationId:crypto.randomUUID()},signal);
  if(memoryDeleteReceipt(lease)&&lease.requestId===requestId&&lease.state==='completed')return 'completed';
  if(!lease||typeof lease!=='object'||Array.isArray(lease))return 'blocked';const v=lease as Record<string,unknown>;
  if(Object.keys(v).sort().join(',')!==['kind','requestId','leaseId','expiresAt','reused','scopeDigest','selection'].sort().join(',')||typeof v.reused!=='boolean'||typeof v.scopeDigest!=='string'||!/^[a-f0-9]{64}$/.test(v.scopeDigest)||!memoryDeleteSelection(v.selection)||v.kind!=='leased'||v.requestId!==requestId||typeof v.leaseId!=='string'||!isUuid(v.leaseId)||typeof v.expiresAt!=='string'||!Number.isFinite(Date.parse(v.expiresAt))||Date.parse(v.expiresAt)<=Date.now())return 'blocked';
  const input={requestId,leaseId:v.leaseId};let result:unknown;
  try{result=await rpc('execute',input,signal);}catch{if(signal.aborted)return 'queued';result=await rpc('execute',input,signal);}
  return memoryDeleteReceipt(result)&&result.requestId===requestId&&result.state==='completed'&&result.scopeDigest===v.scopeDigest&&JSON.stringify(result.selection)===JSON.stringify(v.selection)?'completed':'queued';
 }catch{return 'queued';}
}
