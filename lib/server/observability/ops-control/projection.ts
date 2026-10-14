import { CAPABILITIES, CITIES, CONTROL_SCHEMA, PROVIDERS, exact, parseControlScope, record, revision, uuid, type ControlInput, type ControlScope } from './contract.ts';
export type SessionFence = Readonly<{sessionId:string;sessionEpoch:string}>;
export type ControlEntry = Readonly<{scope:ControlScope;state:'disabled'|'enabled';revision:number;stopRevision:number}>;
export type ControlWorkspace = SessionFence & Readonly<{
 schemaVersion:typeof CONTROL_SCHEMA;revision:number;observedAt:string;controls:readonly ControlEntry[];
 registry:Readonly<{capabilities:readonly string[];providers:readonly string[];cities:readonly string[]}>;recoveryReady:boolean;
}>;
export type ControlReceipt = SessionFence & Readonly<{
 schemaVersion:typeof CONTROL_SCHEMA;operationId:string;revision:number;stopRevision:number;appliedAt:string;acknowledgement:'applied';
}> & (Readonly<{action:'set';scope:ControlScope;state:'disabled'|'enabled';effect:'blocks_new_dispatch'|'permits_fresh_authorization'}> |
 Readonly<{action:'budget_resume';scopeId:string;effect:'permits_fresh_budget_authorization'}>);
