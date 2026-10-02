// Explicit local preparation: frozen backend SQL snapshot, no runtime migration
// or future bridge RPC is installed by this test. Synthetic actor claims only.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {runPlanningComparisonWorker} from '../../../lib/server/turn/planning-comparison-worker.ts';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VPJ80_INTAKE_ADMISSION_PREP==='1',container='vpj80-intake-prep-'+uuid().slice(0,8);
const bridge='20261003020000_vpj80_intake_admission_binding.sql';
const snapshot='4728c18f96d60138cbc6718fc31f5f10ae3ad20b',migration='20261002200000_vpj78_explicit_travel_intake.sql';
let created=false;
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const lit=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const query=(a,name,p)=>`begin;set role authenticated;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({session_id:a.session})}';select public.${name}(`+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');commit;';
const raw=(a,name,p)=>sql(container,query(a,name,p));
const call=async(a,name,p)=>{const r=await raw(a,name,p);assert.equal(r.code,0,r.stderr);return JSON.parse(r.stdout.trim());};
const projection={schemaVersion:'stay-area-intake/1',city:'shanghai',comparisonTarget:'area_transport',durationDays:10,partySize:2,interests:['food','photography'],pace:'relaxed',lodgingBudget:null,dates:null,mobilityConstraints:[]};
const notice='a'.repeat(64);
async function owner(environment='staging',goalText='First China visit, ten days with partner, food and photography, relaxed pace.'){
 const a={owner:uuid(),session:uuid(),policy:uuid(),planningPolicy:uuid(),conversation:uuid(),goal:uuid(),source:uuid()};
 await db(`insert into auth.users(id) values('${a.owner}');insert into identity_private.mobile_accounts(owner_id) values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');
 insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at)
 values('${a.policy}','qwen','synthetic only','https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions','fixture','fixture','fixture','test','test','${notice}','合成','Synthetic','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day');
 insert into turn_private.planning_policies(id,text_policy_id,environment,notice_version,notice_hash,notice_zh,notice_en,effective_at,expires_at)
 values('${a.planningPolicy}','${a.policy}','${environment}','test','${notice}','合成','Synthetic',now()-interval '1 hour',now()+interval '1 day');`);
 await call(a,'accept_text_policy',{p_policy_id:a.policy,p_notice_hash:notice});await call(a,'accept_planning_policy_v1',{p_policy_id:a.planningPolicy,p_notice_hash:notice});
 a.input={p_conversation_id:a.conversation,p_goal_id:a.goal,p_message_id:a.source,p_parent_message_id:null,p_expected_goal_version:null,p_expected_intake_revision:0,p_idempotency_key:uuid(),p_policy_id:a.policy,p_locale:'en',p_text:goalText,p_relationship:'goal_start',p_intake:projection,p_memory_basis:[]};
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
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f!==migration&&f!==bridge).sort())await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
 const fixed=await command('git',['show',snapshot+':supabase/migrations/'+migration]);assert.equal(fixed.code,0,'Frozen backend snapshot must exist locally; not an arbitrary fallback. '+fixed.stderr);await db('begin;'+fixed.stdout+'commit;');
 if(process.env.VPJ80_INTAKE_ADMISSION_V2==='1')await db('begin;'+readFileSync('supabase/migrations/'+bridge,'utf8')+'commit;');
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

run('staged Task then nested old planning admission is rejected and fully rolled back',async t=>{
 const a=await owner(),p=planning(a),before=await state(a);
 const staged={p_thread_id:p.p_thread_id,p_turn_id:p.p_turn_id,p_idempotency_key:p.p_task_key,p_policy_id:p.p_text_policy_id,p_locale:p.p_locale,p_text:p.p_text,p_task_id:p.p_task_id,p_scope_version:1,p_relationship:'new_goal',p_parent_turn_id:null};
 const first=query(a,'submit_service_task_turn',staged).replace('commit;','');
 const second='select public.submit_planning_comparison_v1('+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');commit;';
 const r=await sql(container,first+second);assert.notEqual(r.code,0);assert.match(r.stderr,/SERVICE_TASK_CONFLICT/);assert.equal(await state(a),before);
 t.diagnostic(JSON.stringify({disprovenComposition:'stage_task_then_nested_v1',exit:r.code,error:r.stderr.trim(),rollback:true}));
});

