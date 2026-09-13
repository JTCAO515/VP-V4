import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import { mkdtemp,writeFile,readFile,rm,chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { stagingUsageReconciliation } from '../../../lib/server/jobs/staging-usage-reconciliation.ts';
import { createStagingTextJob } from '../../../lib/server/jobs/staging-text-job.ts';
import { PROTOCOL_MODELS } from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';

function fixture(){
 const job={schemaVersion:'vpj07-staging-text-job/1',ownerId:randomUUID(),policyId:randomUUID(),
  budget:{scopeId:randomUUID(),priceVersion:'synthetic-v1',reservedMicros:2101248,maxOutputTokens:512,timeoutMs:1000},
  provider:{provider:'qwen',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',configurationId:randomUUID(),configurationVersion:1,timeoutMs:1000},
  pricing:{mode:'flat',inputMicrosPerMillion:2000000,outputMicrosPerMillion:8000000,cachedInputMicrosPerMillion:null}};
 const turnId=randomUUID(),receipt={schemaVersion:'validated-model-usage/1',turnId,policyId:job.policyId,
  attempt:{scopeId:job.budget.scopeId,ownerId:job.ownerId,taskId:turnId,attemptId:randomUUID(),provider:'qwen',model:PROTOCOL_MODELS.qwen,priceVersion:job.budget.priceVersion,reservedMicros:job.budget.reservedMicros,timeoutMs:1000},
  usage:{inputTokens:10,outputTokens:5,totalTokens:15,cachedInputTokens:null,uncachedInputTokens:null,reasoningTokens:null,cost:'unknown'},actualMicros:60,observedAt:new Date().toISOString()};
 return {job,receipt};
}
test('reconciliation only settles the original attempt; exact repeat is safe and conflicts stay unavailable',async()=>{
 const {job,receipt}=fixture(),recovery=stagingUsageReconciliation(job,[receipt,structuredClone(receipt)]);assert.equal(recovery.receipts.length,1);
 const r=recovery.receipts[0],calls=[];const rpc=async(name,p)=>{calls.push({name,p});return {kind:'settled',overrun:false};};
 assert.equal(await recovery.settle(r,rpc,new AbortController().signal),'settled');
 assert.equal(calls[0].name,'finish_model_budget');assert.equal(calls[0].p.p_attempt_id,receipt.attempt.attemptId);assert.equal(calls[0].p.p_action,'settle');assert.equal(calls[0].p.p_actual_micros,60);
 assert.equal(await recovery.settle(r,async()=>({kind:'duplicate',status:'settled'}),new AbortController().signal),'already_settled');
 for(const value of [{kind:'conflict'},{kind:'duplicate',status:'pending'},null,{kind:'settled'}])assert.equal(await recovery.settle(r,async()=>value,new AbortController().signal),'unavailable');
 assert.equal(await recovery.settle(r,async()=>{throw Error('lost ack');},new AbortController().signal),'unavailable');
 const abort=new AbortController();abort.abort();assert.equal(await recovery.settle(r,rpc,abort.signal),'unavailable');assert.equal(await recovery.settle(receipt,rpc,new AbortController().signal),'unavailable');assert.equal(calls.length,1);
});
test('owner/config/price/usage conflicts and arbitrary fields fail before any I/O',()=>{
 const {job,receipt:r}=fixture();
 for(const patch of [{actualMicros:0},{actualMicros:61},{policyId:randomUUID()},{turnId:randomUUID()},{text:'never persist'},{observedAt:'2026-02-30T00:00:00.000Z'},
  ...['ownerId','scopeId','model','priceVersion'].map(k=>({attempt:{...r.attempt,[k]:k.endsWith('Id')?randomUUID():'other'}})),
  {usage:{...r.usage,totalTokens:99}},{usage:{...r.usage,cost:'known'}},{usage:{...r.usage,reasoningTokens:6}},{usage:{...r.usage,cachedInputTokens:7,uncachedInputTokens:7}}])assert.throws(()=>stagingUsageReconciliation(job,[{...r,...patch}]));
 assert.throws(()=>stagingUsageReconciliation(job,[r,{...r,usage:{...r.usage,inputTokens:14,totalTokens:19},actualMicros:68}]));
 assert.throws(()=>stagingUsageReconciliation({...job,pricing:{...job.pricing,inputMicrosPerMillion:1}},[r]));
 assert.throws(()=>stagingUsageReconciliation(job,Array(101).fill(r)));
});
test('worker persists validated usage before settlement; a receipt failure retains a hold',async()=>{
 for(const fail of [false,true]){
  const {job,receipt}=fixture(),calls=[],journal=[];let providers=0;
  const worker=createStagingTextJob(job,{workerCredential:()=> 'synthetic-worker',providerCredential:()=> 'synthetic-provider',recordDestination:async()=>{},
   recordUsage:async r=>{journal.push(r);calls.push('durable-usage');if(fail)throw Error('disk failed');},
   fetch:async(url,options)=>{
    if(url===job.provider.endpoint){providers++;return Response.json({model:PROTOCOL_MODELS.qwen,choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:'{"outcome":"answered","text":"Synthetic answer"}'}}],usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}});}
    const name=String(url).split('/').at(-1),p=JSON.parse(options.body);calls.push(name==='finish_model_budget'?p.p_action:name);
    return Response.json({claim_text_work:{kind:'leased',ownerId:job.ownerId,turnId:receipt.turnId,leaseToken:randomUUID(),attempt:1,leaseMs:120000},read_text_work:{kind:'input',text:'Synthetic question',provider:'qwen',endpoint:job.provider.endpoint,locale:'en',policyId:job.policyId},reserve_model_budget:{kind:'reserved'},dispatch_model_budget:{kind:'dispatched'},authorize_text_dispatch:{kind:'authorized'},finish_model_budget:{kind:fail?'pending':'settled',overrun:false},complete_text_work:{kind:'finished'},finish_turn_work:{kind:'queued'}}[name]);
   }});
  assert.equal(await worker(new AbortController().signal),fail?'queued':'finished');assert.equal(providers,1);assert.equal(journal.length,1);assert.equal(journal[0].actualMicros,60);
  assert.ok(calls.indexOf('durable-usage')<calls.indexOf(fail?'pending':'settle'));assert.equal(calls.includes('release'),false);
  assert.doesNotMatch(JSON.stringify(journal),/Synthetic question|Synthetic answer|synthetic-worker|synthetic-provider/);
 }
});
const child=(args,env)=>new Promise(resolve=>{const p=spawn(process.execPath,args,{env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);p.once('close',code=>resolve({code,stdout,stderr}));});
test('explicit CLI checks private journal/config before I/O, ignores only torn tail and never dispatches',{timeout:15000},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'vpj-usage-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const {job,receipt}=fixture(),config=join(dir,'config.json'),journal=join(dir,'journal.jsonl'),out=join(dir,'out.jsonl'),mapper=join(dir,'mapper.mjs'),calls=join(dir,'calls.jsonl');
 const contents=JSON.stringify(job),digest=createHash('sha256').update(contents).digest('hex');await writeFile(config,contents,{mode:0o600});
 const lines=[{schemaVersion:'vpj07-worker-run/2',configurationDigest:digest,phase:'started'},{schemaVersion:'vpj07-usage-journal/1',configurationDigest:digest,receipt}];
 await writeFile(journal,lines.map(JSON.stringify).join('\n')+'\n{"torn":',{mode:0o600});
 await writeFile(mapper,`import {appendFileSync} from 'node:fs';globalThis.fetch=async(url,options)=>{if(String(url)!=='https://dzqdzetcctkhbrhlxxgn.supabase.co/rest/v1/rpc/finish_model_budget'||options.redirect!=='manual')throw Error('Unexpected destination');const p=JSON.parse(options.body);if(p.p_action!=='settle')throw Error('Unexpected action');appendFileSync(${JSON.stringify(calls)},JSON.stringify(p)+'\\n');return Response.json({kind:'settled',overrun:false});};`);
 const args=['--experimental-strip-types','--import',mapper,resolve('lib/server/jobs/reconcile-staging-text-usage.mjs'),'--config',config,'--journal',journal,'--receipts',out];
 const env={...process.env,NODE_OPTIONS:'',VERCEL_ENV:'',VISEPANDA_STAGING_USAGE_RECONCILE:'true',VISEPANDA_STAGING_TEXT_WORKER_KEY:'synthetic-worker-key'};
 const r=await child(args,env);assert.equal(r.code,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),{schemaVersion:'vpj07-usage-reconciliation-result/1',settled:1,alreadySettled:0,partialTailIgnored:true});
 assert.equal((await readFile(calls,'utf8')).trim().split('\n').length,1);assert.equal((await child(args,env)).code,1,'existing output is not overwritten');
 await chmod(journal,0o644);assert.equal((await child([...args.slice(0,-1),join(dir,'public-rejected.jsonl')],env)).code,1);assert.equal((await readFile(calls,'utf8')).trim().split('\n').length,1);
 await chmod(journal,0o600);
 for(const mode of ['thinking','service']){
  const thinking={...job,schemaVersion:'vpj07-staging-text-job/3',inputMode:'task_history_v1',thinkingBudgetTokens:256};
  const value=mode==='thinking'?thinking:{schemaVersion:'vpj07-staging-text-service/1',job,expiresAt:'2026-01-01T00:00:00.000Z',pollIntervalMs:5000};
  const body=JSON.stringify(value),hash=createHash('sha256').update(body).digest('hex'),schema=mode==='thinking'?'vpj07-worker-run/3':'vpj07-service-run/1';
  await writeFile(config,body);await writeFile(journal,[{schemaVersion:schema,configurationDigest:hash,phase:'started'},{schemaVersion:'vpj07-usage-journal/1',configurationDigest:hash,receipt},{schemaVersion:schema,configurationDigest:hash,phase:'returned'}].map(JSON.stringify).join('\n')+'\n');
  const replay=await child([...args.slice(0,-1),join(dir,mode+'.jsonl')],env);assert.equal(replay.code,0,replay.stderr);assert.equal(JSON.parse(replay.stdout).settled,1);
 }
});
