import {PLANNING_COMPARISON_PROMPT} from '../model-gateway/prompt/planning-comparison.ts';
import {CostGuard} from '../model-gateway/budget/index.ts';
import {runWithDurableBudget,type BudgetRpc,type BudgetAttempt} from '../model-gateway/budget/durable.ts';
import {invokePlanningComparisonProtocol,PROTOCOL_MODELS,type ProtocolTransport,type ProtocolUsage} from '../model-gateway/adapters/provider-protocol.ts';
import {validatedPlanningUsageReceipt,type RecordPlanningUsage} from '../model-gateway/budget/usage-receipt.ts';
import {createPlanningV2ModelOutputReceipt,type PlanningV2ModelOutputReceipt} from './planning-v2-model-output-receipt.ts';
import {decodePlanningV2Read,validPlanningV2Lease,type V2Lease} from './planning-intake-worker-protocol.ts';
import {createPlanningV2ModelRequest,type PlanningV2ModelRequestBinding} from './planning-v2-model-request.ts';
/** Trusted-host ports, never local fixture authorization or a qualification flag. */
export type PlanningV2ModelStepPorts=Readonly<{
 read:(lease:V2Lease,signal:AbortSignal)=>Promise<unknown>;
 authorize:(effect:'model_reserve'|'model_dispatch',binding:PlanningV2ModelRequestBinding,signal:AbortSignal)=>Promise<unknown>;
 bindReserved:(binding:PlanningV2ModelRequestBinding,signal:AbortSignal)=>Promise<unknown>;
 budgetForAttempt:(binding:PlanningV2ModelRequestBinding)=>BudgetRpc;transportForAttempt:(binding:PlanningV2ModelRequestBinding)=>ProtocolTransport;price:(usage:ProtocolUsage)=>number|null;
 recordUsage:RecordPlanningUsage;
 readOutput:(output:PlanningV2ModelOutputReceipt,signal:AbortSignal)=>Promise<unknown>;
 persistOutput:(output:PlanningV2ModelOutputReceipt,signal:AbortSignal)=>Promise<unknown>;
}>;
export type PlanningV2ModelStepInput=Readonly<{
 enabled?:boolean;lease:V2Lease;binding:PlanningV2ModelRequestBinding;
 reservedMicros:number;timeoutMs:number;maxOutputTokens:number;prompt:string;
}>;
const row=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fields=['owner','task','turn','lease','textPolicy','planningPolicy','scope','attempt','provider','model','priceVersion','intakeDigest','planningDigest'] as const;
/** Separate closed decision from current qualification. No false-readiness flag
 * or one-shot local fixture record is accepted as real effect authority. */
function authority(raw:unknown,effect:string,b:PlanningV2ModelRequestBinding):boolean{
 if(!row(raw)||Object.keys(raw).length!==4||raw.schemaVersion!=='planning-v2-effect-authority/1'||raw.kind!=='authorized'||raw.effect!==effect||!row(raw.binding))return false;
 const checked=raw.binding;return Object.keys(checked).length===fields.length&&fields.every(k=>checked[k]===b[k]);
}
function reservedBinding(raw:unknown,b:PlanningV2ModelRequestBinding,amount:number):boolean{
 if(!row(raw)||raw.kind!=='model_attempt_binding'||raw.schemaVersion!=='planning-v2-model-binding/1'||raw.ledgerStatus!=='reserved'||raw.reservedMicros!==amount||raw.actualMicros!==null||raw.unknown!==false||raw.reused!==false||raw.executionAllowed!==false||raw.executionAvailable!==false||raw.readyForProvider!==false)return false;
 const map={owner:'ownerId',task:'taskId',turn:'turnId',textPolicy:'textPolicyId',planningPolicy:'planningPolicyId',scope:'scopeId',attempt:'attemptId',provider:'provider',model:'model',priceVersion:'priceVersion',intakeDigest:'intakeContextDigest',planningDigest:'planningContextDigest'} as const;
 return Object.entries(map).every(([k,v])=>raw[v]===b[k as keyof typeof map]);
}
/** Executes at most one explicitly enabled, exact-bound attempt. Actual protocol
 * usage is priced and durably recorded before settlement. Missing/unknown output
 * ACK leaves accounting unresolved through the existing durable budget primitive.
 * No claim, scheduler, credential lookup, local-fake fallback or publisher. */
