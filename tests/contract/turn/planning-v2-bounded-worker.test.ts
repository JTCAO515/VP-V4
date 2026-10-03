// Full TS worker batch with explicitly mocked SQL/provider. No actual SQL grants,
// collector origin verification, provider fees or target execution is claimed.
import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID as uuid} from 'node:crypto';
import {runPlanningV2BoundedWorker,type PlanningV2WorkerConfig,type PlanningV2WorkerPorts} from '../../../lib/server/turn/planning-v2-bounded-worker.ts';
import {createPlanningV2HostedJob} from '../../../lib/server/turn/planning-v2-hosted-job.ts';
import {PROTOCOL_MODELS} from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';
import type {V2Lease} from '../../../lib/server/turn/planning-intake-worker-protocol.ts';
import type {PlanningV2ModelOutputReceipt} from '../../../lib/server/turn/planning-v2-model-output-receipt.ts';
type Row=Record<string,unknown>;
function fixture(options:{lostOutput?:boolean;lostComplete?:boolean;unknown?:boolean;revokeDispatch?:boolean;unknownPrice?:boolean;profileMismatch?:boolean;completedPlace?:boolean}={}){
 const lease:V2Lease={ownerId:uuid(),taskId:uuid(),turnId:uuid(),leaseToken:uuid(),artifactId:uuid(),planningPolicyId:uuid(),intakeContextDigest:'a'.repeat(64),planningContextDigest:'b'.repeat(64),source:{conversationId:uuid(),goalId:uuid(),goalVersion:1,messageId:uuid(),messageSequence:2,intakeRevision:2,memoryBasis:[]},environment:'staging',locale:'en'};
 const config:PlanningV2WorkerConfig={enabled:true,ownerId:lease.ownerId,planningPolicyId:lease.planningPolicyId,textPolicyId:uuid(),scopeId:uuid(),priceVersion:'registered-fixture-1',reservedMicros:10,timeoutMs:500,maxOutputTokens:128,execution:{profileId:uuid(),providerConfigurationId:uuid(),providerConfigurationVersion:1,endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',inputMicrosPerMillion:1,cachedInputMicrosPerMillion:null,outputMicrosPerMillion:1}};
 const intake={schemaVersion:'stay-area-intake/1',city:'shanghai',comparisonTarget:'area_transport',durationDays:10,partySize:2,interests:['food','photography'],pace:'relaxed',lodgingBudget:null,dates:null,mobilityConstraints:[]};
 const qualified={version:5,kind:'travel_intake',schemaVersion:'assistant-travel-current-basis/1',...lease.source,sourceKind:'explicit_current_input',intake,contextDigest:lease.intakeContextDigest,readiness:{kind:'ready',scope:'transport_screening',unknown:['lodgingBudget','dates']},readyForProvider:false};
 const input={kind:'planning_intake_input',schemaVersion:'planning-intake-context/2',ownerId:lease.ownerId,taskId:lease.taskId,turnId:lease.turnId,artifactId:lease.artifactId,planningPolicyId:lease.planningPolicyId,provider:'qwen',endpoint:config.execution.endpoint,goalText:'Shanghai with partner',delegation:'Compare two areas',planningActionBasis:'c'.repeat(64),qualifiedIntake:qualified,intakeContextDigest:lease.intakeContextDigest,planningContextDigest:lease.planningContextDigest,executionAvailable:false,readyForProvider:false};
 const place={schemaVersion:'planning-place/1',source:'amap',observedAt:new Date().toISOString(),providerCalls:1,areas:[{id:'jingan',label:"Jing'an Temple",railMinutes:12,transfers:0},{id:'peoples_square',label:"People's Square",railMinutes:18,transfers:1}]};
 const events:string[]=[],receipts:unknown[]=[];let output:PlanningV2ModelOutputReceipt|null=null,state:Row=options.completedPlace?{state:'completed',observation:place}:{state:'missing'},status='none',sends=0;
 const execution={schemaVersion:'planning-v2-execution/1',executionId:uuid(),profileRevision:1,...config.execution,textPolicyId:config.textPolicyId,scopeId:config.scopeId,provider:'qwen',model:PROTOCOL_MODELS.qwen,priceVersion:config.priceVersion,reservedMicros:options.profileMismatch?11:10,timeoutMs:config.timeoutMs,maxOutputTokens:config.maxOutputTokens,maxMapCalls:13,maxSteps:4,maxRetries:0,deadlineMs:120000};
 const published={kind:'published',taskId:lease.taskId,turnId:lease.turnId,artifactId:lease.artifactId,revision:1};
 const ack=()=>({kind:'output_recorded',binding:output!.binding,outputDigest:output!.outputDigest,usageDigest:output!.usageDigest});
 const rpc:PlanningV2WorkerPorts['rpc']=async(name,p)=>{events.push(name);
 switch(name){
 case 'claim_planning_intake_work_v1':return {kind:'leased',lease,execution};
 case 'read_planning_intake_work_v1':return input;
 case 'read_planning_intake_checkpoints_v1':return {schemaVersion:'planning-v2-checkpoints/1',ownerId:lease.ownerId,taskId:lease.taskId,turnId:lease.turnId,intakeContextDigest:lease.intakeContextDigest,planningContextDigest:lease.planningContextDigest,place:options.unknown?{state:'unknown'}:state,modelAttempt:status};
 case 'claim_planning_intake_place_v1':state={state:'started'};return {kind:'claimed'};
 case 'authorize_planning_intake_external_read_v1':return {schemaVersion:'planning-v2-tool-authority/1',kind:'authorized',binding:{ownerId:lease.ownerId,taskId:lease.taskId,turnId:lease.turnId,leaseToken:lease.leaseToken,intakeContextDigest:lease.intakeContextDigest,planningContextDigest:lease.planningContextDigest},scopeId:config.scopeId,maxCalls:13};
 case 'save_planning_intake_place_v1':state={state:'completed',observation:p.p_observation};return true;
 case 'project_planning_intake_comparison_v1':return {schemaVersion:'qualified-intake-comparison-projection/1',request:intake,binding:{...lease.source,contextDigest:lease.intakeContextDigest},observation:place,coverage:{scope:'transport_screening',evidence:'not_integrated',observedFields:['railMinutes','transfers'],unknown:['food','photography','pace_suitability','safety','quietness','hotel_price','availability']},content:{schemaVersion:'comparison/1',title:'Shanghai rail screening',summary:'Rail only; lodging unknown',options:[{id:'jingan',title:'Jingan',tradeoff:'Rail12'},{id:'peoples_square',title:'Square',tradeoff:'Rail18'}],actions:[]},readyForProvider:false,readyForPublication:false};
 case 'read_planning_intake_model_output_v1':return status==='settled'?{kind:'model_state',state:'settled',binding:output!.binding,output}:{kind:'model_state',state:status};
 case 'claim_planning_intake_result_v1':return {kind:'claimed'};
 case 'complete_planning_intake_comparison_v1':assert.equal(status,'settled');assert.equal(p.p_attempt,output!.binding.attempt);if(options.lostComplete)throw Error('mock committed ACK loss');return published;
 case 'read_completed_planning_intake_receipt_v1':return published;
 case 'pause_planning_intake_work_v1':return {kind:'paused',taskId:lease.taskId,turnId:lease.turnId};
 default:throw Error('Unmodelled mock operation '+name);
 }};
 const ports:PlanningV2WorkerPorts={rpc,now:Date.now,place:async(_s,before)=>{events.push('map');await before();return place;},model:{read:async()=>input,authorize:async(effect,b)=>{events.push(effect);return options.revokeDispatch&&effect==='model_dispatch'?{kind:'blocked'}:{schemaVersion:'planning-v2-effect-authority/1',kind:'authorized',effect,binding:b};},bindReserved:async b=>{events.push('bind');return {kind:'model_attempt_binding',schemaVersion:'planning-v2-model-binding/1',ownerId:b.owner,taskId:b.task,turnId:b.turn,textPolicyId:b.textPolicy,planningPolicyId:b.planningPolicy,scopeId:b.scope,attemptId:b.attempt,provider:b.provider,model:b.model,priceVersion:b.priceVersion,intakeContextDigest:b.intakeDigest,planningContextDigest:b.planningDigest,ledgerStatus:'reserved',reservedMicros:10,actualMicros:null,unknown:false,reused:false,executionAllowed:false,executionAvailable:false,readyForProvider:false};},budgetForAttempt:()=>async(name,p)=>{events.push(name);if(name==='reserve_model_budget'){status='reserved';return {kind:'reserved'};}if(name==='dispatch_model_budget'){status='dispatched';return {kind:'dispatched'};}if(name==='finish_model_budget'){status=p.p_action==='settle'?'settled':'pending';return {kind:status,overrun:false};}throw Error('Unexpected budget operation');},transportForAttempt:()=>async request=>{sends++;events.push('provider');assert.equal(JSON.parse(request.body).enable_thinking,false);return Response.json({model:PROTOCOL_MODELS.qwen,choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:'{"highlight":"jingan"}'}}],usage:{prompt_tokens:12,completion_tokens:8,total_tokens:20}});},price:()=>options.unknownPrice?null:5,recordUsage:async(receipt)=>{events.push('usage');receipts.push(receipt);},persistOutput:async o=>{events.push('output');output=o;if(options.lostOutput)throw Error('mock committed output ACK loss');return ack();},readOutput:async()=>{events.push('output_read');return ack();}}};
 return {config,ports,lease,events,receipts,get sends(){return sends;},get status(){return status;},get output(){return output;}};
}
test('default off worker and hosted job do zero I/O and credential lookup',async()=>{
 const f=fixture();assert.equal(await runPlanningV2BoundedWorker({...f.config,enabled:false},f.ports,new AbortController().signal),'disabled');assert.deepEqual(f.events,[]);
 const job=createPlanningV2HostedJob({enabled:false} as never,{} as never);assert.equal(await job(new AbortController().signal),'disabled');
});
test('full mocked SQL/provider flow binds before dispatch, records real-protocol usage/output before settlement then completes',async()=>{
 const f=fixture();assert.equal(await runPlanningV2BoundedWorker(f.config,f.ports,new AbortController().signal),'persisted',JSON.stringify(f.events));assert.equal(f.sends,1);assert.equal(f.status,'settled');assert.equal(f.receipts.length,1);assert.equal((f.receipts[0] as {actualMicros:number}).actualMicros,5);
 const ordered=['reserve_model_budget','bind','model_dispatch','dispatch_model_budget','provider','usage','output','finish_model_budget','complete_planning_intake_comparison_v1'];for(let i=1;i<ordered.length;i++)assert.ok(f.events.indexOf(ordered[i-1])<f.events.indexOf(ordered[i]),ordered.join('→'));
 assert.equal(f.output!.binding.task,f.lease.taskId);assert.equal(f.output!.usageReceipt.attempt.attemptId,f.output!.binding.attempt);
});
test('lost output and completion ACK recover exact receipts without replay; restart reuses completed tool/model',async()=>{
 const f=fixture({lostOutput:true,lostComplete:true});assert.equal(await runPlanningV2BoundedWorker(f.config,f.ports,new AbortController().signal),'persisted',JSON.stringify(f.events));assert.equal(f.sends,1);assert.equal(f.events.filter(e=>e==='output').length,1);assert.equal(f.events.filter(e=>e==='complete_planning_intake_comparison_v1').length,1);assert.ok(f.events.includes('output_read'));assert.ok(f.events.includes('read_completed_planning_intake_receipt_v1'));
 assert.equal(await runPlanningV2BoundedWorker(f.config,f.ports,new AbortController().signal),'persisted',JSON.stringify(f.events));assert.equal(f.sends,1);assert.equal(f.events.filter(e=>e==='map').length,1);assert.equal(f.receipts.length,1);
});
test('unknown tool, changed dispatch authority and unknown price cannot produce settled completion or a replacement call',async()=>{
 for(const option of [{unknown:true},{revokeDispatch:true},{unknownPrice:true}]){const f=fixture(option);assert.equal(await runPlanningV2BoundedWorker(f.config,f.ports,new AbortController().signal),'paused');assert.ok(!f.events.includes('complete_planning_intake_comparison_v1'));assert.ok(!f.events.includes('read_completed_planning_intake_receipt_v1'));assert.notEqual(f.status,'settled');const sends=f.sends;await runPlanningV2BoundedWorker(f.config,f.ports,new AbortController().signal);assert.equal(f.sends,sends);if(option.revokeDispatch)assert.equal(sends,0);if(option.unknownPrice)assert.equal(f.receipts.length,0);}
});
test('caller reservation cannot override the claimed server execution snapshot',async()=>{
 const f=fixture({profileMismatch:true});assert.equal(await runPlanningV2BoundedWorker(f.config,f.ports,new AbortController().signal),'paused');assert.equal(f.sends,0);assert.ok(!f.events.includes('reserve_model_budget'));
});

