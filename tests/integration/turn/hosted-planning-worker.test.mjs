// Actual hosted CLI child processes and migrated disposable PostgreSQL. JWT
// claims, Qwen and AMap HTTP responses are synthetic; no remote target/key.
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
import {createHostedTextWorker,parseHostedWorkerProfile} from '../../../lib/server/jobs/hosted-text-worker.ts';

const enabled=process.env.VP_TURN_DB_TEST==='1',container='vpj80-hosted-'+uuid().slice(0,8);
const STAGING='https://dzqdzetcctkhbrhlxxgn.supabase.co',QWEN='https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const DB_KEY='SYNTHETIC_DB_'+uuid(),MODEL_KEY='SYNTHETIC_MODEL_'+uuid(),MAP_KEY='SYNTHETIC_MAP_'+uuid();
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const lit=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const call=(role,actor)=>async(name,p={})=>{
 assert.match(name,/^[a-z_0-9]+$/);
 const claims=actor?`set request.jwt.claim.sub='${actor.owner}';set request.jwt.claims='${JSON.stringify({session_id:actor.session})}';`:'';
 return JSON.parse(await db(claims+`set role ${role};set request.jwt.claim.role='${role}';select public.${name}(`+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');'));
};
const service=call('service_role'),notice='a'.repeat(64),workers=new Set(),rpcLog=[];
const waitFor=async(predicate,label,ms=30000)=>{const end=Date.now()+ms;for(;;){if(await predicate())return;if(Date.now()>end)throw Error('Timed out: '+label);await new Promise(r=>setTimeout(r,100));}};
let gateway,model,maps,dir,created=false,mapCalls=0,modelCalls=0,holdAuthTurn=null,authHeld=false,holdModel=false,holdPauseTurn=null,pauseHeld=false;
const readCounts=new Map(),heldResponses=new Set(),targetChecks=[];
let afterMapRequest=null,mapHookAt=0;
const setSwitch=enabled=>service('set_hosted_worker_enabled',{p_enabled:enabled,p_reason:'synthetic integration'});
const profile=(a,patch={})=>({schemaVersion:'vpj07-hosted-text-worker/2',pollIntervalMs:1000,maxLifetimeMs:600000,drainMs:1000,concurrency:2,groupLimit:10,
 modes:['current_input_v1','task_history_v1','knowledge_intent_v1'],planning:{ownerId:a.owner,planningPolicyId:a.planningPolicy,scopeId:a.scope},
 qwen:{priceVersion:'synthetic-v1',pricing:{mode:'flat',inputMicrosPerMillion:1,outputMicrosPerMillion:1,cachedInputMicrosPerMillion:null},
  reservedMicros:1000,maxOutputTokens:256,timeoutMs:15000,configurationId:uuid(),configurationVersion:1},...patch});
