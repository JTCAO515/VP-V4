// Explicit network-none preparation only; all dependencies from this current checkout.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid,createHash} from 'node:crypto';
import {runPlanningV2LocalProtocol} from '../../../lib/server/turn/planning-intake-worker-protocol.ts';
import {readFileSync,readdirSync} from 'node:fs';
import {createPlanningV2CheckpointTestPorts,decodePlanningV2CheckpointSnapshot} from '../../../lib/server/turn/planning-v2-checkpoint-test-ports.ts';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_TURN_DB_TEST==='1',container='vpj78-checkpoints-'+uuid().slice(0,8);
const mine='20261003040000_vpj78_v2_durable_checkpoints.sql';
let created=false;
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const lit=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const query=(a,name,p)=>{
 const memory=['create_memory_retrieval_consent','create_explicit_memory_profile_v2','revoke_memory_retrieval_consent'].includes(name);
 return `begin;set role authenticated;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({session_id:a.session})}';`+(memory?"select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from ":'select ')+`public.${name}(`+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+(memory?') m;commit;':');commit;');
};
const call=async(a,name,p)=>{const r=await sql(container,query(a,name,p));assert.equal(r.code,0,r.stderr);return JSON.parse(r.stdout.trim());};
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
 a.refs=[];if(memory){a.memoryConsent=(await call(a,'create_memory_retrieval_consent',{}))[0].consent_id;a.memoryId=uuid();await call(a,'create_explicit_memory_profile_v2',{p_memory_id:a.memoryId,p_receipt_id:uuid(),p_consent_id:a.memoryConsent,p_constraint_kind:'preference',p_summary:'Synthetic explicit reference'});a.refs=[{id:a.memoryId,revision:1}];}
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
 // Prove040 rollback at its actual dependency boundary, then install every successor.
 for(const f of migrations.filter(f=>f<mine))await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');

 const migration=readFileSync('supabase/migrations/'+mine,'utf8');await db('begin;'+migration+'rollback;');assert.equal(await db("select to_regclass('turn_private.planning_v2_place_checkpoints') is null;"),'t');assert.equal(await db("select to_regprocedure('public.planning_v2_checkpoint_export_owner_v1(uuid,uuid,integer)') is null;"),'t');await db('begin;'+migration+'commit;');
 for(const f of migrations.filter(f=>f>mine))await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
const v2=a=>({...planning(a),p_expected_intake_message_id:a.source,p_expected_source_sequence:1,p_expected_intake_revision:1,p_expected_intake_digest:a.receipt.contextDigest,p_intake:projection});
const bound=async(a,r,lease=null)=>JSON.parse(await db(`select turn_private.read_planning_qualified_intake_v1('${a.owner}','${r.turnId}',${lit(lease)});`));