export async function runPlanningV2ModelStep(input:PlanningV2ModelStepInput,ports:PlanningV2ModelStepPorts,signal:AbortSignal){
 if(input.enabled!==true)return {kind:'disabled'} as const;
 const l=input.lease;
 const canonical=createPlanningV2ModelRequest({schemaVersion:'planning-v2-model-request/1',binding:input.binding,requestId:input.binding?.attempt,payload:{model:input.binding?.model,messages:[{role:'system',content:PLANNING_COMPARISON_PROMPT},{role:'user',content:input.prompt}],stream:false,max_tokens:input.maxOutputTokens,enable_thinking:false,response_format:{type:'json_object'}}},input.binding);if(!canonical)return {kind:'blocked'} as const;
 const b=canonical.binding;
 if(!validPlanningV2Lease(l)||signal.aborted||b.owner!==l.ownerId||b.task!==l.taskId||b.turn!==l.turnId||b.lease!==l.leaseToken||b.planningPolicy!==l.planningPolicyId||b.intakeDigest!==l.intakeContextDigest||b.planningDigest!==l.planningContextDigest||b.provider!=='qwen'||b.model!==PROTOCOL_MODELS.qwen
  ||!Number.isSafeInteger(input.reservedMicros)||input.reservedMicros<1||!Number.isSafeInteger(input.timeoutMs)||input.timeoutMs<1||input.timeoutMs>60000||!Number.isSafeInteger(input.maxOutputTokens)||input.maxOutputTokens<1||input.maxOutputTokens>4096||!input.prompt.trim()||input.prompt.length>32768)return {kind:'blocked'} as const;
 const current=async(s:AbortSignal)=>decodePlanningV2Read(await ports.read(l,s),l);
 let output:PlanningV2ModelOutputReceipt|null=null;
 try{
  const initial=await current(signal);if(!initial||!authority(await ports.authorize('model_reserve',b,signal),'model_reserve',b))return {kind:'blocked'} as const;
  const attempt:BudgetAttempt={scopeId:b.scope,ownerId:b.owner,taskId:b.task,attemptId:b.attempt,provider:b.provider,model:b.model,priceVersion:b.priceVersion,reservedMicros:input.reservedMicros,timeoutMs:input.timeoutMs};
  const guard=new CostGuard({windowMs:120000,perUserAttempts:8,perTaskAttempts:8,turnDeadlineMs:120000,maxModelSteps:1,maxToolSteps:4}).startTurn({userId:b.owner,taskId:b.task});if(guard.kind!=='turn')return {kind:'blocked'} as const;
  let dispatchAuthorized=false;
  const attemptBudget=ports.budgetForAttempt(b);
  const budget:BudgetRpc=async(name,p)=>{
   if(name==='dispatch_model_budget'&&(signal.aborted||!await current(signal)||!authority(await ports.authorize('model_dispatch',b,signal),'model_dispatch',b)))return {kind:'blocked'};
   if(name==='reserve_model_budget'&&(!await current(signal)||!authority(await ports.authorize('model_reserve',b,signal),'model_reserve',b)))return {kind:'blocked'};
   const result=await attemptBudget(name,p);
   if(name==='dispatch_model_budget')dispatchAuthorized=row(result)&&result.kind==='dispatched';
   if(name==='dispatch_model_budget'&&(signal.aborted||!await current(signal)||!authority(await ports.authorize('model_dispatch',b,signal),'model_dispatch',b)))return {kind:'blocked'};
   if(name==='reserve_model_budget'&&row(result)&&result.kind==='reserved'&&!reservedBinding(await ports.bindReserved(b,signal),b,input.reservedMicros))return {kind:'blocked'};
   return result;
  };
  const result=await runWithDurableBudget<Awaited<ReturnType<typeof invokePlanningComparisonProtocol>>>(attempt,budget,async s=>{
   const value=await invokePlanningComparisonProtocol({requestId:b.attempt,text:input.prompt},{provider:b.provider,endpoint:String(initial.endpoint),maxOutputTokens:input.maxOutputTokens,timeoutMs:input.timeoutMs},async()=>{if(!dispatchAuthorized)return false;dispatchAuthorized=false;return Boolean(await current(s));},guard,ports.transportForAttempt(b),s);
   if(value.kind!=='protocol_validated'||value.usage.inputTokens>1048576||value.usage.outputTokens>input.maxOutputTokens)return {value,actualMicros:null};
   const actual=ports.price(value.usage);if(actual===null)return {value,actualMicros:null};
   const observedAt=new Date().toISOString(),receipt=validatedPlanningUsageReceipt({schemaVersion:'validated-planning-usage/1',attempt,turnId:b.turn,policyId:b.planningPolicy,usage:value.usage,actualMicros:actual,observedAt},{taskId:b.task,turnId:b.turn,planningPolicyId:b.planningPolicy});
   await ports.recordUsage(receipt,s);
   output=createPlanningV2ModelOutputReceipt({schemaVersion:'planning-v2-model-output/1',binding:b,usageReceipt:receipt,output:value.output,observedAt},b);if(!output)throw Error('Planning output unavailable');
   let saved:unknown;try{saved=await ports.persistOutput(output,s);}catch{saved=await ports.readOutput(output,s);}
   if(!row(saved)||Object.keys(saved).length!==4||saved.kind!=='output_recorded'||!row(saved.binding)||Object.keys(saved.binding).length!==fields.length||!fields.every(k=>(saved.binding as Record<string,unknown>)[k]===b[k])||saved.outputDigest!==output.outputDigest||saved.usageDigest!==output.usageDigest)throw Error('Planning output acknowledgement unknown');
   return {value,actualMicros:actual};
  },signal);
  return result.kind==='completed'&&result.accounting==='settled'&&output?{kind:'settled',output} as const:{kind:'unknown'} as const;
 }catch{return {kind:'unknown'} as const;}
}
