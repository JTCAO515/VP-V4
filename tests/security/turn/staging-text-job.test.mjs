import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createTextJobPrice,createStagingTextJob} from '../../../lib/server/jobs/staging-text-job.ts';
const ownerId='11111111-1111-4111-8111-111111111111',policyId='22222222-2222-4222-8222-222222222222';
const flat={mode:'flat',inputMicrosPerMillion:2000000,outputMicrosPerMillion:8000000,cachedInputMicrosPerMillion:null};
const usage={inputTokens:10,outputTokens:5,totalTokens:15,cachedInputTokens:4,uncachedInputTokens:6,reasoningTokens:0,cost:'unknown'};
const config=()=>({schemaVersion:'vpj07-staging-text-job/1',ownerId,policyId,
 budget:{scopeId:'33333333-3333-4333-8333-333333333333',priceVersion:'synthetic-v1',reservedMicros:2101248,maxOutputTokens:512,timeoutMs:1000},
 provider:{provider:'qwen',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',configurationId:'44444444-4444-4444-8444-444444444444',configurationVersion:1,timeoutMs:1000},pricing:flat});
test('explicit integer pricing rounds once and leaves incomplete or excessive usage unknown',()=>{
 assert.equal(createTextJobPrice(flat)(usage),60);
 assert.equal(createTextJobPrice({...flat,inputMicrosPerMillion:1,outputMicrosPerMillion:1})(usage),1);
 const split=createTextJobPrice({...flat,mode:'cache_split',cachedInputMicrosPerMillion:1000000});
 assert.equal(split(usage),56);assert.equal(split({...usage,uncachedInputTokens:null}),56);
 for(const patch of [{cachedInputTokens:null},{cachedInputTokens:11},{uncachedInputTokens:5},{totalTokens:16},{inputTokens:NaN},{outputTokens:-1}])assert.equal(split({...usage,...patch}),null);
 assert.equal(createTextJobPrice({...flat,inputMicrosPerMillion:1e12,outputMicrosPerMillion:1e12})({...usage,inputTokens:1e9,outputTokens:1e9,totalTokens:2e9}),null);
 for(const patch of [{mode:'guessed'},{inputMicrosPerMillion:0},{inputMicrosPerMillion:1.2},{outputMicrosPerMillion:Infinity},{cachedInputMicrosPerMillion:2},{extra:true}])assert.throws(()=>createTextJobPrice({...flat,...patch}));
});
test('job config requires fixed shape, matching deadlines and allowlisted provider before I/O',async()=>{
 let calls=0,credentials=0;
 const deps={workerCredential:()=>{credentials++;return 'synthetic-worker';},providerCredential:()=>{credentials++;return 'synthetic-provider';},recordDestination:async()=>{},fetch:async()=>{calls++;return Response.json({kind:'empty'});}};
 for(const patch of [{schemaVersion:'other'},{extra:true},{ownerId:'unknown'},{provider:{...config().provider,endpoint:'https://attacker.test/inference'}},{provider:{...config().provider,timeoutMs:2000}},{pricing:{...flat,extra:true}},{budget:{...config().budget,priceVersion:'bad:version'}}])assert.throws(()=>createStagingTextJob({...config(),...patch},deps));
 assert.equal(calls,0);assert.equal(credentials,0);
 assert.equal(await createStagingTextJob(config(),deps)(new AbortController().signal),'empty');assert.equal(calls,1);assert.equal(credentials,1,'empty poll never requests provider credentials');
});
test('reservation covers full-context input, capped output and the highest cache tariff before credentials or I/O',()=>{
 let touched=0;const deps={workerCredential:()=>{touched++;},providerCredential:()=>{touched++;},recordDestination:async()=>{touched++;},fetch:async()=>{touched++;throw Error('unexpected');}};
 assert.doesNotThrow(()=>createStagingTextJob(config(),deps));
 for(const reservedMicros of [1000,4096,2101247])assert.throws(()=>createStagingTextJob({...config(),budget:{...config().budget,reservedMicros}},deps));
 assert.throws(()=>createStagingTextJob({...config(),budget:{...config().budget,maxOutputTokens:513}},deps));
 assert.throws(()=>createStagingTextJob({...config(),pricing:{...flat,mode:'cache_split',cachedInputMicrosPerMillion:3000000}},deps));
 assert.doesNotThrow(()=>createStagingTextJob({...config(),pricing:{...flat,mode:'cache_split',cachedInputMicrosPerMillion:1000000}},deps));
 assert.throws(()=>createStagingTextJob({...config(),pricing:{...flat,inputMicrosPerMillion:1e12},budget:{...config().budget,reservedMicros:1e12}},deps));
 assert.throws(()=>createStagingTextJob({...config(),provider:{...config().provider,provider:'deepseek'}},deps));
 assert.doesNotThrow(()=>createStagingTextJob({...config(),pricing:{...flat,inputMicrosPerMillion:1,outputMicrosPerMillion:1},budget:{...config().budget,reservedMicros:2}},deps));
 assert.throws(()=>createStagingTextJob({...config(),pricing:{...flat,inputMicrosPerMillion:1,outputMicrosPerMillion:1},budget:{...config().budget,reservedMicros:1}},deps));
 assert.equal(touched,0);
});
const runChild=(args,env)=>new Promise(resolve=>{
 const child=spawn(process.execPath,args,{env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
 child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
 child.once('error',error=>resolve({code:1,stdout,stderr:error.message}));child.once('close',code=>resolve({code,stdout,stderr}));
});
test('one-shot CLI fails closed, preserves existing files and writes only private metadata',{timeout:10000},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'vpj07-cli-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const input=join(dir,'config.json'),journal=join(dir,'receipts.jsonl'),mapper=join(dir,'closed-fetch.mjs');
 await writeFile(input,JSON.stringify(config()),{mode:0o600});
 await writeFile(mapper,`globalThis.fetch=async(url,options)=>{if(url!=='https://dzqdzetcctkhbrhlxxgn.supabase.co/rest/v1/rpc/claim_text_work'||options.redirect!=='manual')throw Error('Unexpected destination');return Response.json({kind:'empty'});};`);
 const args=['--experimental-strip-types','--import',mapper,resolve('lib/server/jobs/run-staging-text-worker.mjs'),'--config',input,'--receipts',journal];
 const env={...process.env,NODE_OPTIONS:'',VERCEL_ENV:'',VISEPANDA_STAGING_TEXT_WORKER:'false',VISEPANDA_STAGING_TEXT_WORKER_KEY:'SYNTHETIC_WORKER_SECRET_CANARY',VISEPANDA_STAGING_TEXT_PROVIDER_KEY:'SYNTHETIC_PROVIDER_SECRET_CANARY'};
 assert.equal((await runChild(args,env)).code,1);await assert.rejects(stat(journal),{code:'ENOENT'});
 env.VISEPANDA_STAGING_TEXT_WORKER='true';
 const result=await runChild(args,env);assert.equal(result.code,0,result.stderr);assert.equal(JSON.parse(result.stdout).result,'empty');
 const contents=await readFile(journal,'utf8'),rows=contents.trim().split('\n').map(JSON.parse);
 assert.deepEqual(rows.map(r=>r.phase),['started','returned']);assert.equal(rows[1].result,'empty');assert.match(rows[0].configurationDigest,/^[a-f0-9]{64}$/);
 assert.equal((await stat(journal)).mode&0o777,0o600);assert.doesNotMatch(contents+result.stdout+result.stderr,/SYNTHETIC_.*_CANARY|11111111-1111|22222222-2222|inputTokens/);
 const duplicate=await runChild(args,env);assert.equal(duplicate.code,1);assert.equal(await readFile(journal,'utf8'),contents,'existing receipt file is never overwritten');
 await writeFile(input,JSON.stringify({...config(),secret:'SYNTHETIC_CONFIG_SECRET_CANARY'}));
 const invalid=await runChild([...args.slice(0,-1),join(dir,'rejected.jsonl')],env);assert.equal(invalid.code,1);assert.doesNotMatch(invalid.stderr,/SYNTHETIC_CONFIG_SECRET_CANARY/);await assert.rejects(stat(join(dir,'rejected.jsonl')),{code:'ENOENT'});
});
