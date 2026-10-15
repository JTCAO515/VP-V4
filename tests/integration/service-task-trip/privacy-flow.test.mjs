import {produceTripCandidate} from './producer-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {nativeDatabase} from './native-db.mjs';
import {fixturePorts} from './fixture.mjs';
import {decodeTripPrivacyReply} from '../../../lib/server/service-task-trip/privacy.ts';
const flags={skip:!process.env.VP_TRIP_PG_BIN,timeout:180000};

test('explicit Trip privacy preview/confirmed erase/recovery removes all owned scoped copies; v1 counts stay unchanged',flags,async t=>{
 const {db,upgrade}=await nativeDatabase(t);await db('begin;'+upgrade+'commit;');const f=fixturePorts(db);await db('update turn_private.service_task_capacity_settings set trip_enabled=true,enabled=true');
 for(const target of ['conversation','turn']){
 const {a,goal,c,input,task,read}=await produceTripCandidate(f,db,{proposal:true}),schemaVersion=target==='turn'?'turn-trip-data/1':'conversation-trip-data/1';
 const selection={schemaVersion,scope:target==='turn'?'turn-sensitive-data/1':'conversation-sensitive-data/1',requestId:uuid(),...(target==='turn'?{turnId:task.turnId}:{rootKind:'conversation',rootId:goal.conversationId}),objectIds:[]};
 if(target==='turn')console.log('Trip graph source',JSON.stringify((await db(`select turn_private.trip_privacy_t_graph_source_v1('${a.owner}','${task.turnId}') v`))[0].v));
 const restoreContext=(await db(`select to_jsonb(c) v from scoped_edit_private.contexts_v1 c where id='${c.contextId}'`))[0].v;
 const previewCommand={action:'preview',...selection};const p=await f.call(a,'privacy_trip_service_task_v1',[a.trip,target,'preview',JSON.stringify(previewCommand),1]);
 console.log('Trip privacy preview',target,JSON.stringify({kind:p.kind,eligible:p.eligible,conflicts:p.conflicts,eraseCounts:p.eraseCounts,redactCounts:p.redactCounts}));assert.equal(p.eligible,true);
 assert.equal(p.eraseCounts.tripContexts,1);assert.equal(p.eraseCounts.tripWork,1);assert.equal(p.eraseCounts.tripOperations,2);assert.equal(p.eraseCounts.tripRequests,1);assert.equal(p.eraseCounts.tripLineage,1);assert.equal(p.redactCounts.tripObjectives,1);
 assert.ok(decodeTripPrivacyReply(p,target,previewCommand,{ownerId:a.owner,sessionId:a.session,mobileEpoch:1},JSON.stringify(previewCommand),a.trip,Date.now()));
 const erase={action:'erase',...selection,sourceDigest:p.sourceDigest,previewDigest:p.previewDigest,confirmed:true},bytes='\n '+JSON.stringify(erase)+' ';
 const r=await f.call(a,'privacy_trip_service_task_v1',[a.trip,target,'erase',bytes,1]);assert.equal(r.state,'erased');console.log('privacy receipt',target,JSON.stringify({state:r.state,erasedCounts:r.decision?.erasedCounts,redactedCounts:r.decision?.redactedCounts}));
 assert.ok(decodeTripPrivacyReply(r,target,erase,{ownerId:a.owner,sessionId:a.session,mobileEpoch:1},bytes,a.trip,Date.now()));
 const recoverCommand={action:'recover',...selection,mutationBytes:bytes};
 const recovered=await f.call(a,'privacy_trip_service_task_v1',[a.trip,target,'recover',JSON.stringify(recoverCommand),1]);assert.deepEqual(recovered,r);
 assert.ok(decodeTripPrivacyReply(recovered,target,recoverCommand,{ownerId:a.owner,sessionId:a.session,mobileEpoch:1},bytes,a.trip,Date.now()));
 if(target==='conversation'){
  const keys=r.decision.tripSourceIdentityKeys;assert.ok(Array.isArray(keys));assert.equal(new Set(keys.map(k=>k.relation)).size,5);
  for(const command of [erase,recoverCommand]){
   const missing=structuredClone(r);delete missing.decision.tripSourceIdentityKeys;
   assert.equal(decodeTripPrivacyReply(missing,target,command,{ownerId:a.owner,sessionId:a.session,mobileEpoch:1},bytes,a.trip,Date.now()),null,'actual SQL receipt missing identity group must fail closed');
   for(const badKeys of [undefined,null,{},[],...keys.map((_,i)=>keys.filter((_,j)=>j!==i)),...keys.map(k=>[...keys,k]),keys.map(k=>k.relation==='scoped_edit_private.operations_v1'?{...k,pk:{...k.pk,owner_id:uuid()}}:k)]){
    const bad=structuredClone(r);bad.decision.tripSourceIdentityKeys=badKeys;
    assert.equal(decodeTripPrivacyReply(bad,target,command,{ownerId:a.owner,sessionId:a.session,mobileEpoch:1},bytes,a.trip,Date.now()),null,'actual five-source identity/count/owner closure');
   }
  }
 }

 for(const table of ['contexts_v1','work_v1','requests_v1','operations_v1','lineage_v1'])assert.equal((await db(`select count(*)::int n from scoped_edit_private.${table} where owner_id='${a.owner}'`))[0].n,0,table);
 const meta=(await db(`select trip_objective from turn_private.service_tasks where id='${task.taskId}'`))[0].trip_objective;assert.equal(meta.schemaVersion,'trip-service-task-erased/1');assert.equal(meta.outcome,'erased');assert.equal(meta.goalId,goal.goalId);assert.ok(meta.proposalId);assert.deepEqual(Object.keys(meta).sort(),['goalId','outcome','proposalId','schemaVersion']);
 await assert.rejects(db(`insert into scoped_edit_private.contexts_v1 select * from jsonb_populate_record(null::scoped_edit_private.contexts_v1,$$${JSON.stringify(restoreContext)}$$::jsonb)`),/TRIP_SOURCE_ERASED|TURN_CONFLICT|CONVERSATION_CONFLICT/);
 assert.equal((await f.service('read_scoped_trip_edit_work_v1',{p_turn_id:task.turnId,p_lease_token:read.binding.leaseToken})).kind,'pending');
 assert.equal((await db(`select actual_micros::text cost from public.model_budget_attempts where task_id='${task.taskId}'`))[0].cost,'15');
 assert.equal((await db(`select head_version from public.trips where id='${a.trip}'`))[0].head_version,0);
 }
});

