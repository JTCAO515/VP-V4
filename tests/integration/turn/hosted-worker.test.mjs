// VPJ-07 #195 hosted worker end-to-end on a disposable PostgreSQL container.
// The real CLI entry runs as a child process. Its two fixed Staging destinations
// are mapped by a closed --import seam to (1) an in-test RPC gateway that executes
// each /rest/v1/rpc/<name> call as service_role against the migrated database and
// (2) a controlled fake model. No remote project, real credential or paid provider.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync,mkdtempSync,writeFileSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
import {PROTOCOL_MODELS} from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';
import {KNOWLEDGE_INTENT_SYSTEM_PROMPT} from '../../../lib/server/model-gateway/prompt/knowledge-intent.ts';
import {translationPrompt,projectTranslation} from '../../../lib/server/media-translation/text/contract.ts';

const enabled=process.env.VP_TURN_DB_TEST==='1',container='vpj07-hosted-'+uuid().slice(0,8);
const STAGING='https://dzqdzetcctkhbrhlxxgn.supabase.co',QWEN='https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const SERVICE_KEY='SYNTHETIC_SERVICE_CANARY_'+uuid(),PROVIDER_KEY='SYNTHETIC_PROVIDER_CANARY_'+uuid();
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const lit=v=>v===null||v===undefined?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const call=(role,actor)=>async(name,p={})=>{
 assert.match(name,/^[a-z_]+$/);
 const claims=actor?`set request.jwt.claim.sub='${actor.owner}';set request.jwt.claims='${JSON.stringify({session_id:actor.session})}';`:'';
 const value=await db(claims+'set role '+role+';select public.'+name+'('+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');');
 return ['cancel_chat_turn'].includes(name)?value:JSON.parse(value);
};
const service=call('service_role');
const notice='a'.repeat(64);
let gateway,model,dir,created=false;
const rpcLog=[];const model$={hits:[],hold:new Set(),pending:new Set()};
const workers=new Set();
const waitFor=async(predicate,label,ms=30000)=>{const end=Date.now()+ms;for(;;){const v=await predicate();if(v)return v;if(Date.now()>end)throw Error('Timed out: '+label);await new Promise(r=>setTimeout(r,200));}};

async function policy(mode='current_input_v1'){
 const id=uuid();
 await db(`insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at,context_mode) values('${id}','qwen','synthetic-test-only','${QWEN}','fixture','fixture','fixture','test-terms','test-notice','${notice}','合成测试告知','Synthetic test notice','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day','${mode}');`);
 return id;
}
async function owner({scope=true,limit=1000000}={}){
 const a={owner:uuid(),session:uuid(),thread:uuid(),scope:uuid()};
 await db(`insert into auth.users values('${a.owner}');insert into identity_private.mobile_accounts(owner_id) values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');insert into public.chat_threads(id,owner_id) values('${a.thread}','${a.owner}');`);
 if(scope)await db(`insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at) values('${a.scope}','${a.owner}','CNY',${limit},${Math.min(limit,100000)},10,2,true,now()+interval '1 day');insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled) values('${a.scope}','qwen','${PROTOCOL_MODELS.qwen}','synthetic-v1',1000000,1000,true);`);
 a.user=call('authenticated',a);
 a.accept=p=>a.user('accept_text_policy',{p_policy_id:p,p_notice_hash:notice});
 a.text=async(p,text,locale='en')=>{const turn=uuid();const r=await a.user('start_text_turn',{p_thread_id:a.thread,p_turn_id:turn,p_idempotency_key:uuid(),p_policy_id:p,p_locale:locale,p_text:text});assert.equal(r.kind,'accepted',JSON.stringify(r));return turn;};
 a.task=async(p,text)=>{const turn=uuid(),task=uuid(),thread=uuid();await db(`insert into public.chat_threads(id,owner_id) values('${thread}','${a.owner}');`);const r=await a.user('submit_service_task_turn',{p_thread_id:thread,p_turn_id:turn,p_idempotency_key:uuid(),p_policy_id:p,p_locale:'en',p_text:text,p_task_id:task,p_scope_version:1,p_relationship:'new_goal',p_parent_turn_id:null});assert.ok(r.turnId||r.kind,JSON.stringify(r));return {turn,task};};
 a.grounded=async(p,text)=>{const turn=uuid();await a.user('submit_grounded_turn',{p_thread_id:uuid(),p_turn_id:turn,p_idempotency_key:uuid(),p_policy_id:p,p_locale:'en',p_text:text,p_task_id:uuid(),p_scope_version:1,p_relationship:'new_goal',p_parent_turn_id:null,p_city:'shanghai'});return turn;};
 return a;
}
const status=turn=>db(`select status from public.turns where id='${turn}';`);
const terminals=turn=>db(`select count(*) from public.chat_turn_events where turn_id='${turn}' and event_type='terminal';`);
const hitsFor=text=>model$.hits.filter(h=>h.includes(text)).length;
const profile=(patch={})=>({schemaVersion:'vpj07-hosted-text-worker/1',pollIntervalMs:1000,maxLifetimeMs:600000,drainMs:2000,concurrency:2,groupLimit:20,
 modes:['current_input_v1','task_history_v1','knowledge_intent_v1'],
 qwen:{priceVersion:'synthetic-v1',pricing:{mode:'flat',inputMicrosPerMillion:1,outputMicrosPerMillion:1,cachedInputMicrosPerMillion:null},reservedMicros:1000,maxOutputTokens:512,timeoutMs:20000,configurationId:uuid(),configurationVersion:1},...patch});
