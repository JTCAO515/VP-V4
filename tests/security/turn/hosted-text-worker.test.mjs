import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readdir,readFile,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID as uuid} from 'node:crypto';
import {parseHostedWorkerProfile,planGroup,runHostedTextLoop,createHostedTextWorker} from '../../../lib/server/jobs/hosted-text-worker.ts';
import {PROTOCOL_MODELS} from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';

const QWEN='https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const profile=(patch={})=>({schemaVersion:'vpj07-hosted-text-worker/1',pollIntervalMs:5000,maxLifetimeMs:3600000,drainMs:1000,concurrency:2,groupLimit:10,
 modes:['current_input_v1','task_history_v1','knowledge_intent_v1'],
 qwen:{priceVersion:'synthetic-v1',pricing:{mode:'flat',inputMicrosPerMillion:2000000,outputMicrosPerMillion:8000000,cachedInputMicrosPerMillion:null},reservedMicros:2101248,maxOutputTokens:512,timeoutMs:1000,configurationId:'44444444-4444-4444-8444-444444444444',configurationVersion:1},...patch});
const group=(patch={})=>({ownerId:uuid(),policyId:uuid(),contextMode:'current_input_v1',provider:'qwen',endpoint:QWEN,scopes:[{scopeId:uuid(),model:PROTOCOL_MODELS.qwen,priceVersion:'synthetic-v1'}],...patch});

test('profile is closed and reuses the existing tariff/reservation qualification',()=>{
 assert.equal(parseHostedWorkerProfile(profile()).modes.length,3);
 for(const patch of [{extra:1},{schemaVersion:'x'},{pollIntervalMs:10},{maxLifetimeMs:86400001},{concurrency:0},{concurrency:9},{groupLimit:51},
  {modes:[]},{modes:['other']},{modes:['current_input_v1','current_input_v1']},
  {qwen:{...profile().qwen,reservedMicros:1}},{qwen:{...profile().qwen,extra:1}},{qwen:{...profile().qwen,configurationId:'x'}},
  {qwen:{...profile().qwen,pricing:{mode:'flat',inputMicrosPerMillion:0,outputMicrosPerMillion:1,cachedInputMicrosPerMillion:null}}}])
  assert.throws(()=>parseHostedWorkerProfile({...profile(),...patch}),undefined,JSON.stringify(patch));
});

test('profile/2 planning scope is closed, optional and canonical',()=>{
 const target={ownerId:uuid().toUpperCase(),planningPolicyId:uuid().toUpperCase(),scopeId:uuid().toUpperCase()};
 const p=parseHostedWorkerProfile(profile({schemaVersion:'vpj07-hosted-text-worker/2',planning:target}));
 assert.deepEqual(p.planning,Object.fromEntries(Object.entries(target).map(([k,v])=>[k,v.toLowerCase()])));
 assert.equal(parseHostedWorkerProfile(profile({schemaVersion:'vpj07-hosted-text-worker/2',planning:null})).planning,null);
 for(const body of [profile({planning:target}),profile({schemaVersion:'vpj07-hosted-text-worker/2'}),
  profile({schemaVersion:'vpj07-hosted-text-worker/2',planning:{...target,secret:'canary'}}),
  profile({schemaVersion:'vpj07-hosted-text-worker/2',planning:{...target,scopeId:'x'}})])assert.throws(()=>parseHostedWorkerProfile(body));
});

