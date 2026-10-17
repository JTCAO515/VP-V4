import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {acceptanceDigest,initializeQaAcceptanceJournal,openQaAcceptanceJournal,QaAcceptanceBusy} from '../../../lib/server/qa-agent/acceptance-journal.ts';
import {parseQaHostedProfile,qaJobConfig} from '../../../lib/server/qa-agent/hosted-profile.ts';
import {createHostedTextWorker} from '../../../lib/server/jobs/hosted-text-worker.ts';
import {PROTOCOL_MODELS} from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';
import {qaBinding,endpoint,sourceCommit} from './acceptance-fixture.mjs';

function selected(now=Date.now()) {
 const profile={schemaVersion:'vpj07-hosted-text-worker/4',projectRef:qaBinding.projectRef,pollIntervalMs:1000,maxLifetimeMs:60000,
  drainMs:1000,concurrency:1,groupLimit:1,modes:['qa_session_history_v1'],planning:null,
  qwen:{priceVersion:'synthetic-upper6-24',pricing:{mode:'flat',inputMicrosPerMillion:6000000,outputMicrosPerMillion:24000000,cachedInputMicrosPerMillion:null},
   reservedMicros:6303744,maxOutputTokens:512,timeoutMs:15000,configurationId:'66666666-6666-4666-8666-666666666666',configurationVersion:1}};
 const job=qaJobConfig(profile,qaBinding.ownerId,qaBinding.policyId,qaBinding.scopeId,endpoint);
 profile.acceptance={schemaVersion:'qa-acceptance-grant/1',runId:randomUUID(),binding:{projectRef:qaBinding.projectRef,
  ownerId:qaBinding.ownerId,policyId:qaBinding.policyId,scopeId:qaBinding.scopeId,noticeHash:qaBinding.noticeHash,
  configurationId:job.provider.configurationId,configurationVersion:job.provider.configurationVersion,sourceCommit,jobDigest:acceptanceDigest(job)},
  activatedAt:now-1000,expiresAt:now+60000,maxPhysicalAttempts:2,concurrency:1,retries:0};
 return parseQaHostedProfile(profile);
}
async function setup(t,profile=selected()) {
 const dir=await realpath(await mkdtemp(join(tmpdir(),'qa-acceptance-hosted-owned-'))),path=join(dir,`qa-acceptance-${profile.acceptance.runId}.jsonl`);
 t.after(()=>rm(dir,{recursive:true,force:true}));return {dir,path,profile,grant:profile.acceptance};
}
const target=()=>({schemaVersion:'qa-hosted-deployment-target/2',environment:'staging',projectRef:qaBinding.projectRef,
 databaseUrl:`https://${qaBinding.projectRef}.supabase.co`,ownerId:qaBinding.ownerId,policyId:qaBinding.policyId,scopeId:qaBinding.scopeId,
 noticeHash:qaBinding.noticeHash,build:sourceCommit,qwenEndpoint:endpoint,startupState:'disabled',restartPolicy:'no'});
const checker=new URL('../../../deploy/hosted-worker/validate-qa-target.mjs',import.meta.url);
function prepare(profile,selectedTarget=target()) {
 return execFileSync(process.execPath,['--experimental-strip-types',checker.pathname,'--prepare'],{input:JSON.stringify({profile,target:selectedTarget}),encoding:'utf8',stdio:['pipe','pipe','pipe']});
}

test('canonical deployment profile carries the closed acceptance grant without extra CLI/env fields; tuple/build mismatch refuses',()=>{
 const p=selected(),bundle=JSON.parse(prepare(p));assert.deepEqual(JSON.parse(bundle.profileJson).acceptance,p.acceptance);
 assert.equal(JSON.parse(bundle.targetJson).startupState,'disabled');assert.equal(JSON.parse(bundle.targetJson).restartPolicy,'no');
 for(const field of ['ownerId','policyId','scopeId','noticeHash','build']){
  const bad={...target(),[field]:field==='build'?'a'.repeat(40):field==='noticeHash'?'b'.repeat(64):randomUUID()};assert.throws(()=>prepare(p,bad));
 }
 for(const patch of [{concurrency:2},{groupLimit:2},{acceptance:{...p.acceptance,retries:1}},
  {qwen:{...p.qwen,maxOutputTokens:513}},{qwen:{...p.qwen,reservedMicros:6303743}},
  {acceptance:{...p.acceptance,binding:{...p.acceptance.binding,jobDigest:'b'.repeat(64)}}}])assert.throws(()=>prepare({...p,...patch}));
 const {acceptance,...ordinary}=p;assert.doesNotThrow(()=>prepare(ordinary),'original /4 remains its separate normal scope');
});

