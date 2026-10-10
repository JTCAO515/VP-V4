import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { directionsParams, directionsReceipt } from '../../../../lib/server/planning/directions/protocol.ts';
const id=randomUUID();const op=randomUUID();
const intake={schemaVersion:'travel-directions-intake/1',destinations:['Shanghai'],durationDays:10,interests:['food'],currentPace:null,budget:null,dates:null,intent:'explore'};
const submit=()=>Object.assign(Object.fromEntries(['conversationId','goalId','parentMessageId','messageId','messageKey','threadId','turnId','taskId','taskKey','planningPolicyId'].map(k=>[k,randomUUID()])),{expectedGoalVersion:1,locale:'en',text:'Ten days, dates unknown',memoryBasis:[],expectedSourceSequence:2,expectedIntakeRevision:0,expectedIntakeDigest:null,intake,useSavedPace:false,expectedProfileRevision:null});
test('request rejects foreign authority, Profile without revision, duplicate Memory and source drift shape',()=>{
 const p=submit();assert.ok(directionsParams('submit',p));
 for(const bad of [{...p,ownerId:randomUUID()},{...p,useSavedPace:true},{...p,expectedIntakeRevision:1},{...p,expectedSourceSequence:0},{...p,taskId:p.turnId},{...p,memoryBasis:[{id,revision:1},{id,revision:2}]}])assert.equal(directionsParams('submit',bad),null);
});
test('choose/save/edit/bind are independent closed operations and edits do not carry dates',()=>{
 const p={artifactId:id,expectedRevision:1,operationId:op};assert.ok(directionsParams('save',p));assert.ok(directionsParams('choose',{...p,directionId:'depth'}));assert.equal(directionsParams('save',{...p,confirm:true}),null);
 const edit={...p,replacements:[{ordinal:2,destination:'Shanghai',activities:['Time for food']}]};assert.ok(directionsParams('edit',edit));assert.equal(directionsParams('edit',{...edit,replacements:[{...edit.replacements[0],startsAt:'09:00'}]}),null);
 assert.ok(directionsParams('bind',{...p,expectedRevision:1000,tripId:randomUUID(),expectedTripVersion:3,startDate:'2026-11-01'}));assert.equal(directionsParams('bind',{...p,tripId:randomUUID(),expectedTripVersion:3,startDate:'2026-02-30'}),null);
});
test('receipts retain original identities, exact revision and source sequence without dispatch grant',()=>{
 const p=submit();const r={kind:'published',artifactId:id,revision:1,reused:false,taskId:p.taskId,turnId:p.turnId,conversationId:p.conversationId,goalId:p.goalId,goalVersion:1,inputMessageId:p.messageId,inputSequence:3,intakeRevision:1,intakeDigest:'a'.repeat(64),current:true};assert.equal(directionsReceipt('submit',r,p),true);
 for(const bad of [{...r,readyForProvider:true},{...r,inputSequence:2},{...r,inputSequence:1000001},{...r,taskId:randomUUID()},{...r,intakeRevision:2}])assert.equal(directionsReceipt('submit',bad,p),false);
 assert.equal(directionsReceipt('submit',{...r,inputSequence:8},p),true);
 const action={artifactId:id,expectedRevision:1,operationId:op};assert.equal(directionsReceipt('choose',{kind:'selected',artifactId:id,revision:2,reused:false},action),true);assert.equal(directionsReceipt('save',{kind:'selected',artifactId:id,revision:2,reused:false},action),false);
});

test('UUID spelling is canonical for receipt comparison while original operation bytes stay separate',()=>{
 const p=submit();p.conversationId=p.conversationId.toUpperCase();p.taskId=p.taskId.toUpperCase();p.memoryBasis=[{id:id.toUpperCase(),revision:1}];
 const normalized=directionsParams('submit',p);assert.equal(normalized.conversationId,p.conversationId.toLowerCase());assert.equal(normalized.taskId,p.taskId.toLowerCase());assert.equal(normalized.memoryBasis[0].id,id.toLowerCase());assert.equal(p.conversationId,p.conversationId.toUpperCase());
});
