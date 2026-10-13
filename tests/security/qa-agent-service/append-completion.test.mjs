import test from 'node:test';
import assert from 'node:assert/strict';
import {createQaService} from '../../../lib/server/qa-agent/service.ts';
import {QaError} from '../../../lib/server/qa-agent/contract.ts';
const sid='11111111-1111-4111-8111-111111111111',pid='22222222-2222-4222-8222-222222222222',task='33333333-3333-4333-8333-333333333333';
const root='44444444-4444-4444-8444-444444444444',newTurn='55555555-5555-4555-8555-555555555555',later='66666666-6666-4666-8666-666666666666';
function fixture({initialCount=1,refreshedState='completed',textState='answered',extraOnReread=false,revoke=false,kind='text',metadataDenied=false,omitKind=false}={}){
 let metadataReads=0,protectedReads=0;const calls=[];
 const store={list:async()=>[],create:async()=>{throw Error('unexpected mutation');},read:async id=>{
  assert.equal(id,sid);metadataReads++;
  if(metadataDenied)throw new QaError('FORBIDDEN');
  const turnIds=metadataReads===1?[root,newTurn].slice(0,initialCount):[root,newTurn];
  return {thread:{id:sid,status:'active',createdAt:'2026-10-13',updatedAt:'2026-10-13'},turns:turnIds.map(id=>({id,status:id===root?'completed':refreshedState,createdAt:'2026-10-13'}))};
 },rpc:async(name,p)=>{
  calls.push(name);
  if(name==='qa_read_policy_v1')return {data:{kind:'policy',policy:{id:pid,contextMode:'qa_session_history_v1',maxTurns:8,noticeHash:'a'.repeat(64),noticeZh:'合成许可',noticeEn:'Synthetic permission',provider:'qwen',recipient:'Synthetic',consentState:'accepted'}},error:null};
  assert.equal(name,'qa_read_session_v1');assert.equal(p.p_thread_id,sid);protectedReads++;
  if(protectedReads===2&&revoke)return {data:null,error:{message:'UNAUTHENTICATED'}};
  const first={kind:'text',reconciliationRequired:false,schemaVersion:'text-turn-v1',turnId:root,locale:'en',input:'Root',output:'Original answer',outcome:'answered'};
  const fresh=protectedReads===2&&textState==='answered';
  const second={kind,reconciliationRequired:false,schemaVersion:'text-turn-v1',turnId:newTurn,locale:'en',input:'Other tab input',output:fresh?'Stored new reply':textState==='technical_failure'?'Actual failure reason':null,outcome:fresh?'answered':textState==='technical_failure'?'technical_failure':null};
  if(omitKind)delete second.kind;
  const messages=[first,second];if(protectedReads===2&&extraOnReread)messages.push({...second,turnId:later,input:'Continued append',output:null,outcome:null});
  return {data:{kind:'session',schemaVersion:'qa-session/1',threadId:sid,policyId:pid,serviceTaskId:task,lastTurnId:messages.at(-1).turnId,messages},error:null};
 }};
 return {service:createQaService(store,pid,'qa_session_history_v1'),calls,get metadataReads(){return metadataReads;},get protectedReads(){return protectedReads;}};
}
test('append then completion during metadata refresh rereads pending text even with aligned membership',async()=>{
 const f=fixture();const result=await f.service.detail(sid);assert.equal(result.messages[1].status,'answered');assert.equal(result.messages[1].text,'Stored new reply');
 assert.equal(f.metadataReads,2);assert.equal(f.protectedReads,2);assert.equal(f.calls.some(x=>/submit|budget|dispatch/.test(x)),false);
});
test('confirmed empty completed result is bounded; real terminal failure and reason remain visible',async()=>{
 const empty=fixture({initialCount:2,textState:'empty'});const result=await empty.service.detail(sid);
 assert.equal(result.messages[1].status,'technical_failure');assert.equal(result.messages[1].text,null);assert.equal(empty.protectedReads,2);assert.equal(empty.metadataReads,1);
 const failed=fixture({initialCount:2,refreshedState:'failed',textState:'empty'});assert.equal((await failed.service.detail(sid)).messages[1].status,'technical_failure');assert.equal(failed.protectedReads,1);
 const reason=fixture({initialCount:2,refreshedState:'failed',textState:'technical_failure'});const failure=(await reason.service.detail(sid)).messages[1];assert.equal(failure.status,'technical_failure');assert.equal(failure.text,'Actual failure reason');assert.equal(reason.protectedReads,1);
});
test('continuing append after final read is retryable and never returns partial history',async()=>{
 const f=fixture({extraOnReread:true});await assert.rejects(f.service.detail(sid),e=>e.code==='PROVIDER_UNAVAILABLE');assert.equal(f.metadataReads,2);assert.equal(f.protectedReads,2);
});
test('stale output plus pending metadata never becomes answered',async()=>{
 const f=fixture({initialCount:2,refreshedState:'generating',textState:'technical_failure'});await assert.rejects(f.service.detail(sid),e=>e.code==='PROVIDER_UNAVAILABLE');assert.equal(f.metadataReads,2);assert.equal(f.protectedReads,2);
});
test('reread revocation and non-text protected kind fail closed',async()=>{
 const revoked=fixture({revoke:true});await assert.rejects(revoked.service.detail(sid),e=>e.code==='UNAUTHENTICATED');assert.equal(revoked.protectedReads,2);
 for(const kind of ['history','pending',null]){const f=fixture({kind});await assert.rejects(f.service.detail(sid),e=>e.code==='DATA_POLICY_BLOCKED');assert.equal(f.metadataReads,1);}
 const missing=fixture({omitKind:true});await assert.rejects(missing.service.detail(sid),e=>e.code==='DATA_POLICY_BLOCKED');assert.equal(missing.metadataReads,1);
 const denied=fixture({metadataDenied:true});await assert.rejects(denied.service.detail(sid),e=>e.code==='FORBIDDEN');assert.equal(denied.protectedReads,0);
});
