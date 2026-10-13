import test from 'node:test';import assert from 'node:assert/strict';
import {ControlController} from '../../../app/ops/controls/controller.ts';
import {handleControlOperations} from '../../../lib/server/observability/ops-control/http.ts';
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
const make=(input,signal)=>new Request('https://example.test/api/ops/controls',{method:'POST',headers:{origin:'https://example.test','content-type':'application/json'},body:JSON.stringify(input),signal});
test('HTTP definitive unavailable rejection releases pending and permits a fresh operation',async t=>{
 for(const cause of ['disabled','workspace_error','workspace_malformed','unregistered','recovery_not_ready','sql_rejection'])await t.test(cause,async()=>{
  const calls=[];let rejecting=true;let rejected;
  const c=new ControlController(async(input,signal)=>{
   const result=await handleControlOperations(make(input,signal),{enabled:!(rejecting&&cause==='disabled'),createRpc:()=>({authenticate:async()=>id,operations:async operation=>{
    calls.push(operation);
    if(operation.action==='workspace'){
     if(rejecting&&cause==='workspace_error')return {data:null,error:{message:'OPS_UNAVAILABLE'}};
     if(rejecting&&cause==='workspace_malformed')return {data:{},error:null};
     return {data:rejecting&&cause==='unregistered'?{...ws,controls:[],registry:{capabilities:[],providers:[],cities:[]}}:rejecting&&cause==='recovery_not_ready'?{...ws,recoveryReady:false}:ws,error:null};
    }
    if(rejecting)return {data:null,error:{message:'OPS_UNAVAILABLE'}};
    return {data:{...receipt,operationId:operation.operationId},error:null};
   }})});
   if(rejecting)rejected=result;return result;
  },()=>{});
  await c.execute(set);
  assert.deepEqual(rejected,{status:503,body:{error:{code:'OPS_UNAVAILABLE'}}});
  assert.equal(c.view.pending,null);assert.equal(c.view.message,'unavailable');assert.equal(c.view.busy,false);
  assert.equal(calls.filter(input=>input.action==='set').length,cause==='sql_rejection'?1:0);
  const before=calls.length;await c.readPending();assert.equal(calls.length,before);
  rejecting=false;await c.execute({...set,operationId:id});
  assert.equal(c.view.message,'applied');assert.equal(c.view.pending,null);assert.equal(c.view.receipt.operationId,id);
  assert.deepEqual(calls.slice(before).map(input=>input.action),['workspace','set','receipt','workspace']);
 });
});
test('HTTP unknown outcomes retain original operation and only matching receipt can resolve it',async t=>{
 for(const cause of ['lost_transport','malformed_receipt','session_replaced'])await t.test(cause,async()=>{
  const calls=[];let recovering=false;let workspaces=0;let unknown;
  const c=new ControlController(async(input,signal)=>{
   const result=await handleControlOperations(make(input,signal),{enabled:true,createRpc:()=>({authenticate:async()=>id,operations:async operation=>{
    calls.push(operation);
    if(operation.action==='workspace'){
     workspaces++;return {data:!recovering&&cause==='session_replaced'&&workspaces===2?{...ws,sessionEpoch:'1'}:ws,error:null};
    }
    if(!recovering&&operation.action==='set'){
     if(cause==='lost_transport')throw Error('lost');
     if(cause==='malformed_receipt')return {data:{},error:null};
    }
    return {data:receipt,error:null};
   }})});
   if(!recovering)unknown=result;return result;
  },()=>{});
  await c.execute(set);assert.equal(unknown.status,503);assert.equal(unknown.body.acknowledgement,'unknown');
  assert.equal(unknown.body.operationId,op);assert.equal(unknown.body.recoveryAction,'read_original_operation');
  assert.deepEqual(c.view.pending,set);assert.equal(c.view.message,'unknown');
  const before=calls.length;
  await c.execute({...set,operationId:id});await c.execute({schemaVersion,action:'receipt',operationId:id});
  assert.equal(calls.length,before);assert.deepEqual(c.view.pending,set);
  recovering=true;await c.readPending();
  assert.deepEqual(calls.slice(before).map(input=>input.action),['workspace','receipt','receipt','workspace']);
  assert.equal(calls.filter(input=>input.action==='set').length,1);
  assert.equal(c.view.pending,null);assert.deepEqual(c.view.receipt,receipt);assert.equal(c.view.message,'applied');
 });
});
test('unavailable with acknowledgement or malformed rejection cannot clear pending',async t=>{
 for(const body of [
  {error:{code:'OPS_UNAVAILABLE'},operationId:op,acknowledgement:'unknown',recoveryAction:'read_original_operation'},
  {error:{code:'OPS_UNAVAILABLE'},acknowledgement:null},
  {error:{code:'OPS_UNAVAILABLE',extra:true}},
  {error:'OPS_UNAVAILABLE'},
  null,
 ])await t.test(JSON.stringify(body),async()=>{
  const calls=[];const c=new ControlController(async input=>{calls.push(input);return input.action==='receipt'?{status:200,body:{data:receipt}}:{status:503,body};},()=>{});
  await c.execute(set);assert.deepEqual(c.view.pending,set);assert.equal(c.view.message,'unknown');
  await c.execute({...set,operationId:id});assert.equal(calls.length,1);
  await c.readPending();assert.deepEqual(calls.map(input=>input.action),['set','receipt']);
  assert.equal(c.view.pending,null);assert.deepEqual(c.view.receipt,receipt);
 });
});
test('session invalidation ignores late definitive unavailable rejection while a new operation is pending',async()=>{
 let resolve;const late=new Promise(r=>{resolve=r;});let calls=0;
 const c=new ControlController(async()=>{if(++calls===1)return late;throw Error('lost');},()=>{});
 const run=c.execute(set);c.invalidate();const fresh={...set,operationId:id};await c.execute(fresh);
 resolve({status:503,body:{error:{code:'OPS_UNAVAILABLE'}}});await run;
 assert.deepEqual(c.view.pending,fresh);assert.equal(c.view.message,'unknown');assert.equal(c.view.busy,false);assert.equal(c.view.receipt,null);
});
