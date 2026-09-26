// Disposable PostgreSQL with synthetic identities only. This verifies the
// action boundary, not a real provider, hosted worker, or user result.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';

const enabled=process.env.VP_TURN_DB_TEST==='1',container='vpj80-actions-'+uuid().slice(0,8);
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const lit=v=>v===null?'null':"'"+String(v).replaceAll("'","''")+"'";
const call=async(role,name,params)=>{
 const body=Object.entries(params).map(([k,v])=>k+'=>'+lit(v)).join(',');
 const r=await sql(container,`set role ${role};set request.jwt.claim.role='${role}';select public.${name}(${body});`);
 return r.code===0?JSON.parse(r.stdout.trim()):{error:r.stderr};
};
let created=false;
before(async()=>{
 if(!enabled)return;
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);
 assert.equal(r.code,0,r.stderr);created=true;
 let ready=false;for(let i=0;i<60;i++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,250));}assert.ok(ready);
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));
 await db("create function auth.role() returns text language sql as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;create schema extensions;create extension pgcrypto with schema extensions;");
 const files=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
 const mine=files.findIndex(f=>f.endsWith('_vpj80_planning_action_receipts.sql'));assert.ok(mine>0);
 for(const f of files.slice(0,mine))await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
 const migration=readFileSync('supabase/migrations/'+files[mine],'utf8');
 await db('begin;'+migration+'rollback;');assert.equal(await db("select to_regclass('turn_private.planning_action_receipts') is null;"),'t');
 await db('begin;'+migration+'commit;');
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});

