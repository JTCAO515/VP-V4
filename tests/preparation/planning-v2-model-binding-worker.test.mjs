// Explicit network-none preparation only; all dependencies from this current checkout.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {runPlanningV2LocalProtocol} from '../../lib/server/turn/planning-intake-worker-protocol.ts';
import {modelBindingWorkerSnapshot} from './planning-v2-model-binding-worker-adapter.mjs';
import {command,sql} from '../integration/cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_TURN_DB_TEST==='1',container='vpj78-model-worker-'+uuid().slice(0,8);

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
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');


});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
const v2=a=>({...planning(a),p_expected_intake_message_id:a.source,p_expected_source_sequence:1,p_expected_intake_revision:1,p_expected_intake_digest:a.receipt.contextDigest,p_intake:projection});
const bound=async(a,r,lease=null)=>JSON.parse(await db(`select turn_private.read_planning_qualified_intake_v1('${a.owner}','${r.turnId}',${lit(lease)});`));

const svc=async(name,p)=>JSON.parse(await db("set role service_role;set request.jwt.claim.role='service_role';select public."+name+'('+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');'));
async function fixture(memory=false,mode='v2',completedPlace=false){const a=await owner('local_synthetic','en','Synthetic model binding fixture',memory),r=mode==='v2'?await call(a,'submit_planning_comparison_v2',v2(a)):await call(a,'submit_planning_comparison_v1',planning(a)),lease=uuid(),scope=uuid(),attempt=uuid();await db(`update turn_private.work set state='leased',lease_token='${lease}',expires_at=clock_timestamp()+interval '120 seconds' where turn_id='${r.turnId}';
 insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at) values('${scope}','${a.owner}','CNY',10000,1000,3,3,true,now()+interval '1 day');insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled) values('${scope}','qwen','synthetic-model','synthetic-v1',10000,1000,true);`);
 if(completedPlace){
  const six=[a.owner,r.taskId,r.turnId,lease,r.intakeContextDigest,r.planningContextDigest],observation={schemaVersion:'planning-place/1',source:'synthetic_fixture',observedAt:new Date().toISOString(),providerCalls:0,areas:[{id:'jingan',label:'Jingan',railMinutes:20,transfers:1},{id:'peoples_square',label:'Square',railMinutes:null,transfers:null}]};
  assert.equal(JSON.parse(await db(`select turn_private.claim_planning_v2_place_v1(${six.map(lit).join(',')});`)).kind,'claimed');assert.equal(await db(`select turn_private.save_planning_v2_place_v1(${six.concat([observation]).map(lit).join(',')});`),'t');
 }
 assert.deepEqual(await svc('reserve_model_budget',{p_scope_id:scope,p_owner_id:a.owner,p_task_id:r.taskId,p_attempt_id:attempt,p_provider:'qwen',p_model:'synthetic-model',p_price_version:'synthetic-v1',p_reserved_micros:10}),{kind:'reserved'});return {a,r,lease,scope,attempt};}