const v2=a=>({...planning(a),p_expected_intake_message_id:a.source,p_expected_source_sequence:1,p_expected_intake_revision:1,p_expected_intake_digest:a.receipt.contextDigest,p_intake:projection});
const runV2=(name,fn)=>test(name,{skip:!enabled||process.env.VPJ80_INTAKE_ADMISSION_V2!=='1',timeout:120000},fn);
runV2('v2 atomically binds new latest typed source with distinct digests and idempotent receipts',async t=>{
 const a=await owner(),p=v2(a),r=await call(a,'submit_planning_comparison_v2',p);
 assert.equal(r.current,true);assert.equal(r.readyForProvider,false);assert.equal(r.executionAvailable,false);assert.equal(r.goalVersion,1);assert.equal(r.messageSequence,2);assert.equal(r.intakeRevision,2);
 assert.notEqual(r.intakeContextDigest,a.receipt.contextDigest);assert.notEqual(r.intakeContextDigest,r.planningContextDigest);
 assert.equal(await db(`select execution_mode from turn_private.work where turn_id='${r.turnId}';`),'planning_intake_comparison_v2');
 const read=await call(a,'read_assistant_travel_intake_v1',{p_policy_id:a.policy,p_conversation_id:a.conversation,p_goal_id:a.goal});assert.equal(read.messageId,p.p_message_id);assert.equal(read.intakeRevision,2);assert.equal(read.contextDigest,r.intakeContextDigest);assert.deepEqual(read.intake,projection);
 const repeated=await call(a,'submit_planning_comparison_v2',p);assert.deepEqual(repeated,{...r,reused:true});
 const before=await state(a),changed=await raw(a,'submit_planning_comparison_v2',{...p,p_intake:{...projection,pace:'balanced'}});assert.notEqual(changed.code,0);assert.match(changed.stderr,/IDEMPOTENCY_KEY_REUSE/);assert.equal(await state(a),before);
 const amendment={...a.input,p_message_id:uuid(),p_parent_message_id:r.messageId,p_expected_goal_version:1,p_expected_intake_revision:2,p_idempotency_key:uuid(),p_relationship:'amendment',p_text:'Explicit correction',p_intake:{...projection,pace:'balanced'}};
 await call(a,'submit_assistant_travel_intake_v1',amendment);
 const historical=await call(a,'submit_planning_comparison_v2',p);assert.equal(historical.current,false);for(const k of ['intakeContextDigest','planningContextDigest','intake','memoryBasis'])assert.equal(Object.hasOwn(historical,k),false);for(const k of ['taskId','turnId','artifactId','messageId','messageSequence','intakeRevision','goalVersion'])assert.equal(historical[k],r[k]);
 await call(a,'withdraw_planning_policy_v1',{p_policy_id:a.planningPolicy});const revoked=await raw(a,'submit_planning_comparison_v2',p);assert.notEqual(revoked.code,0);assert.match(revoked.stderr,/DATA_POLICY_BLOCKED/);
 t.diagnostic(JSON.stringify({boundReceipt:r,historicalReceipt:historical,revokedExit:revoked.code}));
});
runV2('v2 rejects changed projection, identities, schema and Memory refs without provisional writes',async()=>{
 for(const patch of [
  {p_intake:{...projection,pace:'balanced'}},{p_expected_intake_message_id:uuid()},{p_expected_source_sequence:2},{p_expected_intake_revision:2},{p_expected_intake_digest:'0'.repeat(64)},
  {p_expected_goal_version:2},{p_memory_basis:[{id:uuid(),revision:1}]},{p_intake:{...projection,schemaVersion:null}},
  {p_intake:{...projection,interests:null}},{p_intake:{...projection,city:null}},
 ]){const a=await owner(),before=await state(a),r=await raw(a,'submit_planning_comparison_v2',{...v2(a),...patch});assert.notEqual(r.code,0);assert.match(r.stderr,/INVALID_INPUT|SERVICE_TASK_CONFLICT|MEMORY_CONFLICT/);assert.equal(await state(a),before);assert.equal(await db(`select count(*) from turn_private.planning_intake_bindings where owner_id='${a.owner}';`),'0');}
});
runV2('v2 source sequence is exact while new sequence follows the SQL conversation allocator',async()=>{
 const a=await owner();await call(a,'submit_assistant_message_v1',{p_conversation_id:a.conversation,p_message_id:uuid(),p_idempotency_key:uuid(),p_policy_id:a.policy,p_locale:'en',p_text:'Separate owned goal',p_relationship:'goal_start',p_goal_id:uuid(),p_expected_goal_version:null,p_task_id:null,p_parent_message_id:null,p_turn_id:null});
 const r=await call(a,'submit_planning_comparison_v2',v2(a));assert.equal(r.messageSequence,3);assert.equal(r.intakeRevision,2);assert.equal(r.current,true);
});
runV2('v2 same-key and different-key races preserve one exact atomic binding',async()=>{
 for(const same of [true,false]){const a=await owner(),p=v2(a),q=same?p:v2(a),results=await Promise.all([raw(a,'submit_planning_comparison_v2',p),raw(a,'submit_planning_comparison_v2',q)]);
  if(same){for(const r of results)assert.equal(r.code,0,r.stderr);const rs=results.map(r=>JSON.parse(r.stdout.trim()));assert.equal(rs[0].artifactId,rs[1].artifactId);assert.deepEqual(rs.map(r=>r.reused).sort(),[false,true]);}
  else{assert.deepEqual(results.map(r=>r.code===0).sort(),[false,true]);assert.match(results.find(r=>r.code!==0).stderr,/SERVICE_TASK_CONFLICT/);}
  const s=JSON.parse(await state(a));assert.equal(s.tasks,1);assert.equal(s.work,1);assert.equal(s.planning,1);assert.equal(s.intakes,2);assert.equal(s.messages,2);assert.equal(s.attempts,0);assert.equal(await db(`select count(*) from turn_private.planning_intake_bindings where owner_id='${a.owner}';`),'1');
 }
});
runV2('v2 late private binding failure rolls back message, intake, Task, work and enforced capacity',async()=>{
 await db("update turn_private.service_task_capacity_settings set enabled=true;");
 const a=await owner(),before=await state(a);
 await db("create function turn_private.prep_reject_binding() returns trigger language plpgsql as $$begin if (select count(*) from turn_private.service_task_capacity where task_id=(select task_id from turn_private.planning_comparisons where turn_id=new.turn_id) and state='reserved')<>1 or (select count(*) from turn_private.assistant_travel_intakes where message_id=new.message_id)<>1 then raise exception 'PREP_EFFECT_PRECONDITION_FAIL';end if;raise exception 'PREP_BINDING_FAIL';end$$;create trigger prep_reject_binding before insert on turn_private.planning_intake_bindings for each row execute function turn_private.prep_reject_binding();");
 const r=await raw(a,'submit_planning_comparison_v2',v2(a));assert.notEqual(r.code,0);assert.match(r.stderr,/PREP_BINDING_FAIL/);assert.equal(await state(a),before);assert.equal(await db(`select count(*) from turn_private.planning_intake_bindings where owner_id='${a.owner}';`),'0');
 await db("drop trigger prep_reject_binding on turn_private.planning_intake_bindings;drop function turn_private.prep_reject_binding();update turn_private.service_task_capacity_settings set enabled=false;");
});
runV2('synthetic valid v2 lease cannot use any legacy read, dispatch, checkpoint or completion entry',async t=>{
 const a=await owner(),r=await call(a,'submit_planning_comparison_v2',v2(a)),lease=uuid(),digest='a'.repeat(64),attempt=uuid();
 const svc=async(name,params)=>{const x=await sql(container,`set role service_role;set request.jwt.claim.role='service_role';select public.${name}(`+Object.entries(params).map(([k,v])=>k+'=>'+lit(v)).join(',')+');');assert.equal(x.code,0,x.stderr);return JSON.parse(x.stdout.trim());};
 assert.equal((await svc('claim_planning_comparison_work_v1',{p_owner_id:a.owner,p_planning_policy_id:a.planningPolicy})).kind,'empty');
 assert.equal((await svc('claim_text_work',{p_owner_id:a.owner,p_policy_id:a.policy})).kind,'empty');
 await db(`update turn_private.work set state='leased',lease_token='${lease}',expires_at=clock_timestamp()+interval '60 seconds' where turn_id='${r.turnId}';`);
 const bound=JSON.parse(await db(`select turn_private.read_planning_qualified_intake_v1('${a.owner}','${r.turnId}','${lease}');`));assert.equal(bound.kind,'planning_intake_input');assert.equal(bound.intakeContextDigest,r.intakeContextDigest);assert.equal(bound.planningContextDigest,r.planningContextDigest);
 const keys={p_turn_id:r.turnId,p_lease_token:lease},entries=[
  ['read_text_work',keys],['authorize_text_dispatch',{...keys,p_policy_id:a.policy,p_provider:'qwen'}],['authorize_text_task_dispatch',{...keys,p_policy_id:a.policy,p_provider:'qwen',p_context_digest:digest}],
  ['complete_text_work',{...keys,p_kind:'answered',p_text:'Synthetic late text'}],['read_grounded_work',keys],['authorize_grounded_dispatch',{...keys,p_policy_id:a.policy,p_provider:'qwen',p_context_digest:digest}],
  ['complete_grounded_work',{...keys,p_intent:'fallback',p_request_scope:'single'}],['complete_grounded_work_with_needs',{...keys,p_intent:'fallback',p_request_scope:'single',p_unanswered_needs:'[]'}],['complete_grounded_place_work',{...keys,p_intent:'place_address',p_request_scope:'single',p_unanswered_needs:'[]',p_place_name:'Shanghai'}],
  ['finish_turn_work',{...keys,p_outcome:'completed'}],['claim_planning_action_v1',{...keys,p_owner_id:a.owner,p_message_id:r.messageId,p_action_key:digest,p_tool_id:'place.read',p_input_digest:digest,p_memory_basis:[]}],
  ['finish_planning_action_v1',{...keys,p_owner_id:a.owner,p_action_key:digest,p_receipt_digest:digest}],['read_planning_comparison_work_v1',keys],['authorize_planning_read_v1',{...keys,p_context_digest:digest}],['authorize_planning_dispatch_v1',{...keys,p_context_digest:digest,p_scope_id:uuid(),p_attempt_id:attempt}],
  ['pause_planning_comparison_v1',keys],['complete_planning_observation_v1',{...keys,p_owner_id:a.owner,p_action_key:digest,p_observation:{}}],['read_planning_observations_v1',keys],['complete_planning_comparison_v1',{...keys,p_owner_id:a.owner,p_result_action_key:digest,p_model_attempt_id:attempt,p_text:'Synthetic',p_content:{}}],
 ];
 const before=await state(a);for(const [name,params] of entries){const x=await svc(name,params);assert.ok(['blocked','stale'].includes(x.kind),name+' '+JSON.stringify(x));assert.equal(await state(a),before);}
 for(const table of ['text_dispatches','planning_model_dispatches','planning_action_receipts','planning_observations'])assert.equal(await db(`select count(*) from turn_private.${table} where turn_id='${r.turnId}';`),'0',table);
 assert.equal(await db(`select count(*) from turn_private.result_artifacts where id='${r.artifactId}';`),'0');assert.equal(await db(`select count(*) from turn_private.result_events where artifact_id='${r.artifactId}';`),'0');assert.equal(await db(`select status from public.turns where id='${r.turnId}';`),'accepted');
 const correctionParams={...a.input,p_message_id:uuid(),p_parent_message_id:r.messageId,p_expected_goal_version:1,p_expected_intake_revision:2,p_idempotency_key:uuid(),p_relationship:'amendment',p_text:'Explicit correction',p_intake:{...projection,pace:'balanced'}};await call(a,'submit_assistant_travel_intake_v1',correctionParams);
 assert.equal(JSON.parse(await db(`select turn_private.read_planning_qualified_intake_v1('${a.owner}','${r.turnId}','${lease}');`)).kind,'blocked');
 t.diagnostic(JSON.stringify({legacyEntriesBlocked:entries.map(x=>x[0]),validLease:lease,qualifiedIntakeDigest:r.intakeContextDigest,planningContextDigest:r.planningContextDigest,dispatches:0,artifacts:0,events:0}));
});
runV2('common actor lock serializes the mixed legacy C/G-to-Task writer and v2 rolls back',async t=>{
 const a=await owner(),old=planning(a),oldReceipt=await call(a,'submit_planning_comparison_v1',old);
 const corrected={...a.input,p_message_id:uuid(),p_parent_message_id:old.p_message_id,p_expected_goal_version:1,p_expected_intake_revision:1,p_idempotency_key:uuid(),p_relationship:'amendment',p_text:'Explicit current typed input after old Task',p_intake:projection};
 const source=await call(a,'submit_assistant_travel_intake_v1',corrected),p={...v2(a),p_parent_message_id:source.messageId,p_expected_intake_message_id:source.messageId,p_expected_source_sequence:source.messageSequence,p_expected_goal_version:source.goalVersion,p_expected_intake_revision:source.intakeRevision,p_expected_intake_digest:source.contextDigest};
 const tag='vpj80-mixed-'+uuid().slice(0,8);
 const taskHolder=sql(container,`begin;set application_name='${tag}-task';select id from turn_private.service_tasks where id='${oldReceipt.taskId}' for update;select pg_sleep(3);commit;`);
 const wait=async q=>{const end=Date.now()+4000;while(await db(q)!=='t'){if(Date.now()>end)assert.fail('mixed writer barrier missing');await new Promise(r=>setTimeout(r,20));}};
 await wait(`select exists(select 1 from pg_stat_activity where application_name='${tag}-task' and wait_event='PgSleep');`);
 const legacy={p_conversation_id:a.conversation,p_message_id:uuid(),p_idempotency_key:uuid(),p_policy_id:a.policy,p_locale:'en',p_text:'Legacy linked Task follow-up',p_relationship:'follow_up',p_goal_id:a.goal,p_expected_goal_version:source.goalVersion,p_task_id:oldReceipt.taskId,p_parent_message_id:source.messageId,p_turn_id:null};
 const legacyRun=sql(container,query(a,'submit_assistant_message_v1',legacy).replace('begin;',`begin;set application_name='${tag}-legacy';`));
 await wait(`select exists(select 1 from pg_stat_activity where application_name='${tag}-legacy' and wait_event_type='Lock');`);
 const before=await state(a),candidateRun=sql(container,query(a,'submit_planning_comparison_v2',p).replace('begin;',`begin;set application_name='${tag}-candidate';`));
 await wait(`select exists(select 1 from pg_stat_activity where application_name='${tag}-candidate' and wait_event_type='Lock');`);
 const chain=JSON.parse(await db(`select jsonb_agg(jsonb_build_object('application',x.application_name,'wait',x.wait_event_type,'blockedBy',(select jsonb_agg(b.application_name) from pg_stat_activity b where b.pid=any(pg_blocking_pids(x.pid))))) from pg_stat_activity x where x.application_name in ('${tag}-legacy','${tag}-candidate');`));
 assert.ok(chain.find(x=>x.application===tag+'-candidate').blockedBy.includes(tag+'-legacy'));assert.ok(chain.find(x=>x.application===tag+'-legacy').blockedBy.includes(tag+'-task'));
 const r=await candidateRun;assert.notEqual(r.code,0);assert.match(r.stderr,/SERVICE_TASK_CONFLICT/);assert.ok(!r.stderr.includes('deadlock'));
 for(const [table,id] of [['turn_private.service_tasks',p.p_task_id],['public.turns',p.p_turn_id],['turn_private.assistant_messages',p.p_message_id]])assert.equal(await db(`select count(*) from ${table} where id='${id}';`),'0',table);
 for(const table of ['work','planning_comparisons','planning_intake_bindings'])assert.equal(await db(`select count(*) from turn_private.${table} where turn_id='${p.p_turn_id}';`),'0',table);
 assert.equal(await db(`select count(*) from turn_private.service_task_capacity where task_id='${p.p_task_id}';`),'0');
 assert.equal(await db(`select count(*) from turn_private.assistant_travel_intakes where message_id='${p.p_message_id}';`),'0');
 assert.equal(await db(`select count(*) from turn_private.planning_intake_bindings where owner_id='${a.owner}' and request_key='${p.p_message_key}';`),'0');
 const done=await Promise.all([taskHolder,legacyRun]);for(const x of done)assert.equal(x.code,0,x.stderr);
 const final=JSON.parse(await state(a)),previous=JSON.parse(before);assert.equal(final.messages,previous.messages+1);assert.equal(final.sequence,previous.sequence+1);for(const k of ['tasks','work','intakes','planning','capacity','attempts','goalVersion'])assert.equal(final[k],previous[k]);
 assert.equal(await db(`select count(*) from turn_private.assistant_messages where id='${legacy.p_message_id}' and owner_id='${a.owner}' and goal_id='${a.goal}' and task_id='${oldReceipt.taskId}' and parent_message_id='${source.messageId}';`),'1');
 t.diagnostic(JSON.stringify({owner:a.owner,goal:a.goal,sourceMessage:source.messageId,legacyMessage:legacy.p_message_id,legacyTask:oldReceipt.taskId,candidateTask:p.p_task_id,candidateTurn:p.p_turn_id,candidateMessage:p.p_message_id,lockChain:chain,holderExit:done[0].code,legacyExit:done[1].code,legacyReceipt:JSON.parse(done[1].stdout.trim()),legacyObservedWait:'Lock',commonActorGate:'text_owner -> guard_mobile_rpc_v2 account UPDATE',v2Exit:r.code,v2Error:r.stderr.trim(),legacyCompleted:true,provisionalRollback:true}));
});
runV2('v2 ACL, foreign actor/session and policy withdrawal preserve zero admission effects',async()=>{
 const signature='public.submit_planning_comparison_v2(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,jsonb,uuid,bigint,integer,text,jsonb)';
 for(const role of ['anon','authenticated','service_role']){
  assert.equal(await db(`select has_function_privilege('${role}','${signature}','EXECUTE');`),role==='authenticated'?'t':'f');
  for(const helper of ['turn_private.bind_planning_travel_intake_v1(uuid,uuid,uuid,bigint,integer,integer,text,jsonb,jsonb,uuid,text)','turn_private.read_planning_qualified_intake_v1(uuid,uuid,uuid)'])assert.equal(await db(`select has_function_privilege('${role}','${helper}','EXECUTE');`),'f');
  assert.equal(await db(`select has_table_privilege('${role}','turn_private.planning_intake_bindings','SELECT,INSERT,UPDATE,DELETE');`),'f');
 }
 const a=await owner(),b=await owner(),beforeA=await state(a),beforeB=await state(b),p=v2(a);
 // Legitimately accept the shared policy so a foreign goal, not absent consent,
 // is the negative boundary under test.
 await call(b,'accept_text_policy',{p_policy_id:a.policy,p_notice_hash:notice});await call(b,'accept_planning_policy_v1',{p_policy_id:a.planningPolicy,p_notice_hash:notice});
 const foreign=await raw(b,'submit_planning_comparison_v2',p);assert.notEqual(foreign.code,0);assert.match(foreign.stderr,/DATA_POLICY_BLOCKED|SERVICE_TASK_CONFLICT/);assert.equal(await state(a),beforeA);assert.equal(await state(b),beforeB);
 const badSession=await raw({...a,session:uuid()},'submit_planning_comparison_v2',p);assert.notEqual(badSession.code,0);assert.match(badSession.stderr,/UNAUTHENTICATED|SESSION_REPLACED/);assert.equal(await state(a),beforeA);
 await call(a,'withdraw_text_policy',{p_policy_id:a.policy});const denied=await raw(a,'submit_planning_comparison_v2',p);assert.notEqual(denied.code,0);assert.match(denied.stderr,/DATA_POLICY_BLOCKED/);assert.equal(await state(a),beforeA);
});
runV2('v2 exact Memory set is canonical, retained and rechecked for update/withdrawal',async()=>{
 for(const mutation of ['none','update','withdraw']){
  const a=await owner(),memories=[uuid(),uuid()].sort(),consents=[uuid(),uuid()];
  for(let n=0;n<2;n++){const receipt=uuid();await db(`begin;insert into public.memory_consents(id,owner_id,status) values('${consents[n]}','${a.owner}','granted');insert into public.memory_profiles(id,owner_id,source_receipt_id,consent_id,state,constraint_kind,summary) values('${memories[n]}','${a.owner}','${receipt}','${consents[n]}','explicit','preference','Synthetic explicit preference ${n}');insert into public.memory_receipts(id,owner_id,memory_id,event_state,source_kind) values('${receipt}','${a.owner}','${memories[n]}','explicit','user_confirmed');commit;`);}
  const refs=memories.map(id=>({id,revision:1})),source=await call(a,'submit_assistant_travel_intake_v1',{...a.input,p_message_id:uuid(),p_parent_message_id:a.source,p_expected_goal_version:1,p_expected_intake_revision:1,p_idempotency_key:uuid(),p_relationship:'amendment',p_text:'Explicit projection and selected memory',p_memory_basis:refs});
  const p={...v2(a),p_parent_message_id:source.messageId,p_expected_intake_message_id:source.messageId,p_expected_source_sequence:source.messageSequence,p_expected_goal_version:source.goalVersion,p_expected_intake_revision:source.intakeRevision,p_expected_intake_digest:source.contextDigest,p_memory_basis:[...refs].reverse()};
  if(mutation==='update')await db(`update public.memory_profiles set summary='Explicitly corrected preference' where id='${memories[0]}';`);
  if(mutation==='withdraw')await db(`update public.memory_consents set status='revoked' where id='${consents[0]}';`);
  const before=await state(a),r=await raw(a,'submit_planning_comparison_v2',p);
  if(mutation==='none'){assert.equal(r.code,0,r.stderr);const accepted=JSON.parse(r.stdout.trim());assert.equal(accepted.current,true);assert.deepEqual((await call(a,'read_assistant_travel_intake_v1',{p_policy_id:a.policy,p_conversation_id:a.conversation,p_goal_id:a.goal})).memoryBasis,refs);const repeat=await call(a,'submit_planning_comparison_v2',{...p,p_memory_basis:refs});assert.deepEqual(repeat,{...accepted,reused:true});}
  else{assert.notEqual(r.code,0);assert.match(r.stderr,/SERVICE_TASK_CONFLICT|MEMORY_CONFLICT/);assert.equal(await state(a),before);}
 }
});

