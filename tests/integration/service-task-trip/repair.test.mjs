import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {nativeDatabase} from './native-db.mjs';
import {fixturePorts} from './fixture.mjs';
import {executeScopedTripEdit} from '../../../lib/server/turn/scoped-edit/executor.ts';
import {createTextJobPrice} from '../../../lib/server/jobs/staging-text-job.ts';
const flags={skip:!process.env.VP_TRIP_PG_BIN,timeout:180000};
test('known-cost technical failure repairs within original Task/budget; unknown provider ACK never authorizes repair',flags,async t=>{
 const {db,upgrade}=await nativeDatabase(t);await db('begin;'+upgrade+'commit;');const f=fixturePorts(db);
 await db('update turn_private.service_task_capacity_settings set trip_enabled=true,enabled=true');
 for(const known of [true,false]){
  const a=await f.workerFixture(true),goal=await f.canonical(a),c=await f.prepare(a,goal),input={action:'ask',operationId:uuid(),basis:{contextId:c.contextId,contextDigest:c.contextDigest,baseVersion:0},text:'Move B to d2'};
  const task=await f.call(a,'submit_trip_service_task_v1',[a.trip,input,goal]);
  const lease=await f.service('claim_scoped_trip_edit_work_v1',{p_owner_id:a.owner,p_policy_id:a.policy,p_scope_id:a.scope});
  let calls=0;let bad=true;
  const ports={now:Date.now,price:createTextJobPrice({mode:'flat',inputMicrosPerMillion:1000000,outputMicrosPerMillion:1000000,cachedInputMicrosPerMillion:null}),recordUsage:async r=>assert.equal(r.actualMicros,15),rpc:(n,p)=>f.service(n,p),transport:async()=>{
   calls++;if(!known)throw Error('synthetic unknown provider acknowledgement');
   return Response.json({model:'qwen3.7-plus-2026-05-26',usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15},choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({kind:'candidate',edits:[{kind:'move_item',itemId:bad?'nonexistent':'b',toDayId:'d2'}]})}}]});
  }};
  assert.equal(await executeScopedTripEdit(lease,ports,new AbortController().signal),'pending');assert.equal(calls,1);
  await assert.rejects(f.call(a,'continue_trip_service_task_v1',[a.trip,task.taskId,task.turnId,uuid(),'repair','Repair the same requested move']),/SERVICE_TASK_CONFLICT/);
  if(!known){
   assert.equal(await executeScopedTripEdit(lease,ports,new AbortController().signal),'pending');assert.equal(calls,1);
   const budget=(await db(`select status,actual_micros from public.model_budget_attempts where task_id='${task.taskId}'`))[0];assert.equal(budget.status,'pending');assert.equal(budget.actual_micros,null);
   assert.equal((await db(`select output_kind from turn_private.text_content where turn_id='${task.turnId}'`))[0].output_kind,null);
   continue;
  }
  // Read and settle the original known usage. This invocation makes no provider call.
  assert.equal(await executeScopedTripEdit(lease,ports,new AbortController().signal),'persisted');assert.equal(calls,1);
  assert.equal((await db(`select output_kind from turn_private.text_content where turn_id='${task.turnId}'`))[0].output_kind,'technical_failure');
  const repaired=await f.call(a,'continue_trip_service_task_v1',[a.trip,task.taskId,task.turnId,uuid(),'repair','Repair the same requested move']);assert.equal(repaired.taskId,task.taskId);
  const next=await f.service('claim_scoped_trip_edit_work_v1',{p_owner_id:a.owner,p_policy_id:a.policy,p_scope_id:a.scope});bad=false;
  assert.equal(await executeScopedTripEdit(next,ports,new AbortController().signal),'persisted');assert.equal(calls,2);
  const j=(await db(`select binding from scoped_edit_private.work_v1 where turn_id='${repaired.turnId}'`))[0];
  const proposal=await f.call(a,'submit_scoped_trip_edit_v1',[a.trip,{action:'select_candidate',operationId:uuid(),basis:input.basis,askOperationId:j.binding.operationId,candidateId:j.binding.attemptId}]);
  assert.equal(await f.call(a,'confirm_and_apply_trip_proposal',[proposal.proposalId,uuid(),proposal.proposalDigest]),'(applied,1)');
  assert.equal((await db(`select count(*)::int n from turn_private.service_task_capacity where task_id='${task.taskId}'`))[0].n,1);
  assert.equal((await db(`select sum(actual_micros)::text total from public.model_budget_attempts where task_id='${task.taskId}'`))[0].total,'30');
 }
});
