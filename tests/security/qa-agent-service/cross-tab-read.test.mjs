import test from 'node:test';
import assert from 'node:assert/strict';
import {createQaService} from '../../../lib/server/qa-agent/service.ts';
import {QaError} from '../../../lib/server/qa-agent/contract.ts';
const sid='11111111-1111-4111-8111-111111111111',pid='22222222-2222-4222-8222-222222222222',task='33333333-3333-4333-8333-333333333333';
const ids=Array.from({length:4},(_,i)=>`44444444-4444-4444-8444-${String(i+1).padStart(12,'0')}`);
function fixture({metadataCounts=[1,2],protectedCounts=[2,2],refreshError=false,protectedError=false,protectedSession=sid}={}){
 let metadataReads=0,protectedReads=0;const calls=[];
 const store={list:async()=>[],create:async()=>{throw Error('unexpected write');},read:async id=>{
  assert.equal(id,sid);metadataReads++;if(metadataReads===2&&refreshError)throw new QaError('UNAUTHENTICATED');
  const count=metadataCounts[metadataReads-1]??metadataCounts.at(-1);
  return {thread:{id:sid,status:'active',createdAt:'2026-10-13',updatedAt:'2026-10-13'},turns:ids.slice(0,count).map((id,i)=>({id,status:i===0?'completed':'accepted',createdAt:'2026-10-13'}))};
 },rpc:async(name,p)=>{
  calls.push(name);
  if(name==='qa_read_policy_v1')return {error:null,data:{kind:'policy',policy:{id:pid,contextMode:'qa_session_history_v1',maxTurns:8,noticeHash:'a'.repeat(64),noticeZh:'合成同意',noticeEn:'Synthetic consent',provider:'qwen',recipient:'Synthetic',consentState:'accepted'}}};
  assert.equal(name,'qa_read_session_v1');assert.equal(p.p_thread_id,sid);protectedReads++;
  if(protectedReads===2&&protectedError)return {data:null,error:{message:'DATA_POLICY_BLOCKED'}};
  const count=protectedCounts[protectedReads-1]??protectedCounts.at(-1);
  const messages=ids.slice(0,count).map((turnId,i)=>({kind:'text',reconciliationRequired:false,schemaVersion:'text-turn-v1',turnId,locale:'en',input:i===0?'Saved root':'New tab input',outcome:i===0?'answered':null,output:i===0?'Saved answer':null}));
  return {error:null,data:{kind:'session',schemaVersion:'qa-session/1',threadId:protectedSession,policyId:count?pid:null,serviceTaskId:count?task:null,lastTurnId:messages.at(-1)?.turnId??null,messages}};
 }};
 return {service:createQaService(store,pid,'qa_session_history_v1'),calls,get metadataReads(){return metadataReads;},get protectedReads(){return protectedReads;}};
}
test('other tab admits a Turn between metadata and protected read; bounded refresh preserves Session',async()=>{
 const f=fixture();const result=await f.service.detail(sid);
 assert.equal(result.session.id,sid);assert.equal(result.messages.length,2);assert.equal(result.messages[0].text,'Saved answer');assert.equal(result.messages[1].status,'pending');assert.equal(result.messages[1].text,null);
 assert.equal(f.metadataReads,2);assert.equal(f.protectedReads,1);assert.equal(result.policy.consentState,'accepted');
});
test('protected reread catches another append during metadata refresh without unbounded retries',async()=>{
 const f=fixture({metadataCounts:[1,3],protectedCounts:[2,3]});const result=await f.service.detail(sid);
 assert.equal(result.messages.length,3);assert.equal(f.metadataReads,2);assert.equal(f.protectedReads,2);
});
test('persistent or continuously changing counts fail closed as retryable, not permission denial',async()=>{
 for(const counts of [{metadataCounts:[1,1],protectedCounts:[2,2]},{metadataCounts:[1,3],protectedCounts:[2,4]}]){
  const f=fixture(counts);await assert.rejects(f.service.detail(sid),e=>e.code==='PROVIDER_UNAVAILABLE'&&e.ack==='not_submitted');
  assert.equal(f.metadataReads,2);assert.equal(f.protectedReads,2);assert.equal(f.calls.some(x=>/submit|budget|dispatch/.test(x)),false);
 }
});
test('retryable snapshot failure before submit has no unknown admission ACK',async()=>{
 const f=fixture({metadataCounts:[1,1],protectedCounts:[2,2]});await assert.rejects(f.service.submit(sid,{requestId:ids[3],text:'Local input'}),e=>e.code==='PROVIDER_UNAVAILABLE'&&e.ack==='not_submitted');
 assert.equal(f.calls.some(x=>x.includes('submit')),false);
});
test('revocation and actual foreign Session remain permission failures through bounded rereads',async()=>{
 const revoked=fixture({refreshError:true});await assert.rejects(revoked.service.detail(sid),e=>e.code==='UNAUTHENTICATED');assert.equal(revoked.metadataReads,2);
 const policy=fixture({metadataCounts:[1,3],protectedCounts:[2,3],protectedError:true});await assert.rejects(policy.service.detail(sid),e=>e.code==='DATA_POLICY_BLOCKED');assert.equal(policy.protectedReads,2);
 const foreign=fixture({protectedSession:pid});await assert.rejects(foreign.service.detail(sid),e=>e.code==='DATA_POLICY_BLOCKED');assert.equal(foreign.metadataReads,1);
});
