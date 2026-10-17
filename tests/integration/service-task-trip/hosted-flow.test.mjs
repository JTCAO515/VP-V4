import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {nativeDatabase} from './native-db.mjs';
import {fixturePorts} from './fixture.mjs';
import {createHostedScopedEditWorker,parseScopedHostedProfile} from '../../../lib/server/turn/scoped-edit/hosted-job.ts';
const enabled=!!process.env.VP_TRIP_PG_BIN;
test('real hosted composition → SQL clarification → same-task continuation → candidate → original exact confirm', {skip:!enabled,timeout:180000},async t=>{
 const {db,upgrade}=await nativeDatabase(t);await db('begin;'+upgrade+'commit;');
 const f=fixturePorts(db);await db('update turn_private.service_task_capacity_settings set trip_enabled=true,enabled=true');
 const a=await f.workerFixture(true),goal=await f.canonical(a),c=await f.prepare(a,goal);
 const input={action:'ask',operationId:uuid(),basis:{contextId:c.contextId,contextDigest:c.contextDigest,baseVersion:0},text:'Move B to another day; ask which day if needed'};
 const task=await f.call(a,'submit_trip_service_task_v1',[a.trip,input,goal]);
 const profile=parseScopedHostedProfile({schemaVersion:'vpj10-hosted-trip-service-task/1',loop:{schemaVersion:'vpj07-hosted-text-worker/1',pollIntervalMs:1000,maxLifetimeMs:60000,drainMs:0,concurrency:1,groupLimit:1,modes:['current_input_v1'],qwen:{priceVersion:'synthetic-v1',pricing:{mode:'flat',inputMicrosPerMillion:1000000,outputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:null},reservedMicros:2000000,maxOutputTokens:1000,timeoutMs:10000,configurationId:a.configuration,configurationVersion:1}},target:{ownerId:a.owner,policyId:a.policy,scopeId:a.scope}});
 let providerCalls=0;const methods=[],rpcErrors=[];
 async function run(output){
  const stop=new AbortController();const time=setTimeout(()=>stop.abort(),15000);
  try{
   const worker=createHostedScopedEditWorker(profile,{tripServiceTaskEnabled:true,workerId:uuid(),build:'agent008-synthetic',startedAt:new Date().toISOString(),qwenEndpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',workerCredential:()=> 'synthetic-service-key',providerCredential:()=> 'synthetic-provider-key',journal:{job:async()=>{},usage:async()=>{},knowledge:async()=>{},destination:async()=>{},planningUsage:async(_digest,receipt)=>{assert.equal(receipt.actualMicros,15);},event:async e=>{if(e.phase==='cycle'&&e.results?.finished===1)stop.abort();}},fetch:async(url,opts)=>{
    if(String(url).startsWith('https://dzqdzetcctkhbrhlxxgn.supabase.co/rest/v1/rpc/')){
     const name=String(url).split('/').at(-1),p=JSON.parse(opts.body);methods.push([name,p.p_method]);
     try{return Response.json(await f.rawService(name,p));}catch(e){rpcErrors.push({name,method:p.p_method,message:e.message});throw e;}
    }
    assert.equal(String(url),'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');providerCalls++;
    const payload=JSON.parse(opts.body);assert.match(payload.messages[0].content,/clarification/);
    return Response.json({model:payload.model,usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15},choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(output)}}]});
   }});
   const result=await worker(stop.signal);assert.equal(result.finished,1,JSON.stringify({result,methods,rpcErrors}));
  }finally{clearTimeout(time);}
 }
 await run({kind:'clarification',question:'Should B move to day d2?'});
 assert.equal(providerCalls,1);
 const parent=(await db(`select output_kind,output_text from turn_private.text_content where turn_id='${task.turnId}'`))[0];assert.deepEqual(parent,{output_kind:'clarification',output_text:'Should B move to day d2?'});
 assert.equal((await db(`select state from turn_private.service_task_capacity where task_id='${task.taskId}'`))[0].state,'reserved');
 const op=uuid();const continued=await f.call(a,'continue_trip_service_task_v1',[a.trip,task.taskId,task.turnId,op,'clarification','Move B to day d2.']);assert.equal(continued.taskId,task.taskId);assert.notEqual(continued.turnId,task.turnId);
 assert.equal((await f.call(a,'continue_trip_service_task_v1',[a.trip,task.taskId,task.turnId,op,'clarification','Move B to day d2.'])).turnId,continued.turnId);
 await assert.rejects(f.call(a,'continue_trip_service_task_v1',[a.trip,task.taskId,task.turnId,op,'clarification','different']),/IDEMPOTENCY_KEY_REUSE/);
 await assert.rejects(f.call(a,'continue_trip_service_task_v1',[a.trip,task.taskId,task.turnId,uuid(),'clarification','another child']),/SERVICE_TASK_CONFLICT/);
 await run({kind:'candidate',edits:[{kind:'move_item',itemId:'b',toDayId:'d2'}]});assert.equal(providerCalls,2);
 const j=(await db(`select binding from scoped_edit_private.work_v1 where turn_id='${continued.turnId}'`))[0];
 const proposal=await f.call(a,'submit_scoped_trip_edit_v1',[a.trip,{action:'select_candidate',operationId:uuid(),basis:input.basis,askOperationId:op,candidateId:j.binding.attemptId}]);
 const key=uuid();assert.equal(await f.call(a,'confirm_and_apply_trip_proposal',[proposal.proposalId,key,proposal.proposalDigest]),'(applied,1)');
 assert.equal(await f.call(a,'confirm_and_apply_trip_proposal',[proposal.proposalId,key,proposal.proposalDigest]),'(already_applied,1)');
 assert.equal((await db(`select count(*)::int n from turn_private.service_task_capacity where owner_id='${a.owner}'`))[0].n,1);
 assert.equal((await db(`select count(*)::int n from public.model_budget_attempts where task_id='${task.taskId}' and status='settled'`))[0].n,2);
 assert.equal((await db(`select sum(actual_micros)::text total from public.model_budget_attempts where task_id='${task.taskId}'`))[0].total,'30');
 assert.equal((await db(`select budget_scope_id from turn_private.service_tasks where id='${task.taskId}'`))[0].budget_scope_id,a.scope);
 assert.ok(methods.every(([name])=>['trip_service_task_worker_v1','hosted_worker_heartbeat'].includes(name)));
});
