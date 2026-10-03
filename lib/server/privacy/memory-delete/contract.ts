import { isUuid } from '../../identity/request-guards.ts';
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:readonly string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const uuid=(v:unknown):v is string=>typeof v==='string'&&isUuid(v)&&v===v.toLowerCase();
const digest=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const positive=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>0&&Number(v)<=9007199254740990;
const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const arrayKeys=['consumerReferenceIds','artifactIds','generatedTurnIds','exportRequestIds'] as const;
const retainedKeys=['FINANCIAL_RECORDS','USER_TRIP_INTENT','ORIGINAL_CHAT_INPUT','EXTERNAL_COPIES','PROVIDER_ERASURE_UNKNOWN','BACKUP_ERASURE_NOT_VERIFIED'];
const conflicts=['SCOPE_TOO_LARGE','TERMINAL_MEMORY','FOREIGN_REFERENCE','ACTIVE_WORK','CROSS_SCOPE_REFERENCE'];
const retained=(v:unknown)=>Array.isArray(v)&&v.length===retainedKeys.length&&v.every((x,i)=>x===retainedKeys[i]);
const sorted=(a:string[])=>a.every((x,i)=>i===0||a[i-1]<x);
export type MemoryDeleteSelection={memories:{memoryId:string;revision:number;sourceReceiptId:string}[]} & Record<(typeof arrayKeys)[number],string[]>;
export function memoryDeleteSelection(v:unknown):v is MemoryDeleteSelection {
 if(!record(v)||!exact(v,['memories',...arrayKeys])||!Array.isArray(v.memories)||v.memories.length>100||!v.memories.every(m=>record(m)&&exact(m,['memoryId','revision','sourceReceiptId'])&&uuid(m.memoryId)&&uuid(m.sourceReceiptId)&&positive(m.revision))||!sorted(v.memories.map(m=>m.memoryId)))return false;
 return arrayKeys.every(k=>Array.isArray(v[k])&&v[k].length<=(k==='exportRequestIds'?100:1000)&&v[k].every(uuid)&&sorted(v[k]))&&arrayKeys.reduce((n,k)=>n+(v[k] as string[]).length,0)<=3100;
}
export function memoryDeleteCommand(v:unknown):v is Record<string,unknown> {
 if(!record(v))return false;
 if(v.action==='preview')return exact(v,['action','memoryIds'])&&Array.isArray(v.memoryIds)&&v.memoryIds.length>=1&&v.memoryIds.length<=5000&&v.memoryIds.every(uuid)&&new Set(v.memoryIds).size===v.memoryIds.length;
 return v.action==='confirm'&&exact(v,['action','requestId','planId','scopeDigest','confirmed','selection'])&&uuid(v.requestId)&&uuid(v.planId)&&digest(v.scopeDigest)&&v.confirmed===true&&memoryDeleteSelection(v.selection)&&v.selection.memories.length>0;
}
export type MemoryDeletePlan=Record<string,unknown>&{selection:MemoryDeleteSelection;conflicts:string[]};
export function memoryDeletePlan(v:unknown):v is MemoryDeletePlan {
 if(!record(v)||!exact(v,['kind','planId','sourceRevision','scopeDigest','expiresAt','selection','counts','conflicts','retained'])||v.kind!=='memory_delete_plan/1'||!uuid(v.planId)||!positive(v.sourceRevision)||!digest(v.scopeDigest)||!date(v.expiresAt)||!memoryDeleteSelection(v.selection)||!retained(v.retained)||!Array.isArray(v.conflicts)||!v.conflicts.every(x=>conflicts.includes(x))||new Set(v.conflicts).size!==v.conflicts.length||!record(v.counts)||!exact(v.counts,['memories','consumerReferences','artifacts','generatedTurns','exports']))return false;
 const s=v.selection;return v.counts.memories===s.memories.length&&v.counts.consumerReferences===s.consumerReferenceIds.length&&v.counts.artifacts===s.artifactIds.length&&v.counts.generatedTurns===s.generatedTurnIds.length&&v.counts.exports===s.exportRequestIds.length&&(v.conflicts.includes('SCOPE_TOO_LARGE')?Object.values(v.counts).every(x=>x===0):s.memories.length>0);
}
export function memoryDeleteReceipt(v:unknown):v is Record<string,unknown>&{selection:MemoryDeleteSelection} {
 if(!record(v)||!exact(v,['kind','requestId','planId','scope','scopeDigest','state','sourceTombstoned','cleanupPending','requestedAt','completedAt','selection','deletedRevisions','erasedCounts','allUserDataCompleted','retained'])||v.kind!=='memory_delete_receipt/1'||!uuid(v.requestId)||!uuid(v.planId)||v.scope!=='memory-bulk-delete-d4/1'||!digest(v.scopeDigest)||v.sourceTombstoned!==true||v.allUserDataCompleted!==false||!date(v.requestedAt)||!memoryDeleteSelection(v.selection)||!v.selection.memories.length||!retained(v.retained)||!Array.isArray(v.deletedRevisions)||v.deletedRevisions.length!==v.selection.memories.length)return false;
 const memories=v.selection.memories;
 if(!v.deletedRevisions.every((m,i)=>record(m)&&exact(m,['memoryId','revision'])&&m.memoryId===memories[i].memoryId&&positive(m.revision)&&m.revision===memories[i].revision+1))return false;
 if(v.state==='queued')return v.cleanupPending===true&&v.completedAt===null&&v.erasedCounts===null;
 if(v.state!=='completed'||v.cleanupPending!==false||!date(v.completedAt)||!record(v.erasedCounts)||!exact(v.erasedCounts,['consumerReferences','artifacts','generatedOutputs','exports','tickets']))return false;
 const e=v.erasedCounts,s=v.selection;return e.consumerReferences===s.consumerReferenceIds.length&&e.artifacts===s.artifactIds.length&&e.generatedOutputs===s.generatedTurnIds.length&&e.exports===s.exportRequestIds.length&&Number.isSafeInteger(e.tickets)&&Number(e.tickets)>=0;
}

export function selectionEqual(a:unknown,b:unknown):boolean {
 if(!memoryDeleteSelection(a)||!memoryDeleteSelection(b))return false;
 return a.memories.length===b.memories.length&&a.memories.every((m,i)=>m.memoryId===b.memories[i].memoryId&&m.revision===b.memories[i].revision&&m.sourceReceiptId===b.memories[i].sourceReceiptId)&&arrayKeys.every(k=>a[k].length===b[k].length&&a[k].every((id,i)=>id===b[k][i]));
}
