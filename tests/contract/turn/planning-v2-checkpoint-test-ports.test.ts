import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {createPlanningV2CheckpointTestPorts,decodePlanningV2CheckpointSnapshot,type CheckpointLease} from '../../../lib/server/turn/planning-v2-checkpoint-test-ports.ts';
const lease:CheckpointLease={ownerId:uuid(),taskId:uuid(),turnId:uuid(),leaseToken:uuid(),intakeContextDigest:'a'.repeat(64),planningContextDigest:'b'.repeat(64),environment:'local_synthetic'};
const snapshot={schemaVersion:'planning-v2-checkpoints/1',ownerId:lease.ownerId,taskId:lease.taskId,turnId:lease.turnId,intakeContextDigest:lease.intakeContextDigest,planningContextDigest:lease.planningContextDigest,place:{state:'missing'},modelAttempt:'none'};
const signal=new AbortController().signal;
test('private snapshot strictly binds tuple/model status and does not invent missing/none',()=>{
 assert.deepEqual(decodePlanningV2CheckpointSnapshot(snapshot,lease,Date.now()),snapshot);
 for(const bad of [null,{}, {...snapshot,ownerId:uuid()},{...snapshot,taskId:uuid()},{...snapshot,intakeContextDigest:lease.planningContextDigest},{...snapshot,modelAttempt:'unknown'},{...snapshot,modelAttempt:['none']},{...snapshot,place:{state:['missing']}},{...snapshot,place:{state:'missing',observation:{}}},{...snapshot,place:{state:'completed',observation:{}}},{...snapshot,executionAvailable:true}])assert.equal(decodePlanningV2CheckpointSnapshot(bad,lease,Date.now()),null);
 for(const status of ['released','reserved','dispatched','pending','settled'])assert.ok(decodePlanningV2CheckpointSnapshot({...snapshot,modelAttempt:status},lease,Date.now()));
});
test('private adapter forwards exact six params once, maps only authoritative closed results',async()=>{
 const calls:{name:string;params:unknown}[]=[],ports=createPlanningV2CheckpointTestPorts({mode:'local_protocol_test',now:Date.now,transport:async(name,params)=>{calls.push({name,params});return name.startsWith('read')?snapshot:name.startsWith('claim')?{kind:'duplicate'}:true;}});
 assert.deepEqual(await ports.checkpoints(lease,signal),snapshot);assert.equal(await ports.claimPlace(lease,signal),'duplicate');assert.equal(await ports.savePlace(lease,{},signal),true);await ports.unknownPlace(lease);
 assert.equal(calls.length,4);assert.deepEqual(calls[0].params,{p_owner:lease.ownerId,p_task:lease.taskId,p_turn:lease.turnId,p_lease:lease.leaseToken,p_intake_digest:lease.intakeContextDigest,p_planning_digest:lease.planningContextDigest});assert.deepEqual(calls[2].params,{...(calls[0].params as Record<string,unknown>),p_observation:{}});
});
test('blocked/transient/malformed results never retry or become claim/completed',async()=>{
 for(const result of [{kind:'blocked'},{kind:'claimed',lease:lease.leaseToken},{kind:['claimed']},null]){let n=0;const ports=createPlanningV2CheckpointTestPorts({mode:'local_protocol_test',now:Date.now,transport:async()=>{n++;return result;}});await assert.rejects(ports.claimPlace(lease,signal));assert.equal(n,1);}
 const ports=createPlanningV2CheckpointTestPorts({mode:'local_protocol_test',now:Date.now,transport:async()=>false});assert.equal(await ports.savePlace(lease,{},signal),false);await assert.rejects(ports.unknownPlace(lease));await assert.rejects(ports.checkpoints(lease,signal));
});
test('null/invalid/aborted lease stops before private transport',async()=>{
 let n=0;const ports=createPlanningV2CheckpointTestPorts({mode:'local_protocol_test',now:Date.now,transport:async()=>{n++;return snapshot;}});
 await assert.rejects(ports.checkpoints({...lease,leaseToken:''},signal));const controller=new AbortController();controller.abort();await assert.rejects(ports.checkpoints(lease,controller.signal));assert.equal(n,0);
});

test('completed snapshot requires a strict valid date and a positive finite integral clock',()=>{
 const now=Date.now(),observation={schemaVersion:'planning-place/1',source:'synthetic_fixture',observedAt:new Date(now).toISOString(),providerCalls:0,areas:[{id:'jingan',label:'Jingan',railMinutes:20,transfers:1},{id:'peoples_square',label:'Square',railMinutes:null,transfers:null}]},completed={...snapshot,place:{state:'completed',observation}};
 assert.ok(decodePlanningV2CheckpointSnapshot(completed,lease,now));
 for(const bad of [NaN,Infinity,-1,0,now+0.5])assert.equal(decodePlanningV2CheckpointSnapshot(completed,lease,bad),null);
 for(const bad of ['2026-02-30T00:00:00Z','2026-10-03','tomorrow',[observation.observedAt]])assert.equal(decodePlanningV2CheckpointSnapshot({...completed,place:{state:'completed',observation:{...observation,observedAt:bad}}},lease,now),null);
});
