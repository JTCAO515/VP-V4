import test from 'node:test';import assert from 'node:assert/strict';
import {ControlController} from '../../../app/ops/controls/controller.ts';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',op='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';const schemaVersion='ops-control/1',scope={kind:'capability',key:'text'},when='2026-10-12T00:00:00.000000Z';
const ws={schemaVersion,sessionId:id,sessionEpoch:'0',revision:0,observedAt:when,controls:[{scope,state:'enabled',revision:0,stopRevision:0}],registry:{capabilities:['text'],providers:[],cities:[]},recoveryReady:true};
const set={schemaVersion,action:'set',operationId:op,expectedRevision:0,scope,state:'disabled'};
const receipt={schemaVersion,sessionId:id,sessionEpoch:'0',operationId:op,action:'set',scope,state:'disabled',revision:1,stopRevision:1,appliedAt:when,acknowledgement:'applied',effect:'blocks_new_dispatch'};
test('unknown mutation blocks another mutation and reads original receipt without retry',async()=>{
 const calls=[];const c=new ControlController(async input=>{calls.push(input.action);if(input.action==='set')throw Error('lost');return {status:200,body:{data:receipt}};},()=>{});
 await c.execute(set);assert.equal(c.view.message,'unknown');assert.deepEqual(c.view.pending,set);
 await c.execute({...set,operationId:id});assert.deepEqual(calls,['set']);
 await c.readPending();assert.deepEqual(calls,['set','receipt']);assert.equal(c.view.pending,null);assert.deepEqual(c.view.receipt,receipt);
});
test('new SQL session fence erases old workspace and cannot accept its receipt',async()=>{
 const c=new ControlController(async input=>({status:200,body:{data:input.action==='workspace'?ws:{...receipt,sessionEpoch:'1'}}}),()=>{});
 await c.execute({schemaVersion,action:'workspace'});assert.ok(c.view.workspace);
 await c.execute(set);assert.equal(c.view.message,'session_changed');assert.equal(c.view.workspace,null);assert.equal(c.view.receipt,null);
});
test('page/session invalidation prevents a late mutation response from updating UI',async()=>{
 let resolve;const pending=new Promise(r=>{resolve=r;});const c=new ControlController(async()=>pending,()=>{});
 const run=c.execute(set);c.invalidate();resolve({status:200,body:{data:receipt}});await run;
 assert.equal(c.view.message,'session_changed');assert.equal(c.view.receipt,null);assert.equal(c.view.busy,false);
});
