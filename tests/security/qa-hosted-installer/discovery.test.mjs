import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostedTextWorker,parseHostedWorkerProfile} from '../../../lib/server/jobs/hosted-text-worker.ts';
import {PROTOCOL_MODELS} from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';

const id=n=>`${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const endpoint='https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const profile=version=>parseHostedWorkerProfile({
  schemaVersion:`vpj07-hosted-text-worker/${version}`,pollIntervalMs:1000,maxLifetimeMs:60000,
  drainMs:1000,concurrency:1,groupLimit:1,
  modes:[version===3?'qa_session_history_v1':'current_input_v1'],
  ...(version>1?{planning:null}:{}),
  qwen:{priceVersion:'synthetic-v1',pricing:{mode:'flat',inputMicrosPerMillion:1,
    outputMicrosPerMillion:1,cachedInputMicrosPerMillion:null},reservedMicros:2,
    maxOutputTokens:128,timeoutMs:1000,configurationId:id(6),configurationVersion:1},
});

for(const version of [1,2,3])test(`profile/${version} discovers in its bounded queue and claims once`,async()=>{
  const controller=new AbortController(),calls=[];
  const discovery=version===3?'qa_ready_groups_v1':'hosted_worker_ready_groups';
  const claim=version===3?'qa_claim_work_v1':'claim_text_work';
  const group={ownerId:id(1),policyId:id(2),contextMode:version===3?'qa_session_history_v1':'current_input_v1',
    provider:'qwen',endpoint,scopes:[{scopeId:id(5),model:PROTOCOL_MODELS.qwen,priceVersion:'synthetic-v1'}]};
  const run=createHostedTextWorker(profile(version),{
    workerId:id(1),build:'synthetic-discovery',startedAt:new Date().toISOString(),qwenEndpoint:endpoint,
    workerCredential:()=> 'synthetic-db',providerCredential:()=> 'synthetic-provider',
    journal:{job:async()=>{},usage:async()=>{},knowledge:async()=>{},destination:async()=>{},
      event:async event=>{if(event.phase==='cycle')controller.abort();}},
    fetch:async(url,init)=>{
      const name=new URL(url).pathname.split('/').at(-1);calls.push(name);
      if(name==='hosted_worker_heartbeat')return Response.json({kind:'ok',enabled:true});
      if(name===discovery){assert.deepEqual(JSON.parse(init.body),{p_limit:1});return Response.json({kind:'groups',groups:[group]});}
      if(name===claim)return Response.json({kind:'empty'});
      throw Error(`Unexpected RPC ${name}`);
    },
  });
  await run(controller.signal);
  assert.equal(calls.filter(name=>name===discovery).length,1);
  assert.equal(calls.filter(name=>name===claim).length,1);
  assert.equal(calls.includes(version===3?'hosted_worker_ready_groups':'qa_ready_groups_v1'),false);
});
