import {nativeRequestScope} from '../identity/native-request.ts';
import {supabaseWorkerHeaders} from '../jobs/supabase-worker-headers.ts';
import {createProviderHttpTransport,type HttpProviderConfiguration,type HttpTransportDependencies} from '../model-gateway/adapters/http-transport.ts';
import {createTextJobPrice,type TextJobPricing} from '../jobs/staging-text-job.ts';
import {readShanghaiStayAreaRoutes} from '../tools/planning-place-read.ts';
import {runPlanningV2BoundedWorker,type PlanningV2WorkerConfig} from './planning-v2-bounded-worker.ts';
import type {RecordPlanningUsage} from '../model-gateway/budget/usage-receipt.ts';
import type {V2Lease} from './planning-intake-worker-protocol.ts';
import {createPlanningV2ModelRequest,type PlanningV2ModelRequestBinding} from './planning-v2-model-request.ts';
const DATABASE='https://dzqdzetcctkhbrhlxxgn.supabase.co';
const operations=new Set(['claim_planning_intake_work_v1','read_planning_intake_work_v1','read_planning_intake_checkpoints_v1','claim_planning_intake_place_v1','save_planning_intake_place_v1','unknown_planning_intake_place_v1','authorize_planning_intake_external_read_v1','authorize_planning_intake_model_v1','bind_planning_intake_model_attempt_v1','record_planning_intake_provider_destination_v1','record_planning_intake_model_output_v1','read_planning_intake_model_output_receipt_v1','read_planning_intake_model_output_v1','project_planning_intake_comparison_v1','claim_planning_intake_result_v1','complete_planning_intake_comparison_v1','read_completed_planning_intake_receipt_v1','pause_planning_intake_work_v1','planning_intake_budget_v1']);
const six=(l:V2Lease)=>({p_owner:l.ownerId,p_task:l.taskId,p_turn:l.turnId,p_lease:l.leaseToken,p_intake_digest:l.intakeContextDigest,p_planning_digest:l.planningContextDigest});
const tuple=(b:PlanningV2ModelRequestBinding)=>({p_owner:b.owner,p_task:b.task,p_turn:b.turn,p_lease:b.lease,p_text_policy:b.textPolicy,p_planning_policy:b.planningPolicy,p_scope:b.scope,p_attempt:b.attempt,p_provider:b.provider,p_model:b.model,p_price_version:b.priceVersion,p_intake_digest:b.intakeDigest,p_planning_digest:b.planningDigest});
export type PlanningV2HostedConfig=PlanningV2WorkerConfig&Readonly<{schemaVersion:'vpj80-hosted-planning-v2/1';databaseUrl:string;provider:HttpProviderConfiguration;pricing:TextJobPricing}>;
/** Explicit construction only. Disabled before credentials, RPC or supplier I/O.
 * No installation, scheduler, env-key lookup, activation flag or API grant. */
