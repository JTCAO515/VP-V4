import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID as uuid} from 'node:crypto';
import {parseScopedModelOutput,SCOPED_TRIP_EDIT_PROMPT,TRIP_SERVICE_TASK_PROMPT} from '../../../lib/server/turn/scoped-edit/model-output.ts';
import {parseScopedHostedProfile,createHostedScopedEditWorker} from '../../../lib/server/turn/scoped-edit/hosted-job.ts';
import {parseTripTaskContinuation} from '../../../lib/server/service-task-trip/contract.ts';
import {parseScopedReceipt} from '../../../lib/server/trip/scoped-edit/wire.ts';
test('original prompt/output stays byte-for-byte legacy; Trip clarification is bounded and versioned',()=>{
 assert.equal(createHash('sha256').update(SCOPED_TRIP_EDIT_PROMPT).digest('hex'),'1a360f47407d9507f311fd9f25a3645d4e6b29de034a0682761a47409b873f7c');
 assert.notEqual(TRIP_SERVICE_TASK_PROMPT,SCOPED_TRIP_EDIT_PROMPT);
 const q={kind:'clarification',question:'Which selected day?'};assert.equal(parseScopedModelOutput(q),null);assert.deepEqual(parseScopedModelOutput(q,true),q);
 for(const question of ['', ' ', 'x'.repeat(1001),'secret\0'])assert.equal(parseScopedModelOutput({...q,question},true),null);
 assert.equal(parseScopedModelOutput({...q,taskId:uuid()},true),null);
});
test('original receipt decoder rejects new question/failure without explicit Trip mode',()=>{
 const trip=uuid(),op=uuid(),r={kind:'trip_service_clarification/1',tripId:trip,operationId:op,contextId:uuid(),contextDigest:'a'.repeat(64),baseVersion:0,question:'Which day?',reused:false};
 assert.equal(parseScopedReceipt(r,trip,op),null);assert.ok(parseScopedReceipt(r,trip,op,true));
 assert.equal(parseScopedReceipt({...r,question:''},trip,op,true),null);
 const {question,...base}=r;const failed={...base,kind:'trip_service_failure/1',reason:'technical_failure'};assert.equal(parseScopedReceipt(failed,trip,op),null);assert.ok(parseScopedReceipt(failed,trip,op,true));
});
test('continuation accepts only necessary explicit same-task relationship and exact parent intent',()=>{
 const v={schemaVersion:'trip-service-task/1',action:'trip_continue',taskId:uuid(),parentTurnId:uuid(),operationId:uuid(),relationship:'repair',text:'Repair the same requested change'};
 assert.ok(parseTripTaskContinuation(v));for(const bad of [{...v,relationship:'new_goal'},{...v,cost:0},{...v,parentTurnId:'latest'},{...v,text:''}])assert.equal(parseTripTaskContinuation(bad),null);
});