function start(a,patch={}){
 const journals=mkdtempSync(join(dir,'journal-'));chmodSync(journals,0o700);const p=profile(a,patch);
 if(p.schemaVersion.endsWith('/1'))delete p.planning;
 const planning=p.schemaVersion.endsWith('/2')&&p.planning!==null;
 const child=spawn(process.execPath,['--experimental-strip-types','--import',join(dir,'mapper.mjs'),resolve('lib/server/jobs/run-hosted-text-worker.mjs')],{
  env:{...process.env,NODE_OPTIONS:'',VERCEL_ENV:'',VISEPANDA_HOSTED_TEXT_WORKER:'true',VISEPANDA_HOSTED_WORKER_DB_KEY:DB_KEY,
   VISEPANDA_HOSTED_WORKER_QWEN_KEY:MODEL_KEY,VISEPANDA_HOSTED_WORKER_PROFILE:JSON.stringify(p),
   VISEPANDA_HOSTED_PLANNING_WORKER:planning?'true':'false',...(planning?{VISEPANDA_HOSTED_WORKER_AMAP_KEY:MAP_KEY}:{}),
   VISEPANDA_HOSTED_WORKER_JOURNAL_DIR:journals,VISEPANDA_HOSTED_WORKER_BUILD:'synthetic-hosted-planning'},stdio:['ignore','pipe','pipe']});
 const w={child,journals,stdout:'',stderr:''};child.stdout.on('data',d=>w.stdout+=d);child.stderr.on('data',d=>w.stderr+=d);
 w.exited=new Promise(r=>child.once('exit',(code,signal)=>r({code,signal})));workers.add(w);
 w.journal=()=>readdirSync(journals).map(f=>readFileSync(join(journals,f),'utf8')).join('');
 w.stop=async(signal='SIGTERM')=>{if(child.exitCode===null&&child.signalCode===null)child.kill(signal);const value=await w.exited;workers.delete(w);
  for(const content of [w.stdout,w.stderr,w.journal()])for(const secret of [DB_KEY,MODEL_KEY,MAP_KEY])assert.ok(!content.includes(secret));return value;};
 return w;
}
async function owner(label){
 const a={owner:uuid(),session:uuid(),policy:uuid(),planningPolicy:uuid(),scope:uuid(),conversation:uuid(),goal:uuid(),parent:uuid()};
 await db(`insert into auth.users(id) values('${a.owner}');insert into identity_private.mobile_accounts(owner_id) values('${a.owner}');
 insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');
 insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at)
 values('${a.policy}','qwen','synthetic HTTP only','${QWEN}','fixture','fixture','fixture','test','test','${notice}','合成告知','Synthetic notice','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day');
 insert into turn_private.planning_policies(id,text_policy_id,environment,notice_version,notice_hash,notice_zh,notice_en,effective_at,expires_at)
 values('${a.planningPolicy}','${a.policy}','staging','synthetic-closed-http','${notice}','合成规划','Synthetic planning',now()-interval '1 hour',now()+interval '1 day');
 insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at)
 values('${a.scope}','${a.owner}','CNY',1000000,100000,10,1,true,now()+interval '1 day');
 insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled)
 values('${a.scope}','qwen','qwen3.7-plus-2026-05-26','synthetic-v1',1000000,1000,true);`);
 a.user=call('authenticated',a);
 await a.user('accept_text_policy',{p_policy_id:a.policy,p_notice_hash:notice});
 await a.user('accept_planning_policy_v1',{p_policy_id:a.planningPolicy,p_notice_hash:notice});
 assert.equal((await a.user('submit_assistant_message_v1',{p_conversation_id:a.conversation,p_message_id:a.parent,p_idempotency_key:uuid(),
  p_policy_id:a.policy,p_locale:'en',p_text:'SYNTHETIC '+label,p_relationship:'goal_start',p_goal_id:a.goal,
  p_expected_goal_version:null,p_task_id:null,p_parent_message_id:null,p_turn_id:null})).kind,'accepted');
 a.task={turn:uuid(),id:uuid(),message:uuid()};
 a.accepted=await a.user('submit_planning_comparison_v1',{p_conversation_id:a.conversation,p_goal_id:a.goal,p_expected_goal_version:1,
  p_parent_message_id:a.parent,p_message_id:a.task.message,p_message_key:uuid(),p_thread_id:uuid(),p_turn_id:a.task.turn,
  p_task_id:a.task.id,p_task_key:uuid(),p_text_policy_id:a.policy,p_planning_policy_id:a.planningPolicy,p_locale:'en',
  p_text:'SYNTHETIC '+label+' Shanghai stay area comparison',p_memory_basis:[]});
 assert.equal(a.accepted.kind,'accepted',JSON.stringify(a.accepted));return a;
}
async function additional(a,label){
 const task={turn:uuid(),id:uuid(),message:uuid()};
 const accepted=await a.user('submit_planning_comparison_v1',{p_conversation_id:a.conversation,p_goal_id:a.goal,p_expected_goal_version:1,
  p_parent_message_id:a.task.message,p_message_id:task.message,p_message_key:uuid(),p_thread_id:uuid(),p_turn_id:task.turn,
  p_task_id:task.id,p_task_key:uuid(),p_text_policy_id:a.policy,p_planning_policy_id:a.planningPolicy,p_locale:'en',
  p_text:'SYNTHETIC '+label,p_memory_basis:[]});assert.equal(accepted.kind,'accepted');return {task,accepted};
}
before(async()=>{
 if(!enabled)return;
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
 assert.equal(r.code,0,r.stderr);created=true;
 await waitFor(async()=>(await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0,'PostgreSQL');
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
  const content=readFileSync('supabase/migrations/'+f,'utf8');
  if(f.endsWith('_vpj80_hosted_planning_target.sql')){await db('begin;'+content+'rollback;');
   assert.equal(await db("select to_regprocedure('public.hosted_planning_target_v1(uuid,uuid,uuid,text,bigint,uuid,uuid)') is null;"),'t');}
  await db('begin;'+content+'commit;');
 }
 gateway=createServer(async(req,res)=>{
  const name=/^\/rest\/v1\/rpc\/([a-z_0-9]+)$/.exec(req.url??'')?.[1],parts=[];for await(const p of req)parts.push(p);
  if(!name||req.headers.apikey!==DB_KEY||req.headers.authorization!=='Bearer '+DB_KEY){res.writeHead(401);res.end('{}');return;}
  const params=JSON.parse(Buffer.concat(parts).toString());rpcLog.push(name);if(name==='hosted_planning_target_v1')targetChecks.push(params);
  const value=await sql(container,`set role service_role;set request.jwt.claim.role='service_role';select public.${name}(`+Object.entries(params).map(([k,v])=>k+'=>'+lit(v)).join(',')+');');
  const reply=()=>{if(res.destroyed)return;res.writeHead(value.code===0?200:400,{'content-type':'application/json'});res.end(value.code===0?value.stdout.trim():JSON.stringify({message:'synthetic RPC rejected'}));};
  if(name==='authorize_planning_read_v1'){
   const count=(readCounts.get(params.p_turn_id)??0)+1;readCounts.set(params.p_turn_id,count);
   if(params.p_turn_id===holdAuthTurn&&count===16){authHeld=true;heldResponses.add(reply);return;}
  }
  if(name==='pause_planning_comparison_v1'&&params.p_turn_id===holdPauseTurn){pauseHeld=true;heldResponses.add(reply);return;}
  reply();
 });gateway.listen(0,'127.0.0.1');await once(gateway,'listening');
 model=createServer(async(req,res)=>{
  req.resume();if(req.headers.authorization!=='Bearer '+MODEL_KEY){res.writeHead(401);res.end();return;}modelCalls++;
  const reply=()=>{if(res.destroyed)return;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({model:'qwen3.7-plus-2026-05-26',
   choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:'{"highlight":"peoples_square"}'}}],usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30}}));};
  if(holdModel){heldResponses.add(reply);return;}reply();
 });model.listen(0,'127.0.0.1');await once(model,'listening');
 maps=createServer(async(req,res)=>{
  mapCalls++;const u=new URL(req.url,'http://fixture'),query=u.searchParams.get('keywords'),id=u.searchParams.get('id');
  if(u.searchParams.get('key')!==MAP_KEY){res.writeHead(401);res.end();return;}
  const ids={'静安寺':'j','人民广场':'p','上海站':'s'},coordinates={j:'121.440000,31.220000',p:'121.480000,31.230000',s:'121.450000,31.250000'};
  let body;
  if(u.pathname.includes('place/text'))body={status:'1',infocode:'10000',pois:[{id:ids[query],name:query}]};
  else if(u.pathname.includes('place/detail'))body={status:'1',infocode:'10000',pois:[{id,name:'SYNTHETIC '+id,location:coordinates[id],citycode:'021',address:'SYNTHETIC'}]};
  else {const transit=u.pathname.includes('transit'),origin=u.searchParams.get('origin'),destination=u.searchParams.get('destination');
   const segment={walking:{distance:'100',steps:[{instruction:'SYNTHETIC walk'}]},bus:{buslines:[{name:'SYNTHETIC line',departure_stop:{name:'A'},arrival_stop:{name:'B'}}]}};
   body={status:'1',infocode:'10000',route:{origin,destination,[transit?'transits':'paths']:[{distance:'1000',cost:{duration:'960'},steps:[{instruction:'SYNTHETIC walk'}],segments:[segment]}]}};}
  if(afterMapRequest&&mapCalls===mapHookAt){const hook=afterMapRequest;afterMapRequest=null;await hook();}
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(body));
 });maps.listen(0,'127.0.0.1');await once(maps,'listening');
 dir=mkdtempSync(join(tmpdir(),'vpj80-hosted-'));
 writeFileSync(join(dir,'mapper.mjs'),`const original=globalThis.fetch;globalThis.fetch=async(input,init)=>{const url=typeof input==='string'?input:input instanceof URL?input.href:input.url??String(input);
 if(url.startsWith(${JSON.stringify(STAGING+'/rest/v1/rpc/')}))return original('http://127.0.0.1:${gateway.address().port}'+new URL(url).pathname,init);
 if(url===${JSON.stringify(QWEN)})return original('http://127.0.0.1:${model.address().port}',init);
 if(new URL(url).origin==='https://restapi.amap.com')return original('http://127.0.0.1:${maps.address().port}'+new URL(url).pathname+new URL(url).search,init);
 throw Error('Closed fixture rejected destination');};`,{mode:0o600});
});
after(async()=>{
 for(const w of [...workers])await w.stop('SIGKILL');
 for(const reply of heldResponses)reply();
 for(const server of [gateway,model,maps])if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
 if(dir)rmSync(dir,{recursive:true,force:true});if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);
});

