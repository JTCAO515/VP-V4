import test from 'node:test';
import assert from 'node:assert/strict';
import {handleServiceOperations,serviceRequestDigest} from '../../../lib/server/service-cases/operations/http.ts';
import {parseServiceInput,decodeServiceProjection,decodeServiceWorkspace} from '../../../lib/server/service-cases/operations/contract.ts';
const actor='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222',caseId='33333333-3333-4333-8333-333333333333',operationId='44444444-4444-4444-8444-444444444444';
const now=Date.now();
const requestInput={action:'request',operationId,caseId,expectedRevision:0,grantRevision:1,urgency:'normal',trip:{kind:'unknown'}};
const queued=()=>({caseId,revision:1,grantRevision:1,status:'queued',category:'general',problem:'Synthetic service question',grantState:'active',expiresAt:now+60000,updatedAt:now,urgency:'normal',capacity:{state:'unknown',checkedAt:now},staff:null,brief:{kind:'unknown'},sources:{kind:'unknown'},trip:{kind:'unknown'},evidence:[],manualMinutes:0,manualMinutesScope:'recorded_only',proposal:null});
const receipt=(raw,outcome='applied')=>({operationId,requestDigest:serviceRequestDigest(raw),action:JSON.parse(raw).action,outcome,caseId,revision:1,grantRevision:1,createdAt:now});
const request=(raw,staff=false,extra={})=>new Request('http://localhost/api/service',{method:'POST',headers:{'content-type':'application/json',...(staff?{origin:'http://localhost','x-ops-expected-actor':actor,'x-ops-expected-session':session}:{authorization:'Bearer synthetic'}),...extra},body:raw});
async function run(raw,{staff=false,call,auth=async()=>actor,sid=()=>session,proof=async()=>true,extra={},enabled=true}={}){
 const calls=[];
 const result=await handleServiceOperations(request(raw,staff,extra),{enabled,surface:staff?'staff':'owner',sameOrigin:staff,createRpc:()=>({authenticate:auth,sessionId:sid,proveOwnerInput:proof,proveOwnerProjection:proof,call:async(name,params)=>{calls.push({name,params});return call?call(params,calls.length):{data:params.p_input.action==='read_operation'?{receipt:receipt(raw)}:receipt(raw),error:null};}})});
 return {result,calls};
}