test('actual Node CLI imports and receives canonical grant; missing/expired/mismatched journals refuse BEFORE mocked secret stage',async t=>{
 const f=await setup(t),entry=new URL('../../../lib/server/jobs/run-hosted-text-worker.mjs',import.meta.url).href;
 const secretModule=new URL('../../../lib/server/jobs/hosted-worker-secrets.mjs',import.meta.url).href;
 const script=`import {mock} from 'node:test';globalThis.fetch=()=>{console.error('FORBIDDEN_NETWORK');throw Error('blocked');};
 mock.module(${JSON.stringify(secretModule)},{namedExports:{readHostedWorkerSecrets:()=>{console.error('MOCK_SECRET_STAGE');throw Error('stop-before-any-key');},readHostedPlanningKey:()=>{throw Error('unused');}}});`;
 const run=(profile=f.profile,binding=qaBinding,build=sourceCommit)=>{
  try {execFileSync(process.execPath,['--experimental-strip-types','--experimental-test-module-mocks','--import','data:text/javascript,'+encodeURIComponent(script),new URL(entry).pathname],{
   encoding:'utf8',stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH,VISEPANDA_HOSTED_TEXT_WORKER:'true',
    VISEPANDA_HOSTED_WORKER_PROFILE:JSON.parse(prepare(profile)).profileJson.trim(),VISEPANDA_QA_SUPABASE_PROJECT_REF:qaBinding.projectRef,
    VISEPANDA_QA_RUNTIME_BINDING:JSON.stringify(binding),VISEPANDA_HOSTED_WORKER_SECRET_MODE:'files',VISEPANDA_QWEN_ENDPOINT:endpoint,
    VISEPANDA_HOSTED_WORKER_BUILD:build,VISEPANDA_HOSTED_WORKER_JOURNAL_DIR:f.dir}});assert.fail('must stop before activation');
  }catch(error){const output=String(error.stderr);assert.ok(!output.includes('FORBIDDEN_NETWORK'));return output;}
 };
 assert.ok(!run().includes('MOCK_SECRET_STAGE'),'missing persistent run cannot initialize itself on CLI startup');
 await initializeQaAcceptanceJournal(f.path,f.grant);
 assert.ok(run().includes('MOCK_SECRET_STAGE'),'real CLI imported and verified the exact provisioned grant before reaching the test-only stop');
 assert.ok(!run(f.profile,{...qaBinding,ownerId:randomUUID()}).includes('MOCK_SECRET_STAGE'));
 assert.ok(!run(f.profile,qaBinding,'b'.repeat(40)).includes('MOCK_SECRET_STAGE'));
 const before=await readFile(f.path);assert.ok(run().includes('MOCK_SECRET_STAGE'));assert.deepEqual(await readFile(f.path),before,'restart verification does not append/reset');
 const expired=selected(Date.now()-120000);
 await initializeQaAcceptanceJournal(join(f.dir,`qa-acceptance-${expired.acceptance.runId}.jsonl`),expired.acceptance);
 assert.ok(!run(expired).includes('MOCK_SECRET_STAGE'));
 const permit=await openQaAcceptanceJournal(f.path,f.grant).enter(new AbortController().signal);await permit.finish('stopped');
 assert.ok(!run().includes('MOCK_SECRET_STAGE'),'sticky stop refuses a new CLI process before keys');
});

