// Controlled RPC receipts exercise the actual TS producers. They do not assert
// a real SQL Task/admission, provider or Goal compatibility.
import assert from 'node:assert/strict';
import test from 'node:test';
import {parseCanonicalPlaceAsk,parseRecoveryKey,recoveryKey} from '../../../lib/server/knowledge/place-ask/contract.ts';
import {submitCanonicalPlaceAsk,readCanonicalPlaceAsk} from '../../../lib/server/knowledge/place-ask/producer.ts';
import {ids,taskRequest,assistantRequest,taskOperation,assistantOperation,receipt,clone} from './fixtures.mjs';

test('strict original request preserves the question, original IDs, property order and raw UTF8 digest',async()=>{
 const bytes=JSON.stringify(taskRequest,null,2)+'\n';let calls=0;
 const result=await submitCanonicalPlaceAsk(taskRequest,{current:async()=>true,rpc:async(name,{p_input})=>{calls++;assert.equal(name,'grounded_ai_assist_work_v1');assert.deepEqual(Object.keys(p_input),['action','requestBytes']);assert.equal(p_input.action,'selected_submit');assert.equal(p_input.requestBytes,bytes);assert.equal(JSON.parse(p_input.requestBytes).submission.text,taskRequest.submission.text);return {data:receipt(bytes),error:null};}},bytes);
 assert.equal(result.kind,'accepted');assert.equal(result.originalReceipt.serviceTaskId,ids.task);assert.equal(calls,1);assert.equal(result.readyForProvider,false);assert.equal(result.currentEligibilityRequiresRead,true);
});
for(const path of ['owner','session','subject','model','qualified','facts'])test(`caller ${path} is never accepted as authority`,async()=>{
 let calls=0;
 for(const field of ['top','expectation','submission']){
  const request=clone(taskRequest);if(field==='top')request[path]='forged';else request[field][path]='forged';
  assert.equal(parseCanonicalPlaceAsk(request),null);
  assert.equal((await submitCanonicalPlaceAsk(request,{current:async()=>true,rpc:async()=>{calls++;throw Error('must not call');}})).reason,'invalid_input');
 }
 assert.equal(calls,0);
});
for(const [name,patch] of [['bad provider',{provider:'other'}],['missing digest',{mappingDigest:null}],['wrong locale',{locale:'zh'}],['fractional head',{headVersion:.5}],['negative head',{headVersion:-1}],['oversized head',{headVersion:2147483648}],['invalid canonical',{canonicalPoiId:'a title'}]])test(`expectation rejects ${name}`,()=>{
 const r=clone(taskRequest);Object.assign(r.expectation,patch);assert.equal(parseCanonicalPlaceAsk(r),null);
});
test('incompatible existing Goal/assistant submission is preserved and explicitly unavailable without creating any Task or Goal',async()=>{
 let calls=0;assert.deepEqual(parseCanonicalPlaceAsk(assistantRequest),assistantRequest);assert.deepEqual(recoveryKey(assistantRequest),assistantOperation);
 const result=await submitCanonicalPlaceAsk(assistantRequest,{current:async()=>true,rpc:async()=>{calls++;throw Error('must not admit');}});
 assert.equal(result.reason,'original_submission_unsupported');assert.equal(calls,0);assert.equal(assistantRequest.submission.taskId,null);assert.equal(assistantRequest.submission.turnId,null);
});
test('v6 selected sources are not silently stripped into v5',()=>{
 const r=clone(assistantRequest);r.submission.schemaVersion='assistant-message-sources/2';r.submission.selectedSources={artifact:null,trip:null,evidence:[]};assert.equal(parseCanonicalPlaceAsk(r),null);
});
test('only original explicit new_goal permits a null parent, not an inferred replacement Task',()=>{
 for(const [relationship,parent]of [['repair',null],['clarification',null],['new_goal',ids.turn]]){const r=clone(taskRequest);r.submission.serviceTask.relationship=relationship;r.submission.serviceTask.parentTurnId=parent;assert.equal(parseCanonicalPlaceAsk(r),null);}
});
for(const mode of ['throw','empty','wrongTurn','wrongTask','wrongHead','wrongProviderCase','wrongSource','wrongDigest','flatReceipt','extraFacts'])test(`${mode} cannot show accepted or cause a write retry`,async()=>{
 let calls=0;const data=clone(receipt());
 if(mode==='wrongTurn')data.originalReceipt.turnId=ids.poi;
 if(mode==='wrongTask')data.originalReceipt.serviceTaskId=ids.poi;
 if(mode==='wrongHead')data.binding.expectation.headVersion=1;
 if(mode==='wrongProviderCase')data.binding.expectation.providerPoiId='providercasea';
 if(mode==='wrongSource')data.binding.expectation.mappingDigest='c'.repeat(64);
 if(mode==='wrongDigest')data.binding.requestDigest='c'.repeat(64);
 if(mode==='extraFacts')data.facts=['Must not become evidence'];
 const result=await submitCanonicalPlaceAsk(taskRequest,{current:async()=>true,rpc:async()=>{calls++;if(mode==='throw')throw Error('private network detail');return {data:mode==='empty'?null:mode==='flatReceipt'?data.originalReceipt:data,error:null};}});
 assert.equal(result.kind,'unknown');assert.deepEqual(result.operation,taskOperation);assert.equal(calls,1);assert.ok(!JSON.stringify(result).includes('private'));
});
test('current actor failure before a possible write denies, and after a possible write remains unknown',async()=>{
 let calls=0;
 const denied=await submitCanonicalPlaceAsk(taskRequest,{current:async()=>false,rpc:async()=>{calls++;throw Error('must not call');}});assert.equal(denied.reason,'unauthorized');assert.equal(calls,0);
 let current=0;const uncertain=await submitCanonicalPlaceAsk(taskRequest,{current:async()=>++current===1,rpc:async()=>{calls++;return {data:receipt(),error:null};}});assert.equal(uncertain.kind,'unknown');assert.equal(calls,1);
});
test('same original request bytes are required when a raw command is supplied',async()=>{
 let calls=0;const changed=clone(taskRequest);changed.submission.text+='different';
 const result=await submitCanonicalPlaceAsk(taskRequest,{current:async()=>true,rpc:async()=>{calls++;throw Error('must not call');}},JSON.stringify(changed));assert.equal(result.reason,'invalid_input');assert.equal(calls,0);
});
test('mutation of the caller object during RPC cannot replace the captured original selection',async()=>{
 const input=clone(taskRequest);const expected=receipt();
 const result=await submitCanonicalPlaceAsk(input,{current:async()=>true,rpc:async()=>{input.expectation.headVersion=9;input.submission.text='changed';return {data:expected,error:null};}});
 assert.equal(result.kind,'accepted');assert.equal(result.binding.expectation.headVersion,0);
});
test('original null-Turn B recovery uses conversation/message plus the original operation, never a new POST',async()=>{
 let calls=0;const result=await readCanonicalPlaceAsk(assistantOperation,{current:async()=>true,rpc:async(_,{p_input})=>{calls++;assert.deepEqual(p_input,{action:'selected_read',operation:assistantOperation});return {data:{schemaVersion:'canonical-place-ask/1',kind:'not_submitted',operation:assistantOperation,readyForProvider:false},error:null};}});
 assert.equal(result.kind,'not_submitted');assert.equal(calls,1);assert.equal(parseRecoveryKey({...assistantOperation,messageId:null}),null);
});
for(const current of [{kind:'pending'},{kind:'unavailable',reason:'source_unavailable'}])test(`recovery keeps metadata acceptance separate from current ${current.kind}`,async()=>{
 const result=await readCanonicalPlaceAsk(taskOperation,{current:async()=>true,rpc:async(_,{p_input})=>{assert.equal(p_input.action,'selected_read');return {data:{schemaVersion:'canonical-place-ask/1',kind:'recovered',operation:taskOperation,receipt:receipt(),current,readyForProvider:false},error:null};}});
 assert.equal(result.kind,'recovered');assert.equal(result.current.kind,current.kind);assert.equal(result.receipt.currentEligibilityRequiresRead,true);
});
test('wrong operation or current Turn in recovery cannot be reinterpreted as the requested success',async()=>{
 const data={schemaVersion:'canonical-place-ask/1',kind:'recovered',operation:{...taskOperation,operationId:ids.poi},receipt:receipt(),current:{kind:'grounded',turn:{kind:'grounded_turn',schemaVersion:'grounded-turn/1',turnId:ids.poi,serviceTaskId:ids.task}},readyForProvider:false};
 assert.equal((await readCanonicalPlaceAsk(taskOperation,{current:async()=>true,rpc:async()=>({data,error:null})})).kind,'unknown');
});
test('current grounded flag cannot disclose a stale/unavailable original projection',async()=>{
 const data={schemaVersion:'canonical-place-ask/1',kind:'recovered',operation:taskOperation,receipt:receipt(),current:{kind:'grounded',turn:{kind:'grounded_turn',schemaVersion:'grounded-turn/1',turnId:ids.turn,serviceTaskId:ids.task,result:{projection:'unavailable'}}},readyForProvider:false};
 assert.equal((await readCanonicalPlaceAsk(taskOperation,{current:async()=>true,rpc:async()=>({data,error:null})})).kind,'unknown');
});