const blocked={kind:'blocked'};
async function leased(environment='local_synthetic',memory=false){const a=await owner(environment,'en','Synthetic Shanghai comparison',memory),r=await call(a,'submit_planning_comparison_v2',v2(a)),lease=uuid();await db(`update turn_private.work set state='leased',lease_token='${lease}',expires_at=clock_timestamp()+interval '120 seconds' where turn_id='${r.turnId}';`);return {a,r,lease};}
const args=x=>[x.a.owner,x.r.taskId,x.r.turnId,x.lease,x.r.intakeContextDigest,x.r.planningContextDigest];
const privateQuery=(name,p)=>`select to_jsonb(turn_private.${name}(${p.map(lit).join(',')}));`;
const checkpoint=async(name,x,extra=[])=>JSON.parse(await db(privateQuery(name,args(x).concat(extra))));
const read=x=>checkpoint('read_planning_v2_checkpoints_v1',x),claim=x=>checkpoint('claim_planning_v2_place_v1',x),save=(x,p)=>checkpoint('save_planning_v2_place_v1',x,[p]),unknown=x=>checkpoint('unknown_planning_v2_place_v1',x);
const place=(source='synthetic_fixture',observedAt=new Date().toISOString())=>({schemaVersion:'planning-place/1',source,observedAt,providerCalls:0,areas:[{id:'jingan',label:"Jing'an",railMinutes:20,transfers:1},{id:'peoples_square',label:"People's Square",railMinutes:null,transfers:null}]});
const stored=x=>db(`select coalesce(jsonb_agg(to_jsonb(p)),'[]') from turn_private.planning_v2_place_checkpoints p where turn_id='${x.r.turnId}';`);
run('transactional migration and current exact identity nonnull active lease gate',async t=>{
 const x=await leased();const s=await read(x);assert.deepEqual(s.place,{state:'missing'});assert.equal(s.modelAttempt,'none');
 for(const bad of [{...x,lease:null},{...x,lease:uuid()},{...x,a:{...x.a,owner:uuid()}},{...x,r:{...x.r,taskId:uuid()}},{...x,r:{...x.r,intakeContextDigest:'a'.repeat(64)}},{...x,r:{...x.r,planningContextDigest:'b'.repeat(64)}}]){assert.deepEqual(await read(bad),blocked);assert.deepEqual(await claim(bad),blocked);assert.equal(await save(bad,place()),false);assert.equal(await unknown(bad),false);}
 await db(`update turn_private.work set expires_at=clock_timestamp()-interval '1 second' where turn_id='${x.r.turnId}';`);assert.deepEqual(await read(x),blocked);assert.deepEqual(await claim(x),blocked);assert.equal(await stored(x),'[]');
 t.diagnostic(JSON.stringify({network:'none',container,base:'a9e02f3a',migration:mine,providerCalls:0}));
});
run('concurrent claim holds one started receipt and duplicate cannot mint another request',async()=>{
 const x=await leased();const first=sql(container,'begin;'+privateQuery('claim_planning_v2_place_v1',args(x))+"select pg_sleep(1);commit;");
 const second=sql(container,privateQuery('claim_planning_v2_place_v1',args(x)));const responses=await Promise.all([first,second]);for(const r of responses)assert.equal(r.code,0,r.stderr);
 assert.deepEqual(responses.map(r=>JSON.parse(r.stdout.trim()).kind).sort(),['claimed','duplicate']);assert.equal(JSON.parse(await stored(x)).length,1);assert.deepEqual((await read(x)).place,{state:'started'});assert.deepEqual(await claim(x),{kind:'duplicate'});
});
run('started crash or unknown remains durable and lease rotation cannot redo or save the claim',async()=>{
 for(const markUnknown of [false,true]){const x=await leased();assert.deepEqual(await claim(x),{kind:'claimed'});if(markUnknown)assert.equal(await unknown(x),true);
  const originalRow=await stored(x);await db(`update turn_private.work set expires_at=clock_timestamp()-interval '1 second' where turn_id='${x.r.turnId}';`);assert.deepEqual(await read(x),blocked);assert.equal(await save(x,place()),false);assert.equal(await unknown(x),false);assert.equal(await stored(x),originalRow);
  const old=x.lease;x.lease=uuid();await db(`update turn_private.work set lease_token='${x.lease}',expires_at=clock_timestamp()+interval '120 seconds' where turn_id='${x.r.turnId}';`);
  assert.equal(await save({...x,lease:old},place()),false);assert.equal(await unknown({...x,lease:old}),false);assert.equal(await save(x,place()),false);assert.equal(await unknown(x),false);
  assert.deepEqual((await read(x)).place,{state:markUnknown?'unknown':'started'});assert.deepEqual(await claim(x),{kind:markUnknown?'unknown':'duplicate'});
 }
});
run('save commit lost response recovers through fresh process read only, including active new lease',async()=>{
 const x=await leased(),p=place();await claim(x);const lost=await sql(container,privateQuery('save_planning_v2_place_v1',args(x).concat([p])));assert.equal(lost.code,0,lost.stderr); // Ignore successful ack as if transport lost it.
 const before=await stored(x);assert.deepEqual((await read(x)).place,{state:'completed',observation:p});assert.equal(await save(x,p),false);assert.equal(await unknown(x),false);assert.equal(await stored(x),before);
 x.lease=uuid();await db(`update turn_private.work set lease_token='${x.lease}' where turn_id='${x.r.turnId}';`);assert.deepEqual((await read(x)).place,{state:'completed',observation:p});assert.deepEqual(await claim(x),{kind:'duplicate'});assert.equal(await save(x,p),false);assert.equal(await stored(x),before);
});
run('closed source environment freshness and numeric ranges reject malformed observations without reset',async()=>{
 const x=await leased();await claim(x);const p=place();
 const cases=[
  ['null',()=>null],['empty',()=>({})],['wrong source',()=>({...p,source:'amap'})],['extra key',()=>({...p,extra:'private'})],
  ['expired observation',()=>({...p,observedAt:new Date(Date.now()-301000).toISOString()})],
  ['future observation',()=>({...p,observedAt:new Date(Date.now()+6000).toISOString()})],
  ['impossible date',()=>({...p,observedAt:'2026-02-30T00:00:00Z'})],['call cap',()=>({...p,providerCalls:14})],
  ['UTF16 label cap',()=>({...p,areas:[{...p.areas[0],label:'😀'.repeat(41)},p.areas[1]]})],
  ['duplicate identity',()=>({...p,areas:[p.areas[0],p.areas[0]]})],
  ['duration cap',()=>({...p,areas:[{...p.areas[0],railMinutes:181},p.areas[1]]})],
  ['negative transfers',()=>({...p,areas:[{...p.areas[0],transfers:-1},p.areas[1]]})],
 ];
 for(const [label,make] of cases){
  // Relative clocks are created at dispatch, not aged by earlier SQL calls.
  const bad=make(),accepted=await save(x,bad);
  if(accepted){const dbEpochMillis=Number(await db("select extract(epoch from clock_timestamp())*1000;"));
   assert.equal(accepted,false,JSON.stringify({label,observedAt:bad?.observedAt,dbEpochMillis,futureMillis:bad?.observedAt?Date.parse(bad.observedAt)-dbEpochMillis:null}));}
  assert.equal(accepted,false,label);
 }
 assert.deepEqual((await read(x)).place,{state:'started'});assert.deepEqual(await claim(x),{kind:'duplicate'});assert.equal(await save(x,p),true);
 const staging=await leased('staging');await claim(staging);assert.equal(await save(staging,place()),false);assert.equal(await save(staging,place('amap')),true);
 const expiring=await leased();await claim(expiring);assert.equal(await save(expiring,place('synthetic_fixture',new Date(Date.now()-299000).toISOString())),true);await db('select pg_sleep(2);');assert.deepEqual(await read(expiring),blocked);assert.deepEqual(await claim(expiring),blocked);
});
run('ordinary correction and policy/Memory withdrawals block reuse and old writes while retaining receipt',async()=>{
 for(const change of ['source','text','planning','memory'])for(const complete of [false,true]){const x=await leased('local_synthetic',change==='memory');await claim(x);if(complete)assert.equal(await save(x,place()),true);const before=await stored(x);
  if(change==='source')await call(x.a,'submit_assistant_travel_intake_v1',{...x.a.input,p_message_id:uuid(),p_parent_message_id:x.r.messageId,p_expected_goal_version:x.r.goalVersion,p_expected_intake_revision:x.r.intakeRevision,p_idempotency_key:uuid(),p_relationship:'amendment',p_intake:{...projection,pace:'balanced'}});
  if(change==='text')await call(x.a,'withdraw_text_policy',{p_policy_id:x.a.policy});
  if(change==='planning')await call(x.a,'withdraw_planning_policy_v1',{p_policy_id:x.a.planningPolicy});
  if(change==='memory')await call(x.a,'revoke_memory_retrieval_consent',{p_consent_id:x.a.memoryConsent});
  assert.deepEqual(await read(x),blocked);assert.deepEqual(await claim(x),blocked);assert.equal(await save(x,place()),false);assert.equal(await unknown(x),false);assert.equal(await stored(x),before);
 }
});
async function budget(x,status='reserved'){
 const scope=uuid();await db(`insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,expires_at) values('${scope}','${x.a.owner}','CNY',10000,1000,3,3,now()+interval '1 day');insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled) values('${scope}','qwen','fixture','fixture',10000,1000,false);update turn_private.service_tasks set budget_scope_id='${scope}' where id='${x.r.taskId}';insert into public.model_budget_attempts(scope_id,attempt_id,task_id,provider,model,price_version,reserved_micros,actual_micros,status) values('${scope}','${uuid()}','${x.r.taskId}','qwen','fixture','fixture',1,${status==='settled'?0:'null'},'${status}');`);return scope;
}
run('model ledger is readonly and ambiguous/unknown/active/settled attempts never become none or permit claim',async()=>{
 for(const status of ['reserved','dispatched','pending','settled','released']){const x=await leased(),scope=await budget(x,status),before=await db(`select jsonb_agg(to_jsonb(a)) from public.model_budget_attempts a where task_id='${x.r.taskId}';`);
  assert.equal((await read(x)).modelAttempt,status);assert.deepEqual(await claim(x),{kind:status==='released'?'claimed':'unknown'});assert.equal(await db(`select jsonb_agg(to_jsonb(a)) from public.model_budget_attempts a where task_id='${x.r.taskId}';`),before);
  if(status==='pending'){await db(`insert into public.model_budget_attempts(scope_id,attempt_id,task_id,provider,model,price_version,reserved_micros,status) values('${scope}','${uuid()}','${x.r.taskId}','qwen','fixture','fixture',1,'released');`);assert.equal((await read(x)).modelAttempt,'pending');assert.deepEqual(await claim(x),{kind:'unknown'});}
 }
 const x=await leased();await budget(x);const output=await db(`begin;alter table public.model_budget_attempts drop constraint model_budget_attempts_status_check;update public.model_budget_attempts set status='unknown' where task_id='${x.r.taskId}';${privateQuery('read_planning_v2_checkpoints_v1',args(x))}rollback;`);assert.equal(JSON.parse(output).modelAttempt,'pending');assert.equal(await stored(x),'[]');
});
run('private API privileges and immutable row identity leave completion fences intact',async()=>{
 const x=await leased();await claim(x);
 const signatures=['planning_v2_checkpoint_basis_v1(uuid,uuid,uuid,uuid,text,text)','read_planning_v2_checkpoints_v1(uuid,uuid,uuid,uuid,text,text)','claim_planning_v2_place_v1(uuid,uuid,uuid,uuid,text,text)','save_planning_v2_place_v1(uuid,uuid,uuid,uuid,text,text,jsonb)','unknown_planning_v2_place_v1(uuid,uuid,uuid,uuid,text,text)','valid_planning_v2_place_v1(jsonb,text)','planning_v2_model_attempt_v1(uuid,uuid)','guard_planning_v2_checkpoint_v1()'];
 for(const role of ['anon','authenticated','service_role']){assert.equal(await db(`select has_table_privilege('${role}','turn_private.planning_v2_place_checkpoints','SELECT,INSERT,UPDATE,DELETE');`),'f');for(const sig of signatures)assert.equal(await db(`select has_function_privilege('${role}','turn_private.${sig}','EXECUTE');`),'f');}
 for(const update of [`owner_id='${uuid()}'`,`task_id='${uuid()}'`,`claim_lease='${uuid()}'`,`intake_digest='${'c'.repeat(64)}'`,`state='started'`]){const r=await sql(container,`update turn_private.planning_v2_place_checkpoints set ${update} where turn_id='${x.r.turnId}';`);assert.notEqual(r.code,0);assert.match(r.stderr,/IMMUTABLE_CHECKPOINT/);}
 const malformed=await sql(container,`update turn_private.planning_v2_place_checkpoints set state='completed',observation='{}',completed_at=clock_timestamp() where turn_id='${x.r.turnId}';`);assert.notEqual(malformed.code,0);assert.match(malformed.stderr,/INVALID_CHECKPOINT_OBSERVATION/);
 const mismatch=await leased(),r=await sql(container,`insert into turn_private.planning_v2_place_checkpoints(turn_id,owner_id,task_id,claim_lease,intake_digest,planning_digest,state) values('${mismatch.r.turnId}','${x.a.owner}','${mismatch.r.taskId}','${mismatch.lease}','${mismatch.r.intakeContextDigest}','${mismatch.r.planningContextDigest}','started');`);assert.notEqual(r.code,0);assert.match(r.stderr,/CHECKPOINT_IDENTITY_CONFLICT/);
 assert.equal(await save(x,place()),true);const complete=await sql(container,`update turn_private.planning_comparisons set state='completed' where turn_id='${x.r.turnId}';`);assert.notEqual(complete.code,0);assert.match(complete.stderr,/V2_EXECUTION_UNAVAILABLE/);assert.equal(await db(`select count(*) from turn_private.result_artifacts where id='${x.r.artifactId}';`),'0');
});
run('bounded service owner keyset export hides lease and cascade removes only the selected owner',async()=>{
 const x=await leased(),y=await leased();await claim(x);await save(x,place());await claim(y);
 // A second same-owner task can use an independently admitted conversation.
 const p={...x.a.input,p_conversation_id:uuid(),p_goal_id:uuid(),p_message_id:uuid(),p_idempotency_key:uuid()};const initial=await call(x.a,'submit_assistant_travel_intake_v1',p),a={...x.a,conversation:p.p_conversation_id,goal:p.p_goal_id,source:p.p_message_id,input:p,receipt:initial},r=await call(a,'submit_planning_comparison_v2',v2(a)),lease=uuid(),z={a,r,lease};await db(`update turn_private.work set state='leased',lease_token='${lease}',expires_at=clock_timestamp()+interval '120 seconds' where turn_id='${r.turnId}';`);await claim(z);
 const exported=async(cursor=null,limit=1)=>JSON.parse(await db(`set role service_role;set request.jwt.claim.role='service_role';select public.planning_v2_checkpoint_export_owner_v1('${x.a.owner}',${lit(cursor)},${limit});`));
 const first=await exported();assert.equal(first.items.length,1);assert.equal(first.hasMore,true);assert.equal(first.sectionComplete,false);const last=await exported(first.nextCursor);assert.equal(last.items.length,1);assert.equal(last.hasMore,false);assert.equal(last.sectionComplete,true);assert.equal(last.nextCursor,null);
 for(const item of first.items.concat(last.items)){assert.deepEqual(Object.keys(item).sort(),['turnId','ownerId','taskId','state','startedAt','completedAt','observation'].sort());assert.equal(item.ownerId,x.a.owner);}
 for(const limit of [0,101])assert.notEqual((await sql(container,`set role service_role;set request.jwt.claim.role='service_role';select public.planning_v2_checkpoint_export_owner_v1('${x.a.owner}',null,${limit});`)).code,0);
 assert.notEqual((await sql(container,`set role service_role;set request.jwt.claim.role='service_role';select public.planning_v2_checkpoint_export_owner_v1('${x.a.owner}','${y.r.turnId}',1);`)).code,0);
 for(const role of ['anon','authenticated'])assert.equal(await db(`select has_function_privilege('${role}','public.planning_v2_checkpoint_export_owner_v1(uuid,uuid,integer)','EXECUTE');`),'f');
 await db(`delete from auth.users where id='${x.a.owner}';`);assert.equal(await db(`select count(*) from turn_private.planning_v2_place_checkpoints where owner_id='${x.a.owner}';`),'0');assert.equal(JSON.parse(await stored(y)).length,1);
});