run('default closed and invalid owner/budget configuration send neither maps nor model',async()=>{
 const a=await owner('budget gates'),before={maps:mapCalls,model:modelCalls};
 for(const role of ['anon','authenticated'])assert.match((await sql(container,`set role ${role};select public.hosted_planning_target_v1('${a.owner}','${a.planningPolicy}','${a.scope}','synthetic-v1',1000);`)).stderr,/permission denied/);
 const disabled=start(a);await waitFor(()=>disabled.journal().includes('"phase":"disabled"'),'disabled heartbeat');
 assert.equal(await db(`select attempt from turn_private.work where turn_id='${a.task.turn}';`),'0');await disabled.stop();
 await setSwitch(true);
 const oldProfile=profile(a,{schemaVersion:'vpj07-hosted-text-worker/1'});delete oldProfile.planning;
 const old=start(a,oldProfile);await waitFor(()=>old.journal().includes('"phase":"cycle"'),'v1 cycle');await old.stop();
 assert.equal(await db(`select attempt from turn_private.work where turn_id='${a.task.turn}';`),'0');
 for(const [change,restore,target] of [
  [`update public.model_budget_scopes set enabled=false where id='${a.scope}';`,`update public.model_budget_scopes set enabled=true where id='${a.scope}';`,null],
  [`update public.model_budget_scopes set frozen=true where id='${a.scope}';`,`update public.model_budget_scopes set frozen=false where id='${a.scope}';`,null],
  [`update public.model_budget_scopes set expires_at=now()-interval '1 hour' where id='${a.scope}';`,`update public.model_budget_scopes set expires_at=now()+interval '1 day' where id='${a.scope}';`,null],
  [`update public.model_budget_provider_limits set price_version='wrong' where scope_id='${a.scope}';`,`update public.model_budget_provider_limits set price_version='synthetic-v1' where scope_id='${a.scope}';`,null],
  [`update public.model_budget_provider_limits set attempt_limit_micros=999 where scope_id='${a.scope}';`,`update public.model_budget_provider_limits set attempt_limit_micros=1000 where scope_id='${a.scope}';`,null],
  [`update public.model_budget_scopes set limit_micros=500,task_limit_micros=500 where id='${a.scope}';`,`update public.model_budget_scopes set limit_micros=1000000,task_limit_micros=100000 where id='${a.scope}';`,null],
  ['', '',{ownerId:uuid(),planningPolicyId:a.planningPolicy,scopeId:a.scope}],
 ]){
  if(change)await db(change);const n=rpcLog.length,w=start(a,target?{planning:target}:{});
  await waitFor(()=>rpcLog.slice(n).filter(x=>x==='hosted_planning_target_v1').length>=2,'preflight idle');await w.stop();if(restore)await db(restore);
  assert.equal(mapCalls,before.maps);assert.equal(modelCalls,before.model);
 }
 assert.equal(await db(`select count(*) from public.model_budget_attempts where scope_id='${a.scope}';`),'0');
 await a.user('withdraw_planning_policy_v1',{p_policy_id:a.planningPolicy});
 const n=rpcLog.length,revoked=start(a);await waitFor(()=>rpcLog.slice(n).includes('hosted_planning_target_v1'),'withdrawal preflight');await revoked.stop();
 assert.equal(mapCalls,before.maps);assert.equal(modelCalls,before.model);
});