function startWorker(patch={},build='test-build'){
 const journals=mkdtempSync(join(dir,'journal-'));chmodSync(journals,0o700);
 const child=spawn(process.execPath,['--experimental-strip-types','--import',join(dir,'closed-fetch.mjs'),resolve('lib/server/jobs/run-hosted-text-worker.mjs')],{
  env:{...process.env,NODE_OPTIONS:'',VERCEL_ENV:'',VISEPANDA_HOSTED_TEXT_WORKER:'true',VISEPANDA_HOSTED_WORKER_DB_KEY:SERVICE_KEY,VISEPANDA_HOSTED_WORKER_QWEN_KEY:PROVIDER_KEY,
   VISEPANDA_HOSTED_WORKER_PROFILE:JSON.stringify(profile(patch)),VISEPANDA_HOSTED_WORKER_JOURNAL_DIR:journals,VISEPANDA_HOSTED_WORKER_BUILD:build},stdio:['ignore','pipe','pipe']});
 const w={child,journals,stdout:'',stderr:''};child.stdout.on('data',d=>w.stdout+=d);child.stderr.on('data',d=>w.stderr+=d);
 w.exited=new Promise(r=>child.once('exit',(code,signal)=>r({code,signal})));workers.add(w);
 w.journal=()=>readdirSync(journals).map(f=>readFileSync(join(journals,f),'utf8')).join('');
 w.stop=async()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');const r=await w.exited;workers.delete(w);return r;};
 w.kill=async()=>{child.kill('SIGKILL');const r=await w.exited;workers.delete(w);return r;};
 return w;
}
const setSwitch=value=>service('set_hosted_worker_enabled',{p_enabled:value,p_reason:'integration test'});
const assertNoSecrets=w=>{for(const text of [w.stdout,w.stderr,w.journal()]){assert.ok(!text.includes(SERVICE_KEY),'service key never logged');assert.ok(!text.includes(PROVIDER_KEY),'provider key never logged');}};

