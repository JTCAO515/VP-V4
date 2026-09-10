import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { runWithDurableBudget } from '../../../lib/server/model-gateway/budget/durable.ts';
import { stopDurableBudget } from '../../../lib/server/model-gateway/budget/stop.ts';
import { command, sql, rpc } from './fixtures/postgres-rpc.mjs';
const enabled = process.env.VP_BUDGET_DB_TEST === '1';
const container = 'vpj59-test-'+randomUUID().slice(0,8), image='public.ecr.aws/supabase/postgres:17.6.1.159';
const uuid = randomUUID; let created = false;
const run = (name, fn) => test(name, { skip: !enabled }, fn);
const db = async text => { const r=await sql(container,text); assert.equal(r.code,0,r.stderr); return r.stdout.trim(); };
const call = rpc(container);
const identity = a => ({p_scope_id:a.scopeId,p_owner_id:a.ownerId,p_attempt_id:a.attemptId});
const reserve = a => call('reserve_model_budget',{...identity(a),p_task_id:a.taskId,p_provider:a.provider,p_model:a.model,p_price_version:a.priceVersion,p_reserved_micros:a.reservedMicros});
const dispatch = a => call('dispatch_model_budget',identity(a));
const finish = (a,action,actual=null) => call('finish_model_budget',{...identity(a),p_action:action,p_actual_micros:actual});
async function fixture({limit=1000,task=1000,provider=1000,attempt=1000,concurrency=10,attempts=10}={}) {
  attempt=Math.min(attempt,provider);
  const a={scopeId:uuid(),ownerId:uuid(),taskId:uuid(),attemptId:uuid(),provider:'deepseek',model:'test-model',priceVersion:'test-price',reservedMicros:100,timeoutMs:200};
  await db(`insert into auth.users values ('${a.ownerId}'); insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at) values ('${a.scopeId}','${a.ownerId}','CNY',${limit},${task},${attempts},${concurrency},true,now()+interval '1 hour'); insert into public.model_budget_provider_limits values ('${a.scopeId}','deepseek','test-model','test-price',${provider},${attempt},true);`);
  return a;
}
const state = async a => JSON.parse(await db(`select json_build_object('status',status,'actual',actual_micros,'reserved',reserved_micros) from public.model_budget_attempts where scope_id='${a.scopeId}' and attempt_id='${a.attemptId}';`));
before(async()=>{
  if(!enabled)return;
  const start=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh',image,'-c','umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(start.code,0);created=true;
  const inspected=JSON.parse((await command('docker',['inspect',container])).stdout)[0];assert.equal(inspected.HostConfig.NetworkMode,'none');assert.deepEqual(inspected.HostConfig.PortBindings??{},{});
  let ready=false;for(let i=0;i<40;i++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0){ready=true;break;}await new Promise(r=>setTimeout(r,250));}assert.equal(ready,true);
  // Minimal Auth FK fixture only. These tests exercise PostgreSQL roles/locks, not GoTrue/JWT.
  await db('create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create schema auth; create table auth.users(id uuid primary key);');
  await db(readFileSync('supabase/migrations/20260909184816_vpj_59_durable_model_budget.sql','utf8'));
  const upgrade=await fixture();await reserve(upgrade);await dispatch(upgrade);await finish(upgrade,'pending');
  const original=await state(upgrade);
  await db('begin;'+readFileSync('supabase/migrations/20260910190526_vpj_59_stop_model_budget.sql','utf8')+'commit;');
  assert.deepEqual(await state(upgrade),original,'append-only upgrade preserves unknown cost');
  assert.equal(await db(`select enabled from public.model_budget_scopes where id='${upgrade.scopeId}';`),'t','migration must not change existing activation');
});
after(async()=>{if(created){assert.equal((await command('docker',['rm','-f',container])).code,0);assert.notEqual((await command('docker',['inspect',container])).code,0);}});
run('two separate SQL clients reserve and dispatch one duplicate attempt only once',async()=>{
  const a=await fixture();const admitted=await Promise.all([reserve(a),reserve(a)]);assert.deepEqual(admitted.map(x=>x.kind).sort(),['duplicate','reserved']);
  const dispatched=await Promise.all([dispatch(a),dispatch(a)]);assert.deepEqual(dispatched.map(x=>x.kind).sort(),['dispatched','duplicate']);assert.equal((await state(a)).reserved,100);
  assert.equal((await reserve({...a,reservedMicros:101})).kind,'conflict');
});
run('scope, provider, task, attempt and concurrency caps are atomic',async()=>{
  for(const limits of [{limit:100,task:100},{provider:100},{task:100},{concurrency:1}]){
    const a=await fixture(limits),b={...a,attemptId:uuid()};const results=await Promise.all([reserve(a),reserve(b)]);assert.deepEqual(results.map(x=>x.kind).sort(),['exhausted','reserved']);
  }
  const small=await fixture({attempt:99});assert.equal((await reserve(small)).kind,'exhausted');
  const a=await fixture({attempts:1});await reserve(a);await finish(a,'release');assert.equal((await reserve({...a,attemptId:uuid()})).kind,'exhausted');
});
run('task cap is shared across provider attempts and provider caps cannot be transferred',async()=>{
  const a=await fixture({task:100,provider:100});await db(`insert into public.model_budget_provider_limits values ('${a.scopeId}','qwen','test-model','test-price',1000,1000,true);`);await reserve(a);
  assert.equal((await reserve({...a,provider:'qwen',attemptId:uuid()})).kind,'exhausted');
  assert.equal((await reserve({...a,taskId:uuid(),attemptId:uuid()})).kind,'exhausted');
  assert.equal((await reserve({...a,provider:'qwen',taskId:uuid(),attemptId:uuid()})).kind,'reserved');
});
run('owner/model/price mismatch and ordinary database roles cannot use the ledger',async()=>{
  const a=await fixture();for(const change of [{ownerId:uuid()},{model:'different'},{priceVersion:'different'}])assert.equal((await reserve({...a,...change})).kind,'unavailable');
  for(const role of ['anon','authenticated']){
    for(const query of ['select * from public.model_budget_scopes;',`select public.dispatch_model_budget('${a.scopeId}','${a.ownerId}','${a.attemptId}');`,`select public.reserve_model_budget('${a.scopeId}','${a.ownerId}','${a.taskId}','${a.attemptId}','deepseek','test-model','test-price',100);`,`select public.finish_model_budget('${a.scopeId}','${a.ownerId}','${a.attemptId}','release',null);`])assert.notEqual((await sql(container,'set role '+role+';'+query)).code,0);
  }
});
run('kill and expiry are consumed after reserve and before provider callback',async()=>{
  for(const change of ['enabled=false',"expires_at=now()-interval '1 second'",'task_limit_micros=50']){
    const a=await fixture();let invoked=0;const wrapped=async(name,p)=>{const result=await call(name,p);if(name==='reserve_model_budget')await db(`update public.model_budget_scopes set ${change} where id='${a.scopeId}';`);return result;};
    const result=await runWithDurableBudget(a,wrapped,async()=>{invoked++;return {value:'fake',actualMicros:10};},new AbortController().signal);assert.equal(result.kind,'unavailable');assert.equal(invoked,0);assert.equal((await state(a)).status,'released');
  }
});
run('settlement is idempotent; conflicting costs cannot overwrite and overrun freezes admission',async()=>{
  const a=await fixture();await reserve(a);assert.equal((await finish(a,'settle',10)).kind,'conflict');await dispatch(a);assert.equal((await finish(a,'release')).kind,'conflict');
  assert.deepEqual(await finish(a,'settle',120),{kind:'settled',overrun:true});assert.equal((await finish(a,'settle',120)).kind,'duplicate');assert.equal((await finish(a,'settle',119)).kind,'conflict');assert.equal((await state(a)).actual,120);
  assert.equal((await reserve({...a,taskId:uuid(),attemptId:uuid()})).kind,'disabled');
});
run('consumer settles actual usage and returns duplicate without invoking again',async()=>{
  const a=await fixture();let invoked=0;const invoke=async()=>{invoked++;return {value:'synthetic',actualMicros:20};};
  assert.deepEqual(await runWithDurableBudget(a,call,invoke,new AbortController().signal),{kind:'completed',value:'synthetic',accounting:'settled'});
  assert.equal((await runWithDurableBudget(a,call,invoke,new AbortController().signal)).kind,'unavailable');assert.equal(invoked,1);assert.equal((await state(a)).actual,20);
});
run('unknown usage, timeout and cancellation retain reservations; late results do not settle',async()=>{
  const a=await fixture({concurrency:1});assert.equal((await runWithDurableBudget(a,call,async()=>({value:'synthetic',actualMicros:null}),new AbortController().signal)).accounting,'pending');assert.equal((await state(a)).reserved,100);assert.equal((await reserve({...a,attemptId:uuid()})).kind,'exhausted');
  const b=await fixture();b.timeoutMs=10;const result=await runWithDurableBudget(b,call,async()=>{await new Promise(r=>setTimeout(r,50));return {value:'late',actualMicros:2};},new AbortController().signal);assert.deepEqual(result,{kind:'unavailable',reason:'timeout'});await new Promise(r=>setTimeout(r,60));assert.equal((await state(b)).status,'pending');
  const c=await fixture(),controller=new AbortController();const cancelled=await runWithDurableBudget(c,call,async()=>{controller.abort();return new Promise(()=>{});},controller.signal);assert.deepEqual(cancelled,{kind:'unavailable',reason:'cancelled'});assert.equal((await state(c)).status,'pending');
});
run('killed worker retains dispatched cost across a fresh worker process',async()=>{
  const a=await fixture({concurrency:1});a.timeoutMs=300000;
  const child=spawn(process.execPath,['--experimental-strip-types','tests/integration/cost/fixtures/crash-worker.mjs',container,JSON.stringify(a)],{stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('worker did not dispatch'));},15000);child.stdout.on('data',b=>{text+=b;if(text.includes('DISPATCHED')){clearTimeout(timer);resolve();}});child.on('error',reject);child.on('exit',code=>{if(!text.includes('DISPATCHED')){clearTimeout(timer);reject(Error('worker exited before dispatch '+code));}});});
  const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGKILL');await stopped;
  assert.equal((await state(a)).status,'dispatched');assert.equal((await reserve(a)).kind,'duplicate');assert.equal((await reserve({...a,attemptId:uuid()})).kind,'exhausted');
  assert.deepEqual(await stopDurableBudget({scopeId:a.scopeId,ownerId:a.ownerId},call),{kind:'stopped',released:0,pending:1});assert.equal((await state(a)).reserved,100);assert.equal((await finish(a,'settle',30)).kind,'settled');assert.equal((await reserve({...a,attemptId:uuid()})).kind,'disabled');
});
run('atomic stop releases only unsent work and retains unknown charge across repeat stop',async()=>{
  const a=await fixture(),b={...a,attemptId:uuid()},c={...a,attemptId:uuid()},d={...a,attemptId:uuid()};
  for(const item of [a,b,c,d])await reserve(item);
  await dispatch(b);await dispatch(c);await finish(c,'pending');await dispatch(d);await finish(d,'settle',20);
  const beforeC=await state(c),beforeD=await state(d);
  assert.deepEqual(await stopDurableBudget({scopeId:a.scopeId,ownerId:a.ownerId},call),{kind:'stopped',released:1,pending:1});
  assert.deepEqual(await state(a),{status:'released',actual:null,reserved:100});
  assert.deepEqual(await state(b),{status:'pending',actual:null,reserved:100});
  assert.deepEqual(await state(c),beforeC);assert.deepEqual(await state(d),beforeD);
  assert.deepEqual(await stopDurableBudget({scopeId:a.scopeId,ownerId:a.ownerId},call),{kind:'stopped',released:0,pending:0});
  assert.equal((await reserve({...a,attemptId:uuid()})).kind,'disabled');
  assert.equal((await finish(b,'release')).kind,'conflict');
  // Authorized server re-enable is a separate action; unknown reservations still count.
  await db(`update public.model_budget_scopes set enabled=true,concurrency_limit=2 where id='${a.scopeId}';`);
  assert.equal((await reserve({...a,attemptId:uuid()})).kind,'exhausted');
  assert.equal((await finish(b,'settle',30)).kind,'settled');
  assert.equal((await reserve({...a,attemptId:uuid()})).kind,'reserved');
});
run('stop races dispatch and new reservation without releasing dispatched work',async()=>{
  for(let i=0;i<5;i++){
    const a=await fixture();await reserve(a);
    const [sent,stopped]=await Promise.all([dispatch(a),stopDurableBudget({scopeId:a.scopeId,ownerId:a.ownerId},call)]);
    assert.equal(stopped.kind,'stopped');
    if(sent.kind==='dispatched'){
      assert.equal(stopped.released,0);assert.equal(stopped.pending,1);assert.equal((await state(a)).status,'pending');
    }else{
      assert.equal(sent.kind,'duplicate');assert.equal(stopped.released,1);assert.equal(stopped.pending,0);assert.equal((await state(a)).status,'released');
    }
    assert.notEqual((await dispatch(a)).kind,'dispatched');
    const b=await fixture();
    const [admitted]=await Promise.all([reserve(b),stopDurableBudget({scopeId:b.scopeId,ownerId:b.ownerId},call)]);
    assert.ok(['reserved','disabled'].includes(admitted.kind));
    if(admitted.kind==='reserved')assert.equal((await state(b)).status,'released');
    assert.notEqual((await dispatch(b)).kind,'dispatched');
  }
});
run('stop cannot target another owner or run under ordinary roles; in-flight usage still settles',async()=>{
  const a=await fixture();await reserve(a);await dispatch(a);
  assert.deepEqual(await stopDurableBudget({scopeId:a.scopeId,ownerId:uuid()},call),{kind:'unavailable'});
  assert.equal((await state(a)).status,'dispatched');
  for(const role of ['anon','authenticated'])assert.notEqual((await sql(container,`set role ${role}; select public.stop_model_budget('${a.scopeId}','${a.ownerId}');`)).code,0);
  await stopDurableBudget({scopeId:a.scopeId,ownerId:a.ownerId},call);
  assert.deepEqual(await finish(a,'settle',120),{kind:'settled',overrun:true});
  assert.equal((await reserve({...a,attemptId:uuid()})).kind,'disabled');
  assert.equal(await db(`select frozen and not enabled from public.model_budget_scopes where id='${a.scopeId}';`),'t');
});
run('lost stop acknowledgment retries safely without clearing unknown holds',async()=>{
  const a=await fixture();await reserve(a);await dispatch(a);
  const uncertain=async(name,p)=>{await call(name,p);throw Error('lost acknowledgment');};
  assert.deepEqual(await stopDurableBudget({scopeId:a.scopeId,ownerId:a.ownerId},uncertain),{kind:'unavailable'});
  assert.deepEqual(await stopDurableBudget({scopeId:a.scopeId,ownerId:a.ownerId},call),{kind:'stopped',released:0,pending:0});
  assert.deepEqual(await state(a),{status:'pending',actual:null,reserved:100});
});
