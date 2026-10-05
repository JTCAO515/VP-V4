import { createHash } from 'node:crypto';
import { nativeRequestScope } from '../../identity/native-request.ts';
import { supabaseWorkerHeaders } from '../../jobs/supabase-worker-headers.ts';
import { createProviderHttpTransport } from '../../model-gateway/adapters/http-transport.ts';
import { PROTOCOL_MODELS } from '../../model-gateway/adapters/provider-protocol.ts';
import { createTextJobPrice } from '../../jobs/staging-text-job.ts';
import { runDurableTurnWork } from '../durable-worker.ts';
import { HOSTED_STAGING_DATABASE_URL, parseHostedWorkerProfile, runHostedTextLoop, type HostedWorkerProfile, type HostedWorkerDependencies, type PollResult } from '../../jobs/hosted-text-worker.ts';
import { SCOPED_TRIP_EDIT_PROMPT } from './model-output.ts';
import { executeScopedTripEdit, type ScopedRpc } from './executor.ts';
import { authorized, validBinding } from './protocol.ts';
import { exact, record, uuid } from '../../trip/scoped-edit/contract.ts';
export type ScopedHostedProfile = Readonly<{schemaVersion:'vpj10-hosted-scoped-edit/1';loop:HostedWorkerProfile;target:Readonly<{ownerId:string;policyId:string;scopeId:string}>}>;
export function parseScopedHostedProfile(v: unknown): ScopedHostedProfile {
  if(!record(v)||!exact(v,['schemaVersion','loop','target'])||v.schemaVersion!=='vpj10-hosted-scoped-edit/1'||!record(v.target)||!exact(v.target,['ownerId','policyId','scopeId'])||![v.target.ownerId,v.target.policyId,v.target.scopeId].every(uuid))throw Error('Scoped host unavailable');
  const loop=parseHostedWorkerProfile(v.loop);
  if(loop.schemaVersion!=='vpj07-hosted-text-worker/1')throw Error('Scoped host unavailable');
  return Object.freeze({schemaVersion:'vpj10-hosted-scoped-edit/1',loop,target:Object.freeze({...v.target})}) as ScopedHostedProfile;
}
const rpcs=new Set(['hosted_worker_heartbeat','hosted_scoped_trip_edit_target_v1','claim_scoped_trip_edit_work_v1','read_scoped_trip_edit_work_v1','authorize_scoped_trip_edit_effect_v1','scoped_trip_edit_budget_v1','read_scoped_trip_edit_output_v1','record_scoped_trip_edit_output_v1','complete_scoped_trip_edit_work_v1','read_scoped_trip_edit_completion_v1','record_scoped_trip_edit_destination_v1','pause_scoped_trip_edit_work_v1']);
/** Explicit opt-in composition of the existing host loop, work queue, budget and
 * provider adapter. No key discovery, scheduler, fallback or default enabled mode. */