runV2('v2 conversation NOWAIT fails fast after provisional Task admission with complete rollback',async t=>{
 const a=await owner(),before=await state(a),tag='vpj80-cg-'+uuid().slice(0,8);
 const holder=sql(container,`begin;set application_name='${tag}';select id from turn_private.assistant_conversations where id='${a.conversation}' for update;select pg_sleep(2);commit;`);
 const end=Date.now()+4000;while(await db(`select exists(select 1 from pg_stat_activity where application_name='${tag}' and wait_event='PgSleep');`)!=='t'){if(Date.now()>end)assert.fail('conversation hold missing');await new Promise(r=>setTimeout(r,20));}
 const start=Date.now(),r=await raw(a,'submit_planning_comparison_v2',v2(a));assert.notEqual(r.code,0);assert.match(r.stderr,/SERVICE_TASK_CONFLICT/);assert.ok(Date.now()-start<1500,'NOWAIT must reject while holder still owns C/G');assert.equal(await state(a),before);assert.equal((await holder).code,0);t.diagnostic(JSON.stringify({nowaitExit:r.code,rollback:true}));
});

runV2('legacy text and v1 planning still commit under the appended v2 isolation guards',async()=>{
 const trace=[];const service=async(name,p={})=>{const r=await sql(container,`set role service_role;set request.jwt.claim.role='service_role';select public.${name}(`+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');');assert.equal(r.code,0,r.stderr);const value=JSON.parse(r.stdout.trim());trace.push([name,value]);return value;};
 const text=await owner(),turn=uuid();assert.equal((await call(text,'submit_text_turn',{p_thread_id:uuid(),p_turn_id:turn,p_idempotency_key:uuid(),p_policy_id:text.policy,p_locale:'en',p_text:'Synthetic text question'})).kind,'accepted');
 const lease=await service('claim_text_work',{p_owner_id:text.owner,p_policy_id:text.policy});assert.equal(lease.turnId,turn);
 assert.equal((await service('read_text_work',{p_turn_id:turn,p_lease_token:lease.leaseToken})).kind,'input');
 assert.equal((await service('authorize_text_dispatch',{p_turn_id:turn,p_lease_token:lease.leaseToken,p_policy_id:text.policy,p_provider:'qwen'})).kind,'authorized');
 assert.equal((await service('complete_text_work',{p_turn_id:turn,p_lease_token:lease.leaseToken,p_kind:'answered',p_text:'Synthetic provider text answer.'})).kind,'finished');
 assert.equal(await db(`select status from public.turns where id='${turn}';`),'completed');
 const a=await owner('local_synthetic','Compare Shanghai stay areas without choosing dates'),p=planning(a),admitted=await call(a,'submit_planning_comparison_v1',p),scope=uuid();
 await db(`insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at) values('${scope}','${a.owner}','CNY',1000000,100000,10,1,true,now()+interval '1 day');insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled) values('${scope}','qwen','qwen3.7-plus-2026-05-26','test-v1',1000000,1000,true);`);
 let calls=0;const result=await runPlanningComparisonWorker(service,service,service,{environment:'local_synthetic',ownerId:a.owner,planningPolicyId:a.planningPolicy,scopeId:scope,priceVersion:'test-v1',reservedMicros:1000,timeoutMs:10000,maxOutputTokens:256},
  {provider:'qwen',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',transport:async()=>{calls++;return Response.json({model:'qwen3.7-plus-2026-05-26',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:'{"highlight":"peoples_square"}'}}],usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30}});},price:()=>7,evidenceLookup:async()=>({schemaVersion:'planning-evidence/1',coverage:'not_integrated'}),placeRead:async()=>({schemaVersion:'planning-place/1',source:'synthetic_fixture',observedAt:new Date().toISOString(),providerCalls:0,areas:[{id:'jingan',label:"Jing'an Temple anchor",railMinutes:21,transfers:1},{id:'peoples_square',label:"People's Square anchor",railMinutes:16,transfers:0}]})},new AbortController().signal);
 assert.equal(result,'finished');assert.equal(calls,1,JSON.stringify(trace)+' '+await db(`select jsonb_build_object('policyEnvironment',p.environment,'work',w.state,'job',j.state,'actions',(select jsonb_agg(jsonb_build_array(x.tool_id,x.state)) from turn_private.planning_action_receipts x where x.turn_id=j.turn_id)) from turn_private.planning_comparisons j join turn_private.work w on w.turn_id=j.turn_id join turn_private.planning_policies p on p.id=j.planning_policy_id where j.turn_id='${admitted.turnId}';`));const artifact=await call(a,'read_result_artifacts_v1',{p_artifact_id:admitted.artifactId,p_revision:null});assert.equal(artifact.kind,'result_artifact');assert.equal(artifact.current,true);assert.equal(await db(`select status from public.model_budget_attempts where task_id='${p.p_task_id}';`),'settled');
});
runV2('binding metadata export is service-only bounded owner pagination with safe cascade deletion',async()=>{
 const a=await owner(),b=await owner(),receipts=[];let source=a.receipt;
 for(let i=0;i<3;i++){const p={...v2(a),p_parent_message_id:source.messageId,p_expected_intake_message_id:source.messageId,p_expected_source_sequence:source.messageSequence,p_expected_intake_revision:source.intakeRevision,p_expected_intake_digest:source.intakeContextDigest??source.contextDigest,p_expected_goal_version:source.goalVersion};source=await call(a,'submit_planning_comparison_v2',p);receipts.push(source);}
 const other=await call(b,'submit_planning_comparison_v2',v2(b));
 for(const role of ['anon','authenticated']){assert.equal(await db(`select has_function_privilege('${role}','public.planning_intake_binding_export_owner_v1(uuid,uuid,integer)','EXECUTE');`),'f');const r=await sql(container,`set role ${role};set request.jwt.claim.role='${role}';select public.planning_intake_binding_export_owner_v1('${a.owner}',null,1);`);assert.notEqual(r.code,0);assert.match(r.stderr,/permission denied/);}
 const serviceRaw=(owner,after=null,limit=1)=>sql(container,`set role service_role;set request.jwt.claim.role='service_role';select public.planning_intake_binding_export_owner_v1('${owner}',${lit(after)},${lit(limit)});`);
 let cursor=null,rows=[];for(let n=0;n<3;n++){const r=await serviceRaw(a.owner,cursor);assert.equal(r.code,0,r.stderr);const page=JSON.parse(r.stdout.trim());assert.equal(page.schemaVersion,'planning-intake-binding-export/1');assert.equal(page.items.length,1);assert.equal(page.items[0].owner_id,a.owner);assert.equal(page.hasMore,n<2);assert.equal(page.sectionComplete,n===2);assert.equal(page.nextCursor,n<2?page.items[0].turn_id:null);rows.push(page.items[0]);cursor=page.nextCursor;}
 assert.deepEqual(rows.map(x=>x.turn_id),receipts.map(x=>x.turnId).sort());assert.equal(new Set(rows.map(x=>x.turn_id)).size,3);
 for(const row of rows)for(const forbidden of ['leaseToken','lease_token','credential','input_text','intake','memory_basis'])assert.equal(Object.hasOwn(row,forbidden),false);
 const wrong=await serviceRaw(a.owner,other.turnId);assert.notEqual(wrong.code,0);assert.match(wrong.stderr,/INVALID_EXPORT_CURSOR/);
 for(const limit of [0,101,null]){const r=await serviceRaw(a.owner,null,limit);assert.notEqual(r.code,0);assert.match(r.stderr,/INVALID_INPUT/);}
 const otherPage=await serviceRaw(b.owner);assert.equal(otherPage.code,0);assert.deepEqual(JSON.parse(otherPage.stdout.trim()).items.map(x=>x.turn_id),[other.turnId]);
 await db(`delete from auth.users where id='${a.owner}';`);assert.equal(await db(`select count(*) from turn_private.planning_intake_bindings where owner_id='${a.owner}';`),'0');assert.equal(await db(`select count(*) from turn_private.assistant_travel_intakes where owner_id='${a.owner}';`),'0');
 const remaining=await serviceRaw(b.owner);assert.equal(remaining.code,0);assert.deepEqual(JSON.parse(remaining.stdout.trim()).items.map(x=>x.turn_id),[other.turnId]);
});