const blocked={kind:'blocked'},args=x=>[x.a.owner,x.r.taskId,x.r.turnId,x.lease,x.a.policy,x.a.planningPolicy,x.scope,x.attempt,'qwen','synthetic-model','synthetic-v1',x.r.intakeContextDigest,x.r.planningContextDigest];
const privateQuery=(name,p)=>`select turn_private.${name}(${p.map(lit).join(',')});`;
const invoke=async(name,x,p=args(x))=>JSON.parse(await db(privateQuery(name,p)));
const bind=x=>invoke('bind_planning_v2_model_attempt_v1',x),read=x=>invoke('read_planning_v2_model_binding_v1',x),unknown=x=>invoke('unknown_planning_v2_model_attempt_v1',x);
const ledger=x=>db(`select jsonb_agg(to_jsonb(a)) from public.model_budget_attempts a where task_id='${x.r.taskId}';`),stored=x=>db(`select coalesce(jsonb_agg(to_jsonb(b)),'[]') from turn_private.planning_v2_model_attempt_bindings b where turn_id='${x.r.turnId}';`);
const dispatch=x=>svc('dispatch_model_budget',{p_scope_id:x.scope,p_owner_id:x.a.owner,p_attempt_id:x.attempt});
const finish=(x,action,actual=null)=>svc('finish_model_budget',{p_scope_id:x.scope,p_owner_id:x.a.owner,p_attempt_id:x.attempt,p_action:action,p_actual_micros:actual});
const currentCheckpoint=async x=>JSON.parse(await db(`select turn_private.read_planning_v2_checkpoints_v1('${x.a.owner}','${x.r.taskId}','${x.r.turnId}','${x.lease}','${x.r.intakeContextDigest}','${x.r.planningContextDigest}');`));
async function execute(x){
 const q=await bound(x.a,x.r,x.lease),qi=q.qualifiedIntake;
 const l={ownerId:x.a.owner,taskId:x.r.taskId,turnId:x.r.turnId,leaseToken:x.lease,artifactId:x.r.artifactId,planningPolicyId:x.a.planningPolicy,intakeContextDigest:x.r.intakeContextDigest,planningContextDigest:x.r.planningContextDigest,source:Object.fromEntries(['conversationId','goalId','goalVersion','messageId','messageSequence','intakeRevision','memoryBasis'].map(k=>[k,qi[k]])),environment:'local_synthetic',locale:'en'};
 const expected={...l,textPolicyId:x.a.policy,scopeId:x.scope,attemptId:x.attempt,provider:'qwen',model:'synthetic-model',priceVersion:'synthetic-v1'},calls={checkpoints:0,permit:0,claim:0,place:0,save:0,unknown:0,prepare:0,verify:0},trace={};
 const reject=key=>async()=>{calls[key]++;throw Error('test forbids '+key);};
 const ports={mode:'local_protocol_test',read:()=>bound(x.a,x.r,x.lease),now:Date.now,
  checkpoints:async()=>{calls.checkpoints++;const binding=await read(x),snapshot=await currentCheckpoint(x);trace.binding=binding;trace.snapshot=snapshot;
   try{const mapped=modelBindingWorkerSnapshot(snapshot,binding,expected);trace.modelAttempt=mapped.modelAttempt;return mapped;}catch(error){trace.blockReason=error.message;throw error;}},
  permit:async()=>{calls.permit++;return {kind:'not_supplied'};},claimPlace:reject('claim'),place:reject('place'),savePlace:reject('save'),unknownPlace:reject('unknown'),prepare:reject('prepare'),verifyPreparation:reject('verify')};
 const result=await runPlanningV2LocalProtocol(l,ports,new AbortController().signal);return {result,calls,trace};
}
function stopped(r,kind){assert.equal(r.result.kind,kind);assert.equal(r.result.executionAvailable,false);assert.equal(r.result.readyForPublication,false);for(const name of ['claim','place','save','unknown','prepare','verify'])assert.equal(r.calls[name],0,name+' must not be called');}
run('real reserved/dispatched/pending/settled receipts map exact enums and cannot start place/provider/preparation',async t=>{
 const observations=[];
 for(const status of ['reserved','dispatched','pending','settled']){const x=await fixture();await bind(x);if(status!=='reserved')await dispatch(x);if(status==='pending')await finish(x,'pending');if(status==='settled')await finish(x,'settle',0);
  const before=await ledger(x),row=await stored(x),r=await execute(x);assert.equal(r.trace.binding.ledgerStatus,status);assert.equal(Object.keys(r.trace.binding).length,22);assert.equal(r.trace.binding.actualMicros,status==='settled'?0:null);assert.equal(r.trace.modelAttempt,status);assert.notEqual(r.trace.modelAttempt,'none');stopped(r,['pending','dispatched'].includes(status)?'unknown_effect':'blocked');assert.equal(r.calls.permit,0);assert.equal(await ledger(x),before);assert.equal(await stored(x),row);observations.push({status,outcome:r.result.kind,modelAttempt:r.trace.modelAttempt,actualMicros:r.trace.binding.actualMicros});
 }
 t.diagnostic(JSON.stringify({mapping:observations,providerCalls:0,normalWorkerImport:true}));
});
run('sticky unknown across all actual states has no safe enum mapping and blocks before any permit',async t=>{
 const blockedStates=[];
 for(const status of ['reserved','dispatched','pending','settled','released']){const x=await fixture();await bind(x);await unknown(x);if(status==='released')await finish(x,'release');else if(status!=='reserved')await dispatch(x);if(status==='pending')await finish(x,'pending');if(status==='settled')await finish(x,'settle',3);
  const before=await ledger(x),row=await stored(x),r=await execute(x);assert.equal(r.trace.binding.unknown,true);assert.equal(r.trace.binding.ledgerStatus,status);assert.match(r.trace.blockReason,/sticky unknown has no exact/);stopped(r,'blocked');assert.equal(r.calls.permit,0);assert.equal(r.trace.modelAttempt,undefined);assert.equal(await ledger(x),before);assert.equal(await stored(x),row);blockedStates.push(status);
 }
 t.diagnostic(JSON.stringify({stickyUnknownStates:blockedStates,mapping:'blocked; no invented pending/none/released',providerCalls:0}));
});
run('clean released keeps NULL money and released enum but still needs the independent missing permit',async t=>{
 const x=await fixture();await bind(x);await finish(x,'release');const before=await ledger(x),r=await execute(x);assert.equal(r.trace.binding.actualMicros,null);assert.equal(r.trace.binding.unknown,false);assert.equal(r.trace.modelAttempt,'released');stopped(r,'blocked');assert.equal(r.calls.permit,1);assert.equal(await ledger(x),before);t.diagnostic('released is not none; actual independent permit absent, zero claim/place/provider/prepare');
});
run('real SQL missing/ambiguous binding cannot become fabricated none or restore processing',async t=>{
 for(const mode of ['unbound','ambiguous']){const x=await fixture();if(mode==='ambiguous'){await bind(x);await svc('reserve_model_budget',{p_scope_id:x.scope,p_owner_id:x.a.owner,p_task_id:x.r.taskId,p_attempt_id:uuid(),p_provider:'qwen',p_model:'synthetic-model',p_price_version:'synthetic-v1',p_reserved_micros:1});}
  const before=await ledger(x),r=await execute(x);assert.deepEqual(r.trace.binding,{kind:'blocked'});assert.match(r.trace.blockReason,/binding read unavailable/);stopped(r,'blocked');assert.equal(r.calls.permit,0);assert.equal(await ledger(x),before);assert.equal(r.trace.modelAttempt,undefined);
 }
 t.diagnostic(JSON.stringify({network:'none',container,migrations:'all actual checkout',modelBinding:'13tuple/22keys real SQL',providerCalls:0}));
});

run('a real completed place checkpoint cannot bypass model state or sticky released unknown',async t=>{
 for(const status of ['reserved','dispatched','pending','settled','released']){const x=await fixture(false,'v2',true);await bind(x);if(status==='released'){await unknown(x);await finish(x,'release');}else if(status!=='reserved')await dispatch(x);if(status==='pending')await finish(x,'pending');if(status==='settled')await finish(x,'settle',3);
  const before=await ledger(x),r=await execute(x);assert.equal(r.trace.snapshot.place.state,'completed');stopped(r,['dispatched','pending'].includes(status)?'unknown_effect':'blocked');assert.equal(r.calls.permit,0);assert.equal(await ledger(x),before);
  if(status==='released')assert.match(r.trace.blockReason,/sticky unknown/);
 }
 t.diagnostic('Actual 40000 completed checkpoint preserved; blocked fiscal/sticky state cannot start preparation');
});