before(async()=>{
 if(!enabled)return;
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
 assert.equal(r.code,0,r.stderr);created=true;
 let ready=false;for(let i=0;i<60;i++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0){ready=true;break;}await new Promise(r=>setTimeout(r,250));}assert.ok(ready);
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await db('create schema extensions;create extension pgcrypto with schema extensions;');
 const migrations=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
 const mine=migrations.findIndex(f=>f.endsWith('_vpj_07_hosted_text_worker.sql'));assert.ok(mine>0);
 for(const f of migrations.slice(0,mine))await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
 // Append-only migration: a rollback leaves no object; applying it changes no existing row.
 const content=readFileSync('supabase/migrations/'+migrations[mine],'utf8');
 const before=await db("select count(*) from turn_private.work;select count(*) from turn_private.text_policies;");
 await db('begin;'+content+'rollback;');assert.equal(await db("select to_regclass('turn_private.hosted_worker_control') is null;"),'t');
 await db('begin;'+content+'commit;');
 for(const f of migrations.slice(mine+1))await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
 assert.equal(await db("select count(*) from turn_private.work;select count(*) from turn_private.text_policies;"),before);

 gateway=createServer(async(req,res)=>{
  const reply=(status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(body);};
  const name=/^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(req.url??'')?.[1];
  const chunks=[];for await(const c of req)chunks.push(c);
  if(req.method!=='POST'||!name||req.headers.apikey!==SERVICE_KEY||req.headers.authorization!=='Bearer '+SERVICE_KEY)return reply(401,'{"message":"denied"}');
  let params;try{params=JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{return reply(400,'{}');}
  if(!Object.keys(params).every(k=>/^p_[a-z_]+$/.test(k)))return reply(400,'{}');
  rpcLog.push(name);
  const result=await sql(container,'set role service_role;select public.'+name+'('+Object.entries(params).map(([k,v])=>k+'=>'+lit(v)).join(',')+');');
  if(result.code!==0)return reply(400,JSON.stringify({message:'rpc failed'}));
  reply(200,result.stdout.trim()||'null');
 });
 gateway.listen(0,'127.0.0.1');await once(gateway,'listening');
 model=createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);
  const body=JSON.parse(Buffer.concat(chunks).toString()),input=body.messages?.at(-1)?.content??'';
  if(req.headers.authorization!=='Bearer '+PROVIDER_KEY){res.writeHead(401);res.end();return;}
  model$.hits.push(input);
  const grounded=body.messages?.[0]?.content===KNOWLEDGE_INTENT_SYSTEM_PROMPT;
  const translation=input.startsWith('VisePanda field translation v1');
  const content=grounded?{unansweredNeeds:[],intent:'clarification',requestScope:'unknown'}
   :translation?{outcome:'answered',text:JSON.stringify({translation:'2位，晚上7点',backTranslation:'Table for 2 at 7pm'})}
   :{outcome:'answered',text:'Synthetic hosted answer'};
  const deliver=()=>{if(res.destroyed)return;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({model:PROTOCOL_MODELS.qwen,choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(content)}}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}));};
  const holdKey=[...model$.hold].find(k=>input.includes(k));
  if(holdKey){model$.hold.delete(holdKey);model$.pending.add(deliver);}else deliver();
 });
 model.listen(0,'127.0.0.1');await once(model,'listening');
 dir=mkdtempSync(join(tmpdir(),'vpj07-hosted-'));
 writeFileSync(join(dir,'closed-fetch.mjs'),`const original=globalThis.fetch;globalThis.fetch=async(input,init)=>{const url=typeof input==='string'?input:input.url??String(input);
if(url.startsWith(${JSON.stringify(STAGING+'/rest/v1/rpc/')}))return original('http://127.0.0.1:${gateway.address().port}'+new URL(url).pathname,init);
if(url===${JSON.stringify(QWEN)})return original('http://127.0.0.1:${model.address().port}',init);
throw Error('Unexpected hosted-worker destination');};`,{mode:0o600});
});
after(async()=>{
 for(const w of [...workers])await w.kill().catch(()=>{});
 for(const deliver of model$.pending)deliver();
 if(gateway){gateway.closeAllConnections();await new Promise(r=>gateway.close(r));}
 if(model){model.closeAllConnections();await new Promise(r=>model.close(r));}
 if(dir)rmSync(dir,{recursive:true,force:true});
 if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);
});

run('migration is service-only and starts disabled: no discovery, no claim, no provider call',async()=>{
 assert.deepEqual(await service('hosted_worker_ready_groups',{p_limit:10}),{kind:'disabled'});
 for(const role of ['anon','authenticated'])for(const q of ['public.hosted_worker_ready_groups(10)','public.read_hosted_worker_status()',"public.set_hosted_worker_enabled(true,'x')"])
  assert.match((await sql(container,`set role ${role};select ${q};`)).stderr,/permission denied/);
 const p=await policy(),a=await owner();await a.accept(p);const turn=await a.text(p,'Disabled switch question');
 const w=startWorker();
 await waitFor(async()=>(await db(`select phase from turn_private.hosted_worker_heartbeats where phase='disabled';`))==='disabled','disabled heartbeat');
 await new Promise(r=>setTimeout(r,2500));
 assert.equal(await db(`select state from turn_private.work where turn_id='${turn}';`),'queued');assert.equal(hitsFor('Disabled switch question'),0);
 await setSwitch(true);
 await waitFor(async()=>await status(turn)==='completed','completed after enable');
 assert.equal((await a.user('read_text_turn',{p_turn_id:turn})).output,'Synthetic hosted answer');
 const exit=await w.stop();assert.equal(exit.code,0);
 assert.match(w.stdout,/"reason":"stopped"/);
 assert.equal(await db(`select phase||':'||stop_reason from turn_private.hosted_worker_heartbeats order by last_seen_at desc limit 1;`),'stopped:stopped');
 assertNoSecrets(w);
});

