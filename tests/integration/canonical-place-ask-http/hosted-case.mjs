import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createHostedTextWorker,HOSTED_STAGING_DATABASE_URL} from '../../../lib/server/jobs/hosted-text-worker.ts';
import {PROTOCOL_MODELS} from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';
const endpoint='https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const rpcNames=new Set(['hosted_worker_heartbeat','hosted_worker_ready_groups','claim_text_work','claim_grounded_work','read_text_work','read_grounded_work','authorize_text_dispatch','complete_text_work','authorize_grounded_dispatch','complete_grounded_work','complete_grounded_work_with_needs','complete_grounded_place_work','finish_turn_work','reserve_model_budget','dispatch_model_budget','finish_model_budget']);

/** Existing production resident + existing job/4 + actual service SQL; controlled
 * provider transport only. Never creates a new task/mode or uses a hand claim. */
export async function verifyHosted(t,ports){
 for(const mode of ['ordinary','selected','profile-not-allowed','source-withdrawn','unknown-budget'])await t.test('resident '+mode,async child=>{
  const f=await ports.fixture('current_input_v1',null,endpoint);
  assert.equal((await ports.query('select endpoint,context_mode from turn_private.text_policies where id=$1',[f.policy])).rows[0].endpoint,endpoint,'fixture creates its original immutable policy with an explicit controlled recipient');
  const s=f.submission;
  const accepted=mode==='ordinary'?await ports.actorRpc(f.owner,'submit_service_task_turn',{p_thread_id:s.threadId,p_turn_id:s.turnId,p_idempotency_key:s.idempotencyKey,p_policy_id:s.policyId,p_locale:s.locale,p_text:s.text,p_task_id:s.serviceTask.id,p_scope_version:1,p_relationship:s.serviceTask.relationship,p_parent_turn_id:null}):await ports.actorRpc(f.owner,'grounded_ai_assist_work_v1',{p_input:{action:'selected_submit',requestBytes:JSON.stringify(f.request)}});assert.equal(accepted.kind,'accepted');
  const scope=randomUUID();
  child.after(async()=>{await ports.actorRpc(f.owner,'cancel_chat_turn',{p_turn_id:f.submission.turnId});await ports.query('update public.model_budget_scopes set enabled=false where id=$1',[scope]);});
  await ports.query("insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at) values($1,$2,'CNY',1000000,100000,10,1,true,now()+interval '1 day')",[scope,f.owner.id]);
  await ports.query("insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled) values($1,'qwen',$2,'c0-http-hosted',1000000,1000,true)",[scope,PROTOCOL_MODELS.qwen]);
  await ports.actorRpc(null,'set_hosted_worker_enabled',{p_enabled:true,p_reason:'C0 own isolated fixture'},'service_role');
  const controller=new AbortController(),calls=[],jobs=[],discoveries=[],providerBodies=[];let revoked=false,unknown=false;
  const profile={schemaVersion:'vpj07-hosted-text-worker/1',pollIntervalMs:1000,maxLifetimeMs:60000,drainMs:1000,concurrency:1,groupLimit:50,modes:mode==='profile-not-allowed'?['current_input_v1']:['current_input_v1','knowledge_intent_v1'],qwen:{priceVersion:'c0-http-hosted',pricing:{mode:'flat',inputMicrosPerMillion:1,outputMicrosPerMillion:1,cachedInputMicrosPerMillion:null},reservedMicros:1000,maxOutputTokens:512,timeoutMs:10000,configurationId:randomUUID(),configurationVersion:1}};
  const worker=createHostedTextWorker(profile,{workerId:randomUUID(),build:'canonical-c0',startedAt:new Date().toISOString(),qwenEndpoint:endpoint,workerCredential:()=> 'synthetic-service-only',providerCredential:()=> 'synthetic-provider-only',journal:{job:async(_,job)=>jobs.push(job),usage:async()=>{},knowledge:async()=>{},destination:async()=>{},event:async event=>{if(event.phase==='cycle')controller.abort();}},fetch:async(input,init)=>{
   const request=new Request(input,init),url=new URL(request.url);
   if(request.url===endpoint){
    providerBodies.push(await request.json());assert.equal(request.headers.get('authorization'),'Bearer synthetic-provider-only');
    const value=mode==='ordinary'?{outcome:'answered',text:'C0 ordinary answer'}:{intent:'place_opening_hours',requestScope:'single',unansweredNeeds:[],placeName:'it'};
    return Response.json({model:PROTOCOL_MODELS.qwen,choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(value)}}],usage:{prompt_tokens:80,completion_tokens:30,total_tokens:110}});
   }
   assert.equal(url.origin,HOSTED_STAGING_DATABASE_URL);assert.equal(request.headers.get('authorization'),'Bearer synthetic-service-only');
   const name=url.pathname.split('/').at(-1);assert.ok(rpcNames.has(name),'closed service RPC adapter');const params=await request.json();calls.push({name,params});
   const value=await ports.actorRpc(null,name,params,'service_role');
   if(name==='hosted_worker_ready_groups'){
    discoveries.push(value);assert.ok(value.groups.some(g=>g.ownerId===f.owner.id&&g.policyId===f.policy&&g.contextMode==='current_input_v1'));
    if(mode==='source-withdrawn'&&!revoked){revoked=true;await ports.privileged(f.reviewer,'ops_review_workspace',{p_input:{action:'revoke_statement',operationId:randomUUID(),candidateId:f.source.candidate,expectedPublicationVersion:1,note:'C0 withdraw after actual discovery before claim'}});}
   }
   if(name==='dispatch_model_budget'&&mode==='unknown-budget'&&!unknown){unknown=true;return Response.json(null);}
   return Response.json(value);
  }});
  const result=await worker(controller.signal);assert.equal(result.reason,'stopped');assert.equal(discoveries.length,1);
  const modelText=JSON.stringify(providerBodies);
  assert.ok(!modelText.includes(f.subject));assert.ok(!modelText.includes(f.source.statement.expressions.en.text));assert.ok(!modelText.includes(f.expectation.providerPoiId));
  const dbCounts=(await ports.query('select (select count(*)::int from turn_private.service_tasks where owner_id=$1) tasks,(select count(*)::int from public.turns where owner_id=$1) turns',[f.owner.id])).rows[0];assert.deepEqual(dbCounts,{tasks:1,turns:1});
  assert.equal((await ports.query('select context_mode from turn_private.text_policies where id=$1',[f.policy])).rows[0].context_mode,'current_input_v1');
  if(mode==='ordinary'){
   assert.equal(providerBodies.length,1);assert.equal(calls.filter(c=>c.name==='claim_grounded_work').length,0);
   const read=await ports.actorRpc(f.owner,'read_text_turn',{p_turn_id:f.submission.turnId});assert.equal(read.output,'C0 ordinary answer');
   assert.equal(calls.filter(c=>c.name==='complete_text_work'&&c.params.p_turn_id===f.submission.turnId).length,1);
  }else if(mode==='selected'){
   assert.equal(providerBodies.length,1);assert.ok(modelText.includes(f.submission.text));assert.ok(jobs.some(j=>j.schemaVersion==='vpj07-staging-text-job/4'&&j.policyId===f.policy));
   const read=await ports.actorRpc(f.owner,'read_grounded_turn',{p_turn_id:f.submission.turnId});assert.equal(read.kind,'grounded_turn');assert.equal(read.result.placeSubjectId,f.subject);
   assert.equal((await ports.query('select state from turn_private.service_task_capacity where task_id=$1',[f.submission.serviceTask.id])).rows[0].state,'settled');
   assert.equal(calls.filter(c=>c.name==='complete_grounded_place_work'&&c.params.p_turn_id===f.submission.turnId).length,1);
  }else{
   assert.equal(providerBodies.length,0);
   if(mode==='profile-not-allowed')assert.equal(calls.filter(c=>c.name==='claim_grounded_work').length,0);
   if(mode==='source-withdrawn')assert.equal(calls.filter(c=>c.name==='complete_grounded_place_work').length,0);
   if(mode==='unknown-budget'){
    assert.equal(calls.filter(c=>c.name==='dispatch_model_budget').length,1);
    const attempts=(await ports.query('select status from public.model_budget_attempts where scope_id=$1',[scope])).rows;assert.deepEqual(attempts,[{status:'dispatched'}]);
   }
  }
 });
}
