import test from 'node:test';
import assert from 'node:assert/strict';
import {isQaCancellationReceipt,QA_CANCELLATION_VERSION} from '../../../lib/qa-agent/cancellation-contract.ts';
import {createQaCancellationService} from '../../../lib/server/qa-agent/cancellation/service.ts';
const sessionId='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
const scope={sessionId,requestId},receipt=(state)=>({version:QA_CANCELLATION_VERSION,...scope,state,ack:['cancelled','terminal'].includes(state)?'observed':'unknown'});
test('browser-safe strict scope/version/state and acknowledgment do not promise cancellation',()=>{
 for(const state of ['pending','cancelled','terminal','not_observed'])assert.equal(isQaCancellationReceipt(receipt(state),scope),true);
 for(const invalid of [{...receipt('pending'),ack:'observed'},{...receipt('cancelled'),ack:'unknown'},{...receipt('terminal'),text:'private'},{...receipt('cancelled'),sessionId:other},{...receipt('cancelled'),requestId:other},{...receipt('cancelled'),version:'qa-agent/1'},{...receipt('cancelled'),state:'requested'},{...receipt('cancelled'),ownerId:other}])assert.equal(isQaCancellationReceipt(invalid,scope),false);
});
test('service only calls protected original-ID RPC; closed body rejects actor/turn/client status',async()=>{
 const calls=[];const service=createQaCancellationService(async(name,p)=>{calls.push({name,p});return {data:receipt('cancelled'),error:null};});
 assert.equal((await service('cancel',sessionId,requestId,{})).state,'cancelled');assert.deepEqual(calls,[{name:'qa_cancellation_v1',p:{p_action:'cancel',p_thread_id:sessionId,p_request_id:requestId}}]);
 for(const body of [null,{turnId:other},{ownerId:other},{state:'cancelled'},{requestId:other}])await assert.rejects(service('cancel',sessionId,requestId,body),e=>e.code==='INVALID_INPUT');assert.equal(calls.length,1);
});
test('unknown POST ACK retains original scope and recovery is read only, no admission/retry',async()=>{
 const calls=[];let lost=true;const service=createQaCancellationService(async(name,p)=>{calls.push(p.p_action);if(lost)throw Error('Synthetic ACK loss');return {data:receipt('cancelled'),error:null};});
 await assert.rejects(service('cancel',sessionId,requestId,{}),e=>e.code==='PROVIDER_UNAVAILABLE'&&e.ack==='unknown');lost=false;
 assert.equal((await service('read',sessionId,requestId)).state,'cancelled');assert.deepEqual(calls,['cancel','read']);
 const invalid=createQaCancellationService(async()=>({data:{...receipt('pending'),ack:'observed'},error:null}));await assert.rejects(invalid('cancel',sessionId,requestId,{}),e=>e.ack==='unknown');
});
