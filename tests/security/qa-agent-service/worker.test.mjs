import {readIndependentQaTarget} from '../../../lib/server/qa-agent/target.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createQaWorker} from '../../../lib/server/qa-agent/worker.ts';
import {PROTOCOL_MODELS} from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';
const owner='11111111-1111-4111-8111-111111111111',policy='22222222-2222-4222-8222-222222222222',turn='33333333-3333-4333-8333-333333333333',token='44444444-4444-4444-8444-444444444444',scope='55555555-5555-4555-8555-555555555555',task='66666666-6666-4666-8666-666666666666';
const endpoint='https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const config={schemaVersion:'qa-agent-worker/2',projectRef:'dzqdzetcctkhbrhlxxgn',databaseUrl:'https://dzqdzetcctkhbrhlxxgn.supabase.co',ownerId:owner,policyId:policy,budget:{scopeId:scope,priceVersion:'synthetic-v1',reservedMicros:2,maxOutputTokens:128,timeoutMs:1000},provider:{provider:'qwen',endpoint,configurationId:task,configurationVersion:1,timeoutMs:1000},pricing:{mode:'flat',inputMicrosPerMillion:1,outputMicrosPerMillion:1,cachedInputMicrosPerMillion:null}};
test('concrete worker keeps DB and provider credentials on their distinct destinations',async()=>{
 const calls=[],destinations=[],receipts=[];
 const deps={qaBinding:{schemaVersion:'qa-runtime-binding/1',projectRef:config.projectRef,ownerId:owner,policyId:policy,scopeId:scope,noticeHash:'a'.repeat(64)},workerCredential:()=> 'sb_secret_synthetic_worker',providerCredential:()=> 'synthetic-provider-secret',qwenEndpoint:endpoint,recordDestination:async r=>destinations.push(r),recordUsage:async r=>receipts.push(r),
 fetch:async(url,init)=>{
 calls.push(String(url));const headers=new Headers(init.headers);assert.equal(init.redirect,'manual');assert.equal(init.credentials,'omit');
 if(String(url)===endpoint){assert.equal(headers.get('authorization'),'Bearer synthetic-provider-secret');assert.equal(headers.get('apikey'),null);return Response.json({synthetic:true});}
 assert.equal(new URL(url).origin,config.databaseUrl);assert.equal(headers.get('apikey'),'sb_secret_synthetic_worker');assert.equal(headers.get('authorization'),null);
 const name=new URL(url).pathname.split('/').at(-1);
 const rows={qa_claim_work_v1:{kind:'leased',turnId:turn,ownerId:owner,attempt:1,leaseToken:token,leaseMs:120000},qa_read_work_v1:{kind:'qa_input',schemaVersion:'qa-context/1',contextMode:'qa_session_history_v1',ownerId:owner,authSessionId:token,turnId:turn,threadId:task,serviceTaskId:task,policyId:policy,consentId:scope,provider:'qwen',endpoint,locale:'en'},reserve_model_budget:{kind:'reserved'},qa_authorize_dispatch_v2:{kind:'authorized'},finish_model_budget:{kind:'settled',overrun:false},qa_complete_work_v1:{kind:'finished'}};
 if(name==='qa_authorize_dispatch_v2'){const body=JSON.parse(init.body);assert.equal(body.p_owner_id,owner);assert.equal(body.p_notice_hash,'a'.repeat(64));}
 assert.ok(rows[name]);return Response.json(rows[name]);
 },invokeContext:async args=>{
 await args.rpc('qa_authorize_dispatch_v1',{p_turn_id:turn,p_lease_token:token,p_scope_id:scope,p_policy_id:policy,p_provider:'qwen',p_context_digest:'a'.repeat(64)},args.signal);
 await args.transport({provider:'qwen',endpoint,method:'POST',body:JSON.stringify({model:PROTOCOL_MODELS.qwen}),signal:args.signal});
 return {kind:'protocol_validated',provider:'qwen',model:PROTOCOL_MODELS.qwen,output:JSON.stringify({outcome:'answered',text:'Synthetic original output'}),usage:{inputTokens:10,outputTokens:10,totalTokens:20,cachedInputTokens:null,uncachedInputTokens:null,reasoningTokens:null,cost:'unknown'}};
 }};
 assert.equal(await createQaWorker(config,deps,readIndependentQaTarget('dzqdzetcctkhbrhlxxgn'))(new AbortController().signal),'finished');assert.equal(calls.filter(c=>c===endpoint).length,1);assert.equal(destinations.length,3);assert.equal(receipts[0].actualMicros,1);
 assert.throws(()=>createQaWorker({...config,databaseUrl:'https://other.supabase.co'},deps,readIndependentQaTarget('dzqdzetcctkhbrhlxxgn')));
 assert.throws(()=>createQaWorker({...config,budget:{...config.budget,reservedMicros:1}},deps,readIndependentQaTarget('dzqdzetcctkhbrhlxxgn')));
});

test('worker refuses every Vercel runtime while existing dedicated host remains possible',()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try { assert.throws(()=>createQaWorker(config,{})); } finally { old===undefined?delete process.env.VERCEL_ENV:process.env.VERCEL_ENV=old; }
});