export function createPlanningV2HostedJob(config:PlanningV2HostedConfig,deps:Readonly<{
 workerCredential:HttpTransportDependencies['credential'];providerCredential:HttpTransportDependencies['credential'];recordUsage:RecordPlanningUsage;
 mapsEnv:Readonly<Record<string,string|undefined>>;fetcher?:typeof fetch;
}>){
 if(config.enabled!==true)return async(_signal:AbortSignal)=>'disabled' as const;
 if(typeof window!=='undefined'||process.env.VERCEL_ENV||config.schemaVersion!=='vpj80-hosted-planning-v2/1'||config.databaseUrl!==DATABASE||config.provider.provider!=='qwen'||config.provider.timeoutMs!==config.timeoutMs||config.provider.configurationId!==config.execution.providerConfigurationId||config.provider.configurationVersion!==config.execution.providerConfigurationVersion||config.provider.endpoint!==config.execution.endpoint||config.pricing.inputMicrosPerMillion!==config.execution.inputMicrosPerMillion||(config.pricing.cachedInputMicrosPerMillion??null)!==config.execution.cachedInputMicrosPerMillion||config.pricing.outputMicrosPerMillion!==config.execution.outputMicrosPerMillion||typeof deps.workerCredential!=='function'||typeof deps.providerCredential!=='function'||typeof deps.recordUsage!=='function')throw Error('Planning host unavailable');
 const price=createTextJobPrice(config.pricing),inputRate=Math.max(config.pricing.inputMicrosPerMillion,config.pricing.cachedInputMicrosPerMillion??0);
 const required=(BigInt(1048576)*BigInt(inputRate)+BigInt(config.maxOutputTokens)*BigInt(config.pricing.outputMicrosPerMillion)+BigInt(999999))/BigInt(1000000);
 if(!Number.isSafeInteger(config.reservedMicros)||BigInt(config.reservedMicros)<required)throw Error('Planning reservation unavailable');
 const fetcher=deps.fetcher??fetch;
 return async(signal:AbortSignal)=>{
  if(signal.aborted||process.env.VERCEL_ENV)return 'blocked' as const;
  const rpc=async(name:string,p:Readonly<Record<string,unknown>>,s:AbortSignal):Promise<unknown>=>{
   if(!operations.has(name))throw Error('Planning RPC unavailable');const scope=nativeRequestScope(s,15000);
   try{
    const key=await scope.run(()=>Promise.resolve(deps.workerCredential(scope.signal)));if(typeof key!=='string'||!/^[\x21-\x7e]{1,8192}$/.test(key))throw Error('Planning credential unavailable');
    const response=await scope.run(()=>fetcher(config.databaseUrl+'/rest/v1/rpc/'+name,{method:'POST',headers:supabaseWorkerHeaders(key),body:JSON.stringify(p),redirect:'manual',credentials:'omit',cache:'no-store',signal:scope.signal}));
    if(response.redirected||response.status!==200||response.headers.get('content-type')?.split(';')[0].trim()!=='application/json'||!response.body){await response.body?.cancel().catch(()=>{});throw Error('Planning RPC unavailable');}
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
    try{for(;;){const part=await scope.run(()=>reader.read());if(part.done)break;if((bytes+=part.value.byteLength)>262144)throw Error('Planning RPC limit');chunks.push(part.value);}scope.check();return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))) as unknown;}
    finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   }finally{scope.dispose();}
  };
  return runPlanningV2BoundedWorker(config,{rpc,now:Date.now,place:(s,beforeRequest)=>readShanghaiStayAreaRoutes({env:deps.mapsEnv,signal:s,fetcher:deps.fetcher,beforeRequest}),model:{
   read:(l,s)=>rpc('read_planning_intake_work_v1',six(l),s),authorize:(effect,b,s)=>rpc('authorize_planning_intake_model_v1',{...tuple(b),p_effect:effect},s),bindReserved:(b,s)=>rpc('bind_planning_intake_model_attempt_v1',tuple(b),s),
   budgetForAttempt:b=>async(name,p)=>{
    const effect=name==='reserve_model_budget'?'reserve':name==='dispatch_model_budget'?'dispatch':name==='finish_model_budget'?'finish':null;
    if(!effect||p.p_owner_id!==b.owner||p.p_scope_id!==b.scope||p.p_attempt_id!==b.attempt||effect==='reserve'&&(p.p_task_id!==b.task||p.p_provider!==b.provider||p.p_model!==b.model||p.p_price_version!==b.priceVersion))throw Error('Planning budget identity unavailable');
    return rpc('planning_intake_budget_v1',{p_effect:effect,p_binding:b,p_reserved_micros:p.p_reserved_micros??null,p_actual_micros:p.p_actual_micros??null,p_outcome:p.p_action??null},signal);
   },transportForAttempt:b=>async request=>{
    const canonical=createPlanningV2ModelRequest({schemaVersion:'planning-v2-model-request/1',binding:b,requestId:b.attempt,payload:JSON.parse(request.body)},b);if(!canonical||canonical.body!==request.body)throw Error('Planning canonical request unavailable');
    return createProviderHttpTransport(config.provider,{credential:deps.providerCredential,...(deps.fetcher?{fetch:deps.fetcher}:{}),recordDestination:async(receipt,s)=>{
    const saved=await rpc('record_planning_intake_provider_destination_v1',{...tuple(b),p_destination:receipt,p_request_id:canonical.requestId,p_request_digest:canonical.requestDigest,p_payload_digest:canonical.payloadDigest,p_payload_text:canonical.body},s);
    if(saved===null||typeof saved!=='object'||Array.isArray(saved)||Object.keys(saved).length!==4||(saved as Record<string,unknown>).kind!=='destination_recorded'||(saved as Record<string,unknown>).attemptId!==b.attempt||(saved as Record<string,unknown>).invocationId!==receipt.invocationId||(saved as Record<string,unknown>).phase!==receipt.phase)throw Error('Planning destination unavailable');
   }})(request);},price,recordUsage:deps.recordUsage,
   persistOutput:(o,s)=>rpc('record_planning_intake_model_output_v1',{...tuple(o.binding),p_output_wire:o},s),
   readOutput:(o,s)=>rpc('read_planning_intake_model_output_receipt_v1',{...tuple(o.binding),p_output_digest:o.outputDigest,p_usage_digest:o.usageDigest},s),
  }},signal);
 };
}