export const BUDGET_ELIGIBILITY=['eligible','not_stopped','unresolved','expired','exhausted','provider_unavailable','retired','recovery_unavailable'] as const;
export type ControlBudget = SessionFence & Readonly<{schemaVersion:typeof CONTROL_SCHEMA;action:'budget_read';scopeId:string;revision:number;stopRevision:number;enabled:boolean;frozen:boolean;expiresAt:string;exposureMicros:string;unresolvedAttempts:number;eligibility:typeof BUDGET_ELIGIBILITY[number]}>;
const decimal=(v:unknown):v is string=>typeof v==='string'&&/^(0|[1-9][0-9]{0,39})$/.test(v);
const instant=(v:unknown):v is string=>{
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(v))return false;
 const n=Date.parse(v);return Number.isFinite(n)&&new Date(n).toISOString().slice(0,23)===v.slice(0,23);
};
const fenceKeys=['schemaVersion','sessionId','sessionEpoch'];
const fence=(v:Record<string,unknown>):v is Record<string,unknown>&SessionFence=>v.schemaVersion===CONTROL_SCHEMA&&uuid(v.sessionId)&&decimal(v.sessionEpoch);
export const sameFence=(a:SessionFence,b:SessionFence)=>a.sessionId===b.sessionId&&a.sessionEpoch===b.sessionEpoch;
const validRevisions=(v:Record<string,unknown>)=>revision(v.revision)&&revision(v.stopRevision)&&v.stopRevision<=v.revision;
function keys(v:unknown,allowed:readonly string[]):v is string[]{
 return Array.isArray(v)&&v.length<=allowed.length&&v.every((k,i)=>typeof k==='string'&&allowed.includes(k)&&(i===0||v[i-1]<k));
}
export function decodeWorkspace(v:unknown):ControlWorkspace|null{
 if(!record(v)||!exact(v,[...fenceKeys,'revision','observedAt','controls','registry','recoveryReady'])||!fence(v)||!revision(v.revision)||!instant(v.observedAt)||typeof v.recoveryReady!=='boolean'||!record(v.registry)||!exact(v.registry,['capabilities','providers','cities'])||!keys(v.registry.capabilities,CAPABILITIES)||!keys(v.registry.providers,PROVIDERS)||!keys(v.registry.cities,CITIES)||!Array.isArray(v.controls)||v.controls.length>12)return null;
 const registry={capabilities:v.registry.capabilities,providers:v.registry.providers,cities:v.registry.cities};
 const entries:ControlEntry[]=[];const seen=new Set<string>();
 for(const raw of v.controls){
  if(!record(raw)||!exact(raw,['scope','state','revision','stopRevision'])||!validRevisions(raw)||Number(raw.revision)>v.revision||(raw.state!=='disabled'&&raw.state!=='enabled'))return null;
  const scope=parseControlScope(raw.scope);if(!scope)return null;
  const group=scope.kind==='capability'?registry.capabilities:scope.kind==='provider'?registry.providers:registry.cities;
  const key=scope.kind+':'+scope.key;if(!group.includes(scope.key)||seen.has(key))return null;seen.add(key);
  entries.push({scope,state:raw.state,revision:Number(raw.revision),stopRevision:Number(raw.stopRevision)});
 }
 if(entries.length!==registry.capabilities.length+registry.providers.length+registry.cities.length)return null;
 return {schemaVersion:CONTROL_SCHEMA,sessionId:v.sessionId,sessionEpoch:v.sessionEpoch,revision:v.revision,observedAt:v.observedAt,controls:entries,registry,recoveryReady:v.recoveryReady};
}
export function decodeReceipt(v:unknown):ControlReceipt|null{
 if(!record(v)||!fence(v)||!validRevisions(v)||!uuid(v.operationId)||!instant(v.appliedAt)||v.acknowledgement!=='applied')return null;
 const common={schemaVersion:CONTROL_SCHEMA,sessionId:v.sessionId,sessionEpoch:v.sessionEpoch,operationId:v.operationId,revision:Number(v.revision),stopRevision:Number(v.stopRevision),appliedAt:v.appliedAt,acknowledgement:'applied' as const};
 if(v.action==='set'&&exact(v,[...fenceKeys,'operationId','action','scope','state','revision','stopRevision','appliedAt','acknowledgement','effect'])&&(v.state==='disabled'||v.state==='enabled')&&v.effect===(v.state==='disabled'?'blocks_new_dispatch':'permits_fresh_authorization')){
  const scope=parseControlScope(v.scope);if(scope)return {...common,action:'set',scope,state:v.state,effect:v.state==='disabled'?'blocks_new_dispatch':'permits_fresh_authorization'};
 }
 if(v.action==='budget_resume'&&exact(v,[...fenceKeys,'operationId','action','scopeId','revision','stopRevision','appliedAt','acknowledgement','effect'])&&uuid(v.scopeId)&&v.effect==='permits_fresh_budget_authorization')return {...common,action:v.action,scopeId:v.scopeId,effect:v.effect};
 return null;
}
export function decodeBudget(v:unknown):ControlBudget|null{
 if(!record(v)||!exact(v,[...fenceKeys,'action','scopeId','revision','stopRevision','enabled','frozen','expiresAt','exposureMicros','unresolvedAttempts','eligibility'])||!fence(v)||v.action!=='budget_read'||!uuid(v.scopeId)||!validRevisions(v)||typeof v.enabled!=='boolean'||typeof v.frozen!=='boolean'||!instant(v.expiresAt)||!decimal(v.exposureMicros)||!revision(v.unresolvedAttempts)||typeof v.eligibility!=='string'||!BUDGET_ELIGIBILITY.includes(v.eligibility as typeof BUDGET_ELIGIBILITY[number]))return null;
 if(v.eligibility==='eligible'&&(v.unresolvedAttempts!==0||v.enabled&&!v.frozen))return null;
 return {schemaVersion:CONTROL_SCHEMA,sessionId:v.sessionId,sessionEpoch:v.sessionEpoch,action:v.action,scopeId:v.scopeId,revision:Number(v.revision),stopRevision:Number(v.stopRevision),enabled:v.enabled,frozen:v.frozen,expiresAt:v.expiresAt,exposureMicros:v.exposureMicros,unresolvedAttempts:v.unresolvedAttempts,eligibility:v.eligibility as ControlBudget['eligibility']};
}
export function receiptMatches(input:ControlInput,r:ControlReceipt):boolean{
 if(input.action==='receipt')return input.operationId===r.operationId;
 if(input.action==='set')return r.action==='set'&&input.operationId===r.operationId&&input.state===r.state&&input.scope.kind===r.scope.kind&&input.scope.key===r.scope.key;
 return input.action==='budget_resume'&&r.action==='budget_resume'&&input.operationId===r.operationId&&input.scopeId===r.scopeId;
}