run('multi-owner and multi-policy: text, task, grounded and translation answered and read back by owners only',async()=>{
 await setSwitch(true);
 const text=await policy(),task=await policy('task_history_v1'),grounded=await policy('knowledge_intent_v1');
 const a=await owner(),b=await owner(),c=await owner(),unscoped=await owner({scope:false});
 await a.accept(text);await a.accept(task);await b.accept(text);await c.accept(grounded);await unscoped.accept(text);
 const aText=await a.text(text,'Owner A text question');
 const aTask=await a.task(task,'Owner A task goal');
 const bTranslation=await b.text(text,translationPrompt({sourceLocale:'en',targetLocale:'zh',text:'Table for 2 at 7pm'}),'zh');
 const cGrounded=await c.grounded(grounded,'Which booking document do I need?');
 const dText=await unscoped.text(text,'Unscoped owner question');
 const w=startWorker();
 await waitFor(async()=>(await Promise.all([aText,aTask.turn,bTranslation,cGrounded].map(status))).every(s=>s==='completed'),'all groups completed');
 assert.equal((await a.user('read_text_turn',{p_turn_id:aText})).output,'Synthetic hosted answer');
 const taskHistory=await a.user('list_service_task_turns',{p_policy_id:task,p_limit:20});
 assert.ok(JSON.stringify(taskHistory).includes('Synthetic hosted answer'));
 const history=await b.user('list_text_turns',{p_policy_id:text,p_limit:20});
 const projected=history.turns.map(projectTranslation).filter(Boolean);
 assert.equal(projected.length,1);assert.equal(projected[0].state,'translated');assert.equal(projected[0].translation,'2位，晚上7点');
 const groundedRead=await c.user('read_grounded_turn',{p_turn_id:cGrounded});
 assert.equal(groundedRead.turnId,cGrounded);assert.equal(groundedRead.status,'completed');assert.equal(groundedRead.outcome,'clarification',JSON.stringify(groundedRead));
 // Actor isolation: another owner reads nothing from these Turns.
 assert.notEqual((await b.user('read_text_turn',{p_turn_id:aText})).kind,'text');
 assert.equal(JSON.stringify(await c.user('list_text_turns',{p_policy_id:text,p_limit:20})).includes('Owner A'),false);
 // Missing budget scope => skipped, never guessed; Turn stays queued for an operator.
 await waitFor(async()=>Number(await db(`select max(skipped) from turn_private.hosted_worker_heartbeats where stop_reason is null;`))>0,'skipped counter');
 assert.equal(await db(`select state from turn_private.work where turn_id='${dText}';`),'queued');assert.equal(hitsFor('Unscoped owner question'),0);
 // Every model call settled once against the owner's own scope.
 for(const [o,n] of [[a,2],[b,1],[c,1]])assert.equal(await db(`select count(*) filter (where status='settled')||'/'||count(*) from public.model_budget_attempts where scope_id='${o.scope}';`),n+'/'+n);
 for(const t of [aText,aTask.turn,bTranslation,cGrounded])assert.equal(await terminals(t),'1');
 const status$=await service('read_hosted_worker_status');assert.equal(status$.enabled,true);assert.ok(status$.queue.ready>=1);assert.ok(status$.workers.length>=1);
 assert.equal(JSON.stringify(status$).includes('Owner A'),false,'status view is content-free');
 const journal=w.journal();assert.match(journal,/vpj07-hosted-job\/1/);assert.match(journal,/vpj07-usage-journal\/1/);
 for(const phrase of ['Owner A text question','Synthetic hosted answer','Table for 2'])assert.equal(journal.includes(phrase),false,'journal is content-free');
 assert.equal((await w.stop()).code,0);assertNoSecrets(w);
 await db(`update turn_private.work set state='cancelled',lease_token=null,expires_at=null where turn_id='${dText}';`);
});

run('budget exhaustion ends honestly as failed without any provider call',async()=>{
 await setSwitch(true);
 const p=await policy(),e=await owner({limit:500});await e.accept(p);
 const turn=await e.text(p,'Exhausted budget question');
 const w=startWorker();
 await waitFor(async()=>await status(turn)==='failed','failed after bounded attempts');
 assert.equal(hitsFor('Exhausted budget question'),0);
 assert.equal(await db(`select count(*) from public.model_budget_attempts where scope_id='${e.scope}';`),'0');
 assert.equal(await db(`select state||':'||attempt from turn_private.work where turn_id='${turn}';`),'quarantined:3');
 assert.equal(await terminals(turn),'1');
 assert.equal((await w.stop()).code,0);
});

