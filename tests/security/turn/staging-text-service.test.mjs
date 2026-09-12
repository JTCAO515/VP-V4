import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {runTextService,createStagingTextService} from '../../../lib/server/jobs/staging-text-service.ts';

test('service remains available after empty/finished/queued polls and never overlaps work',async()=>{
 let now=1000,active=0,maximum=0,calls=0;const events=[],controller=new AbortController();
 const results=['empty','finished','queued','finished'];
 const result=await runTextService(40000,5000,{
  now:()=>now,record:async e=>events.push(e),wait:async n=>{now+=n;},
  poll:async()=>{active++;maximum=Math.max(maximum,active);await Promise.resolve();const result=results[calls++];active--;if(calls===4)controller.abort();return result;},
 },controller.signal);
 assert.deepEqual(result,{reason:'stopped',polls:4});assert.equal(maximum,1);
 assert.deepEqual(events.filter(e=>e.phase==='poll-returned').map(e=>e.result),results);
});

test('unavailable poll or failed pre-dispatch journal stops without another attempt',async()=>{
 for(const failure of ['poll','journal']){
  let calls=0,waits=0;
  const result=await runTextService(20000,5000,{
   now:()=>1000,record:async()=>{if(failure==='journal')throw Error('disk unavailable');},
   poll:async()=>{calls++;return 'unavailable';},wait:async()=>{waits++;},
  },new AbortController().signal);
  assert.equal(result.reason,'unavailable');assert.equal(calls,failure==='poll'?1:0);assert.equal(waits,0);
 }
});

test('expiry after an idle wait or slow journal prevents the next claim',async()=>{
 for(const expireDuring of ['wait','journal']){
  let now=1000,calls=0;
  const result=await runTextService(6000,5000,{
   now:()=>now,record:async()=>{if(expireDuring==='journal')now=6000;},
   poll:async()=>{calls++;return 'empty';},wait:async n=>{now+=n;},
  },new AbortController().signal);
  assert.deepEqual(result,{reason:'expired',polls:expireDuring==='wait'?1:0});assert.equal(calls,result.polls);
 }
});

test('operator stop reaches an in-flight poll and a stopped service cannot dispatch',async()=>{
 const controller=new AbortController();let calls=0,received;
 const result=await runTextService(Date.now()+60000,5000,{
  record:async()=>{},poll:async signal=>{calls++;received=signal;controller.abort();assert.equal(signal.aborted,true);return 'unavailable';},
 },controller.signal);
 assert.deepEqual(result,{reason:'stopped',polls:1});assert.equal(received.aborted,true);
 const stopped=await runTextService(Date.now()+60000,5000,{record:async()=>{throw Error('must not journal');},poll:async()=>{calls++;return 'empty';}},controller.signal);
 assert.deepEqual(stopped,{reason:'stopped',polls:0});assert.equal(calls,1);
});

const job=()=>({schemaVersion:'vpj07-staging-text-job/2',inputMode:'task_history_v1',
 ownerId:'11111111-1111-4111-8111-111111111111',policyId:'22222222-2222-4222-8222-222222222222',
 budget:{scopeId:'33333333-3333-4333-8333-333333333333',priceVersion:'synthetic-v1',reservedMicros:2101248,maxOutputTokens:512,timeoutMs:1000},
 provider:{provider:'qwen',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',configurationId:'44444444-4444-4444-8444-444444444444',configurationVersion:1,timeoutMs:1000},
 pricing:{mode:'flat',inputMicrosPerMillion:2000000,outputMicrosPerMillion:8000000,cachedInputMicrosPerMillion:null}});
const config=()=>({schemaVersion:'vpj07-staging-text-service/1',job:job(),pollIntervalMs:5000,expiresAt:new Date(Date.now()+60000).toISOString()});
test('service cannot widen a job, omit expiry or create a hot poll loop before I/O',()=>{
 let io=0;const deps={workerCredential:()=>{io++;},providerCredential:()=>{io++;},recordDestination:async()=>{io++;},recordService:async()=>{io++;}};
 for(const patch of [{schemaVersion:'other'},{extra:true},{expiresAt:new Date(0).toISOString()},{expiresAt:new Date(Date.now()+86460000).toISOString()},{expiresAt:'tomorrow'},{pollIntervalMs:1},{pollIntervalMs:Infinity},{job:{...job(),ownerId:'any'}},{job:{...job(),budget:{...job().budget,reservedMicros:1}}}]){
  assert.throws(()=>createStagingTextService({...config(),...patch},deps));
 }
 assert.equal(io,0);
});

test('CLI polls privately and stops on SIGTERM, retaining a restart-safe absolute expiry',{timeout:15000},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'vp-service-cli-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const input=join(dir,'config.json'),journal=join(dir,'receipt.jsonl'),mapper=join(dir,'fetch.mjs');
 const value=config();await writeFile(input,JSON.stringify(value),{mode:0o600});
 await writeFile(mapper,`globalThis.fetch=async(url,options)=>{if(!url.endsWith('/claim_text_task_work')||options.redirect!=='manual')throw Error('wrong target');return Response.json({kind:'empty'});};`);
 const args=['--experimental-strip-types','--import',mapper,resolve('lib/server/jobs/run-staging-text-service.mjs'),'--config',input,'--receipts',journal];
 const env={...process.env,NODE_OPTIONS:'',VERCEL_ENV:'',VISEPANDA_STAGING_TEXT_SERVICE:'true',VISEPANDA_STAGING_TEXT_WORKER_KEY:'SYNTHETIC_WORKER_CANARY',VISEPANDA_STAGING_TEXT_PROVIDER_KEY:'SYNTHETIC_PROVIDER_CANARY'};
 const child=spawn(process.execPath,args,{env,stdio:['ignore','pipe','pipe']});t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
 let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
 const exited=new Promise(resolve=>child.once('close',code=>resolve(code)));
 for(let i=0;i<100;i++){
  const contents=await readFile(journal,'utf8').catch(()=> '');
  if(contents.includes('poll-returned'))break;
  await new Promise(resolve=>setTimeout(resolve,30));
 }
 assert.match(await readFile(journal,'utf8'),/poll-returned/);child.kill('SIGTERM');assert.equal(await exited,0,stderr);
 const contents=await readFile(journal,'utf8'),rows=contents.trim().split('\n').map(JSON.parse);
 assert.equal(rows[0].expiresAt,value.expiresAt);assert.equal(rows.at(-1).reason,'stopped');assert.equal(rows.at(-1).polls,1);
 assert.equal((await stat(journal)).mode&0o777,0o600);assert.doesNotMatch(contents+stdout+stderr,/SYNTHETIC_.*_CANARY|11111111-1111|22222222-2222/);
 const duplicate=spawn(process.execPath,args,{env,stdio:'ignore'});assert.equal(await new Promise(resolve=>duplicate.once('close',resolve)),1);assert.equal(await readFile(journal,'utf8'),contents);
});