test('lease-bound planning receipts are durable, bounded, and fail closed on stale authority',{skip:!enabled,timeout:120000},async()=>{
 const ids={owner:uuid(),other:uuid(),session:uuid(),thread:uuid(),policy:uuid(),consent:uuid(),turn:uuid(),task:uuid(),conversation:uuid(),goal:uuid(),message:uuid(),lease:uuid()};
 const h='a'.repeat(64),d='b'.repeat(64),r='c'.repeat(64),notice='d'.repeat(64);
 await db(`insert into auth.users(id) values('${ids.owner}'),('${ids.other}');
 insert into identity_private.mobile_accounts(owner_id) values('${ids.owner}');
 insert into auth.sessions(id,user_id) values('${ids.session}','${ids.owner}');
 insert into public.chat_threads(id,owner_id) values('${ids.thread}','${ids.owner}');
 insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at)
 values('${ids.policy}','qwen','synthetic','https://example.test/v1','test','test','test','test','test','${notice}','合成告知','Synthetic notice','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day');
 insert into turn_private.text_consents(owner_id,policy_id,consent_id) values('${ids.owner}','${ids.policy}','${ids.consent}');
 insert into public.turns(id,owner_id,thread_id,status) values('${ids.turn}','${ids.owner}','${ids.thread}','accepted');
 insert into turn_private.text_content(turn_id,owner_id,thread_id,policy_id,consent_id,locale,input_text) values('${ids.turn}','${ids.owner}','${ids.thread}','${ids.policy}','${ids.consent}','en','Synthetic planning input');
 insert into turn_private.service_tasks(id,owner_id,thread_id,goal_turn_id,last_turn_id,policy_id,consent_id,scope_version,goal_digest) values('${ids.task}','${ids.owner}','${ids.thread}','${ids.turn}','${ids.turn}','${ids.policy}','${ids.consent}',1,'${h}');
 insert into turn_private.assistant_conversations(id,owner_id,policy_id,consent_id) values('${ids.conversation}','${ids.owner}','${ids.policy}','${ids.consent}');
 insert into turn_private.assistant_goals(id,conversation_id,owner_id,current_text) values('${ids.goal}','${ids.conversation}','${ids.owner}','Compare synthetic areas');
 insert into turn_private.assistant_messages(id,conversation_id,owner_id,sequence,idempotency_key,request_digest,policy_id,consent_id,locale,input_text,relationship,goal_id,scope_version,task_id)
 values('${ids.message}','${ids.conversation}','${ids.owner}',1,'${uuid()}','${h}','${ids.policy}','${ids.consent}','en','Compare synthetic areas','follow_up','${ids.goal}',1,'${ids.task}');
 insert into turn_private.work(turn_id,owner_id,session_id,state,attempt,max_attempts,lease_ms,lease_token,expires_at)
 values('${ids.turn}','${ids.owner}','${ids.session}','leased',1,3,300000,'${ids.lease}',now()+interval '5 minutes');`);
 const claim=(key=uuid().replaceAll('-','').padEnd(64,'0'),overrides={})=>call('service_role','claim_planning_action_v1',{
  p_turn_id:ids.turn,p_owner_id:ids.owner,p_lease_token:ids.lease,p_message_id:ids.message,
  p_action_key:key,p_tool_id:'evidence.lookup',p_input_digest:d,p_memory_basis:'[]',...overrides});
 const finish=(key,digest=r)=>call('service_role','finish_planning_action_v1',{
  p_turn_id:ids.turn,p_owner_id:ids.owner,p_lease_token:ids.lease,p_action_key:key,p_receipt_digest:digest});
 const key='1'.repeat(64);
 const raced=await Promise.all([claim(key),claim(key)]);
 assert.deepEqual(raced.map(x=>x.kind).sort(),['claimed','unknown'],'competing claimers execute once');
 assert.equal((await claim(key)).kind,'unknown','unacknowledged action never replays after another connection');
 assert.equal((await claim('2'.repeat(64))).kind,'unknown','unknown action blocks another effect');
 assert.equal((await finish(key)).kind,'completed');
 assert.equal((await claim(key)).kind,'duplicate');
 assert.equal((await claim(key,{p_input_digest:h})).kind,'conflict');
 assert.equal((await claim('2'.repeat(64))).kind,'claimed');
 assert.equal((await finish('2'.repeat(64),null)).kind,'unknown');
 assert.equal((await claim('3'.repeat(64))).kind,'unknown');
 assert.equal((await claim('3'.repeat(64),{p_owner_id:ids.other})).kind,'stale');
 assert.equal((await claim('3'.repeat(64),{p_lease_token:uuid()})).kind,'stale');
 for(const role of ['anon','authenticated']){
  const denied=await call(role,'claim_planning_action_v1',{p_turn_id:ids.turn,p_owner_id:ids.owner,p_lease_token:ids.lease,p_message_id:ids.message,p_action_key:'4'.repeat(64),p_tool_id:'evidence.lookup',p_input_digest:d,p_memory_basis:'[]'});
  assert.ok(denied.error?.includes('permission denied'));
 }
 assert.equal(await db(`select count(*) from turn_private.planning_action_receipts where turn_id='${ids.turn}';`),'2');
 // Synthetic operator reconciliation of the unknown receipt; the runtime has
 // no automatic reconciliation/redo path in this slice.
 await db(`update turn_private.planning_action_receipts set state='completed',receipt_digest='${r}' where turn_id='${ids.turn}' and action_key='${'2'.repeat(64)}';`);
 for(const digit of ['3','4']){assert.equal((await claim(digit.repeat(64))).kind,'claimed');assert.equal((await finish(digit.repeat(64))).kind,'completed');}
 assert.equal((await claim('5'.repeat(64))).kind,'step_limit','four persisted steps cap this Turn');
 // Reset only this disposable fixture to exercise a distinct memory-basis
 // scenario; no runtime code is allowed to erase action history.
 await db(`delete from turn_private.planning_action_receipts where turn_id='${ids.turn}';`);
 const memory=uuid(),memoryConsent=uuid(),memoryReceipt=uuid();
 await db(`begin;
 insert into public.memory_consents(id,owner_id,status) values('${memoryConsent}','${ids.owner}','granted');
 insert into public.memory_profiles(id,owner_id,source_receipt_id,consent_id,state,constraint_kind,summary)
 values('${memory}','${ids.owner}','${memoryReceipt}','${memoryConsent}','explicit','preference','Prefer quiet areas');
 insert into public.memory_receipts(id,owner_id,memory_id,event_state,source_kind)
 values('${memoryReceipt}','${ids.owner}','${memory}','explicit','user_confirmed');commit;`);
 const memoryBasis=JSON.stringify([{id:memory,revision:1}]);
 assert.equal((await claim('5'.repeat(64),{p_memory_basis:memoryBasis})).kind,'claimed');
 await db(`update public.memory_profiles set summary='Prefer quiet areas near rail' where id='${memory}';`);
 assert.equal((await finish('5'.repeat(64))).kind,'stale_basis','memory correction blocks old receipt completion');
 assert.equal((await claim('6'.repeat(64),{p_memory_basis:memoryBasis})).kind,'stale_basis','old memory revision blocks a new action');
 await db(`delete from turn_private.planning_action_receipts where turn_id='${ids.turn}';`);
 await db(`update turn_private.assistant_goals set scope_version=2 where id='${ids.goal}';`);
 assert.equal((await claim('7'.repeat(64))).kind,'stale_basis','a changed goal version invalidates the old step basis');
 await db(`update turn_private.assistant_goals set scope_version=1 where id='${ids.goal}';`);
 const scope=uuid(),attempt=uuid();
 await db(`insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at)
 values('${scope}','${ids.owner}','CNY',100000,10000,10,1,true,now()+interval '1 day');
 insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled)
 values('${scope}','qwen','synthetic','v1',100000,1000,true);
 insert into public.model_budget_attempts(scope_id,attempt_id,task_id,provider,model,price_version,reserved_micros,status)
 values('${scope}','${attempt}','${ids.task}','qwen','synthetic','v1',1000,'pending');`);
 assert.equal((await claim('7'.repeat(64))).kind,'unknown','unsettled cost blocks another effect');
 await db(`delete from public.model_budget_attempts where attempt_id='${attempt}';`);
 await db(`update turn_private.text_consents set revoked_at=clock_timestamp() where owner_id='${ids.owner}' and policy_id='${ids.policy}';`);
 assert.equal((await claim('7'.repeat(64))).kind,'stale_basis','revocation denies new effects');
 assert.equal((await finish(key)).kind,'stale','a revoked task cannot accept a receipt');
 await db(`update public.turns set status='cancelled' where id='${ids.turn}';`);
 assert.equal((await claim('8'.repeat(64))).kind,'stale','cancellation denies new effects');
});
