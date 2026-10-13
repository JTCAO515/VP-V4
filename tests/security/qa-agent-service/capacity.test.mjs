import test from 'node:test';
import assert from 'node:assert/strict';
import {createQaService,rpcError} from '../../../lib/server/qa-agent/service.ts';
const sid='11111111-1111-4111-8111-111111111111',pid='22222222-2222-4222-8222-222222222222',task='33333333-3333-4333-8333-333333333333',next='99999999-9999-4999-8999-999999999999';
const ids=Array.from({length:8},(_,i)=>`44444444-4444-4444-8444-${String(i+1).padStart(12,'0')}`);
function fixture(maxTurns,mode='qa_session_history_v1'){
 const calls=[],messages=ids.map(turnId=>({kind:'text',schemaVersion:'text-turn-v1',turnId,locale:'en',input:'Saved input',outcome:'answered',output:'Saved answer'}));let admitted=8;
 const thread={id:sid,status:'active',createdAt:'2026-10-13',updatedAt:'2026-10-13'};
 const store={list:async()=>[thread],create:async()=>thread,read:async()=>({thread,turns:ids.map(id=>({id,status:'completed',createdAt:'2026-10-13'}))}),rpc:async(name,p)=>{
 calls.push(name);
 if(name==='qa_read_policy_v1'||name==='read_text_policy')return {error:null,data:{kind:'policy',policy:{id:pid,contextMode:mode,maxTurns,noticeHash:'a'.repeat(64),noticeZh:'合成同意',noticeEn:'Synthetic consent',provider:'qwen',recipient:'Synthetic',consentState:'accepted'}}};
 if(name==='qa_read_session_v1')return {error:null,data:{kind:'session',schemaVersion:'qa-session/1',threadId:sid,policyId:pid,serviceTaskId:task,lastTurnId:ids.at(-1),messages}};
 if(name==='qa_submit_message_v1')return {data:null,error:{message:'QA_CONTEXT_LIMIT'}};
 throw Error('unexpected '+name);
 }};
 return {service:createQaService(store,pid,mode),calls,get admitted(){return admitted;}};
}
test('eight-turn SQL capacity denial is typed, unsubmitted, and original history remains readable',async()=>{
 const f=fixture(8);assert.equal((await f.service.policy()).maxTurns,8);
 await assert.rejects(f.service.submit(sid,{requestId:next,text:'Ninth input'}),e=>e.code==='QA_CONTEXT_LIMIT'&&e.ack==='not_submitted');
 const read=await f.service.detail(sid);assert.equal(read.policy.consentState,'accepted');assert.equal(read.messages.length,8);assert.equal(f.admitted,8);
 assert.equal((await f.service.message(sid,ids[0])).message.text,'Saved answer');
 assert.equal(f.calls.some(name=>/budget|dispatch|claim|worker/.test(name)),false);
 assert.equal(rpcError('QA_CONTEXT_LIMIT').code,'QA_CONTEXT_LIMIT');assert.equal(rpcError('DATA_POLICY_BLOCKED').code,'DATA_POLICY_BLOCKED');
});
test('only the protected exact numeric eight-turn limit reaches QA policy wire',async()=>{
 for(const maxTurns of [undefined,null,7,9,'8']){const f=fixture(maxTurns);await assert.rejects(f.service.policy(),e=>e.code==='DATA_POLICY_BLOCKED');}
 const legacy=fixture(8,'current_input_v1');assert.equal((await legacy.service.policy()).maxTurns,null);
});
