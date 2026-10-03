// Explicit network-none preparation only; all dependencies from this current checkout.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_TURN_DB_TEST==='1',container='vpj78-model-binding-'+uuid().slice(0,8);
const mine='20261003050000_vpj78_v2_model_attempt_binding.sql';
let created=false;
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const lit=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const query=(a,name,p)=>`begin;set role authenticated;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({session_id:a.session})}';select public.${name}(`+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');commit;';
const call=async(a,name,p)=>{const r=await sql(container,query(a,name,p));assert.equal(r.code,0,r.stderr);return JSON.parse(r.stdout.trim());};
const memoryCall=async(a,name,p)=>{const r=await sql(container,query(a,name,p).replace('select public.',"select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from public.").replace(');commit;',') m;commit;'));assert.equal(r.code,0,r.stderr);return JSON.parse(r.stdout.trim());};
const projection={schemaVersion:'stay-area-intake/1',city:'shanghai',comparisonTarget:'area_transport',durationDays:10,partySize:2,interests:['food','photography'],pace:'relaxed',lodgingBudget:null,dates:null,mobilityConstraints:[]};
const notice='a'.repeat(64);
async function owner(environment='local_synthetic',locale='en',goalText='First China visit, ten days with partner, food and photography, relaxed pace.',memory=false){
 const a={owner:uuid(),session:uuid(),policy:uuid(),planningPolicy:uuid(),conversation:uuid(),goal:uuid(),source:uuid()};
 await db(`insert into auth.users(id) values('${a.owner}');insert into identity_private.mobile_accounts(owner_id) values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');
 insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at)
 values('${a.policy}','qwen','synthetic only','https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions','fixture','fixture','fixture','test','test','${notice}','合成','Synthetic','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day');
 insert into turn_private.planning_policies(id,text_policy_id,environment,notice_version,notice_hash,notice_zh,notice_en,effective_at,expires_at)
 values('${a.planningPolicy}','${a.policy}','${environment}','test','${notice}','合成','Synthetic',now()-interval '1 hour',now()+interval '1 day');`);
 await call(a,'accept_text_policy',{p_policy_id:a.policy,p_notice_hash:notice});await call(a,'accept_planning_policy_v1',{p_policy_id:a.planningPolicy,p_notice_hash:notice});
 a.refs=[];if(memory){a.memoryConsent=(await memoryCall(a,'create_memory_retrieval_consent',{}))[0].consent_id;a.memoryId=uuid();await memoryCall(a,'create_explicit_memory_profile_v2',{p_memory_id:a.memoryId,p_receipt_id:uuid(),p_consent_id:a.memoryConsent,p_constraint_kind:'preference',p_summary:'Synthetic explicit Memory'});a.refs=[{id:a.memoryId,revision:1}];}
 a.input={p_conversation_id:a.conversation,p_goal_id:a.goal,p_message_id:a.source,p_parent_message_id:null,p_expected_goal_version:null,p_expected_intake_revision:0,p_idempotency_key:uuid(),p_policy_id:a.policy,p_locale:locale,p_text:goalText,p_relationship:'goal_start',p_intake:projection,p_memory_basis:a.refs};
 a.receipt=await call(a,'submit_assistant_travel_intake_v1',a.input);return a;
}
const planning=a=>({p_conversation_id:a.conversation,p_goal_id:a.goal,p_expected_goal_version:1,p_parent_message_id:a.source,p_message_id:uuid(),p_message_key:uuid(),p_thread_id:uuid(),p_turn_id:uuid(),p_task_id:uuid(),p_task_key:uuid(),p_text_policy_id:a.policy,p_planning_policy_id:a.planningPolicy,p_locale:a.input.p_locale,p_text:'Compare Shanghai areas',p_memory_basis:a.refs});
const correction=a=>({...a.input,p_message_id:uuid(),p_parent_message_id:a.source,p_expected_goal_version:1,p_expected_intake_revision:1,p_idempotency_key:uuid(),p_text:'Explicit full correction to balanced pace',p_relationship:'amendment',p_intake:{...projection,pace:'balanced'}});
const state=a=>db(`select jsonb_build_object('goalVersion',g.scope_version,'text',g.current_text,'sequence',c.next_sequence,'messages',(select count(*) from turn_private.assistant_messages where goal_id=g.id),'intakes',(select count(*) from turn_private.assistant_travel_intakes where goal_id=g.id),'tasks',(select count(*) from turn_private.service_tasks where owner_id=g.owner_id),'work',(select count(*) from turn_private.work where owner_id=g.owner_id),'planning',(select count(*) from turn_private.planning_comparisons where owner_id=g.owner_id),'capacity',(select count(*) from turn_private.service_task_capacity where owner_id=g.owner_id),'attempts',(select count(*) from public.model_budget_attempts b join public.model_budget_scopes s on s.id=b.scope_id where s.owner_id=g.owner_id)) from turn_private.assistant_goals g join turn_private.assistant_conversations c on c.id=g.conversation_id where g.id='${a.goal}';`);
before(async()=>{
 if(!enabled)return;
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(r.code,0,r.stderr);created=true;
 for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 const migrations=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
 for(const f of migrations.filter(f=>f<mine))await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');

 const m=readFileSync('supabase/migrations/'+mine,'utf8');await db('begin;'+m+'rollback;');assert.equal(await db("select to_regclass('turn_private.planning_v2_model_attempt_bindings') is null;"),'t');await db('begin;'+m+'commit;');
 // Apply every later dependent migration only after the original rollback/apply probe.
 for(const f of migrations.filter(f=>f>mine))await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
const v2=a=>({...planning(a),p_expected_intake_message_id:a.source,p_expected_source_sequence:1,p_expected_intake_revision:1,p_expected_intake_digest:a.receipt.contextDigest,p_intake:projection});
const bound=async(a,r,lease=null)=>JSON.parse(await db(`select turn_private.read_planning_qualified_intake_v1('${a.owner}','${r.turnId}',${lit(lease)});`));

const svc=async(name,p)=>JSON.parse(await db("set role service_role;set request.jwt.claim.role='service_role';select public."+name+'('+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');'));
async function fixture(memory=false,mode='v2'){const a=await owner('local_synthetic','en','Synthetic model binding fixture',memory),r=mode==='v2'?await call(a,'submit_planning_comparison_v2',v2(a)):await call(a,'submit_planning_comparison_v1',planning(a)),lease=uuid(),scope=uuid(),attempt=uuid();await db(`update turn_private.work set state='leased',lease_token='${lease}',expires_at=clock_timestamp()+interval '120 seconds' where turn_id='${r.turnId}';
 insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at) values('${scope}','${a.owner}','CNY',10000,1000,3,3,true,now()+interval '1 day');insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled) values('${scope}','qwen','synthetic-model','synthetic-v1',10000,1000,true);`);
 assert.deepEqual(await svc('reserve_model_budget',{p_scope_id:scope,p_owner_id:a.owner,p_task_id:r.taskId,p_attempt_id:attempt,p_provider:'qwen',p_model:'synthetic-model',p_price_version:'synthetic-v1',p_reserved_micros:10}),{kind:'reserved'});return {a,r,lease,scope,attempt};}
const blocked={kind:'blocked'},args=x=>[x.a.owner,x.r.taskId,x.r.turnId,x.lease,x.a.policy,x.a.planningPolicy,x.scope,x.attempt,'qwen','synthetic-model','synthetic-v1',x.r.intakeContextDigest,x.r.planningContextDigest];
const privateQuery=(name,p)=>`select turn_private.${name}(${p.map(lit).join(',')});`;
const invoke=async(name,x,p=args(x))=>JSON.parse(await db(privateQuery(name,p)));
const bind=x=>invoke('bind_planning_v2_model_attempt_v1',x),read=x=>invoke('read_planning_v2_model_binding_v1',x),unknown=x=>invoke('unknown_planning_v2_model_attempt_v1',x);
const ledger=x=>db(`select jsonb_agg(to_jsonb(a)) from public.model_budget_attempts a where task_id='${x.r.taskId}';`),stored=x=>db(`select coalesce(jsonb_agg(to_jsonb(b)),'[]') from turn_private.planning_v2_model_attempt_bindings b where turn_id='${x.r.turnId}';`);
const dispatch=x=>svc('dispatch_model_budget',{p_scope_id:x.scope,p_owner_id:x.a.owner,p_attempt_id:x.attempt});
const finish=(x,action,actual=null)=>svc('finish_model_budget',{p_scope_id:x.scope,p_owner_id:x.a.owner,p_attempt_id:x.attempt,p_action:action,p_actual_micros:actual});
run('first binding only reserved/live scope and exact full tuple, zero ledger writes',async t=>{
 const x=await fixture(),before=await ledger(x);assert.deepEqual(await read(x),blocked);
 for(const [index,value]of [[0,uuid()],[1,uuid()],[2,uuid()],[3,null],[3,uuid()],[4,uuid()],[5,uuid()],[6,uuid()],[7,uuid()],[8,'glm'],[9,'other-model'],[10,'other-price'],[11,'c'.repeat(64)],[12,'d'.repeat(64)]]){const p=args(x);p[index]=value;assert.deepEqual(await invoke('bind_planning_v2_model_attempt_v1',x,p),blocked);assert.equal(await stored(x),'[]');assert.equal(await ledger(x),before);}
 const b=await bind(x);assert.equal(b.reused,false);assert.equal(b.ledgerStatus,'reserved');assert.equal(b.actualMicros,null);assert.equal(b.executionAllowed,false);assert.equal(b.readyForProvider,false);assert.equal(b.executionAvailable,false);assert.equal(b.reconciliationRequired,false);assert.equal(await ledger(x),before);
 const again=await bind(x);assert.equal(again.reused,true);assert.equal(await ledger(x),before);assert.equal(JSON.parse(await stored(x)).length,1);
 t.diagnostic(JSON.stringify({network:'none',container,base:'f97ecc5d',migration:mine,providerCalls:0}));
});
run('dispatched/pending/settled/released cannot receive retroactive first binding',async()=>{
 for(const status of ['dispatched','pending','settled','released']){const x=await fixture();if(status==='released')await finish(x,'release');else {await dispatch(x);if(status==='pending')await finish(x,'pending');if(status==='settled')await finish(x,'settle',3);}
  const before=await ledger(x);assert.deepEqual(await bind(x),blocked);assert.deepEqual(await read(x),blocked);assert.deepEqual(await unknown(x),blocked);assert.equal(await stored(x),'[]');assert.equal(await ledger(x),before);
 }
 for(const mutation of ["enabled=false","frozen=true","expires_at=clock_timestamp()-interval '1 second'"]){const x=await fixture();await db(`update public.model_budget_scopes set ${mutation} where id='${x.scope}';`);const before=await ledger(x);assert.deepEqual(await bind(x),blocked);assert.equal(await stored(x),'[]');assert.equal(await ledger(x),before);}
});
run('same binding reports exact subsequent ledger states and sticky unknown without rewriting budget',async()=>{
 const x=await fixture();await bind(x);assert.deepEqual(await unknown(x),{kind:'unknown',reused:false,executionAllowed:false});assert.deepEqual(await unknown(x),{kind:'unknown',reused:true,executionAllowed:false});const initialBinding=await stored(x);
 await dispatch(x);let before=await ledger(x),r=await read(x);assert.equal(r.ledgerStatus,'dispatched');assert.equal(r.actualMicros,null);assert.equal(r.unknown,true);assert.equal(r.reconciliationRequired,true);assert.equal(await ledger(x),before);
 await finish(x,'pending');before=await ledger(x);r=await read(x);assert.equal(r.ledgerStatus,'pending');assert.equal(r.actualMicros,null);assert.equal(await bind(x).then(v=>v.reused),true);assert.equal(await ledger(x),before);
 await finish(x,'settle',3);await db(`update public.model_budget_scopes set enabled=false,frozen=true,expires_at=clock_timestamp()-interval '1 second' where id='${x.scope}';update public.model_budget_provider_limits set enabled=false where scope_id='${x.scope}';`);
 before=await ledger(x);r=await read(x);assert.equal(r.ledgerStatus,'settled');assert.equal(r.reservedMicros,10);assert.equal(r.actualMicros,3);assert.equal(r.priceVersion,'synthetic-v1');assert.equal(r.unknown,true);assert.equal(r.reconciliationRequired,true);assert.equal(r.executionAllowed,false);assert.equal((await bind(x)).reused,true);assert.equal(await ledger(x),before);assert.equal(await stored(x),initialBinding);
 assert.deepEqual(await invoke('bind_planning_v2_model_attempt_v1',x,args({...x,attempt:uuid()})),blocked);assert.equal(await ledger(x),before);
 const released=await fixture();await bind(released);await finish(released,'release');r=await read(released);assert.equal(r.ledgerStatus,'released');assert.equal(r.actualMicros,null);assert.equal(r.executionAllowed,false);
});
run('basis/policy/session/lease/scope mismatch blocks even a stored settled receipt',async()=>{
 for(const change of ['source','text','planning','session','lease','scope','price']){const x=await fixture();await bind(x);await dispatch(x);await finish(x,'settle',3);const row=await stored(x);
  if(change==='source')await call(x.a,'submit_assistant_travel_intake_v1',{...x.a.input,p_message_id:uuid(),p_parent_message_id:x.r.messageId,p_expected_goal_version:x.r.goalVersion,p_expected_intake_revision:x.r.intakeRevision,p_idempotency_key:uuid(),p_relationship:'amendment',p_intake:{...projection,pace:'balanced'}});
  if(change==='text')await call(x.a,'withdraw_text_policy',{p_policy_id:x.a.policy});if(change==='planning')await call(x.a,'withdraw_planning_policy_v1',{p_policy_id:x.a.planningPolicy});
  if(change==='session')await db(`delete from auth.sessions where id='${x.a.session}';`);if(change==='lease')await db(`update turn_private.work set lease_token='${uuid()}' where turn_id='${x.r.turnId}';`);
  if(change==='scope')await db(`update turn_private.service_tasks set budget_scope_id='${uuid()}' where id='${x.r.taskId}';`);if(change==='price')await db(`update public.model_budget_provider_limits set price_version='changed' where scope_id='${x.scope}';`);
  const before=await ledger(x);assert.deepEqual(await read(x),blocked);assert.deepEqual(await bind(x),blocked);assert.deepEqual(await unknown(x),blocked);assert.equal(await stored(x),row);assert.equal(await ledger(x),before);
 }
});
run('extra/unknown attempts cannot become none or permit a new attempt',async()=>{
 const x=await fixture();await bind(x);await unknown(x);const row=await stored(x);await svc('reserve_model_budget',{p_scope_id:x.scope,p_owner_id:x.a.owner,p_task_id:x.r.taskId,p_attempt_id:uuid(),p_provider:'qwen',p_model:'synthetic-model',p_price_version:'synthetic-v1',p_reserved_micros:1});const before=await ledger(x);
 assert.deepEqual(await read(x),blocked);assert.deepEqual(await bind(x),blocked);assert.deepEqual(await unknown(x),blocked);assert.equal(await stored(x),row);assert.equal(await ledger(x),before);
 const y=await fixture();await bind(y);const output=await db(`begin;alter table public.model_budget_attempts drop constraint model_budget_attempts_status_check;update public.model_budget_attempts set status='unknown' where scope_id='${y.scope}' and attempt_id='${y.attempt}';${privateQuery('read_planning_v2_model_binding_v1',args(y))}rollback;`);assert.deepEqual(JSON.parse(output),blocked);
});
const wait=async tag=>{const end=Date.now()+4000;while(await db(`select exists(select 1 from pg_stat_activity where application_name='${tag}' and wait_event='PgSleep');`)!=='t'){if(Date.now()>end)assert.fail('controlled lock barrier missing');await new Promise(r=>setTimeout(r,20));}};
run('controlled reserve and settle lock orders fail closed without partial bindings or deadlock',async t=>{
 for(const mode of ['reserve','settle']){const x=await fixture();if(mode==='settle'){await bind(x);await dispatch(x);}const row=await stored(x),tag='model-bind-'+uuid().slice(0,8);
  const op=mode==='reserve'?`select public.reserve_model_budget('${x.scope}','${x.a.owner}','${x.r.taskId}','${x.attempt}','qwen','synthetic-model','synthetic-v1',10);`:`select public.finish_model_budget('${x.scope}','${x.a.owner}','${x.attempt}','pending',null);`;
  const held=sql(container,`begin;set application_name='${tag}';set role service_role;set request.jwt.claim.role='service_role';${op}select pg_sleep(1);commit;`);await wait(tag);
  const result=await (mode==='reserve'?bind(x):read(x));assert.deepEqual(result,blocked);assert.equal(await stored(x),row);const done=await held;assert.equal(done.code,0,done.stderr);
  if(mode==='reserve')assert.equal((await bind(x)).reused,false);else assert.equal((await read(x)).ledgerStatus,'pending');
  t.diagnostic(JSON.stringify({mode,held:mode==='reserve'?'Task->scope':'scope->attempt',conflict:'blocked',partialBinding:false,providerCalls:0}));
 }
});
run('account-held session revocation commits before qualification, with no partial binding',async t=>{
 const x=await fixture(),tag='model-session-'+uuid().slice(0,8),before=await ledger(x);
 const held=sql(container,`begin;set application_name='${tag}';select owner_id from identity_private.mobile_accounts where owner_id='${x.a.owner}' for update;delete from auth.sessions where id='${x.a.session}';select pg_sleep(1);commit;`);await wait(tag);const result=await bind(x),done=await held;assert.equal(done.code,0,done.stderr);assert.deepEqual(result,blocked);assert.equal(await stored(x),'[]');assert.equal(await ledger(x),before);t.diagnostic('Synthetic old Auth session deletion under account lock; real native session API remains UNRUN');
});
run('private binding ACL/immutable keys retain v2 completion fences',async()=>{
 const x=await fixture();await bind(x);const signature='(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text)';
 for(const role of ['anon','authenticated','service_role']){assert.equal(await db(`select has_table_privilege('${role}','turn_private.planning_v2_model_attempt_bindings','SELECT,INSERT,UPDATE,DELETE');`),'f');for(const name of ['planning_v2_model_binding_basis_v1','read_planning_v2_model_binding_v1','bind_planning_v2_model_attempt_v1','unknown_planning_v2_model_attempt_v1'])assert.equal(await db(`select has_function_privilege('${role}','turn_private.${name}${signature}','EXECUTE');`),'f');}
 for(const update of [`claim_lease='${uuid()}'`,`price_version='other'`,`attempt_id='${uuid()}'`,`intake_digest='${'c'.repeat(64)}'`]){const r=await sql(container,`update turn_private.planning_v2_model_attempt_bindings set ${update} where turn_id='${x.r.turnId}';`);assert.notEqual(r.code,0);assert.match(r.stderr,/IMMUTABLE_MODEL_BINDING/);}
 await unknown(x);const clear=await sql(container,`update turn_private.planning_v2_model_attempt_bindings set unknown_at=null where turn_id='${x.r.turnId}';`);assert.notEqual(clear.code,0);
 const completion=await sql(container,`update turn_private.planning_comparisons set state='completed' where turn_id='${x.r.turnId}';`);assert.notEqual(completion.code,0);assert.match(completion.stderr,/V2_EXECUTION_UNAVAILABLE/);assert.equal(await db(`select count(*) from turn_private.result_artifacts where id='${x.r.artifactId}';`),'0');
});

run('concurrent identical attempt binds once while real cross actor/Task/attempt and expired lease fail',async()=>{
 const x=await fixture(),before=await ledger(x),results=await Promise.all([bind(x),bind(x)]);assert.deepEqual(results.map(r=>r.reused).sort(),[false,true]);assert.equal(JSON.parse(await stored(x)).length,1);assert.equal(await ledger(x),before);
 const y=await fixture(),other=await ledger(y);for(const p of [args({...x,a:y.a}),args({...x,r:{...x.r,taskId:y.r.taskId}}),args({...x,scope:y.scope,attempt:y.attempt})])assert.deepEqual(await invoke('bind_planning_v2_model_attempt_v1',x,p),blocked);assert.equal(await ledger(x),before);assert.equal(await ledger(y),other);assert.equal(await stored(y),'[]');
 await db(`update turn_private.work set expires_at=clock_timestamp()-interval '1 second' where turn_id='${y.r.turnId}';`);assert.deepEqual(await bind(y),blocked);assert.deepEqual(await read(y),blocked);assert.equal(await stored(y),'[]');assert.equal(await ledger(y),other);
});
run('controlled ordinary Memory/source correction commits before current basis and leaves no binding or ledger write',async t=>{
 for(const change of ['memory','source']){const x=await fixture(change==='memory'),tag='model-basis-'+uuid().slice(0,8),before=await ledger(x);
  let q;if(change==='memory')q=query(x.a,'transition_memory_profile',{p_memory_id:x.a.memoryId,p_next_state:'paused'});
  else q=query(x.a,'submit_assistant_travel_intake_v1',{...x.a.input,p_message_id:uuid(),p_parent_message_id:x.r.messageId,p_expected_goal_version:x.r.goalVersion,p_expected_intake_revision:x.r.intakeRevision,p_idempotency_key:uuid(),p_relationship:'amendment',p_intake:{...projection,pace:'balanced'}});
  q=q.replace('begin;',`begin;set application_name='${tag}';`).replace('commit;','select pg_sleep(1);commit;');const held=sql(container,q);await wait(tag);const result=await bind(x),done=await held;assert.equal(done.code,0,done.stderr);assert.deepEqual(result,blocked);assert.equal(await stored(x),'[]');assert.equal(await ledger(x),before);t.diagnostic(JSON.stringify({change,qualificationAfterCommit:true,partialBinding:false,providerCalls:0}));
 }
 const x=await fixture(true);await bind(x);await memoryCall(x.a,'revoke_memory_retrieval_consent',{p_consent_id:x.a.memoryConsent});const row=await stored(x),before=await ledger(x);assert.deepEqual(await read(x),blocked);assert.deepEqual(await bind(x),blocked);assert.deepEqual(await unknown(x),blocked);assert.equal(await stored(x),row);assert.equal(await ledger(x),before);
});
run('existing v1 dispatch still uses its old authority; private v2 binding never grants it',async()=>{
 const x=await fixture(false,'v1');await dispatch(x);const input=await svc('read_planning_comparison_work_v1',{p_turn_id:x.r.turnId,p_lease_token:x.lease});assert.equal(input.kind,'planning_input');
 assert.deepEqual(await svc('authorize_planning_dispatch_v1',{p_turn_id:x.r.turnId,p_lease_token:x.lease,p_context_digest:input.contextDigest,p_scope_id:x.scope,p_attempt_id:x.attempt}),{kind:'authorized'});
 assert.deepEqual(await bind(x),blocked);assert.equal(await stored(x),'[]');assert.equal(await db(`select count(*) from turn_private.result_artifacts where id='${x.r.artifactId}';`),'0');
});