run('strict injected private ports recover saved receipt in a new process without Map or replay',async()=>{
 const x=await leased(),l={ownerId:x.a.owner,taskId:x.r.taskId,turnId:x.r.turnId,leaseToken:x.lease,intakeContextDigest:x.r.intakeContextDigest,planningContextDigest:x.r.planningContextDigest,environment:'local_synthetic'},signal=new AbortController().signal,p=place();
 const transport=async(name,params)=>JSON.parse(await db(privateQuery(name,Object.values(params))));
 const first=createPlanningV2CheckpointTestPorts({mode:'local_protocol_test',now:Date.now,transport});assert.equal(await first.claimPlace(l,signal),'claimed');
 const lostAck=createPlanningV2CheckpointTestPorts({mode:'local_protocol_test',now:Date.now,transport:async(name,params)=>{const result=await transport(name,params);if(name==='save_planning_v2_place_v1')throw Error('Synthetic saved acknowledgment loss');return result;}});
 await assert.rejects(lostAck.savePlace(l,p,signal));const after=await stored(x),newProcess=createPlanningV2CheckpointTestPorts({mode:'local_protocol_test',now:Date.now,transport});assert.deepEqual((await newProcess.checkpoints(l,signal)).place,{state:'completed',observation:p});assert.equal(await newProcess.claimPlace(l,signal),'duplicate');assert.equal(await newProcess.savePlace(l,p,signal),false);assert.equal(await stored(x),after);
});

