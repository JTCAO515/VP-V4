import {createHash,randomUUID} from 'node:crypto';
import {decodePlanningV2Read,decodePlanningV2Checkpoints,validPlanningV2Lease,validPlanningV2PreparedProjection,type V2Lease} from './planning-intake-worker-protocol.ts';
import {runPlanningV2ModelStep,type PlanningV2ModelStepPorts} from './planning-v2-model-step.ts';
import {parsePlanningV2ModelOutputReceipt,type PlanningV2ModelOutputReceipt} from './planning-v2-model-output-receipt.ts';
import {PROTOCOL_MODELS} from '../model-gateway/adapters/provider-protocol.ts';
import type {PlanningV2ModelRequestBinding} from './planning-v2-model-request.ts';
type Row=Record<string,unknown>;
export type PlanningV2ExecutionExpectation=Readonly<{profileId:string;providerConfigurationId:string;providerConfigurationVersion:number;endpoint:string;inputMicrosPerMillion:number;cachedInputMicrosPerMillion:number|null;outputMicrosPerMillion:number}>;
export type PlanningV2WorkerConfig=Readonly<{enabled?:boolean;execution:PlanningV2ExecutionExpectation;ownerId:string;planningPolicyId:string;textPolicyId:string;scopeId:string;priceVersion:string;reservedMicros:number;timeoutMs:number;maxOutputTokens:number}>;
export type PlanningV2WorkerPorts=Readonly<{
 rpc:(name:string,parameters:Readonly<Row>,signal:AbortSignal)=>Promise<unknown>;
 model:PlanningV2ModelStepPorts;
 place:(signal:AbortSignal,beforeRequest:()=>Promise<void>)=>Promise<unknown>;
 now:()=>number;
}>;
const row=(v:unknown):v is Row=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Row,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const six=(l:V2Lease)=>({p_owner:l.ownerId,p_task:l.taskId,p_turn:l.turnId,p_lease:l.leaseToken,p_intake_digest:l.intakeContextDigest,p_planning_digest:l.planningContextDigest});
/** Single bounded poll over the existing durable work table. No default host,
 * scheduler, fake authorization, second attempt, proposal confirm or publication
 * fallback. SQL owner supplies the reviewed current-authority wrappers. */
