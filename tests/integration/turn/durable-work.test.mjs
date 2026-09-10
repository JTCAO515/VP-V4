import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID as uuid } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { command, sql } from '../cost/fixtures/postgres-rpc.mjs';
import { runDurableTurnWork } from '../../../lib/server/turn/durable-worker.ts';
const enabled=process.env.VP_TURN_DB_TEST==='1';
const container='vpj07-test-'+uuid().slice(0,8);
let created=false;
const run=(name,fn)=>test(name,{skip:!enabled},fn);
const db=async text=>{const r=await sql(container,text);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const lit=v=>typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const call=async(name,p={})=>{
  assert.ok(['enqueue_turn_work','claim_turn_work','finish_turn_work'].includes(name));
  assert.ok(Object.keys(p).every(k=>/^p_[a-z_]+$/.test(k)));
  return JSON.parse(await db('set role service_role; select public.'+name+'('+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');'));
};
async function fixture(max=3,owner=uuid()){
  const a={turn:uuid(),owner,session:uuid(),thread:uuid()};
  await db(`insert into auth.users values('${a.owner}') on conflict do nothing; insert into identity_private.mobile_accounts(owner_id) values('${a.owner}') on conflict do nothing; insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}'); insert into public.chat_threads(id,owner_id) values('${a.thread}','${a.owner}'); insert into public.turns(id,owner_id,thread_id,status) values('${a.turn}','${a.owner}','${a.thread}','accepted'); insert into public.chat_turn_events(owner_id,thread_id,turn_id,event_id,sequence,schema_version,event_type,state) values('${a.owner}','${a.thread}','${a.turn}','accepted',1,'turn-sse-v1','accepted','accepted');`);
  a.params={p_turn_id:a.turn,p_owner_id:a.owner,p_session_id:a.session,p_lease_ms:300000,p_max_attempts:max};
  return a;
}
const finish=(l,outcome='completed')=>call('finish_turn_work',{p_turn_id:l.turnId,p_lease_token:l.leaseToken,p_outcome:outcome});
const expire=l=>db(`update turn_private.work set expires_at=clock_timestamp()-interval '1 second' where turn_id='${l.turnId}';`);
const status=a=>db(`select status from public.turns where id='${a.turn}';`);
const terminals=a=>db(`select count(*) from public.chat_turn_events where turn_id='${a.turn}' and event_type='terminal';`);
before(async()=>{
  if(!enabled)return;
  const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
  assert.equal(r.code,0,r.stderr);created=true;
  assert.equal(JSON.parse((await command('docker',['inspect',container])).stdout)[0].HostConfig.NetworkMode,'none');
  let ready=false;for(let i=0;i<40;i++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0){ready=true;break;}await new Promise(r=>setTimeout(r,250));}assert.ok(ready);
  await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
  const migrations=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
  for(const file of migrations.slice(0,-1)) await db('begin;'+readFileSync('supabase/migrations/'+file,'utf8')+'commit;');
  const preserved=await fixture();
  const snapshot=()=>db(`select row_to_json(t) from public.turns t where id='${preserved.turn}'; select row_to_json(e) from public.chat_turn_events e where turn_id='${preserved.turn}';`);
  const prior=await snapshot();
  await db('begin;'+readFileSync('supabase/migrations/'+migrations.at(-1),'utf8')+'commit;');
  assert.equal(await snapshot(),prior,'new migration preserves existing Turn and events');
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
run('admission binds owner, session and immutable retry limits; duplicate admission is atomic',async()=>{
  const a=await fixture();assert.equal((await call('enqueue_turn_work',{...a.params,p_owner_id:uuid()})).kind,'unavailable');
  const r=await Promise.all([call('enqueue_turn_work',a.params),call('enqueue_turn_work',a.params)]);assert.deepEqual(r.map(x=>x.kind).sort(),['duplicate','queued']);
  assert.equal((await call('enqueue_turn_work',{...a.params,p_max_attempts:5})).kind,'conflict');
  await finish(await call('claim_turn_work'));
});
run('concurrent SQL clients claim once; expiry fences the old lease',async()=>{
  const a=await fixture();await call('enqueue_turn_work',a.params);
  const results=await Promise.all([call('claim_turn_work'),call('claim_turn_work')]);assert.deepEqual(results.map(x=>x.kind).sort(),['empty','leased']);
  const old=results.find(x=>x.kind==='leased');await expire(old);
  const fresh=await call('claim_turn_work');assert.equal(fresh.attempt,2);assert.notEqual(fresh.leaseToken,old.leaseToken);
  assert.equal((await finish(old)).kind,'stale');
  const done=await Promise.all([finish(fresh),finish(fresh)]);assert.deepEqual(done.map(x=>x.kind).sort(),['finished','stale']);
  assert.equal(await status(a),'completed');assert.equal(await terminals(a),'1');
});
run('retry exhaustion and expired final attempt quarantine exactly once',async()=>{
  for(const crash of [false,true]){
    const a=await fixture(1);await call('enqueue_turn_work',a.params);const lease=await call('claim_turn_work');
    if(crash){await expire(lease);assert.equal((await call('claim_turn_work')).kind,'empty');}else await finish(lease,'provider_failure');
    assert.equal(await status(a),'failed');assert.equal(await terminals(a),'1');assert.equal(await db(`select state from turn_private.work where turn_id='${a.turn}';`),'quarantined');
  }
});
run('real cancellation RPC and worker finish race produce one terminal',async()=>{
  for(let i=0;i<5;i++){
    const a=await fixture();await call('enqueue_turn_work',a.params);const l=await call('claim_turn_work');
    const [cancel,done]=await Promise.all([sql(container,`set request.jwt.claim.sub='${a.owner}'; set role authenticated; select * from public.cancel_chat_turn('${a.turn}');`),finish(l)]);
    assert.equal(await terminals(a),'1');const s=await status(a);assert.ok(['completed','cancelled'].includes(s));if(s==='cancelled'){assert.equal(cancel.code,0);assert.equal(done.kind,'stale');}
  }
});
run('revoked sessions, archived threads and mobile replacement reject late completion',async()=>{
  for(const change of ['revoke','archive','replace']){
    const a=await fixture();await call('enqueue_turn_work',a.params);const l=await call('claim_turn_work');
    await db(change==='revoke'?`delete from auth.sessions where id='${a.session}';`:change==='archive'?`update public.chat_threads set status='archived' where id='${a.thread}';`:`insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch) values('${a.owner}','${uuid()}','${a.session}',1); update identity_private.mobile_accounts set session_id='${uuid()}' where owner_id='${a.owner}';`);
    assert.equal((await finish(l)).kind,'unavailable');await expire(l);assert.equal((await call('claim_turn_work')).kind,'empty');assert.equal(await terminals(a),'0');
  }
});
run('ordinary roles cannot read the queue or call worker RPCs; deletion cascades',async()=>{
  const a=await fixture();await call('enqueue_turn_work',a.params);
  for(const role of ['anon','authenticated'])for(const q of ['select * from turn_private.work;','select public.claim_turn_work();',`select public.finish_turn_work('${a.turn}','${uuid()}','completed');`,`select public.enqueue_turn_work('${a.turn}','${a.owner}','${a.session}',1000,3);`])assert.notEqual((await sql(container,'set role '+role+';'+q)).code,0);
  await db(`delete from public.turns where id='${a.turn}';`);assert.equal(await db(`select count(*) from turn_private.work where turn_id='${a.turn}';`),'0');
});
run('TypeScript consumer uses durable finish; abort keeps work recoverable without late completion',async()=>{
  const a=await fixture();await call('enqueue_turn_work',a.params);
  assert.equal(await runDurableTurnWork(call,async()=> 'completed',new AbortController().signal),'finished');assert.equal(await status(a),'completed');
  const b=await fixture();await call('enqueue_turn_work',b.params);const controller=new AbortController();
  assert.equal(await runDurableTurnWork(call,async()=>{controller.abort();return 'completed';},controller.signal),'unavailable');assert.equal(await status(b),'accepted');
  const l=JSON.parse(await db(`select json_build_object('turnId',turn_id) from turn_private.work where turn_id='${b.turn}';`));await expire(l);await finish(await call('claim_turn_work'),'validation_failure');
});

run('SIGKILL after committed claim preserves work for a fresh process',async()=>{
  const a=await fixture();await call('enqueue_turn_work',a.params);
  const child=spawn(process.execPath,['tests/integration/turn/fixtures/crash-worker.mjs',container],{stdio:['ignore','pipe','pipe']});
  let lease;
  try {
    lease=await new Promise((resolve,reject)=>{
      let output='';const timer=setTimeout(()=>reject(Error('claim worker timeout')),10000);
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('exit',()=>{clearTimeout(timer);reject(Error('worker exited before claim'));});
      child.stdout.on('data',data=>{output+=data;if(output.includes('\n')){clearTimeout(timer);resolve(JSON.parse(output.trim()));}});
    });
    assert.equal(lease.kind,'leased');
  } finally {
    if(child.pid && child.exitCode===null && child.signalCode===null){
      const exited=once(child,'exit');child.kill('SIGKILL');
      let timer;
      try {await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('worker kill timeout')),3000);})]);}
      finally {clearTimeout(timer);}
    }
  }
  await expire(lease);const fresh=await call('claim_turn_work');assert.equal(fresh.attempt,2);
  assert.equal((await finish(lease)).kind,'stale');assert.equal((await finish(fresh)).kind,'finished');assert.equal(await terminals(a),'1');
});