run('the same UTC millisecond observation matches SQL, strict adapter and current worker date acceptance',async t=>{
 const workerHash=createHash('sha256').update(readFileSync('lib/server/turn/planning-intake-worker-protocol.ts')).digest('hex'),base=new Date(Math.floor(Date.now()/1000)*1000).toISOString().slice(0,19),matrix=[];
 const cases=[['utc-seconds',base+'Z',true],['utc-tenths',base+'.1Z',true],['utc-hundredths',base+'.12Z',true],['utc-milliseconds',base+'.123Z',true],
  ['zero-offset',base+'.123+00:00',false],['positive-offset',new Date(Date.now()+8*3600000).toISOString().replace('Z','+08:00'),false],['negative-offset',new Date(Date.now()-4*3600000).toISOString().replace('Z','-04:00'),false],
  ['fraction-four',base+'.1234Z',false],['microseconds',base+'.123456Z',false],['invalid-calendar','2026-02-30T00:00:00Z',false],['hour-24',base.slice(0,11)+'24:00:00Z',false],['leap-second',base.slice(0,17)+'60Z',false],
  ['expired',new Date(Date.now()-301000).toISOString(),false],['future',()=>new Date(Date.now()+60000).toISOString(),false],['date-array',[base+'Z'],false]];
 for(const [name,observedAt,accepted]of cases){
  const x=await leased(),q=await bound(x.a,x.r,x.lease),qi=q.qualifiedIntake,l={ownerId:x.a.owner,taskId:x.r.taskId,turnId:x.r.turnId,leaseToken:x.lease,artifactId:x.r.artifactId,planningPolicyId:x.a.planningPolicy,intakeContextDigest:x.r.intakeContextDigest,planningContextDigest:x.r.planningContextDigest,source:Object.fromEntries(['conversationId','goalId','goalVersion','messageId','messageSequence','intakeRevision','memoryBasis'].map(k=>[k,qi[k]])),environment:'local_synthetic',locale:'en'};
  await claim(x);
  // Generate relative-clock negatives at the invocation, after fixture/claim work.
  // Keep a clear out-of-window value despite bounded RPC scheduling latency.
  const generatedAt=Date.now(),p=place('synthetic_fixture',typeof observedAt==='function'?observedAt():observedAt);assert.equal(await save(x,p),accepted,'SQL save '+name);
  if(name==='future'){const serverAfter=Number(await db("select extract(epoch from clock_timestamp())*1000;")),delta=Date.parse(p.observedAt)-serverAfter;assert.ok(delta>5000,'future sample must remain illegal after SQL evaluation');t.diagnostic(JSON.stringify({case:name,generatedAt:new Date(generatedAt).toISOString(),observedAt:p.observedAt,serverAfter:new Date(serverAfter).toISOString(),futureDeltaMs:delta,unchangedMaxFutureMs:5000}));}
  const actual=await read(x),snapshot=accepted?actual:{...actual,place:{state:'completed',observation:p}};
  const adapterAccepted=decodePlanningV2CheckpointSnapshot(snapshot,l,Date.now())!==null;assert.equal(adapterAccepted,accepted,'adapter '+name);
  let prepareReached=0;const forbid=async()=>{assert.fail('completed parser test must not claim, permit or call provider');};
  const result=await runPlanningV2LocalProtocol(l,{mode:'local_protocol_test',read:()=>bound(x.a,x.r,x.lease),checkpoints:async()=>snapshot,claimPlace:forbid,savePlace:forbid,unknownPlace:forbid,permit:forbid,place:forbid,prepare:async()=>{prepareReached++;return null;},verifyPreparation:forbid,now:Date.now},new AbortController().signal);
  assert.equal(prepareReached,accepted?1:0,'worker observation acceptance '+name);assert.equal(result.executionAvailable,false);assert.equal(result.readyForPublication,false);
  assert.equal(await db(`select count(*) from turn_private.result_artifacts where id='${x.r.artifactId}';`),'0');matrix.push({name,SQL:accepted,adapter:adapterAccepted,worker:prepareReached===1});
 }
 t.diagnostic(JSON.stringify({workerSource:'current normal import',workerSha256:workerHash,SQLSource:'current40000',matrix,providerCalls:0,preparationProbeOnly:true}));
});