test('disabled operations neither authenticate nor dispatch',async()=>{
 const {result,calls}=await run(JSON.stringify(requestInput),{enabled:false,auth:()=>{throw Error('must not authenticate');}});
 assert.equal(result.status,503);assert.equal(result.body.error.code,'CASE_OPERATIONS_DISABLED');assert.equal(calls.length,0);
});
test('original Unicode bytes and whitespace reach RPC and bind the stored receipt',async()=>{
 const raw=JSON.stringify(requestInput,null,2);const {result,calls}=await run(raw);
 assert.equal(result.status,200);assert.equal(calls[0].params.p_request_bytes,raw);assert.deepEqual(calls[0].params.p_input,requestInput);assert.equal(result.body.data.requestDigest,serviceRequestDigest(raw));assert.equal(calls[1].params.p_input.action,'read_operation');assert.notEqual(serviceRequestDigest(raw),serviceRequestDigest(JSON.stringify(requestInput)));
});
test('staff cannot submit owner commands or attach a guessed Proposal',async()=>{
 for(const input of [requestInput,{action:'cancel',operationId,caseId,expectedRevision:1,grantRevision:1},{action:'select_proposal',operationId,caseId,expectedRevision:1,grantRevision:1,proposal:{proposalId:operationId,tripId:caseId,baseVersion:1}}]){
  const {result,calls}=await run(JSON.stringify(input),{staff:true});assert.equal(result.status,400);assert.equal(calls.length,0);
 }
 const update={action:'update',operationId,caseId,expectedRevision:2,grantRevision:1,status:'unresolved',evidence:[],minutes:null,proposal:{proposalId:operationId,tripId:caseId,baseVersion:1}};
 assert.equal(parseServiceInput(update),null);
});
test('owner cannot submit accept or abandon a staff command',async()=>{
 const staff={action:'accept',operationId,caseId,expectedRevision:1,grantRevision:1};
 for(const input of [staff,{action:'abandon',operationId,mutationBytes:JSON.stringify(staff)}]){const {result,calls}=await run(JSON.stringify(input));assert.equal(result.status,400);assert.equal(calls.length,0);}
});
test('staff request must match verified actor and live session',async()=>{
 const raw=JSON.stringify({action:'accept',operationId,caseId,expectedRevision:1,grantRevision:1});
 for(const extra of [{'x-ops-expected-actor':caseId},{'x-ops-expected-session':caseId},{authorization:'Bearer synthetic'}]){const {result,calls}=await run(raw,{staff:true,extra});assert.equal(result.status,403);assert.equal(calls.length,0);}
});
test('post-dispatch timeout, invalid digest and revoked fresh read retain unknown ACK',async()=>{
 const raw=JSON.stringify(requestInput);
 for(const call of [async()=>{throw Error('timeout');},async()=>({data:{...receipt(raw),requestDigest:'a'.repeat(64)},error:null}),async(p,n)=>n===1?{data:receipt(raw),error:null}:{data:null,error:{message:'CASE_FORBIDDEN'}}]){
  const {result}=await run(raw,{call});assert.equal(result.status,503);assert.equal(result.body.acknowledgement,'unknown');assert.equal(result.body.operationId,operationId);assert.equal(result.body.recoveryAction,'read_original_operation');assert.equal(result.body.error.code,'CASE_ACK_UNKNOWN');
 }
});
test('same actor replacement before reply cannot acknowledge old operation',async()=>{
 let count=0;const raw=JSON.stringify(requestInput);
 const {result}=await run(raw,{auth:async()=>{count++;return actor;},sid:()=>count===1?session:caseId});
 assert.equal(result.status,503);assert.equal(result.body.acknowledgement,'unknown');
});
test('receipt absence is returned without claiming abandonment or mutating again',async()=>{
 const {result,calls}=await run(JSON.stringify({action:'read_operation',operationId}),{call:async()=>({data:{receipt:null},error:null})});
 assert.equal(result.status,200);assert.deepEqual(result.body.data,{receipt:null});assert.equal(calls.length,2);assert.ok(calls.every(c=>c.params.p_input.action==='read_operation'));
});
test('explicit abandon forwards original bytes and accepts original applied receipt without Undo',async()=>{
 const original=JSON.stringify(requestInput,null,1),raw=JSON.stringify({action:'abandon',operationId,mutationBytes:original});
 for(const outcome of ['applied','cancelled']){
  const r=receipt(original,outcome);const {result,calls}=await run(raw,{call:async(p)=>({data:p.p_input.action==='read_operation'?{receipt:r}:r,error:null})});
  assert.equal(result.status,200);assert.equal(result.body.data.outcome,outcome);assert.equal(calls[0].params.p_input.mutationBytes,original);assert.ok(calls.every(c=>c.params.p_input.action!=='request'));
 }
 assert.equal(parseServiceInput({action:'abandon',operationId:caseId,mutationBytes:original}),null);
});
test('current owner Trip/Proposal proof is required before dispatch and again after receipt',async()=>{
 const raw=JSON.stringify({...requestInput,trip:{kind:'bound',tripId:caseId,headVersion:1}});
 const rejected=await run(raw,{proof:async()=>false});assert.equal(rejected.result.status,409);assert.equal(rejected.calls.length,0);
 let n=0;const changed=await run(raw,{proof:async()=>++n===1});assert.equal(changed.result.status,503);assert.equal(changed.result.body.acknowledgement,'unknown');
});
test('fresh read denies revoked staff body even if first response was eligible',async()=>{
 const raw=JSON.stringify({action:'read',caseId});const p={...queued(),status:'accepted',staff:{actorId:actor,label:'Synthetic operator',acceptedAt:now,shiftEndsAt:now+60000}};
 const {result}=await run(raw,{staff:true,call:async(_,n)=>n===1?{data:p,error:null}:{data:null,error:{message:'CASE_FORBIDDEN'}}});
 assert.equal(result.status,503);assert.ok(!('data'in result.body));
});
test('queued projection cannot invent staff, ETA, result, or completed Brief',()=>{
 assert.ok(decodeServiceProjection(queued()));
 for(const p of [{...queued(),staff:{actorId:actor,label:'Invented',acceptedAt:now,shiftEndsAt:now+60000}},{...queued(),eta:now+60000},{...queued(),brief:{kind:'qualified'}},{...queued(),manualMinutesScope:'actual_total'},{...queued(),evidence:[{kind:'contacted_provider',note:'Called',reference:'Synthetic reference',observedAt:now}]}])assert.equal(decodeServiceProjection(p),null);
});
test('contact alone does not establish resolved; tutorial and external resolution stay distinct',()=>{
 const base={action:'update',operationId,caseId,expectedRevision:3,grantRevision:1,status:'resolved',minutes:null,proposal:null};
 const item={note:'Synthetic evidence',reference:'Synthetic record',observedAt:now};
 assert.equal(parseServiceInput({...base,evidence:[{...item,kind:'contacted_provider'}]}),null);
 for(const kind of ['tutorial','external_resolution'])assert.ok(parseServiceInput({...base,evidence:[{...item,kind}]}));
});
test('bounded complete workspace rejects silently partial and duplicate pages',()=>{
 const workspace={actorId:actor,surface:'owner',capacity:{state:'unknown',checkedAt:now},cases:[queued()],complete:true};
 assert.ok(decodeServiceWorkspace(workspace));assert.equal(decodeServiceWorkspace({...workspace,complete:false}),null);assert.equal(decodeServiceWorkspace({...workspace,cases:[queued(),queued()]}),null);assert.equal(decodeServiceWorkspace({...workspace,cases:Array.from({length:51},queued)}),null);
});
test('oversize body, malformed UTF8 and unexpected authority fields never reach RPC',async()=>{
 for(const raw of [JSON.stringify({...requestInput,staffId:actor}),' '.repeat(48001),new Uint8Array([0xc3,0x28]),'\ufeff'+JSON.stringify(requestInput)]){const {result,calls}=await run(raw);assert.ok([400,413].includes(result.status));assert.equal(calls.length,0);}
});