run('each map request stops after current claimed task loses authorization',async()=>{
 for(const [branch,stage] of [['stop',1],['withdraw',1],['cancel',1],['frozen',1],['expired_lease',1],['stop',3],['frozen',8]]){
  const a=await owner('per request '+branch),before={maps:mapCalls,model:modelCalls},checks=targetChecks.length;
  await setSwitch(true);
  let claimedLease;mapHookAt=before.maps+stage;afterMapRequest=async()=>{
   assert.equal(await db(`select state from turn_private.work where turn_id='${a.task.turn}';`),'leased');
   claimedLease=await db(`select lease_token from turn_private.work where turn_id='${a.task.turn}';`);
   if(branch==='stop')await setSwitch(false);
   if(branch==='withdraw')await a.user('withdraw_planning_policy_v1',{p_policy_id:a.planningPolicy});
   if(branch==='cancel')await db(`set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({session_id:a.session})}';set role authenticated;set request.jwt.claim.role='authenticated';select row_to_json(c) from public.cancel_chat_turn('${a.task.turn}') c;`);
   if(branch==='frozen')await db(`update public.model_budget_scopes set frozen=true where id='${a.scope}';`);
   if(branch==='expired_lease')await db(`update turn_private.work set expires_at=clock_timestamp()-interval '1 second' where turn_id='${a.task.turn}';`);
  };
  const w=start(a);
  await waitFor(()=>w.journal().includes('"phase":"cycle"'),'partial map cycle '+branch);
  await w.stop();
  assert.equal(mapCalls-before.maps,stage,'no subsequent egress after '+branch);assert.equal(modelCalls-before.model,0);
  const exact=targetChecks.slice(checks).filter(p=>p.p_turn_id!==undefined);assert.ok(exact.length>=2);
  for(const p of exact){assert.equal(p.p_turn_id,a.task.turn);assert.equal(p.p_lease_token,claimedLease);assert.equal(p.p_owner_id,a.owner);assert.equal(p.p_scope_id,a.scope);assert.equal(p.p_planning_policy_id,a.planningPolicy);}
  assert.equal(await db(`select count(*) from turn_private.planning_observations o join turn_private.planning_action_receipts r using(turn_id,action_key) where o.turn_id='${a.task.turn}' and r.tool_id='place.read';`),'0');
  // Restore only reversible operator gates; withdrawn consent stays revoked.
  assert.match(await db(`select state from turn_private.planning_action_receipts where turn_id='${a.task.turn}' and tool_id='place.read';`),/^(started|unknown)$/);
  await setSwitch(true);
  if(branch==='frozen')await db(`update public.model_budget_scopes set frozen=false where id='${a.scope}';`);
  await db(`update turn_private.work set expires_at=clock_timestamp()-interval '1 second' where turn_id='${a.task.turn}' and state='leased';`);
  const n=rpcLog.length,restarted=start(a);await waitFor(()=>rpcLog.slice(n).includes('hosted_planning_target_v1'),'partial restart '+branch);await restarted.stop();
  assert.equal(mapCalls-before.maps,stage,'unknown partial action never replayed after '+branch);assert.equal(modelCalls-before.model,0);
  assert.equal(await db(`select count(*) from public.model_budget_attempts where task_id='${a.task.id}';`),'0');
  assert.equal(await db(`select count(*) from turn_private.result_artifacts where id='${a.accepted.artifactId}';`),'0');
 }
});

