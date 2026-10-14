import test from 'node:test';import assert from 'node:assert/strict';
import {handleControlOperations} from '../../../lib/server/observability/ops-control/http.ts';
import {decodeWorkspace,decodeBudget,decodeReceipt} from '../../../lib/server/observability/ops-control/projection.ts';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';const next='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const fence={schemaVersion:'ops-control/1',sessionId:id,sessionEpoch:'0'};
const scope={kind:'capability',key:'text'};const when='2026-10-12T00:00:00.000000Z';
const ws={...fence,revision:0,observedAt:when,controls:[{scope,state:'enabled',revision:0,stopRevision:0}],registry:{capabilities:['text'],providers:[],cities:[]},recoveryReady:true};
const set={schemaVersion:'ops-control/1',action:'set',operationId:next,expectedRevision:0,scope,state:'disabled'};
const receipt={...fence,operationId:next,action:'set',scope,state:'disabled',revision:1,stopRevision:1,appliedAt:when,acknowledgement:'applied',effect:'blocks_new_dispatch'};
const make=input=>new Request('https://example.test/api/ops/controls',{method:'POST',headers:{origin:'https://example.test','content-type':'application/json'},body:JSON.stringify(input)});
const run=(input,operations,authenticate=async()=>id)=>handleControlOperations(make(input),{enabled:true,createRpc:()=>({authenticate,operations})});
test('closed response rejects raw rows, unknown scope and mismatched receipt effect',()=>{
 assert.ok(decodeWorkspace(ws));assert.equal(decodeWorkspace({...ws,actorId:id}),null);
 assert.equal(decodeWorkspace({...ws,registry:{...ws.registry,providers:['new']}}),null);
 assert.equal(decodeWorkspace({...ws,controls:[]}),null);
 assert.equal(decodeReceipt({...receipt,effect:'permits_fresh_authorization'}),null);
 const b={...fence,action:'budget_read',scopeId:id,revision:0,stopRevision:0,enabled:false,frozen:true,expiresAt:when,exposureMicros:'9007199254740993',unresolvedAttempts:0,eligibility:'eligible'};
 assert.equal(decodeBudget(b).exposureMicros,'9007199254740993');assert.equal(decodeBudget({...b,unresolvedAttempts:1}),null);
});
test('authorized stop returns only original verified receipt after fresh live session reads',async()=>{
 const calls=[];const result=await run(set,async input=>{calls.push(input.action);return {data:input.action==='workspace'?ws:receipt,error:null};});
 assert.equal(result.status,200);assert.deepEqual(result.body.data,receipt);assert.deepEqual(calls,['workspace','set','receipt','workspace']);
});
test('loss after mutation dispatch retains UUID unknown ack without retry',async()=>{
 let calls=0;const result=await run(set,async input=>{if(input.action==='workspace')return {data:ws,error:null};calls++;throw Error('transport lost');});
 assert.equal(result.status,503);assert.equal(result.body.acknowledgement,'unknown');assert.equal(result.body.operationId,next);assert.equal(calls,1);
});
test('session replacement and changed receipt cannot report mutation success',async()=>{
 for(const change of ['session','receipt']){
  let count=0;const result=await run(set,async input=>{
   if(input.action==='workspace'){count++;return {data:count===2&&change==='session'?{...ws,sessionId:next}:ws,error:null};}
   return {data:input.action==='receipt'&&change==='receipt'?{...receipt,revision:2}:receipt,error:null};
  });assert.equal(result.body.acknowledgement,'unknown');assert.equal(result.status,503);
 }
});
test('nonmember and absent registry cannot send a mutation',async()=>{
 let sends=0;const deny=await run(set,async()=>({data:null,error:{message:'OPS_FORBIDDEN'}}));assert.equal(deny.status,403);
 const absent=await run(set,async input=>{if(input.action!=='workspace')sends++;return {data:{...ws,controls:[],registry:{capabilities:[],providers:[],cities:[]}},error:null};});
 assert.equal(absent.status,503);assert.equal(sends,0);
});
