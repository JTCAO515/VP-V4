import test from 'node:test';
import assert from 'node:assert/strict';
import {executeQaWork} from '../../../lib/server/qa-agent/executor.ts';
import {PROTOCOL_MODELS} from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';
const owner='11111111-1111-4111-8111-111111111111',policy='22222222-2222-4222-8222-222222222222',turn='33333333-3333-4333-8333-333333333333',token='44444444-4444-4444-8444-444444444444',scope='55555555-5555-4555-8555-555555555555',task='66666666-6666-4666-8666-666666666666';
const config={scopeId:scope,priceVersion:'synthetic-v1',reservedMicros:100,maxOutputTokens:128,timeoutMs:1000};
const usage={inputTokens:10,outputTokens:10,totalTokens:20,cachedInputTokens:null,uncachedInputTokens:null,reasoningTokens:null,cost:'unknown'};
function fixture(overrides={}){
 const calls=[],usageReceipts=[];let sent=0;
 const raw={ownerId:owner,authSessionId:token,kind:'qa_input',schemaVersion:'qa-context/1',contextMode:'qa_session_history_v1',turnId:turn,threadId:task,serviceTaskId:task,policyId:policy,consentId:scope,provider:'qwen',endpoint:'https://synthetic.invalid',locale:'en'};
 const defaults={qa_claim_work_v1:{kind:'leased',turnId:turn,ownerId:owner,attempt:1,leaseToken:token,leaseMs:120000},qa_read_work_v1:raw,reserve_model_budget:{kind:'reserved'},qa_authorize_dispatch_v1:{kind:'authorized'},finish_model_budget:{kind:'settled',overrun:false},qa_complete_work_v1:{kind:'finished'}};
 const deps={rpc:async(name,p)=>{calls.push({name,p});if(overrides[name] instanceof Error)throw overrides[name];return overrides[name]??defaults[name];},
 provider:{provider:'qwen',endpoint:raw.endpoint,price:()=>20,transport:async()=>{sent++;return Response.json({synthetic:true});}},
 recordUsage:async receipt=>usageReceipts.push(receipt),
 invokeContext:async args=>{
 const auth=await args.rpc('qa_authorize_dispatch_v1',{p_turn_id:turn,p_lease_token:token,p_scope_id:scope,p_policy_id:policy,p_provider:'qwen',p_context_digest:'a'.repeat(64)},args.signal);
 if(auth.kind!=='authorized')return {kind:'unavailable',code:'DATA_POLICY_BLOCKED',usage:null,cost:'unknown'};
 await args.transport({provider:'qwen',endpoint:raw.endpoint,method:'POST',body:'{}',signal:args.signal});
 return {kind:'protocol_validated',provider:'qwen',model:PROTOCOL_MODELS.qwen,output:JSON.stringify({outcome:'answered',text:'Saved synthetic answer'}),usage};
 }};
 return {deps,calls,usageReceipts,get sent(){return sent;},run:(signal=new AbortController().signal)=>executeQaWork(owner,policy,config,deps,signal)};
}
test('original lease budget identity, one dispatch, real cost and settlement precede saved completion',async()=>{
 const f=fixture();assert.equal(await f.run(),'finished');assert.equal(f.sent,1);
 assert.equal(f.calls.find(x=>x.name==='reserve_model_budget').p.p_attempt_id,token);
 assert.equal(f.calls.find(x=>x.name==='reserve_model_budget').p.p_task_id,turn);
 assert.equal(f.calls.some(x=>x.name==='dispatch_model_budget'),false);
 assert.equal(f.usageReceipts[0].actualMicros,20);assert.equal(f.usageReceipts[0].attempt.attemptId,token);
 const settle=f.calls.findIndex(x=>x.name==='finish_model_budget'),complete=f.calls.findIndex(x=>x.name==='qa_complete_work_v1');assert.ok(settle<complete);
});
test('budget denial and unqualified context cannot physically send',async()=>{
 for(const overrides of [{reserve_model_budget:{kind:'disabled'}},{qa_read_work_v1:{kind:'blocked'}},{qa_authorize_dispatch_v1:{kind:'blocked'}}]){
 const f=fixture(overrides);assert.equal(await f.run(),'unavailable');assert.equal(f.sent,0);assert.equal(f.calls.some(x=>x.name==='qa_complete_work_v1'),false);
 }
});
test('unknown dispatch ACK keeps original pending attempt with zero transport and no retry',async()=>{
 const f=fixture({qa_authorize_dispatch_v1:new Error('Synthetic lost ACK')});assert.equal(await f.run(),'unavailable');assert.equal(f.sent,0);
 assert.equal(f.calls.at(-1).p.p_action,'pending');assert.equal(f.calls.filter(x=>x.name==='reserve_model_budget').length,1);
 const recovery=fixture({qa_claim_work_v1:{kind:'reconciliation_required',turnId:turn}});assert.equal(await recovery.run(),'reconciliation_required');assert.equal(recovery.sent,0);
});
test('unknown settlement and completion do not create another physical attempt',async()=>{
 for(const point of ['finish_model_budget','qa_complete_work_v1']){
 const f=fixture({[point]:new Error('Synthetic lost ACK')});assert.equal(await f.run(),'unavailable');assert.equal(f.sent,1);
 assert.equal(f.calls.filter(x=>x.name==='qa_authorize_dispatch_v1').length,1);
 if(point==='finish_model_budget')assert.equal(f.calls.some(x=>x.name==='qa_complete_work_v1'),false);
 }
});
test('transport is independently fenced even if injected composer omits authorization',async()=>{
 const f=fixture();f.deps.invokeContext=async args=>args.transport({provider:'qwen',endpoint:'https://synthetic.invalid',method:'POST',body:'{}',signal:args.signal});
 assert.equal(await f.run(),'unavailable');assert.equal(f.sent,0);assert.equal(f.calls.at(-1).p.p_action,'release');
});
test('cancellation bounds a hostile composer and records reserved attempt without publishing',async()=>{
 const f=fixture(),controller=new AbortController();f.deps.invokeContext=()=>new Promise(()=>{});
 const started=Date.now(),running=f.run(controller.signal);setTimeout(()=>controller.abort(),10);
 assert.equal(await running,'unavailable');assert.ok(Date.now()-started<1000);assert.equal(f.sent,0);assert.equal(f.calls.at(-1).p.p_action,'release');
});

