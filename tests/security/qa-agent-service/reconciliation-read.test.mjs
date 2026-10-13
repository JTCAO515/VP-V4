import test from 'node:test';
import assert from 'node:assert/strict';
import {createQaService} from '../../../lib/server/qa-agent/service.ts';
const sid='11111111-1111-4111-8111-111111111111',pid='22222222-2222-4222-8222-222222222222',rid='33333333-3333-4333-8333-333333333333',task='44444444-4444-4444-8444-444444444444',foreign='55555555-5555-4555-8555-555555555555';
function fixture(options={}){
 let reads=0,protectedReads=0;const calls=[];
 const store={list:async()=>[],create:async()=>{throw Error('unexpected write');},read:async()=>{
  reads++;const state=options.metadataState??'accepted';return {thread:{id:sid,status:'active',createdAt:'2026-10-13',updatedAt:'2026-10-13'},turns:[{id:rid,status:state,createdAt:'2026-10-13'}]};
 },rpc:async(name,p)=>{
  calls.push(name);
  if(name==='qa_read_policy_v1')return {data:{kind:'policy',policy:{id:pid,contextMode:'qa_session_history_v1',maxTurns:8,noticeHash:'a'.repeat(64),noticeZh:'合成许可',noticeEn:'Synthetic permission',provider:'qwen',recipient:'Synthetic',consentState:'accepted'}},error:null};
  assert.equal(name,'qa_read_session_v1');assert.equal(p.p_thread_id,sid);protectedReads++;
  if(options.revoke)return {data:null,error:{message:'UNAUTHENTICATED'}};
  const message={kind:'text',schemaVersion:'text-turn-v1',turnId:rid,locale:'en',input:'Original input',output:null,outcome:null,reconciliationRequired:true,...options.textPatch};
  if(options.missingFlag)delete message.reconciliationRequired;
  if(options.finishOnReread&&protectedReads===2)Object.assign(message,{reconciliationRequired:false,output:'Actual saved reply',outcome:'answered'});
  return {data:{kind:'session',schemaVersion:'qa-session/1',threadId:options.foreignSession?foreign:sid,policyId:pid,serviceTaskId:task,lastTurnId:rid,messages:[message]},error:null};
 }};
 return {service:createQaService(store,pid,'qa_session_history_v1'),calls,get reads(){return reads;},get protectedReads(){return protectedReads;}};
}
test('trusted expired-dispatch projection is visible and repeated reads never admit or charge',async()=>{
 const f=fixture();for(let i=0;i<2;i++){
 const result=await f.service.message(sid,rid);assert.equal(result.message.status,'reconciliation_required');assert.equal(result.message.text,null);assert.equal(result.message.requestId,rid);assert.equal(result.message.turnId,rid);
 }
 assert.equal(f.calls.some(name=>/submit|reserve|dispatch|claim|finish|worker/.test(name)),false);assert.equal(f.reads,2);assert.equal(f.protectedReads,2);
});
test('false remains pending or actual terminal failure; null text alone never infers reconciliation',async()=>{
 const pending=fixture({textPatch:{reconciliationRequired:false}});assert.equal((await pending.service.message(sid,rid)).message.status,'pending');
 const failed=fixture({metadataState:'failed',textPatch:{reconciliationRequired:false}});assert.equal((await failed.service.message(sid,rid)).message.status,'technical_failure');
 const reason=fixture({metadataState:'failed',textPatch:{reconciliationRequired:false,output:'Stored failure reason',outcome:'technical_failure'}});assert.equal((await reason.service.message(sid,rid)).message.text,'Stored failure reason');
});
test('protected true with stored text/outcome and invalid or absent QA flag are refused',async()=>{
 for(const textPatch of [{output:'Stored',outcome:'answered'},{outcome:'technical_failure'},{reconciliationRequired:'true'},{reconciliationRequired:1},{reconciliationRequired:null}]){
  const f=fixture({textPatch});await assert.rejects(f.service.message(sid,rid),e=>e.code==='DATA_POLICY_BLOCKED');
 }
 const missing=fixture({missingFlag:true});await assert.rejects(missing.service.message(sid,rid),e=>e.code==='DATA_POLICY_BLOCKED');
});
test('completion racing with protected reconciliation flag rereads to actual stored answer',async()=>{
 const f=fixture({metadataState:'completed',finishOnReread:true});const result=await f.service.message(sid,rid);
 assert.equal(result.message.status,'answered');assert.equal(result.message.text,'Actual saved reply');assert.equal(f.reads,1);assert.equal(f.protectedReads,2);
 const stable=fixture({metadataState:'completed'});assert.equal((await stable.service.message(sid,rid)).message.status,'reconciliation_required');assert.equal(stable.protectedReads,2);
});
test('revoked actor or foreign Session cannot expose protected recovery projection',async()=>{
 const revoked=fixture({revoke:true});await assert.rejects(revoked.service.message(sid,rid),e=>e.code==='UNAUTHENTICATED');
 const other=fixture({foreignSession:true});await assert.rejects(other.service.message(sid,rid),e=>e.code==='DATA_POLICY_BLOCKED');
});
