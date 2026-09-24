import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,readFile,chmod,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {auditHostedUsageJournal} from '../../../lib/server/jobs/hosted-usage-audit.ts';
import {jobConfig,parseHostedWorkerProfile} from '../../../lib/server/jobs/hosted-text-worker.ts';
import {PROTOCOL_MODELS} from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';

const endpoint='https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const profile=parseHostedWorkerProfile({schemaVersion:'vpj07-hosted-text-worker/1',pollIntervalMs:3000,maxLifetimeMs:86400000,
 drainMs:45000,concurrency:2,groupLimit:20,modes:['current_input_v1'],
 qwen:{priceVersion:'synthetic-v1',pricing:{mode:'flat',inputMicrosPerMillion:2000000,outputMicrosPerMillion:8000000,cachedInputMicrosPerMillion:null},
  reservedMicros:2101248,maxOutputTokens:512,timeoutMs:1000,configurationId:randomUUID(),configurationVersion:1}});
const first={schemaVersion:'vpj07-hosted-run/1',phase:'started',workerId:randomUUID(),build:'synthetic',startedAt:new Date().toISOString(),profile,qwenEndpoint:endpoint};
function group(ownerId=randomUUID()){
 const job=jobConfig(profile,'current_input_v1',ownerId,randomUUID(),randomUUID(),endpoint);
 const digest=createHash('sha256').update(JSON.stringify(job)).digest('hex');
 return {job,digest,row:{schemaVersion:'vpj07-hosted-job/1',jobDigest:digest,job}};
}
function usage(g,patch={}){
 const turnId=randomUUID();
 return {schemaVersion:'vpj07-usage-journal/1',configurationDigest:g.digest,receipt:{schemaVersion:'validated-model-usage/1',turnId,policyId:g.job.policyId,
  attempt:{scopeId:g.job.budget.scopeId,ownerId:g.job.ownerId,taskId:turnId,attemptId:randomUUID(),provider:'qwen',model:PROTOCOL_MODELS.qwen,
   priceVersion:g.job.budget.priceVersion,reservedMicros:g.job.budget.reservedMicros,timeoutMs:g.job.budget.timeoutMs},
  usage:{inputTokens:10,outputTokens:5,totalTokens:15,cachedInputTokens:null,uncachedInputTokens:null,reasoningTokens:null,cost:'unknown'},
  actualMicros:60,observedAt:new Date().toISOString(),...patch}};
}
test('separates owner groups, validates price, deduplicates exact receipts and does not infer ledger state',()=>{
 const a=group(),b=group(),ra=usage(a),rb=usage(b);
 const audit=auditHostedUsageJournal([first,a.row,b.row,ra,structuredClone(ra),rb]);
 assert.equal(audit.groups.length,2);assert.equal(audit.receiptRows,3);assert.equal(audit.distinctAttempts,2);
 assert.equal(audit.groups.reduce((sum,g)=>sum+g.actualMicros,0),120);
 assert.equal(audit.ledgerState,'not_checked');assert.equal(audit.settlementAction,'none');
 assert.equal(audit.processEndObserved,false);
 assert.equal(audit.groups.find(g=>g.ownerId===a.job.ownerId).distinctAttempts,1);
 assert.ok(!JSON.stringify(audit).includes('synthetic-secret'));
});
test('rejects forged jobs, orphan or conflicting receipts, cross-group attempt reuse and content fields',()=>{
 const a=group(),b=group(),r=usage(a);
 const other=usage(b);
 const reused={...other,receipt:{...other.receipt,attempt:{...other.receipt.attempt,attemptId:r.receipt.attempt.attemptId}}};
 for(const rows of [
  [first,{...a.row,job:{...a.job,ownerId:randomUUID()}},r],
  [first,r,a.row],
  [first,a.row,{...r,receipt:{...r.receipt,actualMicros:61}}],
  [first,a.row,r,{...r,receipt:{...r.receipt,usage:{...r.receipt.usage,inputTokens:11,totalTokens:16},actualMicros:62}}],
  [first,a.row,b.row,r,reused],
  [first,a.row,{...r,text:'private question'}],
  [first,a.row,r,{schemaVersion:'vpj07-hosted-run/1',phase:'disabled',cycle:1,observedAt:new Date().toISOString(),answer:'private answer'}],
  [first,a.row,{schemaVersion:'vpj07-hosted-run/1',phase:'returned',reason:'stopped',polls:1,finished:1,unavailable:0,skipped:0,observedAt:new Date().toISOString()},r],
  [first,a.row,r,{schemaVersion:'provider-destination/1',invocationId:randomUUID(),provider:'qwen',model:PROTOCOL_MODELS.qwen,endpoint,
    configurationId:profile.qwen.configurationId,configurationVersion:1,phase:'attempted',observedAt:new Date().toISOString(),authorization:'synthetic-secret'}],
  [first,{...a.row,job:{...a.job,provider:{...a.job.provider,endpoint:'https://evil.example/v1'}}}],
 ])assert.throws(()=>auditHostedUsageJournal(rows));
});
test('validates more than 100 receipts without losing cross-batch duplicate checks',()=>{
 const g=group(),receipts=Array.from({length:101},()=>usage(g));
 const result=auditHostedUsageJournal([first,g.row,...receipts]);
 assert.equal(result.distinctAttempts,101);assert.equal(result.groups[0].actualMicros,6060);
 const changed={...receipts[0],receipt:{...receipts[0].receipt,actualMicros:61}};
 assert.throws(()=>auditHostedUsageJournal([first,g.row,...receipts,changed]));
});
const child=(args,env)=>new Promise(resolve=>{const p=spawn(process.execPath,args,{env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
 p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);p.once('close',code=>resolve({code,stdout,stderr}));});
test('CLI creates a private report, ignores torn tail, fails closed on public journal and never needs secrets',{timeout:15000},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'vp-hosted-audit-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const g=group(),journal=join(dir,'journal.jsonl'),report=join(dir,'report.json'),rows=[first,g.row,usage(g)];
 await writeFile(journal,rows.map(JSON.stringify).join('\n')+'\n{"torn":',{mode:0o600});
 const args=['--experimental-strip-types',resolve('lib/server/jobs/audit-hosted-text-usage.mjs'),'--journal',journal,'--report',report];
 const env={...process.env,NODE_OPTIONS:'',VERCEL_ENV:'',VISEPANDA_STAGING_TEXT_WORKER_KEY:'synthetic-secret-canary'};
 const result=await child(args,env);assert.equal(result.code,0,result.stderr);
 assert.equal(JSON.parse(result.stdout).partialTailIgnored,true);
 const output=JSON.parse(await readFile(report,'utf8'));
 assert.equal(output.groups[0].actualMicros,60);assert.equal(output.ledgerState,'not_checked');
 assert.equal((await stat(report)).mode&0o077,0);
 assert.ok(!JSON.stringify(output).includes('synthetic-secret-canary'));
 assert.equal((await child(args,env)).code,1,'report cannot be overwritten');
 await chmod(journal,0o644);
 assert.equal((await child([...args.slice(0,-1),join(dir,'public.json')],env)).code,1);
 await chmod(journal,0o600);
 await writeFile(journal,[first,g.row,{...rows[2],receipt:{...rows[2].receipt,actualMicros:61}}].map(JSON.stringify).join('\n')+'\n');
 assert.equal((await child([...args.slice(0,-1),join(dir,'forged.json')],env)).code,1);
 await assert.rejects(readFile(join(dir,'forged.json')));
});