run('SIGKILL after persisted place checkpoint resumes in new competing processes without repeated maps or model',async()=>{
 const a=await owner('checkpoint restart'),before={maps:mapCalls,model:modelCalls};holdAuthTurn=a.task.turn;authHeld=false;
 const first=start(a);await waitFor(()=>authHeld,'checkpoint barrier');
 assert.equal(await db(`select count(*) from turn_private.planning_observations where turn_id='${a.task.turn}';`),'2');
 assert.equal(mapCalls-before.maps,13);assert.equal(modelCalls-before.model,0);
 await first.stop('SIGKILL');holdAuthTurn=null;for(const reply of heldResponses)reply();heldResponses.clear();
 await db(`update turn_private.work set expires_at=clock_timestamp()-interval '1 second' where turn_id='${a.task.turn}';`);
 const resumed=start(a),replica=start(a);
 try{await waitFor(async()=>await db(`select status from public.turns where id='${a.task.turn}';`)==='completed','persisted result');}
 catch(error){assert.fail(String(error)+' '+await db(`select jsonb_build_object('work',w.state,'job',j.state,'attempt',w.attempt,
  'actions',(select jsonb_agg(jsonb_build_array(x.tool_id,x.state)) from turn_private.planning_action_receipts x where x.turn_id=w.turn_id),
  'budgets',(select jsonb_agg(b.status) from public.model_budget_attempts b where b.task_id=j.task_id))
  from turn_private.work w join turn_private.planning_comparisons j on j.turn_id=w.turn_id where w.turn_id='${a.task.turn}';`)
  +' modelDelta='+String(modelCalls-before.model)+' resumed='+resumed.stderr+' '+resumed.journal().slice(-1800));}
 await resumed.stop();await replica.stop();
 assert.equal(mapCalls-before.maps,13,'completed tool was not repeated');assert.equal(modelCalls-before.model,1);
 const result=await a.user('read_result_artifacts_v1',{p_artifact_id:a.accepted.artifactId,p_revision:null});
 assert.equal(result.kind,'result_artifact');assert.equal(result.source.taskId,a.task.id);assert.equal(result.current,true);
 assert.equal(await db(`select count(*) from public.model_budget_attempts where task_id='${a.task.id}';`),'1');
 assert.equal(await db(`select count(*) from turn_private.result_events where artifact_id='${a.accepted.artifactId}' and event_type='ready';`),'1');
 assert.match(resumed.journal()+replica.journal(),/vpj80-planning-usage-journal\/1/);
 const receipt=(resumed.journal()+replica.journal()).trim().split('\n').map(line=>JSON.parse(line))
  .find(row=>row.schemaVersion==='vpj80-planning-usage-journal/1').receipt;
 assert.equal(receipt.schemaVersion,'validated-planning-usage/1');assert.equal(receipt.attempt.taskId,a.task.id);
 assert.equal(receipt.turnId,a.task.turn);assert.equal(receipt.policyId,a.planningPolicy);
});

