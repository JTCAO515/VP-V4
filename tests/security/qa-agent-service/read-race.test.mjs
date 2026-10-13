import test from 'node:test';
import assert from 'node:assert/strict';
import {createQaService} from '../../../lib/server/qa-agent/service.ts';
import {QaError} from '../../../lib/server/qa-agent/contract.ts';
const session='11111111-1111-4111-8111-111111111111',policy='22222222-2222-4222-8222-222222222222',turn='33333333-3333-4333-8333-333333333333',task='44444444-4444-4444-8444-444444444444',other='55555555-5555-4555-8555-555555555555';
function fixture({textPatch={},sessionPatch={},denyMetadata=false,denyProtected=false,metadataStatus='generating'}={}) {
 const calls=[];let metadataReads=0,protectedReads=0;
 const store={list:async()=>[],create:async()=>{throw Error('unexpected mutation');},
  read:async id=>{
   calls.push('metadata');metadataReads++;
   if(denyMetadata)throw new QaError('FORBIDDEN');
   assert.equal(id,session);
   return {thread:{id:session,status:'active',createdAt:'2026-10-13',updatedAt:'2026-10-13'},turns:[{id:turn,status:metadataStatus,createdAt:'2026-10-13'}]};
  },
  rpc:async(name,params)=>{
   if(name==='qa_read_policy_v1')return {error:null,data:{kind:'policy',policy:{id:policy,contextMode:'qa_session_history_v1',noticeHash:'a'.repeat(64),noticeZh:'合成测试同意',noticeEn:'Synthetic consent',provider:'qwen',recipient:'Synthetic',consentState:'accepted'}}};
   assert.equal(name,'qa_read_session_v1');assert.equal(params.p_thread_id,session);
   assert.equal(calls.at(-1),'metadata','worker completes after the earlier metadata read');
   calls.push('worker-completed');protectedReads++;
   if(denyProtected)return {data:null,error:{message:'UNAUTHENTICATED'}};
   return {error:null,data:{kind:'session',schemaVersion:'qa-session/1',threadId:session,policyId:policy,serviceTaskId:task,lastTurnId:turn,
    messages:[{kind:'text',turnId:turn,input:'Synthetic question',output:'Persisted worker answer',outcome:'answered',status:'completed',createdAt:'2026-10-13',...textPatch}],...sessionPatch}};
  }};
 return {service:createQaService(store,policy,'qa_session_history_v1'),get metadataReads(){return metadataReads;},get protectedReads(){return protectedReads;}};
}
for(const endpoint of ['detail','message'])test(`${endpoint}: worker completion between reads uses protected state and saved text`,async()=>{
 const f=fixture();const value=endpoint==='detail'?await f.service.detail(session):await f.service.message(session,turn);
 const message=endpoint==='detail'?value.messages[0]:value.message;
 assert.equal(message.status,'answered');assert.equal(message.text,'Persisted worker answer');assert.equal(message.turnId,turn);assert.equal(message.sessionId,session);
 assert.equal(f.metadataReads,1);assert.equal(f.protectedReads,1);
});
test('protected pending cannot become answered from stale terminal metadata or unqualified output',async()=>{
 const pending=fixture({metadataStatus:'completed',textPatch:{status:'generating',output:null,outcome:null}});
 const result=await pending.service.message(session,turn);assert.equal(result.message.status,'pending');assert.equal(result.message.text,null);
 for(const textPatch of [{status:'generating'},{status:undefined},{status:'invented-complete'},{output:null}]){
  const f=fixture({textPatch});await assert.rejects(f.service.message(session,turn),e=>e.code==='PROVIDER_UNAVAILABLE');assert.equal(f.protectedReads,1);
 }
});
test('completion race still rejects foreign Session, policy and Turn membership',async()=>{
 for(const change of [{sessionPatch:{threadId:other}},{sessionPatch:{policyId:other}},{textPatch:{turnId:other}}]){
  const f=fixture(change);await assert.rejects(f.service.message(session,turn),e=>e.code==='DATA_POLICY_BLOCKED');
 }
});
test('foreign actor metadata denial and revocation between reads cannot expose completed text',async()=>{
 const foreign=fixture({denyMetadata:true});await assert.rejects(foreign.service.message(session,turn),e=>e.code==='FORBIDDEN');assert.equal(foreign.protectedReads,0);
 const revoked=fixture({denyProtected:true});await assert.rejects(revoked.service.message(session,turn),e=>e.code==='UNAUTHENTICATED');assert.equal(revoked.protectedReads,1);
});