test('controlled host uses real HTTP transport but mock destinations: configured recipient gate after credential blocks supplier egress',async()=>{
 const f=fixture({completedPlace:true}),phases:string[]=[];let modelCredentials=0,binding:Row={};
 const toBinding=(p:Row)=>({owner:p.p_owner,task:p.p_task,turn:p.p_turn,lease:p.p_lease,textPolicy:p.p_text_policy,planningPolicy:p.p_planning_policy,scope:p.p_scope,attempt:p.p_attempt,provider:p.p_provider,model:p.p_model,priceVersion:p.p_price_version,intakeDigest:p.p_intake_digest,planningDigest:p.p_planning_digest});
 const fetcher:typeof fetch=async(url,init)=>{
  const endpoint=String(url);if(endpoint===f.config.execution.endpoint){assert.fail('No supplier request permitted after configured gate denies');}
  const name=endpoint.split('/').at(-1)!,p=JSON.parse(String(init?.body)) as Row;
  if(name==='authorize_planning_intake_model_v1')return Response.json(await f.ports.model.authorize(p.p_effect as 'model_reserve'|'model_dispatch',toBinding(p) as never,new AbortController().signal));
  if(name==='bind_planning_intake_model_attempt_v1'){binding=toBinding(p);return Response.json(await f.ports.model.bindReserved(binding as never,new AbortController().signal));}
  if(name==='planning_intake_budget_v1'){const b=p.p_binding as Row,original=p.p_effect==='reserve'?'reserve_model_budget':p.p_effect==='dispatch'?'dispatch_model_budget':'finish_model_budget';return Response.json(await f.ports.model.budgetForAttempt(b as never)(original,{p_scope_id:String(b.scope),p_owner_id:String(b.owner),p_attempt_id:String(b.attempt),p_action:p.p_outcome as string|null,p_actual_micros:p.p_actual_micros as number|null}));}
  if(name==='record_planning_intake_provider_destination_v1'){assert.equal(modelCredentials,1);phases.push((p.p_destination as Row).phase as string);assert.equal((p.p_attempt),binding.attempt);return Response.json({kind:'blocked'});}
  return Response.json(await f.ports.rpc(name,p,new AbortController().signal));
 };
 const job=createPlanningV2HostedJob({...f.config,schemaVersion:'vpj80-hosted-planning-v2/1',databaseUrl:'https://dzqdzetcctkhbrhlxxgn.supabase.co',provider:{provider:'qwen',endpoint:f.config.execution.endpoint,configurationId:f.config.execution.providerConfigurationId,configurationVersion:1,timeoutMs:f.config.timeoutMs},pricing:{mode:'flat',inputMicrosPerMillion:1,cachedInputMicrosPerMillion:null,outputMicrosPerMillion:1}},
 {workerCredential:()=> 'fixture-db-credential',providerCredential:()=>{modelCredentials++;return 'fixture-provider-credential';},recordUsage:f.ports.model.recordUsage,mapsEnv:{AMAP_SEARCH_ENABLED:'true',AMAP_DETAIL_ENABLED:'true',AMAP_ROUTES_ENABLED:'true',AMAP_WEB_SERVICE_KEY:'fixture-map-key'},fetcher:async(url,init)=>{
  // Reuse a completed explicitly mock tool checkpoint to focus this negative on credential→configured→no send.
  return fetcher(url,init);
 }});
 assert.equal(await job(new AbortController().signal),'paused');assert.deepEqual(phases,['configured']);assert.equal(modelCredentials,1);assert.equal(f.status,'pending');assert.equal(f.receipts.length,0);
});