run('SIGKILL during dispatched paid attempt persists paused_unknown after restart with no blind replay',async()=>{
 const a=await owner('paid unknown'),before={maps:mapCalls,model:modelCalls};holdModel=true;
 const first=start(a);await waitFor(()=>modelCalls===before.model+1,'held paid request');
 assert.equal(await db(`select status from public.model_budget_attempts where task_id='${a.task.id}';`),'dispatched');
 await first.stop('SIGKILL');holdModel=false;for(const reply of heldResponses)reply();heldResponses.clear();
 await db(`update turn_private.work set expires_at=clock_timestamp()-interval '1 second' where turn_id='${a.task.turn}';`);
 const restarted=start(a);await waitFor(async()=>await db(`select state from turn_private.planning_comparisons where turn_id='${a.task.turn}';`)==='paused_unknown','durable unknown pause');
 await restarted.stop();assert.equal(modelCalls-before.model,1);assert.equal(mapCalls-before.maps,13);
 assert.equal(await db(`select count(*) from turn_private.result_artifacts where id='${a.accepted.artifactId}';`),'0');
 assert.equal(await db(`select status from public.model_budget_attempts where task_id='${a.task.id}';`),'dispatched','lost supplier receipt is unresolved, not zero');
});

run('mixed queues cannot lend later readiness or unknown cleanup permission to the claimed earliest task',async()=>{
 const frozen=await owner('earliest frozen'),later=await additional(frozen,'later unknown'),before={maps:mapCalls,model:modelCalls};
 await db(`insert into public.model_budget_attempts(scope_id,attempt_id,task_id,provider,model,price_version,reserved_micros,status)
  values('${frozen.scope}','${uuid()}','${later.task.id}','qwen','qwen3.7-plus-2026-05-26','synthetic-v1',1000,'dispatched');
  update public.model_budget_scopes set frozen=true where id='${frozen.scope}';`);
 const w=start(frozen);await waitFor(async()=>await db(`select count(*) from turn_private.planning_comparisons
  where task_id in ('${frozen.task.id}','${later.task.id}') and state='paused_unknown';`)==='2','mixed frozen cleanup');await w.stop();
 assert.equal(mapCalls,before.maps);assert.equal(modelCalls,before.model);
 const exhausted=await owner('earliest attempt exhausted'),funded=await additional(exhausted,'later funded');
 await db(`update public.model_budget_scopes set task_attempt_limit=1 where id='${exhausted.scope}';
  insert into public.model_budget_attempts(scope_id,attempt_id,task_id,provider,model,price_version,reserved_micros,status)
  values('${exhausted.scope}','${uuid()}','${exhausted.task.id}','qwen','qwen3.7-plus-2026-05-26','synthetic-v1',1000,'released');`);
 holdPauseTurn=exhausted.task.turn;pauseHeld=false;const e=start(exhausted);await waitFor(()=>pauseHeld,'exhausted earliest pause');
 assert.equal(mapCalls,before.maps);assert.equal(modelCalls,before.model);await e.stop('SIGKILL');holdPauseTurn=null;
 for(const reply of heldResponses)reply();heldResponses.clear();
 const resumed=start(exhausted);await waitFor(async()=>await db(`select status from public.turns where id='${funded.task.turn}';`)==='completed','later funded task');await resumed.stop();
 assert.equal(mapCalls-before.maps,13);assert.equal(modelCalls-before.model,1);
 assert.equal(await db(`select count(*) from turn_private.result_artifacts where id='${exhausted.accepted.artifactId}';`),'0');
});