export function createHostedScopedEditWorker(raw:ScopedHostedProfile,deps:HostedWorkerDependencies & Readonly<{scopedEditEnabled?:boolean}>) {
  const profile=parseScopedHostedProfile(raw), tariff=profile.loop.qwen, target=profile.target;
  if(deps.scopedEditEnabled!==true||typeof window!=='undefined'||process.env.VERCEL_ENV||!uuid(deps.workerId)||typeof deps.workerCredential!=='function'||typeof deps.providerCredential!=='function'||typeof deps.journal.planningUsage!=='function')throw Error('Scoped host unavailable');
  const pricing=createTextJobPrice(tariff.pricing);
  const configDigest=createHash('sha256').update(JSON.stringify(profile)).digest('hex');
  const fetcher=deps.fetch??fetch;
  const rpc:ScopedRpc=async(name,params,signal)=>{
    if(!rpcs.has(name)||signal.aborted||process.env.VERCEL_ENV)throw Error('Scoped RPC unavailable');
    const scope=nativeRequestScope(signal,15000);
    try {
      const key=await scope.run(()=>Promise.resolve(deps.workerCredential(scope.signal)));
      if(typeof key!=='string'||!/^[\x21-\x7e]{1,8192}$/.test(key))throw Error('Scoped credential unavailable');
      const response=await scope.run(()=>fetcher(HOSTED_STAGING_DATABASE_URL+'/rest/v1/rpc/'+name,{method:'POST',headers:supabaseWorkerHeaders(key),body:JSON.stringify(params),redirect:'manual',credentials:'omit',cache:'no-store',signal:scope.signal}));
      if(response.redirected||response.status!==200||response.headers.get('content-type')?.split(';')[0].trim()!=='application/json'||!response.body){await response.body?.cancel().catch(()=>{});throw Error('Scoped RPC unavailable');}
      const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
      try {for(;;){const part=await scope.run(()=>reader.read());if(part.done)break;if((bytes+=part.value.byteLength)>262144)throw Error('Scoped RPC limit');chunks.push(part.value);}scope.check();return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))) as unknown;}
      finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
    } finally {scope.dispose();}
  };
  let journaled=false;
  const poll=async(signal:AbortSignal):Promise<PollResult>=>{
    const ready=await rpc('hosted_scoped_trip_edit_target_v1',{p_owner_id:target.ownerId,p_policy_id:target.policyId,p_scope_id:target.scopeId,p_price_version:tariff.priceVersion,p_reserved_micros:tariff.reservedMicros},signal);
    if(record(ready)&&ready.kind==='idle')return 'empty';
    if(!record(ready)||ready.kind!=='ready')return 'unavailable';
    if(!journaled){await deps.journal.event({phase:'cycle',cycle:0,groups:1,skipped:0,results:{}});journaled=true;}
    // Reuse the original lease timeout and finish fence; override only its claim
    // RPC with the dedicated execution mode in the same durable work table.
    return runDurableTurnWork(async(name,p)=>{
      if(name!=='claim_turn_work')throw Error('Scoped finish unavailable');
      return rpc('claim_scoped_trip_edit_work_v1',{p_owner_id:target.ownerId,p_policy_id:target.policyId,p_scope_id:target.scopeId},signal);
    },async(lease,stop)=>{
      let currentBinding:unknown=null;
      let requestIdentity:Readonly<{requestId:string;requestDigest:string;payloadDigest:string;body:string}>|null=null;
      const scopedRpc:ScopedRpc=async(name,p,s)=>{
        const value=await rpc(name,p,s);
        if(name==='read_scoped_trip_edit_work_v1'&&record(value)&&validBinding(value.binding)){
          if(value.binding.ownerId!==target.ownerId||value.binding.policyId!==target.policyId||value.binding.scopeId!==target.scopeId||value.binding.priceVersion!==tariff.priceVersion||value.endpoint!==deps.qwenEndpoint||value.timeoutMs!==tariff.timeoutMs||value.reservedMicros!==tariff.reservedMicros||value.maxOutputTokens!==tariff.maxOutputTokens)throw Error('Scoped host binding unavailable');
          currentBinding=value.binding;
        }
        return value;
      };
      const transport=createProviderHttpTransport({provider:'qwen',endpoint:deps.qwenEndpoint,configurationId:tariff.configurationId,configurationVersion:tariff.configurationVersion,timeoutMs:tariff.timeoutMs},{credential:deps.providerCredential,qwenEndpoint:deps.qwenEndpoint,...(deps.fetch?{fetch:deps.fetch}:{}),recordDestination:async(destination,s)=>{
        if(!validBinding(currentBinding)||!requestIdentity)throw Error('Scoped destination binding unavailable');
        if(destination.phase==='configured'){
          const decision=await scopedRpc('authorize_scoped_trip_edit_effect_v1',{p_binding:currentBinding,p_effect:'dispatch'},s);
          if(!authorized(decision,currentBinding,'dispatch'))throw Error('Scoped destination unavailable');
        }
        await deps.journal.destination(destination,s);
        const stored=await scopedRpc('record_scoped_trip_edit_destination_v1',{p_binding:currentBinding,p_destination:destination,p_request_id:requestIdentity.requestId,p_request_digest:requestIdentity.requestDigest,p_payload_digest:requestIdentity.payloadDigest,p_payload_text:requestIdentity.body},s);
        if(!record(stored)||!exact(stored,['kind','attemptId','invocationId','phase'])||stored.kind!=='destination_recorded'||stored.attemptId!==currentBinding.attemptId||stored.invocationId!==destination.invocationId||stored.phase!==destination.phase)throw Error('Scoped destination unavailable');
      }});
      const wrapped:typeof transport=async request=>{
        if(!validBinding(currentBinding))throw Error('Scoped request unavailable');
        const body=JSON.parse(request.body);
        if(!record(body)||!exact(body,['model','messages','stream','max_tokens','enable_thinking','response_format'])||body.model!==PROTOCOL_MODELS.qwen||body.stream!==false||body.max_tokens!==tariff.maxOutputTokens||body.enable_thinking!==false||!Array.isArray(body.messages)||body.messages.length!==2||!record(body.messages[0])||body.messages[0].content!==SCOPED_TRIP_EDIT_PROMPT)throw Error('Scoped request unavailable');
        const payloadDigest=createHash('sha256').update(request.body,'utf8').digest('hex');
        const stable={...currentBinding,leaseToken:undefined};
        requestIdentity={requestId:currentBinding.attemptId,payloadDigest,body:request.body,requestDigest:createHash('sha256').update(JSON.stringify(['scoped-trip-edit-request/1',stable,payloadDigest])).digest('hex')};
        return transport(request);
      };
      const result=await executeScopedTripEdit(lease,{rpc:scopedRpc,transport:wrapped,price:pricing,recordUsage:(receipt,s)=>deps.journal.planningUsage!(configDigest,receipt,s),now:Date.now},stop);
      if(result==='persisted')return 'persisted';
      if(validBinding(currentBinding)&&!stop.aborted)await rpc('pause_scoped_trip_edit_work_v1',{p_binding:currentBinding,p_reason:'provider_unavailable'},stop).catch(()=>{});
      throw Error('Scoped work pending');
    },signal);
  };
  return (signal:AbortSignal)=>runHostedTextLoop({...profile.loop,requireInitialDisabled:deps.requireInitialDisabled===true},{
    heartbeat:async(state,s)=>{
      const value=await rpc('hosted_worker_heartbeat',{p_worker_id:deps.workerId,p_build:deps.build,p_started_at:deps.startedAt,p_phase:state.phase,p_result:state.result,p_polls:state.polls,p_finished:state.finished,p_unavailable:state.unavailable,p_skipped:state.skipped,p_stop_reason:state.stopReason},s).catch(()=>null);
      const ok=record(value)&&value.kind==='ok'&&typeof value.enabled==='boolean';
      deps.onHeartbeat?.(ok,ok?value.enabled as boolean:null);
      return ok?{enabled:value.enabled as boolean}:null;
    },readyGroups:async()=>[target],workerFor:group=>group===target?{ownerId:target.ownerId,poll}:null,record:deps.journal.event,
  },signal);
}
