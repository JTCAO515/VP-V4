import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {qaConfig} from '../../../lib/server/qa-agent/config.ts';
import {readApprovedQaTarget,readIndependentQaTarget,SHARED_QA_PROJECT_REF} from '../../../lib/server/qa-agent/target.ts';
import {createQaWorker} from '../../../lib/server/qa-agent/worker.ts';
import {parseHostedWorkerProfile,createHostedTextWorker,getHostedWorkerDatabaseTarget} from '../../../lib/server/jobs/hosted-text-worker.ts';
import {qaJobConfig,requireQaProfileTarget} from '../../../lib/server/qa-agent/hosted-profile.ts';
const ref='dzqdzetcctkhbrhlxxgn',other='bbbbbbbbbbbbbbbbbbbb',policy='11111111-1111-4111-8111-111111111111';
const endpoint='https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const raw=()=>({schemaVersion:'vpj07-hosted-text-worker/4',projectRef:ref,pollIntervalMs:1000,maxLifetimeMs:60000,drainMs:1000,concurrency:1,groupLimit:1,modes:['qa_session_history_v1'],planning:null,qwen:{priceVersion:'synthetic-v1',pricing:{mode:'flat',inputMicrosPerMillion:1,outputMicrosPerMillion:1,cachedInputMicrosPerMillion:null},reservedMicros:2,maxOutputTokens:128,timeoutMs:1000,configurationId:policy,configurationVersion:1}});
const env=()=>({VISEPANDA_QA_AGENT:'true',VISEPANDA_QA_AGENT_ORIGIN:'https://qatesting.go2china.space',VISEPANDA_QA_AGENT_POLICY_ID:policy,VISEPANDA_QA_SUPABASE_PROJECT_REF:ref,NEXT_PUBLIC_SUPABASE_URL:`https://${ref}.supabase.co`,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic-public',VERCEL_ENV:'preview'});
test('foreground operator ref is mandatory and exact; approved shared ref works; missing, wrong-ref, fallback and URL normalization rejected',()=>{
 assert.equal(readApprovedQaTarget(SHARED_QA_PROJECT_REF).projectRef,SHARED_QA_PROJECT_REF);assert.equal(readIndependentQaTarget(SHARED_QA_PROJECT_REF).projectRef,SHARED_QA_PROJECT_REF);
 assert.equal(qaConfig('https://qatesting.go2china.space/qa',env()).url,`https://${ref}.supabase.co`);
 for(const candidate of [undefined,'','abcdefghijklmnopqrst','A'.repeat(20),'a'.repeat(19),'a'.repeat(21),ref+'/',other]){
  assert.equal(qaConfig('https://qatesting.go2china.space/qa',{...env(),VISEPANDA_QA_SUPABASE_PROJECT_REF:candidate}),null);
 }
 for(const url of [`https://abcdefghijklmnopqrst.supabase.co`,`https://${other}.supabase.co`,`https://${ref}.supabase.co/`,`https://${ref}.supabase.co:443`,`https://${ref}.supabase.co?x=1`,`https://user@${ref}.supabase.co`,`http://${ref}.supabase.co`])assert.equal(qaConfig('https://qatesting.go2china.space/qa',{...env(),NEXT_PUBLIC_SUPABASE_URL:url}),null);
 assert.equal(qaConfig('https://qatesting.go2china.space/qa',{...env(),VERCEL_ENV:'production'}),null);
 assert.equal(qaConfig('https://evil.invalid/qa',env()),null);
});
test('profile, composition root and job independently agree before credentials or network',()=>{
 const profile=parseHostedWorkerProfile(raw()),target=readIndependentQaTarget(ref);assert.equal(getHostedWorkerDatabaseTarget(profile),target.databaseUrl);
 const job=qaJobConfig(profile,policy,policy,policy,endpoint);assert.equal(job.projectRef,ref);assert.equal(job.schemaVersion,'qa-agent-worker/2');
 let reads=0;const deps={workerCredential:()=>{reads++;return 'synthetic';},providerCredential:()=>{reads++;return 'synthetic';},recordDestination:async()=>{},recordUsage:async()=>{},invokeContext:async()=>{throw Error('not invoked');},qwenEndpoint:endpoint};
 assert.doesNotThrow(()=>createQaWorker(job,deps,target));
 for(const invalid of [{...job,projectRef:other,databaseUrl:`https://${other}.supabase.co`},{...job,databaseUrl:`https://${other}.supabase.co`},{...job,projectRef:'abcdefghijklmnopqrst',databaseUrl:'https://abcdefghijklmnopqrst.supabase.co'},{...job,schemaVersion:'qa-agent-worker/1'}])assert.throws(()=>createQaWorker(invalid,deps,target));
 assert.throws(()=>createQaWorker(job,deps));assert.equal(reads,0);
 const legacy=raw();legacy.schemaVersion='vpj07-hosted-text-worker/3';delete legacy.projectRef;assert.equal(parseHostedWorkerProfile(legacy).schemaVersion,legacy.schemaVersion);assert.throws(()=>getHostedWorkerDatabaseTarget(parseHostedWorkerProfile(legacy)));assert.throws(()=>createHostedTextWorker(parseHostedWorkerProfile(legacy),{}));
 assert.throws(()=>getHostedWorkerDatabaseTarget(profile,other));assert.throws(()=>createHostedTextWorker(profile,{qaProjectRef:other}));assert.throws(()=>createHostedTextWorker(profile,{}));
});
const cli=readFileSync('lib/server/jobs/run-hosted-text-worker.mjs','utf8').replace(/^import[^\n]*\n/gm,'');
async function cliProbe(profile,extra={}){
 let secretReads=0;const errors=[];const runtime={env:{VISEPANDA_HOSTED_TEXT_WORKER:'true',VISEPANDA_HOSTED_WORKER_PROFILE:JSON.stringify(profile),VISEPANDA_QA_SUPABASE_PROJECT_REF:ref,VISEPANDA_HOSTED_WORKER_SECRET_MODE:'files',...extra},argv:['node','entry'],exitCode:0,removeListener:()=>{}};
 await vm.runInNewContext('(async()=>{'+cli+'})()',{process:runtime,AbortController,AbortSignal,Buffer,console:{error:s=>errors.push(s)},parseHostedWorkerProfile,getHostedWorkerDatabaseTarget,requireQaProfileTarget,parseScopedHostedProfile:()=>{throw Error('unexpected scoped');},readHostedWorkerSecrets:async()=>{secretReads++;throw Error('Synthetic no credentials');}});
 return {secretReads,exitCode:runtime.exitCode,errors};
}
test('actual CLI binds /4 before reading fixed files and refuses env-key fallback without secret access',async()=>{
 for(const extra of [{VISEPANDA_QA_SUPABASE_PROJECT_REF:undefined},{VISEPANDA_QA_SUPABASE_PROJECT_REF:other},{VISEPANDA_HOSTED_WORKER_SECRET_MODE:undefined},{VISEPANDA_HOSTED_WORKER_DB_KEY:'synthetic-canary'}]){
  const result=await cliProbe(raw(),extra);assert.equal(result.secretReads,0);assert.equal(result.exitCode,1);assert.equal(result.errors.some(e=>e.includes('synthetic-canary')),false);
 }
 const allowed=await cliProbe(raw());assert.equal(allowed.secretReads,1,'valid /4 reaches only original container fixed-file reader');
 const old=raw();old.schemaVersion='vpj07-hosted-text-worker/3';delete old.projectRef;assert.equal((await cliProbe(old)).secretReads,0);
 for(const version of [1,2]){const old=raw();old.schemaVersion=`vpj07-hosted-text-worker/${version}`;delete old.projectRef;old.modes=['current_input_v1'];if(version===1)delete old.planning;assert.equal((await cliProbe(old)).secretReads,1);}
});
