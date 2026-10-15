import test from 'node:test';
import assert from 'node:assert/strict';
import {createQaCancellationService} from '../../../lib/server/qa-agent/cancellation/service.ts';
const sessionId='aabbccdd-1234-4abc-8def-012345abcdef',requestId='eeffaabb-5678-4cde-9fab-abcdef012345';
const receipt={version:'qa-cancellation/1',sessionId,requestId,state:'cancelled',ack:'observed'};
test('uppercase original UUID POST decodes canonical SQL receipt and same-ID GET recovers',async()=>{
 const calls=[];const service=createQaCancellationService(async(name,p)=>{calls.push(p);return {data:receipt,error:null};});
 assert.deepEqual(await service('cancel',sessionId.toUpperCase(),requestId.toUpperCase(),{}),receipt);
 assert.deepEqual(await service('read',sessionId.toUpperCase(),requestId.toUpperCase()),receipt);
 assert.equal(calls.every(p=>p.p_thread_id===sessionId&&p.p_request_id===requestId),true);
});
test('unknown uppercase POST ACK keeps original scope; canonicalization never accepts another UUID',async()=>{
 let lost=true;const calls=[];const service=createQaCancellationService(async(name,p)=>{calls.push(p);if(lost)throw Error('Lost stop ACK');return {data:receipt,error:null};});
 await assert.rejects(service('cancel',sessionId.toUpperCase(),requestId.toUpperCase(),{}),e=>e.ack==='unknown');lost=false;
 assert.deepEqual(await service('read',sessionId.toUpperCase(),requestId.toUpperCase()),receipt);assert.deepEqual(calls.map(p=>p.p_action),['cancel','read']);
 const wrong=createQaCancellationService(async()=>({data:{...receipt,requestId:'ddeeffaa-5678-4cde-9fab-abcdef012345'},error:null}));
 await assert.rejects(wrong('read',sessionId.toUpperCase(),requestId.toUpperCase()),e=>e.code==='PROVIDER_UNAVAILABLE'&&e.ack==='unknown');
});
