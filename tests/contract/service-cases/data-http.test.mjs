import test from 'node:test';
import assert from 'node:assert/strict';
import {handleServiceData} from '../../../lib/server/service-cases/operations/data-http.ts';
import {decodeServiceDataBundle,parseServiceDataInput} from '../../../lib/server/service-cases/operations/data-contract.ts';
import {serviceRequestDigest} from '../../../lib/server/service-cases/operations/http.ts';
const actor='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222',caseId='33333333-3333-4333-8333-333333333333',op='44444444-4444-4444-8444-444444444444';
const deletion={action:'delete',operationId:op,caseId,grantRevision:1,confirmed:true};
const exportInput={action:'export',requestId:op,confirmed:true};
const receipt=(raw,outcome='deleted')=>({schemaVersion:'service-case-data/1',kind:'receipt',operationId:op,requestDigest:serviceRequestDigest(raw),outcome,createdAt:Date.now(),allUserDataCompleted:false});
const bundle=()=>({schemaVersion:'service-case-data/1',kind:'bundle',requestId:op,ownerId:actor,sessionId:sid,capturedAt:Date.now(),expiresAt:Date.now()+30000,sourceDigest:'a'.repeat(64),corePackageEnrollment:'not_enrolled',allUserDataCompleted:false,coverage:{case:'complete',grant_audit:'complete',service:'complete',minutes:'complete',service_audit:'complete',operation:'complete',brief:'unavailable',attachments:'unavailable'},rows:[{key:'case:'+caseId,domain:'case',value:{caseId,category:'general',problem:'Synthetic private support',revision:1,recipientId:null,expiresAt:null,revoked:true,createdAt:'2026-10-05T00:00:00Z'}}]});
async function run(input,{enabled=true,reply,auth=async()=>actor,session=()=>sid,headers={}}={}){
 const raw=typeof input==='string'?input:JSON.stringify(input),calls=[],r=receipt(raw);
 const response=await handleServiceData(new Request('http://localhost/api/data',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer synthetic',...headers},body:raw}),{enabled,createRpc:()=>({authenticate:auth,sessionId:session,call:async(_,p)=>{calls.push(p);return reply?reply(p,calls.length):{data:p.p_input.action==='read_operation'?{receipt:r}:r,error:null};}})});
 return {response,calls};
}
test('data scope remains independently default disabled without any RPC',async()=>{
 const {response,calls}=await run(deletion,{enabled:false});assert.equal(response.status,503);assert.equal(calls.length,0);
});
test('delete requires explicit confirmation and rejects caller authority or ambiguous credentials',async()=>{
 for(const v of [{...deletion,confirmed:false},{...deletion,ownerId:actor},{...deletion,grantRevision:-1}]){const {response,calls}=await run(v);assert.equal(response.status,400);assert.equal(calls.length,0);}
 const {response,calls}=await run(deletion,{headers:{cookie:'synthetic'}});assert.equal(response.status,403);assert.equal(calls.length,0);
});
test('permanent minimal deletion receipt binds original bytes and does not need the erased Case',async()=>{
 const raw=JSON.stringify(deletion,null,2),r=receipt(raw);
 const {response,calls}=await run(raw,{reply:async p=>({data:p.p_input.action==='read_operation'?{receipt:r}:r,error:null})});
 assert.equal(response.status,200);assert.equal(response.body.data.outcome,'deleted');assert.equal(response.body.data.requestDigest,serviceRequestDigest(raw));assert.equal(calls[1].p_input.action,'read_operation');assert.ok(!('caseId'in response.body.data));assert.ok(!('requestBytes'in response.body.data));
});
test('delete unknown ACK and null receipt preserve uncertainty instead of manufacturing deletion',async()=>{
 const absent=await run({action:'read_operation',operationId:op},{reply:async()=>({data:{receipt:null},error:null})});assert.equal(absent.response.status,200);assert.deepEqual(absent.response.body.data,{receipt:null});
 const failure=await run(deletion,{reply:async()=>{throw Error('network loss');}});assert.equal(failure.response.status,503);assert.equal(failure.response.body.acknowledgement,'unknown');assert.equal(failure.response.body.operationId,op);
});
test('abandon delete preserves original byte identity and never Undo an already deleted command',async()=>{
 const original=JSON.stringify(deletion,null,1);
 for(const outcome of ['deleted','cancelled']){const r=receipt(original,outcome);const result=await run({action:'abandon',operationId:op,mutationBytes:original},{reply:async p=>({data:p.p_input.action==='read_operation'?{receipt:r}:r,error:null})});assert.equal(result.response.status,200);assert.equal(result.response.body.data.outcome,outcome);assert.equal(result.calls[0].p_input.mutationBytes,original);}
 assert.equal(parseServiceDataInput({action:'abandon',operationId:caseId,mutationBytes:original}),null);
});
test('export is a bounded independent service bundle with honest unavailable coverage',async()=>{
 const b=bundle(),{response,calls}=await run(exportInput,{reply:async()=>({data:b,error:null})});assert.equal(response.status,200);assert.equal(calls.length,2);assert.equal(response.body.data.corePackageEnrollment,'not_enrolled');assert.equal(response.body.data.allUserDataCompleted,false);assert.equal(response.body.data.coverage.brief,'unavailable');assert.equal(response.body.data.coverage.attachments,'unavailable');
});
test('source revocation or deletion between export snapshots suppresses the entire download',async()=>{
 for(const changed of [{...bundle(),sourceDigest:'b'.repeat(64)},{...bundle(),rows:[]},null]){const b=bundle();const {response}=await run(exportInput,{reply:async(_,n)=>({data:n===1?b:changed,error:null})});assert.equal(response.status,503);assert.ok(!('data'in response.body));}
});
test('export owner/session/request binding and final replacement remain mandatory',async()=>{
 for(const b of [{...bundle(),ownerId:caseId},{...bundle(),sessionId:caseId},{...bundle(),requestId:caseId}]){const {response}=await run(exportInput,{reply:async()=>({data:b,error:null})});assert.equal(response.status,503);}
 let count=0;const b=bundle();const {response}=await run(exportInput,{reply:async()=>({data:b,error:null}),auth:async()=>{count++;return actor;},session:()=>count===1?sid:caseId});assert.equal(response.status,401);assert.ok(!('data'in response.body));
});
test('export refuses expired, silently partial, over-limit and future secret columns',async()=>{
 const b=bundle();
 for(const v of [{...b,expiresAt:b.capturedAt-1},{...b,expiresAt:b.capturedAt+30001},{...b,allUserDataCompleted:true},{...b,coverage:{...b.coverage,case:'partial'}},{...b,rows:Array.from({length:10001},()=>b.rows[0])},{...b,rows:[{...b.rows[0],value:{...b.rows[0].value,token:'must not be included'}}]}])assert.equal(decodeServiceDataBundle(v),null);
 const large={...b,rows:Array.from({length:1000},(_,n)=>({...b.rows[0],key:'case:'+n,value:{...b.rows[0].value,problem:'S'.repeat(1000)}}))};assert.ok(decodeServiceDataBundle(large));const {response}=await run(exportInput,{reply:async()=>({data:large,error:null})});assert.equal(response.status,503);
});
test('mismatched deletion digest and final credential unavailability never clear the pending command',async()=>{
 const raw=JSON.stringify(deletion),bad={...receipt(raw),requestDigest:'e'.repeat(64)};
 const mismatch=await run(raw,{reply:async()=>({data:bad,error:null})});assert.equal(mismatch.response.body.acknowledgement,'unknown');
 let n=0;const failure=await run(deletion,{auth:async()=>{if(++n===2)throw Error('credential service unavailable');return actor;}});assert.equal(failure.response.status,503);assert.equal(failure.response.body.acknowledgement,'unknown');
});