run('planning usage journal failure keeps pending cost and does not repeat the paid request',async()=>{
 const a=await owner('journal failure'),before={maps:mapCalls,model:modelCalls},controller=new AbortController();
 const mapper=async(input,init)=>{const url=typeof input==='string'?input:input instanceof URL?input.href:input.url??String(input),u=new URL(url);
  if(url.startsWith(STAGING+'/rest/v1/rpc/'))return fetch('http://127.0.0.1:'+gateway.address().port+u.pathname,init);
  if(url===QWEN)return fetch('http://127.0.0.1:'+model.address().port,init);
  if(u.origin==='https://restapi.amap.com')return fetch('http://127.0.0.1:'+maps.address().port+u.pathname+u.search,init);
  throw Error('closed fixture');};
 const worker=createHostedTextWorker(parseHostedWorkerProfile(profile(a)),{workerId:uuid(),build:'journal-failure',startedAt:new Date().toISOString(),
  qwenEndpoint:QWEN,workerCredential:()=>DB_KEY,providerCredential:()=>MODEL_KEY,planningEnabled:true,amapCredential:()=>MAP_KEY,fetch:mapper,
  journal:{job:async()=>{},usage:async()=>{},knowledge:async()=>{},destination:async()=>{},planningJob:async()=>{},
   planningUsage:async()=>{throw Error('Injected journal write failure');},event:async event=>{if(event.phase==='cycle')controller.abort();}}});
 await worker(controller.signal);assert.equal(modelCalls-before.model,1);assert.equal(mapCalls-before.maps,13);
 assert.equal(await db(`select status from public.model_budget_attempts where task_id='${a.task.id}';`),'pending');
 assert.equal(await db(`select state from turn_private.planning_comparisons where turn_id='${a.task.turn}';`),'paused_unknown');
 const n=rpcLog.length,restarted=start(a);await waitFor(()=>rpcLog.slice(n).includes('hosted_planning_target_v1'),'pending restart');await restarted.stop();
 assert.equal(modelCalls-before.model,1);assert.equal(mapCalls-before.maps,13);
 assert.equal(await db(`select count(*) from turn_private.result_artifacts where id='${a.accepted.artifactId}';`),'0');
});
