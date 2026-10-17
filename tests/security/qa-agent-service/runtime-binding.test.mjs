import test from 'node:test';
import assert from 'node:assert/strict';
import {requireQaRuntimeBinding} from '../../../lib/server/qa-agent/runtime-binding.ts';
import {parseQaHostedProfile,planQaGroup,qaJobConfig} from '../../../lib/server/qa-agent/hosted-profile.ts';
import {createHostedTextWorker} from '../../../lib/server/jobs/hosted-text-worker.ts';
import {createQaWorker} from '../../../lib/server/qa-agent/worker.ts';
import {readApprovedQaTarget,readLocalQaTarget} from '../../../lib/server/qa-agent/target.ts';
import {PROTOCOL_MODELS} from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';
const id=n=>`${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
const ref='dzqdzetcctkhbrhlxxgn',endpoint='https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const binding={schemaVersion:'qa-runtime-binding/1',projectRef:ref,ownerId:id('1'),policyId:id('2'),scopeId:id('3'),noticeHash:'a'.repeat(64)};
const profile=()=>parseQaHostedProfile({schemaVersion:'vpj07-hosted-text-worker/4',projectRef:ref,pollIntervalMs:1000,maxLifetimeMs:60000,drainMs:1000,concurrency:1,groupLimit:1,modes:['qa_session_history_v1'],planning:null,qwen:{priceVersion:'synthetic-v1',pricing:{mode:'flat',inputMicrosPerMillion:1,outputMicrosPerMillion:1,cachedInputMicrosPerMillion:null},reservedMicros:2,maxOutputTokens:128,timeoutMs:1000,configurationId:id('6'),configurationVersion:1}});
const group=()=>({ownerId:binding.ownerId,policyId:binding.policyId,noticeHash:binding.noticeHash,contextMode:'qa_session_history_v1',provider:'qwen',endpoint,scopes:[{scopeId:binding.scopeId,model:PROTOCOL_MODELS.qwen,priceVersion:'synthetic-v1'}]});

test('trusted deployment binding is closed, immutable, canonical and project-bound',()=>{
 assert.ok(Object.isFrozen(requireQaRuntimeBinding(binding,ref)));
 for(const bad of [undefined,null,{}, {...binding,extra:true},{...binding,schemaVersion:'qa-runtime-binding/2'},{...binding,projectRef:'abcdefghijklmnopqrst'},...['ownerId','policyId','scopeId','noticeHash'].flatMap(k=>[{...binding,[k]:undefined},{...binding,[k]:'invalid'}]),{...binding,ownerId:'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'}])assert.throws(()=>requireQaRuntimeBinding(bad,ref));
});
test('planner rejects every foreign qualified tuple and missing binding, retaining scope ambiguity refusal',()=>{
 const p=profile(),g=group();assert.ok(planQaGroup(p,g,endpoint,binding));
 assert.equal(planQaGroup(p,g,endpoint),null);
 for(const k of ['ownerId','policyId','noticeHash'])assert.equal(planQaGroup(p,{...g,[k]:k==='noticeHash'?'b'.repeat(64):id('8')},endpoint,binding),null);
 for(const scopes of [[],[{...g.scopes[0],scopeId:id('8')}],[...g.scopes,...g.scopes]])assert.equal(planQaGroup(p,{...g,scopes},endpoint,binding),null);
});
test('worker independently refuses foreign jobs before credentials, budget, claim or provider; local direct target remains compatible',()=>{
 const p=profile(),job=qaJobConfig(p,binding.ownerId,binding.policyId,binding.scopeId,endpoint);let reads=0;
 const deps={qaBinding:binding,workerCredential:()=>{reads++;return 'synthetic-db';},providerCredential:()=>{reads++;return 'synthetic-provider';},recordDestination:async()=>{},recordUsage:async()=>{},invokeContext:async()=>{throw Error('no dispatch');}};
 for(const bad of [{...job,ownerId:id('8')},{...job,policyId:id('8')},{...job,budget:{...job.budget,scopeId:id('8')}}])assert.throws(()=>createQaWorker(bad,deps,readApprovedQaTarget(ref)));
 assert.throws(()=>createQaWorker(job,{...deps,qaBinding:undefined},readApprovedQaTarget(ref)));
 assert.equal(reads,0);
 assert.doesNotThrow(()=>createQaWorker({...job,projectRef:null,databaseUrl:'http://127.0.0.1:54321'},{...deps,qaBinding:undefined},readLocalQaTarget('http://127.0.0.1:54321')));
});
test('hostile discovery cannot turn another independently qualified actor into a claim',async()=>{
 const stop=new AbortController(),calls=[];
 const deps={qaBinding:binding,qaProjectRef:ref,workerId:id('9'),build:'synthetic-binding',startedAt:new Date().toISOString(),qwenEndpoint:endpoint,
 workerCredential:()=> 'synthetic-db',providerCredential:()=>{throw Error('foreign provider access');},
 journal:{job:async()=>{throw Error('foreign job');},usage:async()=>{throw Error('foreign usage');},knowledge:async()=>{},destination:async()=>{},event:async e=>{if(e.phase==='cycle')stop.abort();}},
 fetch:async(url,init)=>{const name=new URL(url).pathname.split('/').at(-1);calls.push(name);
 if(name==='hosted_worker_heartbeat')return Response.json({kind:'ok',enabled:true});
 assert.equal(name,'qa_ready_groups_v3');assert.deepEqual(JSON.parse(init.body),{p_limit:1,p_model:PROTOCOL_MODELS.qwen,p_price_version:'synthetic-v1',p_endpoint:endpoint,p_owner_id:binding.ownerId,p_policy_id:binding.policyId,p_scope_id:binding.scopeId,p_notice_hash:binding.noticeHash});
 return Response.json({kind:'groups',groups:[{...group(),ownerId:id('8')}]});}};
 await createHostedTextWorker(profile(),deps)(stop.signal);
 assert.equal(calls.includes('qa_claim_work_v1'),false);assert.equal(calls.includes('reserve_model_budget'),false);
 assert.throws(()=>createHostedTextWorker(profile(),{...deps,qaBinding:undefined}));
});
