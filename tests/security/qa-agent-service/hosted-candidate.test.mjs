import test from 'node:test';
import assert from 'node:assert/strict';
import {PROTOCOL_MODELS} from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';
const worker=await import('../../../lib/server/jobs/hosted-text-worker.ts');
const audit=await import('../../../lib/server/jobs/hosted-usage-audit.ts');
const owner='11111111-1111-4111-8111-111111111111',policy='22222222-2222-4222-8222-222222222222',turn='33333333-3333-4333-8333-333333333333',token='44444444-4444-4444-8444-444444444444',scope='55555555-5555-4555-8555-555555555555',task='66666666-6666-4666-8666-666666666666';
const endpoint='https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const profile=()=>({schemaVersion:'vpj07-hosted-text-worker/4',projectRef:'abcdefghijklmnopqrst',pollIntervalMs:1000,maxLifetimeMs:60000,drainMs:1000,concurrency:1,groupLimit:10,modes:['qa_session_history_v1'],planning:null,qwen:{priceVersion:'synthetic-v1',pricing:{mode:'flat',inputMicrosPerMillion:1,outputMicrosPerMillion:1,cachedInputMicrosPerMillion:null},reservedMicros:2,maxOutputTokens:128,timeoutMs:1000,configurationId:task,configurationVersion:1}});
let journal;
test('independent hosted loop executes sole context composer, original transport and secure usage journal',async()=>{
 const p=worker.parseHostedWorkerProfile(profile()),controller=new AbortController(),rows=[],startedAt=new Date().toISOString();let sent=0,completed=false;
 rows.push({schemaVersion:'vpj07-hosted-run/1',phase:'started',workerId:owner,build:'synthetic-qa',startedAt,profile:p,qwenEndpoint:endpoint});
 const raw={kind:'qa_input',schemaVersion:'qa-context/1',contextMode:'qa_session_history_v1',ownerId:owner,authSessionId:token,turnId:turn,threadId:task,serviceTaskId:task,policyId:policy,consentId:scope,provider:'qwen',endpoint,text:'Synthetic question',locale:'en',history:[],sourceTurnIds:[turn],contextDigest:'a'.repeat(64)};
 const fetcher=async(url,init)=>{
  if(String(url)===endpoint){sent++;const payload=JSON.parse(init.body);assert.equal(payload.messages.at(-1).content,raw.text);return Response.json({model:PROTOCOL_MODELS.qwen,choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({outcome:'answered',text:'Synthetic stored result'})}}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}});}
  const name=new URL(url).pathname.split('/').at(-1);
  const values={hosted_worker_heartbeat:{kind:'ok',enabled:true},qa_ready_groups_v2:{kind:'groups',groups:[{ownerId:owner,policyId:policy,contextMode:'qa_session_history_v1',provider:'qwen',endpoint,scopes:[{scopeId:scope,model:PROTOCOL_MODELS.qwen,priceVersion:'synthetic-v1'}]}]},qa_claim_work_v1:{kind:'leased',ownerId:owner,turnId:turn,leaseToken:token,attempt:1,leaseMs:120000},qa_read_work_v1:raw,reserve_model_budget:{kind:'reserved'},qa_authorize_dispatch_v1:{kind:'authorized'},finish_model_budget:{kind:'settled',overrun:false},qa_complete_work_v1:{kind:'finished'}};
  assert.ok(values[name],'only original/QA qualified RPCs');if(name==='qa_complete_work_v1'){completed=true;assert.equal(JSON.parse(init.body).p_text,'Synthetic stored result');}
  return Response.json(values[name]);
 };
 const run=worker.createHostedTextWorker(p,{workerId:owner,build:'synthetic-qa',startedAt,qwenEndpoint:endpoint,qaProjectRef:'abcdefghijklmnopqrst',workerCredential:()=> 'sb_secret_synthetic',providerCredential:()=> 'synthetic-provider',fetch:fetcher,
 journal:{job:async(digest,job)=>rows.push({schemaVersion:'vpj07-hosted-job/1',jobDigest:digest,job}),usage:async(digest,receipt)=>rows.push({schemaVersion:'vpj07-usage-journal/1',configurationDigest:digest,receipt}),knowledge:async()=>{throw Error('unexpected legacy knowledge');},destination:async receipt=>rows.push(receipt),event:async event=>{rows.push({schemaVersion:'vpj07-hosted-run/1',...event,observedAt:new Date().toISOString()});if(completed)controller.abort();}}});
 const result=await run(controller.signal);assert.equal(result.finished,1);assert.equal(sent,1);
 rows.push({schemaVersion:'vpj07-hosted-run/1',phase:'returned',...result,observedAt:new Date().toISOString()});journal=rows;
 const report=audit.auditHostedUsageJournal(rows);assert.equal(report.distinctAttempts,1);assert.equal(report.groups[0].actualMicros,1);assert.equal(report.settlementAction,'none');
});
test('independent auditor rejects foreign receipt, hash mismatch and inconsistent duplicate usage',()=>{
 assert.ok(journal);const copy=()=>structuredClone(journal);
 const foreign=copy();foreign.find(r=>r.schemaVersion==='vpj07-usage-journal/1').receipt.attempt.ownerId=policy;assert.throws(()=>audit.auditHostedUsageJournal(foreign));
 const hash=copy();hash.find(r=>r.schemaVersion==='vpj07-hosted-job/1').jobDigest='b'.repeat(64);assert.throws(()=>audit.auditHostedUsageJournal(hash));
 const duplicate=copy(),receipt=structuredClone(duplicate.find(r=>r.schemaVersion==='vpj07-usage-journal/1'));receipt.receipt.usage.inputTokens=11;receipt.receipt.usage.totalTokens=21;duplicate.splice(-1,0,receipt);assert.throws(()=>audit.auditHostedUsageJournal(duplicate));
 const good=copy();good.splice(-1,0,structuredClone(good.find(r=>r.schemaVersion==='vpj07-usage-journal/1')));assert.equal(audit.auditHostedUsageJournal(good).distinctAttempts,1);
});
test('current profile v4 uses existing CLI planning:false branch and keeps legacy mode rejection',()=>{
 const p=worker.parseHostedWorkerProfile(profile());assert.equal(p.schemaVersion==='vpj07-hosted-text-worker/2'&&p.planning!==null,false);
 assert.throws(()=>worker.parseHostedWorkerProfile({...profile(),schemaVersion:'vpj07-hosted-text-worker/2'}));
 const old={...profile(),schemaVersion:'vpj07-hosted-text-worker/2',modes:['current_input_v1']};delete old.projectRef;assert.equal(worker.parseHostedWorkerProfile(old).schemaVersion,'vpj07-hosted-text-worker/2');
 assert.equal(worker.planGroup(p,{contextMode:'current_input_v1'},endpoint),null);
});