export async function runPlanningV2BoundedWorker(config:PlanningV2WorkerConfig,ports:PlanningV2WorkerPorts,signal:AbortSignal){
 if(config.enabled!==true)return 'disabled' as const;
 if(signal.aborted||![config.ownerId,config.planningPolicyId,config.textPolicyId,config.scopeId].every(uuid)||!/^[A-Za-z0-9._-]{1,100}$/.test(config.priceVersion)||!Number.isSafeInteger(config.reservedMicros)||config.reservedMicros<1||config.reservedMicros>1e12||!Number.isSafeInteger(config.timeoutMs)||config.timeoutMs<1||config.timeoutMs>60000||!Number.isSafeInteger(config.maxOutputTokens)||config.maxOutputTokens<1||config.maxOutputTokens>4096)return 'blocked' as const;
 const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,120000);
 let lease:V2Lease|null=null;
 const invoke=(name:string,p:Row)=>ports.rpc(name,p,controller.signal);
 const pause=async(reason:'reconciliation'|'blocked'|'stale')=>{
  if(!lease)return 'blocked' as const;
  // Cleanup has a separate finite scope, since the worker may already be aborted.
  const cleanup=new AbortController(),limit=setTimeout(()=>cleanup.abort(),15000);
  try{const v=await ports.rpc('pause_planning_intake_work_v1',{...six(lease),p_reason:reason},cleanup.signal);return row(v)&&exact(v,['kind','taskId','turnId'])&&v.kind==='paused'&&v.taskId===lease.taskId&&v.turnId===lease.turnId?'paused' as const:'unknown' as const;}catch{return 'unknown' as const;}finally{clearTimeout(limit);}
 };
 try{
  const claim=await invoke('claim_planning_intake_work_v1',{p_owner_id:config.ownerId,p_planning_policy_id:config.planningPolicyId,p_execution_profile_id:config.execution.profileId});
  if(row(claim)&&exact(claim,['kind'])&&claim.kind==='idle')return 'idle' as const;
  if(!row(claim)||!exact(claim,['kind','lease','execution'])||claim.kind!=='leased'||!validPlanningV2Lease(claim.lease)||claim.lease.ownerId!==config.ownerId||claim.lease.planningPolicyId!==config.planningPolicyId)return 'blocked' as const;
  lease=claim.lease;
  if(!row(claim.execution))return await pause('blocked');
  const e=claim.execution,expected={schemaVersion:'planning-v2-execution/1',currency:'CNY',unit:'micros',inputTokenUpperBound:1048576,...config.execution,textPolicyId:config.textPolicyId,scopeId:config.scopeId,provider:'qwen',model:PROTOCOL_MODELS.qwen,priceVersion:config.priceVersion,reservedMicros:config.reservedMicros,timeoutMs:config.timeoutMs,maxOutputTokens:config.maxOutputTokens,maxMapCalls:13,maxSteps:4,maxRetries:0,deadlineMs:120000};
  if(!exact(e,[...Object.keys(expected),'executionId','profileRevision'])||!uuid(e.executionId)||!Number.isSafeInteger(e.profileRevision)||Number(e.profileRevision)<1||Object.entries(expected).some(([k,v])=>e[k]!==v))return await pause('blocked');
  const l=lease;
  const current=async()=>{if(controller.signal.aborted)throw Error('Planning stopped');const q=decodePlanningV2Read(await invoke('read_planning_intake_work_v1',six(l)),l);if(!q)throw Error('Planning basis unavailable');return q;};
  let input=await current();const checkpoints=decodePlanningV2Checkpoints(await invoke('read_planning_intake_checkpoints_v1',six(l)),l,ports.now());if(!checkpoints)return await pause('blocked');
  const placeState=checkpoints.place as Row;let place:Row;
  if(['started','unknown'].includes(String(placeState.state)))return await pause('reconciliation');
  if(placeState.state==='completed')place=placeState.observation as Row;
  else{
   await current();const claimed=await invoke('claim_planning_intake_place_v1',six(l));if(!row(claimed)||!exact(claimed,['kind'])||claimed.kind!=='claimed')return await pause('reconciliation');
   let calls=0;
   const beforeRequest=async()=>{
    if(++calls>13)throw Error('Planning tool limit');await current();
    const decision=await invoke('authorize_planning_intake_external_read_v1',{...six(l),p_scope:config.scopeId,p_max_calls:13});
    const expected={ownerId:l.ownerId,taskId:l.taskId,turnId:l.turnId,leaseToken:l.leaseToken,intakeContextDigest:l.intakeContextDigest,planningContextDigest:l.planningContextDigest};
    if(!row(decision)||!exact(decision,['schemaVersion','kind','binding','scopeId','maxCalls'])||decision.schemaVersion!=='planning-v2-tool-authority/1'||decision.kind!=='authorized'||decision.scopeId!==config.scopeId||decision.maxCalls!==13||!row(decision.binding)||!exact(decision.binding,Object.keys(expected))||Object.entries(expected).some(([k,v])=>(decision.binding as Row)[k]!==v))throw Error('Planning external authority unavailable');
   };
   try{
    const observed=await ports.place(controller.signal,beforeRequest);await current();const verified=decodePlanningV2Checkpoints({...checkpoints,place:{state:'completed',observation:observed}},l,ports.now());if(!verified||calls<1||!row(observed)||observed.providerCalls!==calls)throw Error('Planning tool receipt unavailable');place=observed as Row;
    if(await invoke('save_planning_intake_place_v1',{...six(l),p_observation:place})!==true)return await pause('reconciliation');
   }catch{try{await invoke('unknown_planning_intake_place_v1',six(l));}catch{}return await pause('reconciliation');}
  }
  input=await current();
  const model=await invoke('read_planning_intake_model_output_v1',{...six(l),p_scope:config.scopeId,p_text_policy:config.textPolicyId,p_price_version:config.priceVersion});let output:PlanningV2ModelOutputReceipt|null=null;
  if(row(model)&&exact(model,['kind','state','binding','output'])&&model.kind==='model_state'&&model.state==='settled'&&row(model.binding)){
   const b=model.binding as PlanningV2ModelRequestBinding;
   if(b.owner!==l.ownerId||b.task!==l.taskId||b.turn!==l.turnId||b.planningPolicy!==l.planningPolicyId||b.textPolicy!==config.textPolicyId||b.scope!==config.scopeId||b.priceVersion!==config.priceVersion||b.provider!=='qwen'||b.model!==PROTOCOL_MODELS.qwen||b.intakeDigest!==l.intakeContextDigest||b.planningDigest!==l.planningContextDigest)return await pause('blocked');
   output=parsePlanningV2ModelOutputReceipt(model.output,b);if(!output)return await pause('reconciliation');
  }else if(row(model)&&exact(model,['kind','state'])&&model.kind==='model_state'&&model.state==='none'&&checkpoints.modelAttempt==='none'){
   const binding:PlanningV2ModelRequestBinding={owner:l.ownerId,task:l.taskId,turn:l.turnId,lease:l.leaseToken,textPolicy:config.textPolicyId,planningPolicy:l.planningPolicyId,scope:config.scopeId,attempt:randomUUID(),provider:'qwen',model:PROTOCOL_MODELS.qwen,priceVersion:config.priceVersion,intakeDigest:l.intakeContextDigest,planningDigest:l.planningContextDigest};
   const prompt=JSON.stringify({goal:input.goalText,delegation:input.delegation,intake:input.qualifiedIntake.intake,observation:place,unknown:['hotel_price','availability','safety','quietness','food','photography','pace_suitability']});
   const result=await runPlanningV2ModelStep({enabled:true,lease:l,binding,reservedMicros:config.reservedMicros,timeoutMs:config.timeoutMs,maxOutputTokens:config.maxOutputTokens,prompt},ports.model,controller.signal);if(result.kind!=='settled')return await pause('reconciliation');output=result.output;
  }else return await pause('reconciliation');
  input=await current();const projection=await invoke('project_planning_intake_comparison_v1',{...six(l),p_observation:place});if(!validPlanningV2PreparedProjection(projection,input,l,place,ports.now())||!row(projection))return await pause('blocked');
  const content=projection.content as Row,options=content.options as Row[],contentTuple=[content.schemaVersion,content.title,content.summary,options.map(o=>[o.id,o.title,o.tradeoff]),content.actions],digest=createHash('sha256').update(JSON.stringify(contentTuple)).digest('hex'),key=createHash('sha256').update(JSON.stringify([l.taskId,l.turnId,l.intakeContextDigest,l.planningContextDigest,'result.prepare',digest])).digest('hex');
  await current();const action=await invoke('claim_planning_intake_result_v1',{...six(l),p_action_key:key,p_content_digest:digest});if(!row(action)||!exact(action,['kind'])||!['claimed','duplicate'].includes(String(action.kind)))return await pause('reconciliation');
  const p={...six(l),p_action_key:key,p_scope:output.binding.scope,p_attempt:output.binding.attempt,p_output_digest:output.outputDigest,p_usage_digest:output.usageDigest,p_content:content};
  const published=(v:unknown)=>row(v)&&exact(v,['kind','taskId','turnId','artifactId','revision'])&&v.kind==='published'&&v.taskId===l.taskId&&v.turnId===l.turnId&&v.artifactId===l.artifactId&&Number.isSafeInteger(v.revision)&&Number(v.revision)>0;
  let complete:unknown;try{complete=await invoke('complete_planning_intake_comparison_v1',p);}catch{/* Read exact committed receipt; never replay completion/provider. */}
  if(published(complete))return 'persisted' as const;
  const receiptScope=new AbortController(),receiptLimit=setTimeout(()=>receiptScope.abort(),15000);
  try{const receipt=await ports.rpc('read_completed_planning_intake_receipt_v1',{p_owner:l.ownerId,p_task:l.taskId,p_turn:l.turnId,p_artifact:l.artifactId,p_intake_digest:l.intakeContextDigest,p_planning_digest:l.planningContextDigest,p_scope:output.binding.scope,p_attempt:output.binding.attempt,p_output_digest:output.outputDigest,p_usage_digest:output.usageDigest},receiptScope.signal);if(published(receipt))return 'persisted' as const;}catch{/* Still unknown, never retry completion. */}finally{clearTimeout(receiptLimit);}
  return await pause('reconciliation');
 }catch{return await pause('stale');}finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