test('false qualification or local fixture permit cannot become reserve authority; foreign attempt cannot dispatch',async()=>{
 for(const fault of ['local_permit','foreign_binding']){
  const f=fixture();
  if(fault==='local_permit')Object.assign(f.ports.model,{authorize:async()=>({kind:'local_protocol_permit',readyForProvider:true})});
  else{const original=f.ports.model.bindReserved;Object.assign(f.ports.model,{bindReserved:async(...args:Parameters<typeof original>)=>({...await original(...args) as Row,attemptId:uuid()})});}
  assert.equal(await runPlanningV2BoundedWorker(f.config,f.ports,new AbortController().signal),'paused');assert.equal(f.sends,0);assert.ok(!f.events.includes('dispatch_model_budget'));assert.ok(!f.events.includes('complete_planning_intake_comparison_v1'));if(fault==='local_permit')assert.ok(!f.events.includes('reserve_model_budget'));
 }
});
test('foreign output acknowledgement and revoked current source cannot publish or repeat supplier calls',async()=>{
 for(const fault of ['foreign_output','stale_source']){
  const f=fixture();
  if(fault==='foreign_output'){const original=f.ports.model.persistOutput;Object.assign(f.ports.model,{persistOutput:async(...args:Parameters<typeof original>)=>({...await original(...args) as Row,binding:{...args[0].binding,attempt:uuid()}})});}
  else Object.assign(f.ports.model,{read:async()=>({kind:'blocked'})});
  assert.equal(await runPlanningV2BoundedWorker(f.config,f.ports,new AbortController().signal),'paused');assert.ok(!f.events.includes('complete_planning_intake_comparison_v1'));const sends=f.sends;await runPlanningV2BoundedWorker(f.config,f.ports,new AbortController().signal);assert.equal(f.sends,sends);assert.notEqual(f.status,'settled');
 }
});
