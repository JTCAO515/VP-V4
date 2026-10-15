import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {nativeDatabase} from './native-db.mjs';
import {fixturePorts} from './fixture.mjs';
import {executeScopedTripEdit} from '../../../lib/server/turn/scoped-edit/executor.ts';
import {createTextJobPrice} from '../../../lib/server/jobs/staging-text-job.ts';
test('in-flight cancel/consent withdrawal stops results while the original known provider attempt reconciles once',{skip:!process.env.VP_TRIP_PG_BIN,timeout:180000},async t=>{
 const {db,upgrade}=await nativeDatabase(t);await db('begin;'+upgrade+'commit;');const f=fixturePorts(db);await db('update turn_private.service_task_capacity_settings set trip_enabled=true,enabled=true');
 for(const stop of ['cancel','withdraw']){
 const a=await f.workerFixture(true),goal=await f.canonical(a),c=await f.prepare(a,goal),input={action:'ask',operationId:uuid(),basis:{contextId:c.contextId,contextDigest:c.contextDigest,baseVersion:0},text:'Move B to d2'};
 const task=await f.call(a,'submit_trip_service_task_v1',[a.trip,input,goal]),lease=await f.service('claim_scoped_trip_edit_work_v1',{p_owner_id:a.owner,p_policy_id:a.policy,p_scope_id:a.scope});let calls=0;
 const result=await executeScopedTripEdit(lease,{now:Date.now,price:createTextJobPrice({mode:'flat',inputMicrosPerMillion:1000000,outputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:null}),recordUsage:async r=>assert.equal(r.actualMicros,15),rpc:(n,p)=>f.service(n,p),transport:async()=>{
 calls++;if(stop==='cancel')await f.call(a,'cancel_trip_service_task_v1',[task.taskId]);else await f.call(a,'withdraw_text_policy',[a.policy]);
 await db('update turn_private.service_task_capacity_settings set trip_enabled=false');
 return Response.json({model:'qwen3.7-plus-2026-05-26',usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15},choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({kind:'candidate',edits:[{kind:'move_item',itemId:'b',toDayId:'d2'}]})}}]});
 }},new AbortController().signal);assert.equal(result,'pending');assert.equal(calls,1);
 const attempt=(await db(`select status,actual_micros::text cost from public.model_budget_attempts where task_id='${task.taskId}'`))[0];assert.deepEqual(attempt,{status:'settled',cost:'15'});
 assert.equal((await db(`select count(*)::int n from public.trip_proposals where owner_id='${a.owner}'`))[0].n,0);assert.equal((await db(`select output_kind from turn_private.text_content where turn_id='${task.turnId}'`))[0].output_kind,null);
 if(stop==='withdraw')await f.call(a,'cancel_trip_service_task_v1',[task.taskId]);
 assert.equal((await db(`select state from turn_private.service_task_capacity where task_id='${task.taskId}'`))[0].state,'released');
 await db('update turn_private.service_task_capacity_settings set trip_enabled=true');
 }
});
