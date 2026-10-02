// Explicit local preparation: frozen backend SQL snapshot, no runtime migration
// or future bridge RPC is installed by this test. Synthetic actor claims only.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VPJ80_INTAKE_ADMISSION_PREP==='1',container='vpj80-intake-prep-'+uuid().slice(0,8);
const snapshot='4728c18f96d60138cbc6718fc31f5f10ae3ad20b',migration='20261002200000_vpj78_explicit_travel_intake.sql';
let created=false;
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const lit=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const query=(a,name,p)=>`begin;set role authenticated;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({session_id:a.session})}';select public.${name}(`+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');commit;';
const raw=(a,name,p)=>sql(container,query(a,name,p));
const call=async(a,name,p)=>{const r=await raw(a,name,p);assert.equal(r.code,0,r.stderr);return JSON.parse(r.stdout.trim());};
const projection={schemaVersion:'stay-area-intake/1',city:'shanghai',comparisonTarget:'area_transport',durationDays:10,partySize:2,interests:['food','photography'],pace:'relaxed',lodgingBudget:null,dates:null,mobilityConstraints:[]};
const notice='a'.repeat(64);
async function owner(){
 const a={owner:uuid(),session:uuid(),policy:uuid(),planningPolicy:uuid(),conversation:uuid(),goal:uuid(),source:uuid()};
 await db(`insert into auth.users(id) values('${a.owner}');insert into identity_private.mobile_accounts(owner_id) values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');
 insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at)
 values('${a.policy}','qwen','synthetic only','https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions','fixture','fixture','fixture','test','test','${notice}','合成','Synthetic','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day');
 insert into turn_private.planning_policies(id,text_policy_id,environment,notice_version,notice_hash,notice_zh,notice_en,effective_at,expires_at)
 values('${a.planningPolicy}','${a.policy}','staging','test','${notice}','合成','Synthetic',now()-interval '1 hour',now()+interval '1 day');`);
 await call(a,'accept_text_policy',{p_policy_id:a.policy,p_notice_hash:notice});await call(a,'accept_planning_policy_v1',{p_policy_id:a.planningPolicy,p_notice_hash:notice});
 a.input={p_conversation_id:a.conversation,p_goal_id:a.goal,p_message_id:a.source,p_parent_message_id:null,p_expected_goal_version:null,p_expected_intake_revision:0,p_idempotency_key:uuid(),p_policy_id:a.policy,p_locale:'en',p_text:'First China visit, ten days with partner, food and photography, relaxed pace.',p_relationship:'goal_start',p_intake:projection,p_memory_basis:[]};
 a.receipt=await call(a,'submit_assistant_travel_intake_v1',a.input);return a;
}
const planning=a=>({p_conversation_id:a.conversation,p_goal_id:a.goal,p_expected_goal_version:1,p_parent_message_id:a.source,p_message_id:uuid(),p_message_key:uuid(),p_thread_id:uuid(),p_turn_id:uuid(),p_task_id:uuid(),p_task_key:uuid(),p_text_policy_id:a.policy,p_planning_policy_id:a.planningPolicy,p_locale:'en',p_text:'Compare Shanghai areas',p_memory_basis:[]});
const correction=a=>({...a.input,p_message_id:uuid(),p_parent_message_id:a.source,p_expected_goal_version:1,p_expected_intake_revision:1,p_idempotency_key:uuid(),p_text:'Explicit full correction to balanced pace',p_relationship:'amendment',p_intake:{...projection,pace:'balanced'}});
const state=a=>db(`select jsonb_build_object('goalVersion',g.scope_version,'text',g.current_text,'sequence',c.next_sequence,'messages',(select count(*) from turn_private.assistant_messages where goal_id=g.id),'intakes',(select count(*) from turn_private.assistant_travel_intakes where goal_id=g.id),'tasks',(select count(*) from turn_private.service_tasks where owner_id=g.owner_id),'work',(select count(*) from turn_private.work where owner_id=g.owner_id),'planning',(select count(*) from turn_private.planning_comparisons where owner_id=g.owner_id),'capacity',(select count(*) from turn_private.service_task_capacity where owner_id=g.owner_id),'attempts',(select count(*) from public.model_budget_attempts b join public.model_budget_scopes s on s.id=b.scope_id where s.owner_id=g.owner_id)) from turn_private.assistant_goals g join turn_private.assistant_conversations c on c.id=g.conversation_id where g.id='${a.goal}';`);
before(async()=>{
 if(!enabled)return;
 const image='public.ecr.aws/supabase/postgres:17.6.1.159';const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh',image,'-c','umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(r.code,0,r.stderr);created=true;
 for(let i=0;i<100;i++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f!==migration).sort())await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
 const fixed=await command('git',['show',snapshot+':supabase/migrations/'+migration]);assert.equal(fixed.code,0,'Frozen backend snapshot must exist locally; not an arbitrary fallback. '+fixed.stderr);await db('begin;'+fixed.stdout+'commit;');
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
run('legacy planning admission invalidates current typed source without replacing its binding',async t=>{
 t.diagnostic(JSON.stringify({container,snapshot,network:'none',socket:'/tmp/vpj59-socket'}));
 const a=await owner(),p=planning(a);assert.equal(a.receipt.current,true);
 const before=await call(a,'read_assistant_travel_intake_v1',{p_policy_id:a.policy,p_conversation_id:a.conversation,p_goal_id:a.goal});assert.equal(before.contextDigest,a.receipt.contextDigest);
 const r=await call(a,'submit_planning_comparison_v1',p);assert.equal(r.kind,'accepted');
 t.diagnostic(JSON.stringify({admission:r,originalIntakeReceipt:a.receipt}));
 const after=await call(a,'read_assistant_travel_intake_v1',{p_policy_id:a.policy,p_conversation_id:a.conversation,p_goal_id:a.goal});assert.deepEqual(after,{kind:'unavailable',reason:'stale_basis'});t.diagnostic(JSON.stringify({qualifiedReadBefore:before,qualifiedReadAfter:after,state:JSON.parse(await state(a))}));
 assert.equal(await db(`select turn_private.assistant_travel_current_basis_v1('${a.owner}','${a.source}') is null;`),'t');
 assert.equal(await db(`select count(*) from turn_private.assistant_travel_intakes where message_id='${p.p_message_id}';`),'0','new planning message has no typed binding');
 assert.equal((await call(a,'submit_assistant_travel_intake_v1',a.input)).current,false,'historical receipt cannot revive authority');
});
run('same legacy admission request races atomically and creates one Task/Turn/artifact identity',async()=>{
 const a=await owner(),p=planning(a),r=await Promise.all([raw(a,'submit_planning_comparison_v1',p),raw(a,'submit_planning_comparison_v1',p)]);for(const x of r)assert.equal(x.code,0,x.stderr);
 const receipts=r.map(x=>JSON.parse(x.stdout.trim()));assert.equal(receipts[0].artifactId,receipts[1].artifactId);assert.deepEqual(receipts.map(x=>x.reused).sort(),[false,true]);
 const s=JSON.parse(await state(a));assert.equal(s.tasks,1);assert.equal(s.work,1);assert.equal(s.planning,1);assert.equal(s.messages,2);assert.equal(s.intakes,1);assert.equal(s.attempts,0);
});
run('explicit correction versus legacy admission has one winner and the losing transaction rolls back',async()=>{
 const a=await owner(),p=planning(a),r=await Promise.all([raw(a,'submit_planning_comparison_v1',p),raw(a,'submit_assistant_travel_intake_v1',correction(a))]);
 assert.deepEqual(r.map(x=>x.code===0).sort(),[false,true]);assert.match(r.find(x=>x.code!==0).stderr,/SERVICE_TASK_CONFLICT/);
 const s=JSON.parse(await state(a));assert.equal(s.messages,2);assert.equal(s.attempts,0);
 if(r[0].code===0){assert.equal(s.tasks,1);assert.equal(s.intakes,1);assert.equal(s.goalVersion,1);}else{assert.equal(s.tasks,0);assert.equal(s.work,0);assert.equal(s.planning,0);assert.equal(s.capacity,0);assert.equal(s.intakes,2);assert.equal(s.goalVersion,2);}
 const before=await state(a);const fail=await raw(a,'submit_planning_comparison_v1',{...planning(a),p_expected_goal_version:999});assert.notEqual(fail.code,0);assert.match(fail.stderr,/SERVICE_TASK_CONFLICT/);assert.equal(await state(a),before,'late goal-CAS failure rolls back Task/Turn/work/message/capacity');
});

run('controlled lock waits in both writer orders preserve rollback and never deadlock',async t=>{
 for(const first of ['correction','planning']){
  const a=await owner(),p=planning(a),c=correction(a),tag='vpj80-prep-'+uuid().slice(0,8);
  const firstName=first==='correction'?'submit_assistant_travel_intake_v1':'submit_planning_comparison_v1';
  const secondName=first==='correction'?'submit_planning_comparison_v1':'submit_assistant_travel_intake_v1';
  const firstQuery=query(a,firstName,first==='correction'?c:p).replace('begin;',`begin;set application_name='${tag}-first';`).replace('commit;',"select pg_sleep(2);commit;");
  const runningFirst=sql(container,firstQuery);
  const wait=async predicate=>{const end=Date.now()+4000;while(await db(predicate)!=='t'){if(Date.now()>end)assert.fail('controlled lock barrier missing');await new Promise(r=>setTimeout(r,20));}};
  await wait(`select exists(select 1 from pg_stat_activity where application_name='${tag}-first' and wait_event='PgSleep');`);
  const runningSecond=sql(container,query(a,secondName,first==='correction'?p:c).replace('begin;',`begin;set application_name='${tag}-second';`));
  await wait(`select exists(select 1 from pg_stat_activity where application_name='${tag}-second' and wait_event_type='Lock');`);
  const results=await Promise.all([runningFirst,runningSecond]);assert.equal(results[0].code,0,results[0].stderr);assert.notEqual(results[1].code,0);assert.match(results[1].stderr,/SERVICE_TASK_CONFLICT/);assert.ok(!results[1].stderr.includes('deadlock'));
  const s=JSON.parse(await state(a));assert.equal(s.messages,2);assert.equal(s.attempts,0);
  if(first==='correction'){assert.equal(s.tasks,0);assert.equal(s.work,0);assert.equal(s.planning,0);assert.equal(s.capacity,0);assert.equal(s.intakes,2);assert.equal(s.goalVersion,2);}else{assert.equal(s.tasks,1);assert.equal(s.work,1);assert.equal(s.planning,1);assert.equal(s.intakes,1);assert.equal(s.goalVersion,1);}
  t.diagnostic(JSON.stringify({first,observedWait:'Lock',firstExit:results[0].code,secondExit:results[1].code,secondError:results[1].stderr.trim(),state:s}));
 }
});
