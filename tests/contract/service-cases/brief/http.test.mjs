import test from 'node:test';
import assert from 'node:assert/strict';
import {handleTravelerBrief,briefRequestDigest} from '../../../../lib/server/service-cases/brief/http.ts';
import {BRIEF_NOTICE,parseBriefInput,decodeBrief,decodeBriefSourceOptions,decodeBriefDataBundle,decodeBriefOwnerState,validBriefField} from '../../../../lib/server/service-cases/brief/contract.ts';
const owner='11111111-1111-4111-8111-111111111111',staff='22222222-2222-4222-8222-222222222222',caseId='33333333-3333-4333-8333-333333333333',operationId='44444444-4444-4444-8444-444444444444',session='55555555-5555-4555-8555-555555555555',previewId='66666666-6666-4666-8666-666666666666';
const now=Date.now(),sourceDigest='a'.repeat(64);
const binding={caseId,ownerId:owner,recipientId:staff,grantRevision:1,purpose:'case_assistance',category:'general'};
const source={kind:'case',id:caseId,revision:1,updatedAt:now,receiptId:null,consentId:null,basisDigest:sourceDigest};
const problem={key:'problem',field:'problem',state:'available',value:'真实问题 / synthetic fixture',provenance:'explicit',source};
const preview=()=>({schemaVersion:'traveler-brief/1',kind:'preview',...binding,previewId,revision:0,sourceDigest,createdAt:now,expiresAt:now+60000,fields:[problem,{key:'budget',field:'budget',state:'unknown'},{key:'response_detail',field:'response_detail',state:'unknown'}],noticeVersion:BRIEF_NOTICE});
const projection=()=>({schemaVersion:'traveler-brief/1',kind:'brief',...binding,revision:1,sourceDigest,updatedAt:now,expiresAt:now+60000,fields:[problem],noticeVersion:BRIEF_NOTICE});
const sources={profilePace:false,memories:[],intakeMessageId:null};
const previewInput={action:'preview',caseId,recipientId:staff,grantRevision:1,sources};
const share={action:'share',operationId,caseId,recipientId:staff,grantRevision:1,expectedRevision:0,previewId,sourceDigest,selectedKeys:['problem'],noticeVersion:BRIEF_NOTICE,confirmed:true};
const receipt=(raw,outcome='applied')=>({schemaVersion:'traveler-brief/1',kind:'receipt',operationId,requestDigest:briefRequestDigest(raw),action:JSON.parse(raw).action,outcome,caseId,revision:1,grantRevision:1,createdAt:now});
const request=(raw,staffSurface=false,headers={})=>new Request('http://localhost/api/brief',{method:'POST',headers:{'content-type':'application/json',...(staffSurface?{origin:'http://localhost','x-ops-expected-actor':staff,'x-ops-expected-session':session}:{authorization:'Bearer synthetic'}),...headers},body:raw});
async function run(raw,{staffSurface=false,enabled=true,headers={},call,authenticate,sessionId}={}){
 const calls=[];const actor=staffSurface?staff:owner;
 const result=await handleTravelerBrief(request(raw,staffSurface,headers),{enabled,surface:staffSurface?'staff':'owner',sameOrigin:staffSurface,createRpc:()=>({authenticate:authenticate??(async()=>actor),sessionId:sessionId??(()=>session),call:async(name,params)=>{calls.push({name,params});return call?call(params,calls.length):{data:params.p_input.action==='read_operation'?{receipt:receipt(raw)}:receipt(raw),error:null};}})});
 return {result,calls};
}
test('preview never shares and fresh revalidation uses the server preview identifier',async()=>{
 const p=preview(),raw=JSON.stringify(previewInput);const {result,calls}=await run(raw,{call:async()=>({data:p,error:null})});
 assert.equal(result.status,200);assert.deepEqual(calls[0].params.p_input,previewInput);assert.deepEqual(calls[1].params.p_input,{action:'read_preview',previewId});assert.ok(calls.every(c=>!['share','grant'].includes(c.params.p_input.action)));assert.equal(result.body.data.fields[1].state,'unknown');
});
test('owner source options returns bounded real references without staff authorization',async()=>{
 const options={schemaVersion:'traveler-brief/1',kind:'source_options',caseId,ownerId:owner,recipientId:staff,grantRevision:1,expiresAt:now+60000,profilePace:null,memories:[],memoryScope:'latest_three_preferences',intake:null};
 assert.ok(decodeBriefSourceOptions(options));assert.equal(decodeBriefSourceOptions({...options,memoryScope:'complete_history'}),null);
 const raw=JSON.stringify({action:'source_options',caseId});const {result}=await run(raw,{call:async()=>({data:options,error:null})});assert.equal(result.status,200);
 const denied=await run(raw,{staffSurface:true});assert.equal(denied.result.status,403);assert.equal(denied.calls.length,0);
});
test('exact original bytes bind share and whitespace mismatch cannot acknowledge',async()=>{
 const raw=JSON.stringify(share,null,2);const good=await run(raw);assert.equal(good.result.status,200);assert.equal(good.calls[0].params.p_request_bytes,raw);assert.equal(good.result.body.data.requestDigest,briefRequestDigest(raw));
 const wrong=receipt(JSON.stringify(share));const bad=await run(raw,{call:async()=>({data:wrong,error:null})});assert.equal(bad.result.status,503);assert.equal(bad.result.body.acknowledgement,'unknown');assert.ok(!('data'in bad.result.body));
});
test('share cannot inject values, grant fields, source summaries or inferred personality',()=>{
 for(const invalid of [{...share,value:'invented'},{...share,confirmed:false},{...share,selectedKeys:[]},{...share,selectedKeys:['problem','problem']},{...share,selectedKeys:['personality']},{...share,noticeVersion:'other'},{...previewInput,sources:{...sources,allHistory:true}},{...previewInput,sources:{...sources,memories:[{id:owner,revision:1},{id:owner,revision:1}]}}])assert.equal(parseBriefInput(invalid),null);
 assert.equal(validBriefField({...problem,provenance:'inferred'}),false);assert.equal(validBriefField({...problem,field:'response_detail',key:'response_detail'}),false);assert.equal(decodeBrief({...projection(),fields:[{key:'budget',field:'budget',state:'unknown'}]}),null);
});
test('staff reads require verified actor/session, recipient and the exact explicit shared revision',async()=>{
 const input={action:'read',caseId,recipientId:staff,grantRevision:1,expectedRevision:1},raw=JSON.stringify(input);
 const good=await run(raw,{staffSurface:true,call:async()=>({data:projection(),error:null})});assert.equal(good.result.status,200);
 for(const headers of [{'x-ops-expected-actor':owner},{'x-ops-expected-session':owner},{authorization:'Bearer synthetic'}]){const bad=await run(raw,{staffSurface:true,headers});assert.equal(bad.result.status,403);assert.equal(bad.calls.length,0);}
 const other=await run(JSON.stringify({...input,recipientId:owner}),{staffSurface:true});assert.equal(other.result.status,403);assert.equal(other.calls.length,0);
 const stale=await run(JSON.stringify({...input,expectedRevision:0}),{staffSurface:true,call:async()=>({data:projection(),error:null})});assert.equal(stale.result.status,503);assert.ok(!('data'in stale.result.body));
});
test('staff locator exposes no values and requires a freshly qualified shared Brief',async()=>{
 const locator={schemaVersion:'traveler-brief/1',kind:'locator',...binding,revision:1,expiresAt:now+60000};
 const {result}=await run(JSON.stringify({action:'locate',caseId}),{staffSurface:true,call:async()=>({data:locator,error:null})});assert.equal(result.status,200);assert.ok(!('fields'in result.body.data));
 const denied=await run(JSON.stringify({action:'locate',caseId}),{staffSurface:true,call:async()=>({data:null,error:{message:'BRIEF_FORBIDDEN'}})});assert.equal(denied.result.status,403);
});
test('owner cleanup metadata is independent of complete audit and permits first-preview revision zero',async()=>{
 const state={schemaVersion:'traveler-brief/1',kind:'owner_state',caseId,ownerId:owner,recipientId:staff,grantRevision:1,briefRevision:0,state:'absent'};
 assert.ok(decodeBriefOwnerState(state));assert.ok(decodeBriefOwnerState({...state,recipientId:null,grantRevision:0}));
 for(const invalid of [{...state,state:'shared'},{...state,briefRevision:1},{...state,fields:[problem]},{...state,ownerId:staff}]){
  const r=await run(JSON.stringify({action:'owner_state',caseId}),{call:async()=>({data:invalid,error:null})});assert.equal(r.result.status,503);assert.ok(!('data'in r.result.body));
 }
 const r=await run(JSON.stringify({action:'owner_state',caseId}),{call:async()=>({data:state,error:null})});assert.equal(r.result.status,200);assert.equal(r.calls.length,2);assert.ok(r.calls.every(c=>c.params.p_input.action==='owner_state'));assert.ok(!('sourceDigest'in r.result.body.data));
 const denied=await run(JSON.stringify({action:'owner_state',caseId}),{staffSurface:true});assert.equal(denied.result.status,403);assert.equal(denied.calls.length,0);
 const changed=await run(JSON.stringify({action:'owner_state',caseId}),{call:async(_,n)=>({data:n===1?state:{...state,grantRevision:2},error:null})});assert.equal(changed.result.status,503);assert.ok(!('data'in changed.result.body));
});
test('staff cannot preview, audit, export, recover or mutate an owner Brief',async()=>{
 for(const input of [previewInput,share,{action:'audit',caseId},{action:'export',requestId:operationId,confirmed:true},{action:'read_operation',operationId},{action:'abandon',operationId,mutationBytes:JSON.stringify(share)}]){const {result,calls}=await run(JSON.stringify(input),{staffSurface:true});assert.equal(result.status,403);assert.equal(calls.length,0);}
});
test('source correction, grant withdrawal, TTL and replacement session before response suppress old values',async()=>{
 const input={action:'read',caseId,recipientId:staff,grantRevision:1,expectedRevision:1},raw=JSON.stringify(input);
 for(const call of [async(_,n)=>n===1?{data:projection(),error:null}:{data:null,error:{message:'BRIEF_STALE'}},async(_,n)=>({data:n===1?projection():{...projection(),sourceDigest:'b'.repeat(64)},error:null}),async()=>({data:{...projection(),expiresAt:now-1},error:null})]){
  const {result}=await run(raw,{staffSurface:true,call});assert.equal(result.status,503);assert.ok(!('data'in result.body));
 }
 let n=0;const switched=await run(raw,{staffSurface:true,call:async()=>({data:projection(),error:null}),authenticate:async()=>{n++;return staff;},sessionId:()=>n===1?session:owner});assert.equal(switched.result.status,401);assert.ok(!('data'in switched.result.body));
});
test('post-dispatch source failure and timeouts retain unknown acknowledgement without retry',async()=>{
 const raw=JSON.stringify(share);
 for(const call of [async()=>{throw Error('lost ACK');},async(_,n)=>n===1?{data:receipt(raw),error:null}:{data:null,error:{message:'BRIEF_STALE'}}]){const {result,calls}=await run(raw,{call});assert.equal(result.status,503);assert.equal(result.body.operationId,operationId);assert.equal(result.body.recoveryAction,'read_original_operation');assert.equal(result.body.acknowledgement,'unknown');assert.equal(calls.filter(c=>c.params.p_input.action==='share').length,1);}
});
test('original operation absence is not abandonment; explicit abandonment preserves prior applied outcome',async()=>{
 const missing=await run(JSON.stringify({action:'read_operation',operationId}),{call:async()=>({data:{receipt:null},error:null})});assert.equal(missing.result.status,200);assert.deepEqual(missing.result.body.data,{receipt:null});assert.ok(missing.calls.every(c=>c.params.p_input.action==='read_operation'));
 const bytes=JSON.stringify(share,null,1),raw=JSON.stringify({action:'abandon',operationId,mutationBytes:bytes});
 for(const outcome of ['applied','cancelled']){const r=receipt(bytes,outcome);const {result,calls}=await run(raw,{call:async(p)=>({data:p.p_input.action==='read_operation'?{receipt:r}:r,error:null})});assert.equal(result.status,200);assert.equal(result.body.data.outcome,outcome);assert.equal(calls[0].params.p_input.mutationBytes,bytes);assert.ok(calls.every(c=>c.params.p_input.action!=='share'));}
});
test('raw-byte controls, invalid UTF8, unexpected query and disabled routes fail before RPC',async()=>{
 for(const raw of [new Uint8Array([0xc3,0x28]),'\ufeff'+JSON.stringify(share),' '.repeat(48001)]){const {result,calls}=await run(raw);assert.ok([400,413].includes(result.status));assert.equal(calls.length,0);}
 const disabled=await run(JSON.stringify(share),{enabled:false,authenticate:async()=>{throw Error('must not authenticate');}});assert.equal(disabled.result.body.error.code,'BRIEF_DISABLED');assert.equal(disabled.calls.length,0);
});
test('independent export checks exact owner/session/source lease and never claims core completion',async()=>{
 const bundle={schemaVersion:'traveler-brief-data/1',kind:'bundle',requestId:operationId,ownerId:owner,sessionId:session,capturedAt:now,expiresAt:now+30000,sourceDigest,corePackageEnrollment:'not_enrolled',allUserDataCompleted:false,coverage:{brief:'complete',previews:'complete',audit:'complete',operations:'complete',sourceValues:'not_copied',attachments:'unavailable'},rows:[]};
 assert.ok(decodeBriefDataBundle(bundle));for(const invalid of [{...bundle,allUserDataCompleted:true},{...bundle,coverage:{...bundle.coverage,attachments:'complete'}},{...bundle,rows:[{key:'secret',domain:'memory',value:{summary:'secret'}}]}])assert.equal(decodeBriefDataBundle(invalid),null);
 const raw=JSON.stringify({action:'export',requestId:operationId,confirmed:true});const good=await run(raw,{call:async()=>({data:bundle,error:null})});assert.equal(good.result.status,200);
 for(const delta of [{ownerId:staff},{sessionId:staff},{sourceDigest:'b'.repeat(64)},{coverage:{...bundle.coverage,sourceValues:'copied'}}]){const bad=await run(raw,{call:async(_,n)=>({data:n===1?bundle:{...bundle,...delta},error:null})});assert.equal(bad.result.status,503);assert.ok(!('data'in bad.result.body));}
});