test('uppercase planning target shares the discovered lowercase text owner lane',async()=>{
 const owner=uuid(),target={ownerId:owner.toUpperCase(),planningPolicyId:uuid().toUpperCase(),scopeId:uuid().toUpperCase()};
 const controller=new AbortController(),order=[];let active=0,maxActive=0;
 const p=parseHostedWorkerProfile(profile({schemaVersion:'vpj07-hosted-text-worker/2',planning:target}));
 const worker=createHostedTextWorker(p,{workerId:uuid(),build:'synthetic-test',startedAt:new Date().toISOString(),qwenEndpoint:QWEN,
  workerCredential:()=> 'synthetic-db',providerCredential:()=> 'synthetic-model',planningEnabled:true,amapCredential:()=> 'synthetic-map',
  journal:{job:async()=>{},usage:async()=>{},knowledge:async()=>{},destination:async()=>{},planningJob:async()=>{},planningUsage:async()=>{},
   event:async event=>{if(event.phase==='cycle')controller.abort();}},
  fetch:async(url)=>{
   const name=new URL(url).pathname.split('/').at(-1);
   if(name==='hosted_worker_heartbeat')return Response.json({kind:'ok',enabled:true});
   if(name==='hosted_worker_ready_groups')return Response.json({kind:'groups',groups:[group({ownerId:owner})]});
   if(name==='claim_text_work'){order.push('text-start');maxActive=Math.max(maxActive,++active);
    await new Promise(r=>setTimeout(r,30));active--;order.push('text-end');return Response.json({kind:'empty'});}
   if(name==='hosted_planning_target_v1'){order.push('planning');maxActive=Math.max(maxActive,++active);active--;return Response.json({kind:'ready'});}
   if(name==='claim_planning_comparison_work_v1')return Response.json({kind:'empty'});
   throw Error('Unexpected RPC');
  }});
 const result=await worker(controller.signal);assert.equal(result.reason,'stopped');assert.equal(maxActive,1);
 assert.deepEqual(order,['text-start','text-end','planning']);
});

test('a group runs only with exactly one qualifying scope, an allowed mode and the bound endpoint',()=>{
 const p=parseHostedWorkerProfile(profile({modes:['current_input_v1','task_history_v1']}));
 const g=group();const job=planGroup(p,g,QWEN);
 assert.equal(job.schemaVersion,'vpj07-staging-text-job/1');assert.equal(job.ownerId,g.ownerId);assert.equal(job.budget.scopeId,g.scopes[0].scopeId);assert.equal(job.inputMode,undefined);
 assert.equal(planGroup(p,group({contextMode:'task_history_v1'}),QWEN).inputMode,'task_history_v1');
 assert.equal(planGroup(parseHostedWorkerProfile(profile()),group({contextMode:'knowledge_intent_v1'}),QWEN).schemaVersion,'vpj07-staging-text-job/4');
 const skipped=[group({contextMode:'knowledge_intent_v1'}),group({scopes:[]}),group({scopes:[g.scopes[0],{...g.scopes[0],scopeId:uuid()}]}),
  group({scopes:[{...g.scopes[0],priceVersion:'other'}]}),group({scopes:[{...g.scopes[0],model:'other'}]}),group({provider:'glm'}),
  group({endpoint:'https://evil.example/v1'}),group({ownerId:'x'}),null,[]];
 for(const value of skipped)assert.equal(planGroup(p,value,QWEN),null,JSON.stringify(value));
 assert.equal(planGroup(p,g,'https://ws.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions'),null,'policy endpoint must equal the process binding');
});

const settings={pollIntervalMs:5000,maxLifetimeMs:3600000,drainMs:50,concurrency:2};
test('disabled switch performs no discovery or claim and the loop keeps signalling',async()=>{
 const controller=new AbortController();let beats=0,discovery=0,claims=0;const states=[];
 const result=await runHostedTextLoop(settings,{
  heartbeat:async state=>{states.push(state.phase);if(++beats===4)controller.abort();return {enabled:false};},
  readyGroups:async()=>{discovery++;return [];},workerFor:()=>{claims++;return null;},record:async()=>{},wait:async()=>{},
 },controller.signal);
 assert.equal(result.reason,'stopped');assert.equal(discovery,0);assert.equal(claims,0);
 assert.equal(states.at(-1),'stopped');assert.ok(states.includes('disabled'));
});

test('file-mode first heartbeat must still be disabled after read-only precheck',async()=>{
 let discovery=0,claims=0;
 const result=await runHostedTextLoop({...settings,requireInitialDisabled:true},{
  heartbeat:async()=>({enabled:true}),readyGroups:async()=>{discovery++;return [];},
  workerFor:()=>{claims++;return null;},record:async()=>{},wait:async()=>{},
 },new AbortController().signal);
 assert.equal(result.reason,'unavailable');assert.equal(discovery,0);assert.equal(claims,0);assert.equal(result.polls,0);
});