run('retryable failure requeues, a fresh lease succeeds without duplicate terminal',async()=>{
  const a=await fixture();await call('enqueue_turn_work',a.params);const first=await call('claim_turn_work');
  assert.equal((await finish(first,'provider_failure')).kind,'queued');assert.equal(await terminals(a),'0');
  const second=await call('claim_turn_work');assert.equal(second.attempt,2);assert.equal((await finish(first)).kind,'stale');
  assert.equal((await finish(second)).kind,'finished');assert.equal(await terminals(a),'1');
});
run('competing claimers clean expired items across owners without accumulating owner locks',async()=>{
  for(let round=0;round<5;round++){
    const a=await fixture(1),b=await fixture(1);await call('enqueue_turn_work',a.params);await call('enqueue_turn_work',b.params);
    const oldA=await call('claim_turn_work'),oldB=await call('claim_turn_work');await expire(oldA);await expire(oldB);
    const a2=await fixture(3,a.owner),b2=await fixture(3,b.owner);await call('enqueue_turn_work',a2.params);await call('enqueue_turn_work',b2.params);
    const leases=[];
    for(let i=0;i<4 && leases.length<2;i++){
      const pair=await Promise.all([call('claim_turn_work'),call('claim_turn_work')]);leases.push(...pair.filter(l=>l.kind==='leased'));
    }
    assert.equal(leases.length,2);await Promise.all(leases.map(l=>finish(l)));
    for(const f of [a,b,a2,b2])assert.equal(await terminals(f),'1');
  }
});
