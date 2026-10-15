import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeDatabase} from './native-db.mjs';
import {fixturePorts,claims} from './fixture.mjs';
import {randomUUID as uuid} from 'node:crypto';
const flags={skip:!process.env.VP_TRIP_PG_BIN,timeout:180000};
const vector=db=>db('select conversation_data_private.schema_supported_v1() conversation,profile_data_private.schema_v1() profile,result_data_private.schema_supported_v1() result,turn_data_private.schema_supported_v1() turn,turn_data_private.runtime_supported_v1() runtime,result_data_private.infrastructure_supported_v1() infrastructure,turn_data_private.write_hooks_valid_v1() hooks');
test('registered lifecycle keeps original guards; unknown columns and source functions stay denied',flags,async t=>{
 const {db,upgrade}=await nativeDatabase(t);await db('begin;'+upgrade+'commit;');
 assert.ok(Object.values((await vector(db))[0]).every(v=>v===true));
 // Actual mutation test uses a committed synthetic schema change, followed by its exact local reversal.
 await db('alter table turn_private.service_tasks add column unexpected_future_column text');
 assert.equal((await vector(db))[0].turn,false);
 await db('alter table turn_private.service_tasks drop column unexpected_future_column');
 assert.ok(Object.values((await vector(db))[0]).every(v=>v===true));
});
test('source erase strips new metadata, releases pending capacity and permanently fences late work',flags,async t=>{
 const {db,upgrade}=await nativeDatabase(t);await db('begin;'+upgrade+'commit;');
 const f=fixturePorts(db);await db('update turn_private.service_task_capacity_settings set trip_enabled=true,enabled=true');
 for(const mode of ['turn','message','account']){
  const a=await f.workerFixture(),goal=await f.canonical(a),c=await f.prepare(a,goal),input={action:'ask',operationId:uuid(),basis:{contextId:c.contextId,contextDigest:c.contextDigest,baseVersion:0},text:'Move B to the second day'};
  const task=await f.call(a,'submit_trip_service_task_v1',[a.trip,input,goal]);
  const before=(await db(`select trip_objective from turn_private.service_tasks where id='${task.taskId}'`))[0].trip_objective;
  await assert.rejects(db(`update turn_private.service_tasks set trip_objective='{"outcome":"erased"}' where id='${task.taskId}'`),/ERASURE_AUTHORITY|CAPACITY_SCOPE/);
  if(mode==='turn')await db(`update turn_private.text_content set hidden_at=clock_timestamp(),input_text='[deleted by scoped Turn request]',output_text=null,output_kind=null where turn_id='${task.turnId}'`);
  if(mode==='message')await db(`delete from turn_private.assistant_messages where id='${goal.messageId}'`);
  if(mode==='account'){await assert.rejects(db(`delete from auth.users where id='${a.owner}'`),/model_budget_scopes_owner_id_fkey/);assert.deepEqual((await db(`select trip_objective from turn_private.service_tasks where id='${task.taskId}'`))[0].trip_objective,before);continue;}
  const erased=(await db(`select trip_objective from turn_private.service_tasks where id='${task.taskId}'`))[0].trip_objective;
  assert.deepEqual(erased,{schemaVersion:'trip-service-task-erased/1',outcome:'erased',goalId:goal.goalId});
  assert.equal((await db(`select state from turn_private.service_task_capacity where task_id='${task.taskId}'`))[0]?.state,'released');
  await assert.rejects(db(`update turn_private.service_tasks set trip_objective=$$${JSON.stringify(before)}$$::jsonb where id='${task.taskId}'`),/CAPACITY_SCOPE/);
  const lease=await f.service('claim_scoped_trip_edit_work_v1',{p_owner_id:a.owner,p_policy_id:a.policy,p_scope_id:a.scope});assert.notEqual(lease.kind,'leased');
 }
});

test('actual original privacy graph reports the retained scoped producer references honestly',flags,async t=>{
 const {db,upgrade}=await nativeDatabase(t);await db('begin;'+upgrade+'commit;');
 const f=fixturePorts(db);await db('update turn_private.service_task_capacity_settings set trip_enabled=true,enabled=true');
 const a=await f.workerFixture(),goal=await f.canonical(a),c=await f.prepare(a,goal),input={action:'ask',operationId:uuid(),basis:{contextId:c.contextId,contextDigest:c.contextDigest,baseVersion:0},text:'Move B to the second day'};
 const task=await f.call(a,'submit_trip_service_task_v1',[a.trip,input,goal]);await f.call(a,'cancel_trip_service_task_v1',[task.taskId]);
 const conv=(await db(`select conversation_data_private.source_v1('${a.owner}','conversation','${goal.conversationId}') v`))[0].v;
 const turn=(await db(`select turn_data_private.source_v1('${a.owner}','${task.turnId}') v`))[0].v;
 console.log('actual scoped source conflicts',JSON.stringify({conversation:conv.conflicts,turn:turn.conflicts}));
 assert.ok(conv.conflicts.includes('SCOPED_EDIT_REFERENCE'));
});