test('definite SQL blocked dispatch releases reserved budget, never settles a zero cost',async()=>{
 const f=fixture({qa_authorize_dispatch_v1:{kind:'blocked'}});assert.equal(await f.run(),'unavailable');assert.equal(f.sent,0);
 assert.equal(f.calls.at(-1).name,'finish_model_budget');assert.equal(f.calls.at(-1).p.p_action,'release');assert.equal(f.calls.at(-1).p.p_actual_micros,null);
 assert.equal(f.usageReceipts.length,0);assert.equal(f.calls.filter(x=>x.name==='qa_authorize_dispatch_v1').length,1);
});
test('unrecognized dispatch ACK and post-authorization transport failure retain pending cost',async()=>{
 for(const response of [{kind:'unknown'},{kind:'blocked',unexpected:true}]){const uncertain=fixture({qa_authorize_dispatch_v1:response});assert.equal(await uncertain.run(),'unavailable');assert.equal(uncertain.sent,0);assert.equal(uncertain.calls.at(-1).p.p_action,'pending');}
 const transport=fixture();transport.deps.provider.transport=async()=>{throw Error('Synthetic physical transport failure');};assert.equal(await transport.run(),'unavailable');assert.equal(transport.calls.at(-1).p.p_action,'pending');assert.equal(transport.calls.filter(x=>x.name==='qa_authorize_dispatch_v1').length,1);
});