test('shared context remains explicitly ineligible and cannot erase another Task sources',flags,async t=>{
 const {db,upgrade}=await nativeDatabase(t);await db('begin;'+upgrade+'commit;');const f=fixturePorts(db);await db('update turn_private.service_task_capacity_settings set trip_enabled=true,enabled=true');
 const x=await produceTripCandidate(f,db),nextGoal=await f.canonical(x.a);
 const other=await f.call(x.a,'submit_trip_service_task_v1',[x.a.trip,{...x.input,operationId:uuid(),text:'Another explicit Trip goal using the same selected context'},nextGoal]);
 const selection={schemaVersion:'turn-trip-data/1',scope:'turn-sensitive-data/1',requestId:uuid(),turnId:x.task.turnId,objectIds:[]};const p=await f.call(x.a,'privacy_trip_service_task_v1',[x.a.trip,'turn','preview',JSON.stringify({action:'preview',...selection}),1]);assert.equal(p.eligible,false);assert.ok(p.conflicts.includes('SCOPED_EDIT_REFERENCE'));
 await assert.rejects(f.call(x.a,'privacy_trip_service_task_v1',[x.a.trip,'turn','erase',JSON.stringify({action:'erase',...selection,sourceDigest:p.sourceDigest,previewDigest:p.previewDigest,confirmed:true}),1]),/TURN_CONFLICT/);
 assert.equal((await db(`select count(*)::int n from scoped_edit_private.work_v1 where task_id='${other.taskId}'`))[0].n,1);assert.equal((await db(`select count(*)::int n from scoped_edit_private.contexts_v1 where id='${x.c.contextId}'`))[0].n,1);
});