test('file-mode first disabled heartbeat arms later explicit enable',async()=>{
 const controller=new AbortController();let beats=0,discovery=0;
 const result=await runHostedTextLoop({...settings,requireInitialDisabled:true},{
  heartbeat:async()=>({enabled:++beats>1}),readyGroups:async()=>{discovery++;controller.abort();return [];},
  workerFor:()=>null,record:async()=>{},wait:async()=>{},
 },controller.signal);
 assert.equal(result.reason,'stopped');assert.equal(discovery,1);assert.ok(beats>=2);
});

test('one owner runs sequentially; different owners run concurrently within the bound',async()=>{
 const controller=new AbortController();let active=new Map(),maxByOwner=0,maxTotal=0,total=0,cycles=0;
 const groups=[{o:'A'},{o:'A'},{o:'B'},{o:'C'},{o:'C'}];
 const result=await runHostedTextLoop({...settings,concurrency:2},{
  heartbeat:async()=>({enabled:true}),
  readyGroups:async()=>{if(++cycles===2)controller.abort();return groups;},
  workerFor:g=>({ownerId:g.o,poll:async()=>{
   active.set(g.o,(active.get(g.o)??0)+1);total++;maxByOwner=Math.max(maxByOwner,active.get(g.o));maxTotal=Math.max(maxTotal,total);
   await new Promise(r=>setTimeout(r,20));active.set(g.o,active.get(g.o)-1);total--;return 'finished';}}),
  record:async()=>{},wait:async()=>{},
 },controller.signal);
 assert.equal(maxByOwner,1);assert.equal(maxTotal,2);assert.equal(result.finished,5);assert.equal(result.polls,1);
});

test('soft stop lets in-flight work drain, then aborts it at the drain deadline',async()=>{
 for(const [workMs,expectAborted] of [[10,false],[500,true]]){
  const controller=new AbortController();let seen;
  const result=await runHostedTextLoop({...settings,drainMs:100},{
   heartbeat:async()=>({enabled:true}),readyGroups:async()=>[{o:'A'}],
   workerFor:()=>({ownerId:'A',poll:async signal=>{seen=signal;controller.abort();
    await new Promise(r=>{const t=setTimeout(r,workMs);signal.addEventListener('abort',()=>{clearTimeout(t);r();},{once:true});});
    return signal.aborted?'unavailable':'finished';}}),
   record:async()=>{},wait:async()=>{},
  },controller.signal);
  assert.equal(result.reason,'stopped');assert.equal(seen.aborted,expectAborted);assert.equal(result.finished,expectAborted?0:1);
 }
});

test('persistent heartbeat/discovery/claim unavailability exits with backoff instead of hot-looping',async()=>{
 for(const failing of ['heartbeat','discovery','claims']){
  const waits=[];let claims=0;
  const result=await runHostedTextLoop({...settings,maxConsecutiveFailures:3},{
   heartbeat:async state=>state.phase==='stopped'?{enabled:true}:failing==='heartbeat'?null:{enabled:true},
   readyGroups:async()=>failing==='discovery'?null:[{o:'A'}],
   workerFor:()=>({ownerId:'A',poll:async()=>{claims++;return 'unavailable';}}),
   record:async()=>{},wait:async ms=>{waits.push(ms);},
  },new AbortController().signal);
  assert.equal(result.reason,'unavailable',failing);assert.ok(waits.length<=3);
  if(failing!=='claims')assert.deepEqual(waits,[10000,20000]);else assert.equal(claims,3);
 }
});

test('absolute lifetime ends the loop as expired and a throwing worker factory only skips',async()=>{
 let now=0;
 const result=await runHostedTextLoop({...settings,maxLifetimeMs:60000},{
  now:()=>now,heartbeat:async()=>({enabled:true}),readyGroups:async()=>[{o:'A'}],
  workerFor:()=>{throw Error('bad group');},record:async()=>{},wait:async ms=>{now+=ms;},
 },new AbortController().signal);
 assert.equal(result.reason,'expired');assert.ok(result.skipped>=1);assert.equal(result.finished,0);
});