run('user cancellation before claim and during the provider call never stores a late answer',async()=>{
 await setSwitch(true);
 const p=await policy(),f=await owner();await f.accept(p);
 const early=await f.text(p,'Cancelled before claim');
 await f.user('cancel_chat_turn',{p_turn_id:early});
 model$.hold.add('Cancelled in flight');
 const late=await f.text(p,'Cancelled in flight');
 const w=startWorker();
 await waitFor(()=>model$.pending.size===1,'provider holding');
 await f.user('cancel_chat_turn',{p_turn_id:late});
 for(const deliver of model$.pending)deliver();model$.pending.clear();
 await new Promise(r=>setTimeout(r,2500));
 for(const t of [early,late]){assert.equal(await status(t),'cancelled');assert.equal(await terminals(t),'1');}
 assert.equal(hitsFor('Cancelled before claim'),0);
 assert.equal(await db(`select coalesce(output_text,'none') from turn_private.text_content where turn_id='${late}';`),'none');
 // The provider did answer with verified usage: that real cost is recorded, not hidden.
 assert.equal(await db(`select string_agg(status,',') from public.model_budget_attempts where scope_id='${f.scope}';`),'settled');
 assert.equal((await w.stop()).code,0);
});

run('SIGKILL mid-dispatch keeps the unknown charge; lease recovery by two competing workers answers exactly once',async()=>{
 await setSwitch(true);
 const p=await policy(),g=await owner();await g.accept(p);
 model$.hold.add('Crash recovery question');
 const turn=await g.text(p,'Crash recovery question');
 const first=startWorker({},'crashing-build');
 await waitFor(()=>model$.pending.size===1,'first worker dispatched');
 await first.kill();
 for(const deliver of model$.pending)deliver();model$.pending.clear();
 assert.equal(await db(`select state||':'||attempt from turn_private.work where turn_id='${turn}';`),'leased:1');
 assert.equal(await db(`select status from public.model_budget_attempts where scope_id='${g.scope}';`),'dispatched','unknown cost retained, never released');
 // Natural expiry is 120 s; move only this lease's expiry to now (test clock shortcut).
 await db(`update turn_private.work set expires_at=clock_timestamp() where turn_id='${turn}';`);
 const others=await Promise.all(Array.from({length:4},async()=>{const o=await owner();await o.accept(p);return {o,turn:await o.text(p,'Competing duplicate question '+uuid())};}));
 const second=startWorker({},'second'),third=startWorker({},'third');
 await waitFor(async()=>(await Promise.all([turn,...others.map(x=>x.turn)].map(status))).every(s=>s==='completed'),'recovered and competing work completed');
 assert.equal(hitsFor('Crash recovery question'),2,'one crashed dispatch + one recovery dispatch');
 assert.equal(await db(`select state||':'||attempt from turn_private.work where turn_id='${turn}';`),'completed:2');
 assert.equal(await db(`select string_agg(status,',' order by created_at) from public.model_budget_attempts where scope_id='${g.scope}';`),'dispatched,settled');
 for(const t of [turn,...others.map(x=>x.turn)])assert.equal(await terminals(t),'1');
 const competing=model$.hits.filter(h=>h.startsWith('Competing duplicate question')).length;assert.equal(competing,4,'no duplicate dispatch across two live workers');
 assert.equal((await second.stop()).code,0);assert.equal((await third.stop()).code,0);
 assert.equal(await db(`select count(*) from turn_private.hosted_worker_heartbeats where build='crashing-build' and stop_reason is null;`),'1','a killed worker is visible as a stale heartbeat');
});

run('operator stop switch halts new claims while running and resumes on re-enable',async()=>{
 await setSwitch(true);
 const p=await policy(),h=await owner();await h.accept(p);
 const w=startWorker();
 await waitFor(async()=>(await db(`select count(*) from turn_private.hosted_worker_heartbeats where build='test-build' and stop_reason is null and phase in ('idle','polling');`))!=='0','worker polling');
 await setSwitch(false);
 await waitFor(async()=>(await db(`select count(*) from turn_private.hosted_worker_heartbeats where stop_reason is null and phase='disabled';`))!=='0','worker observed stop switch');
 const turn=await h.text(p,'Submitted while stopped');
 await new Promise(r=>setTimeout(r,3000));
 assert.equal(await db(`select state from turn_private.work where turn_id='${turn}';`),'queued');assert.equal(hitsFor('Submitted while stopped'),0);
 const view=await service('read_hosted_worker_status');assert.equal(view.enabled,false);assert.equal(view.reason,'integration test');assert.ok(view.queue.ready>=1);
 await setSwitch(true);
 await waitFor(async()=>await status(turn)==='completed','resumed');
 assert.equal((await w.stop()).code,0);assertNoSecrets(w);
});
