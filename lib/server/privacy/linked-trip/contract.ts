import { isUuid } from '../../identity/request-guards.ts';
export const selectionKeys = ['threadIds','turnIds','taskIds','goalIds','messageIds','artifactIds','exportRequestIds'] as const;
const retainedKeys=['FINANCIAL_LEDGER_MINIMUM','TASK_CAPACITY_MINIMUM','EXTERNAL_DOWNLOADED_COPIES','PROVIDER_COPIES_NOT_ERASED','BACKUP_ERASURE_NOT_VERIFIED'];
const conflictKeys=['SCOPE_TOO_LARGE','SHARED_OR_FOREIGN_CHAT','SHARED_TASK','SHARED_GOAL','SHARED_MESSAGE','SHARED_ARTIFACT','ACTIVE_WORK','CROSS_SCOPE_REFERENCE'];
const countKeys=['threads','turns','tasks','goals','messages','artifacts','exports'];
const erasedKeys=['threads','turns','goals','messages','artifacts','textBodies','groundedRows','planningRows','consumerReferences','exports','tickets'];
export type LinkedSelection = Record<(typeof selectionKeys)[number], string[]>;
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:readonly string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const uuid=(v:unknown):v is string=>typeof v==='string'&&isUuid(v)&&v===v.toLowerCase();
export function linkedSelection(v:unknown):v is LinkedSelection {
  if(!record(v)||!exact(v,selectionKeys))return false;
  return selectionKeys.every(k=>{const values=v[k];return Array.isArray(values)&&values.length<=(k==='threadIds'||k==='exportRequestIds'?100:1000)&&values.every(uuid)&&new Set(values).size===values.length&&values.every((id:string,i:number)=>i===0||values[i-1]<id);})&&selectionKeys.reduce((n,k)=>n+(v[k] as string[]).length,0)<=4100;
}

const counts=(v:unknown,keys:string[])=>record(v)&&exact(v,keys)&&keys.every(k=>Number.isSafeInteger(v[k])&&Number(v[k])>=0&&Number(v[k])<=10000);
const retained=(v:unknown)=>Array.isArray(v)&&v.length===retainedKeys.length&&v.every((x,i)=>x===retainedKeys[i]);
export function linkedTripCommand(v:unknown):v is Record<string,unknown> {
  if(!record(v))return false;
  if(v.action==='preview')return exact(v,['action','tripId','expectedVersion'])&&uuid(v.tripId)&&Number.isSafeInteger(v.expectedVersion)&&Number(v.expectedVersion)>=0&&Number(v.expectedVersion)<=999999999;
  return v.action==='confirm'&&exact(v,['action','requestId','planId','scopeDigest','expectedVersion','confirmed','selection'])&&uuid(v.requestId)&&uuid(v.planId)&&typeof v.scopeDigest==='string'&&/^[a-f0-9]{64}$/.test(v.scopeDigest)&&Number.isSafeInteger(v.expectedVersion)&&Number(v.expectedVersion)>=0&&Number(v.expectedVersion)<=999999999&&v.confirmed===true&&linkedSelection(v.selection);
}
export function linkedTripReceipt(v:unknown):v is Record<string,unknown> {
  return record(v)&&exact(v,['kind','requestId','planId','tripId','scope','scopeDigest','state','requestedAt','completedAt','selection','erasedCounts','allUserDataCompleted','retained'])&&v.kind==='linked_trip_delete_receipt/1'&&[v.requestId,v.planId,v.tripId].every(uuid)&&v.scope==='trip-linked-chat-d3/1'&&typeof v.scopeDigest==='string'&&/^[a-f0-9]{64}$/.test(v.scopeDigest)&&['queued','completed'].includes(String(v.state))&&typeof v.requestedAt==='string'&&Number.isFinite(Date.parse(v.requestedAt))&&(v.state==='queued'?v.completedAt===null&&v.erasedCounts===null:typeof v.completedAt==='string'&&Number.isFinite(Date.parse(v.completedAt))&&counts(v.erasedCounts,erasedKeys))&&linkedSelection(v.selection)&&v.allUserDataCompleted===false&&retained(v.retained);
}
export function linkedTripPlan(v:unknown):v is Record<string,unknown> {
  return record(v)&&exact(v,['kind','planId','tripId','title','expectedVersion','scopeDigest','expiresAt','selection','counts','conflicts','retained'])&&v.kind==='linked_trip_delete_plan/1'&&uuid(v.planId)&&uuid(v.tripId)&&typeof v.title==='string'&&typeof v.scopeDigest==='string'&&/^[a-f0-9]{64}$/.test(v.scopeDigest)&&Number.isSafeInteger(v.expectedVersion)&&Number(v.expectedVersion)>=0&&typeof v.expiresAt==='string'&&Number.isFinite(Date.parse(v.expiresAt))&&linkedSelection(v.selection)&&counts(v.counts,countKeys)&&Array.isArray(v.conflicts)&&v.conflicts.every(x=>conflictKeys.includes(x))&&new Set(v.conflicts).size===v.conflicts.length&&retained(v.retained);
}