test('real hosted root, sole context composer and HTTP transport share durable two-call control across recreated roots',async t=>{
 const f=await setup(t);await initializeQaAcceptanceJournal(f.path,f.grant);let physical=0,claims=0;
 const loop=async(fail=false,run=f,options={})=>{
  const f=run;
  const controller=new AbortController(),turn=randomUUID(),attempt=randomUUID();let finished=false,beats=0;
  const originalControl=openQaAcceptanceJournal(f.path,f.grant);
  const control={...originalControl,enter:async signal=>{try{return await originalControl.enter(signal);}catch(error){if(error instanceof QaAcceptanceBusy)options.onBusy?.();throw error;}}};
  const deps={qaProjectRef:qaBinding.projectRef,qaBinding,qaAcceptance:{control,sourceCommit},
   workerId:randomUUID(),build:sourceCommit,startedAt:new Date().toISOString(),qwenEndpoint:endpoint,requireInitialDisabled:true,
   workerCredential:()=> 'sb_secret_synthetic_worker',providerCredential:()=> 'synthetic-provider',
   journal:{job:async()=>{},usage:async()=>{},knowledge:async()=>{},destination:async()=>{},event:async event=>{if(finished&&event.phase==='cycle')controller.abort();}},
   fetch:async(url,init)=>{
    if(String(url)===endpoint){physical++;await options.hold?.();const body=JSON.parse(init.body);assert.equal(body.enable_thinking,false);assert.equal(body.max_tokens,512);
     if(fail)throw Error('Synthetic physical failure');
     return Response.json({model:PROTOCOL_MODELS.qwen,choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({outcome:'answered',text:'Synthetic result'})}}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}});}
    const name=new URL(url).pathname.split('/').at(-1);
    if(options.preLeaseFailure&&name==='hosted_worker_heartbeat'){options.onPreLeaseRpc?.();return Response.json({synthetic:'unavailable'},{status:503});}
    if(name==='qa_claim_work_v1')claims++;
    if(name==='qa_complete_work_v1')finished=true;
    const values={hosted_worker_heartbeat:{kind:'ok',enabled:++beats>1},qa_ready_groups_v3:{kind:'groups',groups:[{ownerId:qaBinding.ownerId,policyId:qaBinding.policyId,contextMode:'qa_session_history_v1',provider:'qwen',endpoint,noticeHash:qaBinding.noticeHash,scopes:[{scopeId:qaBinding.scopeId,model:PROTOCOL_MODELS.qwen,priceVersion:f.profile.qwen.priceVersion}]}]},
     qa_claim_work_v1:{kind:'leased',ownerId:qaBinding.ownerId,turnId:turn,leaseToken:attempt,attempt:1,leaseMs:120000},
     qa_read_work_v1:{kind:'qa_input',schemaVersion:'qa-context/1',contextMode:'qa_session_history_v1',ownerId:qaBinding.ownerId,authSessionId:attempt,turnId:turn,threadId:f.profile.qwen.configurationId,serviceTaskId:f.profile.qwen.configurationId,policyId:qaBinding.policyId,consentId:qaBinding.scopeId,provider:'qwen',endpoint,text:'Synthetic question',locale:'en',history:[],sourceTurnIds:[turn],contextDigest:'a'.repeat(64)},
     reserve_model_budget:{kind:'reserved'},qa_authorize_dispatch_v2:{kind:'authorized'},finish_model_budget:{kind:'settled',overrun:false},qa_complete_work_v1:{kind:'finished'}};
    assert.ok(values[name]);return Response.json(values[name]);
   }};
  return createHostedTextWorker(f.profile,deps)(controller.signal);
 };
 assert.equal((await loop()).finished,1);assert.equal((await loop()).finished,1);
 assert.equal((await loop()).reason,'unavailable');assert.equal(physical,2);assert.equal(claims,2);
 const failed=await setup(t);await initializeQaAcceptanceJournal(failed.path,failed.grant);
 assert.equal((await loop(true,failed)).reason,'unavailable');assert.equal(physical,3);assert.equal(claims,3);
 assert.equal((await loop(false,failed)).reason,'unavailable');assert.equal(physical,3);assert.equal(claims,3);
 const shared=await setup(t);await initializeQaAcceptanceJournal(shared.path,shared.grant);
 let arrived,release;const reached=new Promise(r=>arrived=r),held=new Promise(r=>release=r);
 const running=loop(false,shared,{hold:async()=>{arrived();await held;}});await reached;
 const beforeCalls=physical,beforeClaims=claims;
 let busy;const waiting=new Promise(r=>busy=r);let bRpcs=0;
 const failB=()=>loop(false,shared,{preLeaseFailure:true,onBusy:busy,onPreLeaseRpc:()=>bRpcs++});
 const bPromise=(globalThis.__qaDenyStopCreation?globalThis.__qaDenyStopCreation(failB):failB()).catch(error=>({reason:'unavailable',thrown:error.code??error.name}));
 await Promise.race([waiting,bPromise.then(()=>{throw Error('B failed before owning its root-stage mutex');})]);
 assert.equal(bRpcs,0,'B must not run heartbeat/discovery while A owns the run');
 assert.equal(physical,beforeCalls);assert.equal(claims,beforeClaims);
 release();assert.equal((await running).finished,1);
 const bResult=await bPromise;assert.equal(bResult.reason,'unavailable');assert.ok(bRpcs>0);
 const cResult=await loop(false,shared);
 if(globalThis.__qaDenyStopCreation)console.log(JSON.stringify({case:'root-stop-create-refusal',bResult,cResult,additionalClaims:claims-beforeClaims,additionalPhysical:physical-beforeCalls}));
 assert.equal(cResult.reason,'unavailable');
 assert.equal(physical,beforeCalls,'B pre-lease failure must stop C after A succeeds');
 assert.equal(claims,beforeClaims,'C must not acquire a new SQL lease');
 const nextJob=qaJobConfig(shared.profile,qaBinding.ownerId,qaBinding.policyId,qaBinding.scopeId,endpoint);
 const helper=new URL('./acceptance-fixture.mjs',import.meta.url).href;
 const restarted=`const {acceptanceWorker}=await import(${JSON.stringify(helper)});const w=acceptanceWorker({path:process.argv[1],grant:JSON.parse(process.argv[2]),job:JSON.parse(process.argv[3])});console.log(JSON.stringify({result:await w.run(),claims:w.claims,physical:w.physical}));`;
 assert.deepEqual(JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',restarted,shared.path,JSON.stringify(shared.grant),JSON.stringify(nextJob)],{encoding:'utf8',stdio:['pipe','pipe','pipe']})),{result:'unavailable',claims:0,physical:0});
 const missing={qaBinding,qaProjectRef:qaBinding.projectRef,build:sourceCommit,qwenEndpoint:endpoint};
 assert.throws(()=>createHostedTextWorker(f.profile,missing),'acceptance profile without root controller fails before keys/RPC');
});
