import test from 'node:test';
import assert from 'node:assert/strict';
import {createQaService} from '../../../lib/server/qa-agent/service.ts';
const sid='11111111-1111-4111-8111-111111111111',pid='22222222-2222-4222-8222-222222222222',root='33333333-3333-4333-8333-333333333333',follow='44444444-4444-4444-8444-444444444444';
function fixture(){
 const calls=[],messages=[];let task=null,mode='qa_session_history_v1',lost=false;
 const thread={id:sid,status:'active',createdAt:'2026-10-13',updatedAt:'2026-10-13'};
 const store={list:async()=>[thread],create:async()=>thread,read:async()=>({thread,turns:messages.map(m=>({id:m.turnId,status:m.output?'completed':'accepted',createdAt:'2026-10-13'}))}),rpc:async(name,p)=>{
 calls.push({name,p});const ok=data=>({data,error:null});
 if(name==='qa_read_policy_v1')return ok({kind:'policy',policy:{id:pid,contextMode:mode,maxTurns:8,noticeHash:'a'.repeat(64),noticeZh:'合成同Session许可',noticeEn:'Synthetic same Session permission',provider:'qwen',recipient:'Synthetic',consentState:'accepted'}});
 if(name==='qa_read_session_v1')return ok({kind:'session',schemaVersion:'qa-session/1',threadId:sid,policyId:messages.length?pid:null,serviceTaskId:task,lastTurnId:messages.at(-1)?.turnId??null,messages});
 if(name==='qa_list_sessions_v1')return ok({kind:'sessions',sessions:[{threadId:sid}]});
 if(name==='qa_submit_message_v1'){
 const prior=messages.find(m=>m.turnId===p.p_turn_id);
 if(prior&&prior.input!==p.p_text)return {data:null,error:{message:'IDEMPOTENCY_KEY_REUSE'}};
 if(!prior){task=p.p_task_id;messages.push({kind:'text',reconciliationRequired:false,turnId:p.p_turn_id,input:p.p_text,output:'Synthetic saved answer',outcome:'answered'});}
 if(lost)throw new Error('Unknown ACK');return ok({kind:'accepted',turnId:p.p_turn_id,reused:!!prior});
 }
 throw new Error('unexpected '+name);
 }};
 return {service:createQaService(store,pid,'qa_session_history_v1'),calls,messages,get task(){return task;},setMode:v=>mode=v,setLost:v=>lost=v};
}
test('blank original Session then answered followup retain canonical Task and protected history',async()=>{
 const f=fixture();assert.deepEqual((await f.service.detail(sid)).messages,[]);
 await f.service.submit(sid,{requestId:root,text:'Plan a short visit'});const task=f.task;
 await f.service.submit(sid,{requestId:follow,text:'Why? Simplify the second option; correction: Guangzhou.'});
 assert.equal(f.task,task);assert.notEqual(task,root);
 assert.equal(f.calls.filter(c=>c.name==='qa_submit_message_v1').every(c=>c.p.p_task_id===task),true);
 assert.equal(f.calls.some(c=>c.name==='submit_text_turn'||c.name==='submit_service_task_turn'),false);
 const history=await f.service.detail(sid);assert.equal(history.messages.length,2);assert.equal(history.messages[1].status,'answered');
});
test('lost ACK and old request replay after newer turn always use original SQL wrapper',async()=>{
 const f=fixture();f.setLost(true);await assert.rejects(f.service.submit(sid,{requestId:root,text:'Original'}),e=>e.ack==='unknown');
 f.setLost(false);await f.service.submit(sid,{requestId:follow,text:'Why?'});
 assert.equal((await f.service.submit(sid,{requestId:root,text:'Original'})).reused,true);assert.equal(f.messages.length,2);
 await assert.rejects(f.service.submit(sid,{requestId:root,text:'Changed'}),e=>e.code==='IDEMPOTENCY_KEY_REUSE');
});
test('deployed mode flag cannot give legacy consent Session history permission',async()=>{
 const f=fixture();f.setMode('current_input_v1');await assert.rejects(f.service.submit(sid,{requestId:root,text:'Question'}),e=>e.code==='DATA_POLICY_BLOCKED');
 assert.equal(f.calls.some(c=>c.name==='qa_submit_message_v1'),false);
});