const CANARY_DB='SYNTHETIC_DB_CANARY_'+uuid(),CANARY_QWEN='SYNTHETIC_QWEN_CANARY_'+uuid(),CANARY_AMAP='SYNTHETIC_AMAP_CANARY_'+uuid();
async function cli(t,{env={},mapper=null,journalMode=0o700,wait=null}={}){
 const dir=await mkdtemp(join(tmpdir(),'vp-hosted-cli-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const journals=join(dir,'j');await (await import('node:fs/promises')).mkdir(journals);await chmod(journals,journalMode);
 const args=['--experimental-strip-types'];
 if(mapper){await writeFile(join(dir,'m.mjs'),mapper);args.push('--import',join(dir,'m.mjs'));}
 args.push(resolve('lib/server/jobs/run-hosted-text-worker.mjs'));
 const child=spawn(process.execPath,args,{env:{...process.env,NODE_OPTIONS:'',VERCEL_ENV:'',VISEPANDA_HOSTED_TEXT_WORKER:'true',
  VISEPANDA_HOSTED_WORKER_DB_KEY:CANARY_DB,VISEPANDA_HOSTED_WORKER_QWEN_KEY:CANARY_QWEN,VISEPANDA_HOSTED_WORKER_PROFILE:JSON.stringify(profile({pollIntervalMs:1000})),
  VISEPANDA_HOSTED_WORKER_JOURNAL_DIR:journals,...env},stdio:['ignore','pipe','pipe']});
 t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
 let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
 const exited=new Promise(r=>child.once('close',code=>r(code)));
 if(wait)await wait(child,journals);
 const code=await exited;const files=await readdir(journals);
 const journal=(await Promise.all(files.map(f=>readFile(join(journals,f),'utf8')))).join('');
 for(const text of [stdout,stderr,journal]){assert.ok(!text.includes(CANARY_DB));assert.ok(!text.includes(CANARY_QWEN));assert.ok(!text.includes(CANARY_AMAP));}
 return {code,stdout,stderr,files,journal};
}

test('CLI fails closed before any I/O without every explicit prerequisite',async t=>{
 const p2=profile({schemaVersion:'vpj07-hosted-text-worker/2',planning:{ownerId:uuid(),planningPolicyId:uuid(),scopeId:uuid()}});
 for(const env of [{VISEPANDA_HOSTED_TEXT_WORKER:''},{VERCEL_ENV:'preview'},{VISEPANDA_HOSTED_WORKER_DB_KEY:''},{VISEPANDA_HOSTED_WORKER_QWEN_KEY:CANARY_DB},
  {VISEPANDA_HOSTED_PLANNING_WORKER:'true'}, {VISEPANDA_HOSTED_WORKER_AMAP_KEY:CANARY_AMAP},
  {VISEPANDA_HOSTED_WORKER_PROFILE:JSON.stringify(p2)},
  {VISEPANDA_HOSTED_WORKER_PROFILE:JSON.stringify(p2),VISEPANDA_HOSTED_PLANNING_WORKER:'true'},
  {VISEPANDA_HOSTED_WORKER_PROFILE:JSON.stringify(p2),VISEPANDA_HOSTED_PLANNING_WORKER:'true',VISEPANDA_HOSTED_WORKER_AMAP_KEY:CANARY_DB},
  {VISEPANDA_HOSTED_WORKER_SECRET_MODE:'files'},{VISEPANDA_HOSTED_WORKER_SECRET_MODE:'unexpected'},
  {VISEPANDA_HOSTED_WORKER_PROFILE:'{}'},{VISEPANDA_HOSTED_WORKER_PROFILE:JSON.stringify(profile({modes:['x']}))},{VISEPANDA_HOSTED_WORKER_JOURNAL_DIR:'relative'},
  {VISEPANDA_HOSTED_WORKER_BUILD:'bad build'},{VISEPANDA_QWEN_ENDPOINT:'https://evil.example/v1'},{VISEPANDA_HOSTED_WORKER_HEALTH_PORT:'0'}]){
  const r=await cli(t,{env,mapper:'globalThis.fetch=async()=>{throw Error("no network expected");};'});
  assert.equal(r.code,1,JSON.stringify(env));assert.match(r.stderr,/Hosted text worker unavailable/);
  assert.deepEqual(r.files,[],'no journal before prerequisites pass');
 }
 const shared=await cli(t,{journalMode:0o777,mapper:'globalThis.fetch=async()=>{throw Error("no network");};'});
 assert.equal(shared.code,1);assert.deepEqual(shared.files,[]);
});

test('CLI serves disabled heartbeat, exposes content-free health and drains on SIGTERM',async t=>{
 const port=String(40000+Math.floor(Math.random()*20000));
 const mapper=`globalThis.fetch=async(url,options)=>{
  if(options.redirect!=='manual'||options.headers.apikey===undefined)throw Error('wrong');
  if(url==='https://dzqdzetcctkhbrhlxxgn.supabase.co/rest/v1/rpc/hosted_worker_heartbeat')return Response.json({kind:'ok',enabled:false});
  throw Error('unexpected '+url);};`;
 let health;
 const r=await cli(t,{mapper,env:{VISEPANDA_HOSTED_WORKER_HEALTH_PORT:port},wait:async(child,journals)=>{
  for(let i=0;i<100;i++){
   try{const res=await fetch('http://127.0.0.1:'+port+'/healthz');health={status:res.status,body:await res.json()};if(health.body.status==='disabled')break;}catch{}
   await new Promise(r=>setTimeout(r,50));
  }
  child.kill('SIGTERM');
 }});
 assert.deepEqual(health,{status:200,body:{status:'disabled'}});
 assert.equal(r.code,0,r.stderr);assert.match(r.stdout,/"reason":"stopped"/);
 assert.equal(r.files.length,1);assert.match(r.files[0],/^hosted-.*\.jsonl$/);
 const phases=r.journal.trim().split('\n').map(line=>JSON.parse(line).phase);
 assert.equal(phases[0],'started');assert.equal(phases.at(-1),'returned');assert.ok(phases.includes('disabled'));
});

test('profile/2 requires separate planning opt-in and removes AMap secret before disabled startup journal',async t=>{
 const p=profile({schemaVersion:'vpj07-hosted-text-worker/2',planning:{ownerId:uuid(),planningPolicyId:uuid(),scopeId:uuid()},pollIntervalMs:1000});
 const r=await cli(t,{env:{VISEPANDA_HOSTED_WORKER_PROFILE:JSON.stringify(p),VISEPANDA_HOSTED_PLANNING_WORKER:'true',
  VISEPANDA_HOSTED_WORKER_AMAP_KEY:CANARY_AMAP},mapper:`globalThis.fetch=async url=>{
   if(process.env.VISEPANDA_HOSTED_WORKER_AMAP_KEY!==undefined)throw Error('key retained');
   if(url.endsWith('/hosted_worker_heartbeat'))return Response.json({kind:'ok',enabled:false});throw Error('no discovery');};`,
  wait:async(child,journals)=>{for(let i=0;i<100;i++){const files=await readdir(journals);
   if(files.length&& (await readFile(join(journals,files[0]),'utf8')).includes('"phase":"disabled"'))break;
   await new Promise(resolve=>setTimeout(resolve,50));}child.kill('SIGTERM');}});
 assert.equal(r.code,0,r.stderr);assert.match(r.journal,/vpj07-hosted-text-worker\/2/);
 assert.doesNotMatch(r.journal,/vpj80-hosted-planning-job/,'disabled startup did not poll planning');
});

test('hosted discovery accepts a dedicated Supabase secret key without a Bearer header',async t=>{
 const key='sb_secret_synthetic_hosted_only',port=String(40000+Math.floor(Math.random()*20000));
 const mapper=`globalThis.fetch=async(url,options)=>{
  if(options.headers.apikey!==${JSON.stringify(key)}||Object.hasOwn(options.headers,'authorization'))throw Error('wrong headers');
  if(url==='https://dzqdzetcctkhbrhlxxgn.supabase.co/rest/v1/rpc/hosted_worker_heartbeat')return Response.json({kind:'ok',enabled:false});
  throw Error('unexpected route');};`;
 const r=await cli(t,{mapper,env:{VISEPANDA_HOSTED_WORKER_DB_KEY:key,VISEPANDA_HOSTED_WORKER_HEALTH_PORT:port},wait:async child=>{
  for(let i=0;i<100;i++){
   try{const response=await fetch('http://127.0.0.1:'+port+'/healthz');if((await response.json()).status==='disabled')break;}catch{}
   await new Promise(resolve=>setTimeout(resolve,50));
  }
  child.kill('SIGTERM');
 }});
 assert.equal(r.code,0,r.stderr);assert.ok(!r.stdout.includes(key));assert.ok(!r.journal.includes(key));
});
