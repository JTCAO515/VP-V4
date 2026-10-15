import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {nativeDatabase} from './native-db.mjs';
import {fixturePorts,claims,lit} from './fixture.mjs';
import {produceTripCandidate} from './producer-fixture.mjs';
const flags={skip:!process.env.VP_TRIP_PG_BIN,timeout:180000};
async function blocked(db,pid){for(let i=0;i<400;i++){if((await db(`select wait_event_type='Lock' blocked from pg_stat_activity where pid=${pid}`))[0]?.blocked)return;await new Promise(r=>setTimeout(r,5));}throw Error('Expected real account-row barrier was not reached');}
const service="set request.jwt.claim.role='service_role';set request.jwt.claim.sub='';set request.jwt.claims='{\"role\":\"service_role\"}';set role service_role;";
test('real account-row barrier: completion waits without capacity lock; owner cancel commits then stale completion cannot publish',flags,async t=>{
 const {db,open,upgrade}=await nativeDatabase(t);await db('begin;'+upgrade+'commit;');const f=fixturePorts(db);await db('update turn_private.service_task_capacity_settings set trip_enabled=true,enabled=true');
 const x=await produceTripCandidate(f,db,{cancel:false,complete:false,clarification:true}),owner=await open(),worker=await open();
 try{
 await owner.query(`begin;select 1 from identity_private.mobile_accounts where owner_id='${x.a.owner}' for update`);
 const completion=worker.query(service+`select public.trip_service_task_worker_v1('complete_trip_service_clarification_v1',${lit({p_binding:x.read.binding})}) v`);
 await blocked(db,worker.processID);
 // With the wrong 34→account order this real call deadlocks with the worker.
 const cancelled=await owner.query(claims(x.a)+`select public.cancel_trip_service_task_v1('${x.task.taskId}') v`);assert.equal(cancelled.at(-1).rows[0].v.kind,'cancelled');await owner.query('commit');
 const result=await completion;assert.equal(result.at(-1).rows[0].v.kind,'pending');
 assert.equal((await db(`select state from turn_private.service_task_capacity where task_id='${x.task.taskId}'`))[0].state,'released');assert.equal((await db(`select head_version from public.trips where id='${x.a.trip}'`))[0].head_version,0);
 }finally{await owner.query('rollback').catch(()=>{});await owner.end();await worker.end();}
});
test('actual valid continuation selection commits while another completion waits account-first',flags,async t=>{
 const {db,open,upgrade}=await nativeDatabase(t);await db('begin;'+upgrade+'commit;');const f=fixturePorts(db);await db('update turn_private.service_task_capacity_settings set trip_enabled=true,enabled=true');
 const x=await produceTripCandidate(f,db,{cancel:false,clarification:true});const continued=await f.call(x.a,'continue_trip_service_task_v1',[x.a.trip,x.task.taskId,x.task.turnId,uuid(),'clarification','Move B to d2']);
 const lease=await f.service('claim_scoped_trip_edit_work_v1',{p_owner_id:x.a.owner,p_policy_id:x.a.policy,p_scope_id:x.a.scope}),read=await f.service('read_scoped_trip_edit_work_v1',{p_turn_id:lease.turnId,p_lease_token:lease.leaseToken}),p={p_binding:read.binding};
 await f.service('scoped_trip_edit_budget_v1',{...p,p_effect:'reserve',p_reserved_micros:100,p_actual_micros:null,p_outcome:null});await f.service('scoped_trip_edit_budget_v1',{...p,p_effect:'dispatch',p_reserved_micros:null,p_actual_micros:null,p_outcome:null});const usage={inputTokens:10,outputTokens:5,totalTokens:15,cachedInputTokens:null,uncachedInputTokens:null,reasoningTokens:null,cost:'unknown'},edits=[{kind:'move_item',itemId:'b',toDayId:'d2'}];await f.service('record_scoped_trip_edit_output_v1',{...p,p_output:{kind:'candidate',edits},p_usage:usage,p_actual_micros:15});await f.service('scoped_trip_edit_budget_v1',{...p,p_effect:'finish',p_reserved_micros:null,p_actual_micros:15,p_outcome:'settle'});const patch=(await db(`select scoped_edit_private.candidate_patch_v1(c,'${continued.operationId}','${read.binding.attemptId}',${lit(edits)}) v from scoped_edit_private.contexts_v1 c where id='${x.c.contextId}'`))[0].v;await f.service('complete_scoped_trip_edit_work_v1',{...p,p_patch:patch});
 const other=await produceTripCandidate(f,db,{actor:x.a,cancel:false,complete:false,clarification:true});
 const owner=await open(),worker=await open();
 try{await owner.query(`begin;select 1 from identity_private.mobile_accounts where owner_id='${x.a.owner}' for update`);
 const completed=worker.query(service+`select public.trip_service_task_worker_v1('complete_trip_service_clarification_v1',${lit({p_binding:other.read.binding})}) v`).then(r=>({r}),e=>({e}));await blocked(db,worker.processID);
 // This is a valid continuation candidate, not an invalid-selection shortcut.
 const input={action:'select_candidate',operationId:uuid(),basis:x.input.basis,askOperationId:continued.operationId,candidateId:read.binding.attemptId};
 const selected=await owner.query(claims(x.a)+`select public.trip_service_task_owner_v1('${x.a.trip}','select',${lit(input)}) v`);assert.equal(selected.at(-1).rows[0].v.kind,'scoped_edit_proposal/1');await owner.query('commit');
 const outcome=await completed;if(outcome.e)throw outcome.e;assert.equal(outcome.r.at(-1).rows[0].v.kind,'clarification_saved');
 assert.equal((await db(`select count(*)::int n from public.trip_proposals where owner_id='${x.a.owner}'`))[0].n,1);assert.equal((await db(`select head_version from public.trips where id='${x.a.trip}'`))[0].head_version,0);
 }finally{await owner.query('rollback').catch(()=>{});await owner.end();await worker.end();}
});
