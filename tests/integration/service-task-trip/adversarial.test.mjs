import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {nativeDatabase} from './native-db.mjs';
import {fixturePorts} from './fixture.mjs';
import {produceTripCandidate} from './producer-fixture.mjs';
import {journeyPassCatalog} from '../../../lib/server/entitlements/journey-pass-catalog.ts';
const flags={skip:!process.env.VP_TRIP_PG_BIN,timeout:180000};
const state=async(db,t)=>({head:(await db(`select head_version from public.trips where id='${t.a.trip}'`))[0].head_version,capacity:(await db(`select state from turn_private.service_task_capacity where task_id='${t.task.taskId}'`))[0].state,events:(await db(`select count(*)::int n from public.trip_events where proposal_id='${t.proposal.proposalId}'`))[0].n});
test('shared last capacity serializes across text/Trip; cross actor/key/epoch/claim fields never authorize',flags,async t=>{
 const {db,upgrade}=await nativeDatabase(t);await db('begin;'+upgrade+'commit;');const f=fixturePorts(db);await db('update turn_private.service_task_capacity_settings set trip_enabled=true,enabled=true');
 const a=await f.workerFixture(),other=await f.workerFixture();const textTask=uuid(),textTurn=uuid();await f.call(a,'submit_service_task_turn',[uuid(),textTurn,uuid(),a.policy,'en','Independent text task',textTask,1,'new_goal',null]);
 const prepared=[];for(let i=0;i<2;i++){const goal=await f.canonical(a),c=await f.prepare(a,goal);prepared.push({goal,input:{action:'ask',operationId:uuid(),basis:{contextId:c.contextId,contextDigest:c.contextDigest,baseVersion:0},text:'Move B to d2'}});}
 const outcomes=await Promise.allSettled(prepared.map(v=>f.call(a,'submit_trip_service_task_v1',[a.trip,v.input,v.goal])));assert.equal(outcomes.filter(v=>v.status==='fulfilled').length,1);assert.match(outcomes.find(v=>v.status==='rejected').reason.message,/CAPACITY_EXHAUSTED/);
 const v=prepared[outcomes.findIndex(v=>v.status==='fulfilled')],accepted=outcomes.find(v=>v.status==='fulfilled').value;assert.equal((await db(`select count(*)::int n from turn_private.service_task_capacity where owner_id='${a.owner}'`))[0].n,2);
 await assert.rejects(f.call(other,'submit_trip_service_task_v1',[a.trip,v.input,v.goal]),/STALE_BASIS|FORBIDDEN/);
 for(const goal of [{...v.goal,goalVersion:String(v.goal.goalVersion)},{...v.goal,verified:true},{...v.goal,messageId:uuid()}])await assert.rejects(f.call(a,'submit_trip_service_task_v1',[a.trip,{...v.input,operationId:uuid()},goal]),/INVALID_INPUT|STALE_BASIS/);
 await db(`update identity_private.mobile_accounts set epoch=epoch+1 where owner_id='${a.owner}'`);const stale=await f.call(a,'trip_service_task_owner_v1',[a.trip,'read',{operationId:v.input.operationId}]);assert.ok(stale.state==='unknown'||stale.kind==='unavailable');await assert.rejects(f.call(a,'submit_trip_service_task_v1',[a.trip,v.input,v.goal]),/STALE_BASIS|SESSION_REPLACED|UNAUTHENTICATED/);
 assert.equal((await db(`select state from turn_private.service_task_capacity where task_id='${accepted.taskId}'`))[0].state,'reserved');
});
test('cancel/reject and exact confirmation races have one result; original manual edits have no new settlement',flags,async t=>{
 const {db,upgrade}=await nativeDatabase(t);await db('begin;'+upgrade+'commit;');const f=fixturePorts(db);await db('update turn_private.service_task_capacity_settings set trip_enabled=true,enabled=true');
 for(const action of ['cancel','reject'])for(let i=0;i<3;i++){
  const x=await produceTripCandidate(f,db,{cancel:false,proposal:true});const confirm=()=>f.call(x.a,'confirm_and_apply_trip_proposal',[x.proposal.proposalId,uuid(),x.proposal.proposalDigest]);
  const stop=()=>action==='cancel'?f.call(x.a,'cancel_trip_service_task_v1',[x.task.taskId]):f.call(x.a,'reject_trip_proposal_v2',[x.proposal.proposalId]);
  const results=await Promise.allSettled(i%2?[confirm(),stop()]:[stop(),confirm()]);const s=await state(db,x);
  assert.ok(s.head===0&&s.events===0&&s.capacity==='released'||s.head===1&&s.events===1&&s.capacity==='settled',JSON.stringify({s,results}));
 }
 const x=await produceTripCandidate(f,db,{cancel:false,proposal:false});const manual=await f.call(x.a,'create_trip_proposal_patch',[x.a.trip,{expectedVersion:0,operations:[{kind:'set_title',title:'Owner manual title'}]}]);
 const raw=String(manual),id=raw.match(/[a-f0-9]{8}-[a-f0-9-]{27,}/)?.[0];assert.ok(id);
 const digest=(await db(`set request.jwt.claim.sub='${x.a.owner}';select digest from public.read_trip_proposal_v2('${id}')`))[0].digest;
 assert.equal(await f.call(x.a,'confirm_and_apply_trip_proposal',[id,uuid(),digest]),'(applied,1)');assert.equal((await db(`select state from turn_private.service_task_capacity where task_id='${x.task.taskId}'`))[0].state,'reserved');
 const stale=await f.call(x.a,'submit_scoped_trip_edit_v1',[x.a.trip,{action:'select_candidate',operationId:uuid(),basis:x.input.basis,askOperationId:x.input.operationId,candidateId:x.read.binding.attemptId}]);assert.equal(stale.kind,'unavailable');
 await f.call(x.a,'cancel_trip_service_task_v1',[x.task.taskId]);assert.equal((await db(`select state from turn_private.service_task_capacity where task_id='${x.task.taskId}'`))[0].state,'released');
});
test('original Sandbox grant revocation races with settlement; expired grant cannot settle or dispatch',flags,async t=>{
 const {db,upgrade}=await nativeDatabase(t);await db('begin;'+upgrade+'commit;');const f=fixturePorts(db);await db('update turn_private.service_task_capacity_settings set trip_enabled=true,enabled=true');
 const grant=async(a,expires=false)=>{
 const purchaseAt=new Date(Date.now()-720*3600000+(expires?8000:3600000)).toISOString();const input={ownerId:a.owner,appAccountToken:a.owner,environment:'Sandbox',transactionId:'agent008-synthetic-'+uuid(),productId:'synthetic',purchaseAt,catalogVersion:2,policyVersion:'service-task-development/1',capacitySnapshot:journeyPassCatalog.serviceTaskCapacity.journeyPass};await f.rawService('storekit_apply_verified_v1',{p_input:input});return input;};
 for(let i=0;i<3;i++){let g;const x=await produceTripCandidate(f,db,{cancel:false,proposal:true,grant:async a=>{g=await grant(a);}});await Promise.allSettled([f.call(x.a,'confirm_and_apply_trip_proposal',[x.proposal.proposalId,uuid(),x.proposal.proposalDigest]),f.rawService('storekit_apply_verified_v1',{p_input:{...g,revokedAt:new Date().toISOString()}})]);const s=await state(db,x);assert.ok(s.head===1&&s.events===1&&s.capacity==='settled'||s.head===0&&s.events===0&&s.capacity==='reserved');}
 let g;const x=await produceTripCandidate(f,db,{cancel:false,proposal:true,grant:async a=>{g=await grant(a,true);}});const ends=Date.parse(g.purchaseAt)+720*3600000;await new Promise(r=>setTimeout(r,Math.max(0,ends-Date.now()+100)));
 await assert.rejects(f.call(x.a,'confirm_and_apply_trip_proposal',[x.proposal.proposalId,uuid(),x.proposal.proposalDigest]),/GRANT_UNAVAILABLE/);assert.deepEqual(await state(db,x),{head:0,events:0,capacity:'reserved'});
 assert.notEqual((await f.service('authorize_scoped_trip_edit_effect_v1',{p_binding:x.read.binding,p_effect:'dispatch'})).kind,'authorized');
});
