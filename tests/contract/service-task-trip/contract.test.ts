import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {parseTripTaskRequest,parseTripTaskAdmission} from '../../../lib/server/service-task-trip/contract.ts';
import {admitTripTask} from '../../../lib/server/service-task-trip/service.ts';
import {parseScopedEditRequest} from '../../../lib/server/trip/scoped-edit/contract.ts';
const input=()=>({schemaVersion:'trip-service-task/1',action:'trip_task',operationId:uuid(),basis:{contextId:uuid(),contextDigest:'a'.repeat(64),baseVersion:0},text:'Move the selected item',goal:{conversationId:uuid(),goalId:uuid(),goalVersion:2,messageId:uuid(),messageSequence:2,linkVersion:1,linkOperationId:uuid()}});
test('explicit versioned Trip intent is closed; legacy ask/manual retain their meaning',()=>{
 const v=input();assert.ok(parseTripTaskRequest(v));assert.equal(parseScopedEditRequest(v),null);
 for(const bad of [{...v,schemaVersion:'future'},{...v,taskId:uuid()},{...v,goal:{...v.goal,ownerId:uuid()}},{...v,goal:{...v.goal,messageSequence:0}},{...v,goal:{...v.goal,goalVersion:10001}},{...v,text:''}])assert.equal(parseTripTaskRequest(bad),null);
 const legacy={action:'ask',operationId:v.operationId,basis:v.basis,text:v.text};assert.ok(parseScopedEditRequest(legacy));assert.equal(parseTripTaskRequest(legacy),null);
});
test('admission uses authenticated SQL source validation and performs one call; unknown ACK never retries',async()=>{
 const v=parseTripTaskRequest(input())!;let calls=0;
 const receipt={kind:'trip_service_task/1',taskId:uuid(),turnId:uuid(),operationId:v.operationId,capacityMode:'record_only',reused:false};
 const read=await admitTripTask(uuid(),v,async(name,p)=>{calls++;assert.equal(name,'submit_trip_service_task_v1');assert.deepEqual(p.p_goal,v.goal);assert.equal((p.p_input as {action:string}).action,'ask');return {data:receipt,error:null};});
 assert.deepEqual(read,receipt);assert.equal(calls,1);
 await assert.rejects(admitTripTask(uuid(),v,async()=>{calls++;throw new Error('lost acknowledgement');}),/lost acknowledgement/);assert.equal(calls,2);
 assert.equal(parseTripTaskAdmission({...receipt,cost:0},v.operationId),null);
 assert.equal(parseTripTaskAdmission({...receipt,taskId:receipt.turnId},v.operationId),null);
});
