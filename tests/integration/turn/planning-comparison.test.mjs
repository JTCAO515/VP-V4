// VPJ-80 bounded comparison on disposable PostgreSQL. All users, provider
// observations and model responses in this file are synthetic fixtures.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
import {runPlanningComparisonWorker} from '../../../lib/server/turn/planning-comparison-worker.ts';

const enabled=process.env.VP_TURN_DB_TEST==='1',container='vpj80-chain-'+uuid().slice(0,8);
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const lit=v=>v===null?'null':typeof v==='number'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const call=async(role,name,params,actor)=>{
 const claims=actor?`set request.jwt.claim.sub='${actor.owner}';set request.jwt.claims='${JSON.stringify({session_id:actor.session})}';`:'';
 const result=await sql(container,`${claims}set role ${role};set request.jwt.claim.role='${role}';select public.${name}(${Object.entries(params).map(([k,v])=>k+'=>'+lit(v)).join(',')});`);
 return result.code===0?JSON.parse(result.stdout.trim()):{error:result.stderr};
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
 const mine=files.findIndex(f=>f.endsWith('_vpj80_planning_comparison.sql'));assert.ok(mine>0);
 for(const f of files.slice(0,mine))await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
 const migration=readFileSync('supabase/migrations/'+files[mine],'utf8');
 await db('begin;'+migration+'rollback;');assert.equal(await db("select to_regclass('turn_private.planning_comparisons') is null;"),'t');
 await db('begin;'+migration+'commit;');
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});

test('planning comparison migration is disabled and service-only',{skip:!enabled,timeout:120000},async()=>{
 assert.equal(await db('select count(*) from turn_private.planning_policies;'),'0');
 assert.equal(await db('select count(*) from turn_private.planning_comparisons;'),'0');
 const denied=await call('authenticated','claim_planning_comparison_work_v1',{p_owner_id:uuid(),p_planning_policy_id:uuid()});
 assert.match(denied.error,/permission denied/i);
});

test('one synthetic owner task follows existing lease, checkpoint, budget and comparison readback',{skip:!enabled,timeout:120000},async()=>{
 const a={owner:uuid(),session:uuid(),policy:uuid(),planningPolicy:uuid(),conversation:uuid(),goal:uuid(),parent:uuid(),message:uuid(),
  thread:uuid(),turn:uuid(),task:uuid(),artifact:null};
 const notice='a'.repeat(64),digest='b'.repeat(64),now=new Date().toISOString();
 await db(`insert into auth.users(id) values('${a.owner}');insert into identity_private.mobile_accounts(owner_id) values('${a.owner}');
 insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');
 insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at)
 values('${a.policy}','qwen','synthetic test','https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions','fixture','fixture','fixture','test','test','${notice}','合成告知','Synthetic notice','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day');
 insert into turn_private.text_consents(owner_id,policy_id) values('${a.owner}','${a.policy}');
 insert into turn_private.planning_policies(id,text_policy_id,environment,notice_version,notice_hash,notice_zh,notice_en,effective_at,expires_at)
 values('${a.planningPolicy}','${a.policy}','local_synthetic','synthetic-v1','${notice}','合成规划告知','Synthetic planning notice',now()-interval '1 hour',now()+interval '1 day');`);
 const user=(name,p)=>call('authenticated',name,p,a),service=(name,p)=>call('service_role',name,p);
 const started=await user('submit_assistant_message_v1',{p_conversation_id:a.conversation,p_message_id:a.parent,p_idempotency_key:uuid(),
  p_policy_id:a.policy,p_locale:'en',p_text:'Compare Shanghai stay areas without choosing dates',p_relationship:'goal_start',p_goal_id:a.goal,
  p_expected_goal_version:null,p_task_id:null,p_parent_message_id:null,p_turn_id:null});
 assert.equal(started.kind,'accepted',JSON.stringify(started));
 assert.equal((await user('accept_planning_policy_v1',{p_policy_id:a.planningPolicy,p_notice_hash:notice})).kind,'accepted');
 assert.match((await sql(container,`update turn_private.planning_policies set notice_en='Changed recipient notice' where id='${a.planningPolicy}';`)).stderr,/IMMUTABLE_POLICY/);
 const admission={p_conversation_id:a.conversation,p_goal_id:a.goal,p_expected_goal_version:1,p_parent_message_id:a.parent,
  p_message_id:a.message,p_message_key:uuid(),p_thread_id:a.thread,p_turn_id:a.turn,p_task_id:a.task,p_task_key:uuid(),
  p_text_policy_id:a.policy,p_planning_policy_id:a.planningPolicy,p_locale:'en',p_text:'Compare Jing’an Temple and People’s Square for staying',p_memory_basis:'[]'};
 const accepted=await user('submit_planning_comparison_v1',admission);
 assert.equal(accepted.kind,'accepted',JSON.stringify(accepted));assert.equal(accepted.reused,false);a.artifact=accepted.artifactId;
 assert.equal((await user('submit_planning_comparison_v1',admission)).reused,true,'admission is idempotent');
 assert.equal(await db(`select execution_mode from turn_private.work where turn_id='${a.turn}';`),'planning_comparison_v1');
 assert.equal((await service('claim_text_work',{p_owner_id:a.owner,p_policy_id:a.policy})).kind,'empty','text claimer cannot steal planning');
 assert.equal((await service('claim_turn_work',{})).kind,'empty','legacy generic claimer cannot steal planning');
 assert.equal((await service('set_hosted_worker_enabled',{p_enabled:true,p_reason:'synthetic test'})).enabled,true);
 assert.deepEqual((await service('hosted_worker_ready_groups',{p_limit:10})).groups,[],'planning rows do not occupy hosted text group slots');
 await service('set_hosted_worker_enabled',{p_enabled:false,p_reason:'synthetic test'});
 const lease=await service('claim_planning_comparison_work_v1',{p_owner_id:a.owner,p_planning_policy_id:a.planningPolicy});
 assert.equal(lease.kind,'leased',JSON.stringify(lease));
 assert.equal((await service('read_text_work',{p_turn_id:a.turn,p_lease_token:lease.leaseToken})).kind,'blocked');
 assert.equal((await service('authorize_text_dispatch',{p_turn_id:a.turn,p_lease_token:lease.leaseToken,p_policy_id:a.policy,p_provider:'qwen'})).kind,'blocked');
 const input=await service('read_planning_comparison_work_v1',{p_turn_id:a.turn,p_lease_token:lease.leaseToken});
 assert.equal(input.kind,'planning_input',JSON.stringify(input));assert.equal(input.taskId,a.task);
 const keys={p_turn_id:a.turn,p_owner_id:a.owner,p_lease_token:lease.leaseToken,p_message_id:a.message,p_memory_basis:'[]'};
 const observations=[
  ['evidence.lookup',{schemaVersion:'planning-evidence/1',coverage:'not_integrated'}],
  ['place.read',{schemaVersion:'planning-place/1',source:'synthetic_fixture',observedAt:now,providerCalls:0,
   areas:[{id:'jingan',label:"Jing'an Temple anchor",railMinutes:21,transfers:1},{id:'peoples_square',label:"People's Square anchor",railMinutes:16,transfers:0}]}],
  ['constraints.evaluate',{schemaVersion:'planning-constraints/1',fasterAreaId:'peoples_square',hotelPrice:'unknown',availability:'unknown'}],
 ];
 for(let i=0;i<observations.length;i++){
  const [toolId,observation]=observations[i],key=String(i+1).repeat(64);
  assert.equal((await service('claim_planning_action_v1',{...keys,p_action_key:key,p_tool_id:toolId,p_input_digest:digest})).kind,'claimed');
  assert.equal((await service('complete_planning_observation_v1',{p_turn_id:a.turn,p_owner_id:a.owner,p_lease_token:lease.leaseToken,
   p_action_key:key,p_observation:JSON.stringify(observation)})).kind,'completed');
 }
 const read=await service('read_planning_observations_v1',{p_turn_id:a.turn,p_lease_token:lease.leaseToken});
 assert.equal(read.items.length,3,'completed observations survive separate SQL connections');
 const scope=uuid(),attempt=uuid();
 await db(`insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at)
 values('${scope}','${a.owner}','CNY',100000,10000,4,1,true,now()+interval '1 day');
 insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled)
 values('${scope}','qwen','qwen3.7-plus-2026-05-26','test-v1',100000,1000,true);`);
 assert.equal((await service('reserve_model_budget',{p_scope_id:scope,p_owner_id:a.owner,p_task_id:a.task,p_attempt_id:attempt,
  p_provider:'qwen',p_model:'qwen3.7-plus-2026-05-26',p_price_version:'test-v1',p_reserved_micros:1000})).kind,'reserved');
 assert.equal((await service('dispatch_model_budget',{p_scope_id:scope,p_owner_id:a.owner,p_attempt_id:attempt})).kind,'dispatched');
 assert.equal((await service('authorize_planning_dispatch_v1',{p_turn_id:a.turn,p_lease_token:lease.leaseToken,p_context_digest:input.contextDigest,
  p_scope_id:scope,p_attempt_id:attempt})).kind,'authorized');
 assert.equal((await service('finish_model_budget',{p_scope_id:scope,p_owner_id:a.owner,p_attempt_id:attempt,p_action:'settle',p_actual_micros:7})).kind,'settled');
 const resultKey='4'.repeat(64),content={schemaVersion:'comparison/1',title:'Synthetic fixture: Shanghai stay-area comparison',
  summary:'This compares current rail access to Shanghai Railway Station only. Hotel inventory, price and area suitability are unverified.',
  options:[{id:'jingan',title:"Jing'an Temple anchor",tradeoff:'About 21 minutes and 1 transfer to Shanghai Railway Station; hotel price and availability are unknown.'},
   {id:'peoples_square',title:"People's Square anchor",tradeoff:'About 16 minutes and 0 transfers to Shanghai Railway Station; hotel price and availability are unknown.'}],actions:[]};
 assert.equal((await service('claim_planning_action_v1',{...keys,p_action_key:resultKey,p_tool_id:'result.prepare',p_input_digest:digest})).kind,'claimed');
 const completion={p_turn_id:a.turn,p_owner_id:a.owner,p_lease_token:lease.leaseToken,
  p_result_action_key:resultKey,p_model_attempt_id:attempt,p_text:'Synthetic comparison ready; hotel inventory unknown.'};
 const invented=await service('complete_planning_comparison_v1',{...completion,p_content:JSON.stringify({...content,
  options:[{...content.options[0],tradeoff:'Hotels are available and bookable now.'},content.options[1]]})});
 assert.match(invented.error,/INVALID_INPUT/,'unobserved inventory is rejected');
 assert.equal(await db(`select status from public.turns where id='${a.turn}';`),'accepted');
 const forgedAttempt=uuid();
 await db(`insert into public.model_budget_attempts(scope_id,attempt_id,task_id,provider,model,price_version,reserved_micros,actual_micros,status)
  values('${scope}','${forgedAttempt}','${a.task}','qwen','qwen3.7-plus-2026-05-26','test-v1',1000,7,'settled');`);
 const wrongAttempt=await service('complete_planning_comparison_v1',{...completion,p_model_attempt_id:forgedAttempt,p_content:JSON.stringify(content)});
 assert.match(wrongAttempt.error,/PLANNING_INCOMPLETE/,'a settled attempt cannot be substituted for the dispatched lease');
 assert.equal(await db(`select status from public.turns where id='${a.turn}';`),'accepted');
 await db(`update turn_private.assistant_goals set scope_version=2 where id='${a.goal}';`);
 const stalePublication=await service('complete_planning_comparison_v1',{...completion,p_content:JSON.stringify(content)});
 assert.match(stalePublication.error,/STALE_BASIS/,'late goal change rolls back terminal and result together');
 assert.equal(await db(`select status from public.turns where id='${a.turn}';`),'accepted');
 assert.equal(await db(`select count(*) from turn_private.result_artifacts where id='${a.artifact}';`),'0');
 // Fixture reset only. Production goal versions are never decremented.
 await db(`update turn_private.assistant_goals set scope_version=1 where id='${a.goal}';`);
 const published=await service('complete_planning_comparison_v1',{p_turn_id:a.turn,p_owner_id:a.owner,p_lease_token:lease.leaseToken,
  p_result_action_key:resultKey,p_model_attempt_id:attempt,p_text:'Synthetic comparison ready; hotel inventory unknown.',p_content:JSON.stringify(content)});
 assert.equal(published.kind,'published',JSON.stringify(published));assert.equal(published.artifactId,a.artifact);
 assert.equal(await db(`select status from public.turns where id='${a.turn}';`),'completed');
 assert.equal(await db(`select status||':'||actual_micros from public.model_budget_attempts where attempt_id='${attempt}';`),'settled:7');
 assert.equal((await user('read_result_artifacts_v1',{p_artifact_id:a.artifact,p_revision:null})).kind,'result_artifact');
 assert.equal(await db(`select count(*) from turn_private.result_events where artifact_id='${a.artifact}' and event_type='ready';`),'1');

 const second={thread:uuid(),turn:uuid(),task:uuid(),message:uuid()};
 const admitted=await user('submit_planning_comparison_v1',{
  ...admission,p_parent_message_id:a.message,p_message_id:second.message,p_message_key:uuid(),
  p_thread_id:second.thread,p_turn_id:second.turn,p_task_id:second.task,p_task_key:uuid()});
 assert.equal(admitted.kind,'accepted',JSON.stringify(admitted));
 let providerCalls=0,placeCalls=0;
 const rpc=(name,params)=>service(name,params),fakePlace={schemaVersion:'planning-place/1',source:'synthetic_fixture',observedAt:now,providerCalls:0,
  areas:[{id:'jingan',label:"Jing'an Temple anchor",railMinutes:21,transfers:1},{id:'peoples_square',label:"People's Square anchor",railMinutes:16,transfers:0}]};
 const fakeTransport=async request=>{providerCalls++;assert.equal(request.endpoint,'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
  return Response.json({model:'qwen3.7-plus-2026-05-26',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:'{"highlight":"peoples_square"}'}}],
   usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30}});};
 const result=await runPlanningComparisonWorker(rpc,rpc,rpc,{environment:'local_synthetic',ownerId:a.owner,planningPolicyId:a.planningPolicy,
  scopeId:scope,priceVersion:'test-v1',reservedMicros:1000,timeoutMs:10000,maxOutputTokens:256},
  {provider:'qwen',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',transport:fakeTransport,
   price:()=>7,evidenceLookup:async()=>({schemaVersion:'planning-evidence/1',coverage:'not_integrated'}),
   placeRead:async()=>{placeCalls++;return fakePlace;}},new AbortController().signal);
 assert.equal(result,'finished','real worker function drives existing lease and terminal');
 assert.equal(providerCalls,1);assert.equal(placeCalls,1);
 const saved=await user('read_result_artifacts_v1',{p_artifact_id:admitted.artifactId,p_revision:null});
 assert.equal(saved.kind,'result_artifact');assert.equal(saved.content.title,'Synthetic fixture: Shanghai stay-area comparison');
 assert.equal(saved.source.taskId,second.task);assert.equal(saved.current,true);

 const third={thread:uuid(),turn:uuid(),task:uuid(),message:uuid()};
 const resumable=await user('submit_planning_comparison_v1',{
  ...admission,p_parent_message_id:second.message,p_message_id:third.message,p_message_key:uuid(),
  p_thread_id:third.thread,p_turn_id:third.turn,p_task_id:third.task,p_task_key:uuid()});
 assert.equal(resumable.kind,'accepted');
 const oldLease=await service('claim_planning_comparison_work_v1',{p_owner_id:a.owner,p_planning_policy_id:a.planningPolicy});
 assert.equal(oldLease.turnId,third.turn);
 for(const [i,toolId,observation] of [[1,'evidence.lookup',observations[0][1]],[2,'place.read',fakePlace]]){
  const key=String(i).repeat(64),base={p_turn_id:third.turn,p_owner_id:a.owner,p_lease_token:oldLease.leaseToken,p_message_id:third.message,p_memory_basis:'[]'};
  assert.equal((await service('claim_planning_action_v1',{...base,p_action_key:key,p_tool_id:toolId,p_input_digest:digest})).kind,'claimed');
  assert.equal((await service('complete_planning_observation_v1',{p_turn_id:third.turn,p_owner_id:a.owner,p_lease_token:oldLease.leaseToken,
   p_action_key:key,p_observation:JSON.stringify(observation)})).kind,'completed');
 }
 await db(`update turn_private.work set expires_at=clock_timestamp()-interval '1 second' where turn_id='${third.turn}';`);
 const beforeProvider=providerCalls,beforePlace=placeCalls;
 const recovered=await runPlanningComparisonWorker(rpc,rpc,rpc,{environment:'local_synthetic',ownerId:a.owner,planningPolicyId:a.planningPolicy,
  scopeId:scope,priceVersion:'test-v1',reservedMicros:1000,timeoutMs:10000,maxOutputTokens:256},
  {provider:'qwen',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',transport:fakeTransport,
   price:()=>7,evidenceLookup:async()=>{throw Error('completed evidence was re-executed');},
   placeRead:async()=>{placeCalls++;throw Error('completed place read was re-executed');}},new AbortController().signal);
 assert.equal(recovered,'finished','new worker instance resumes under a new lease');
 assert.equal(providerCalls,beforeProvider+1);assert.equal(placeCalls,beforePlace);
 assert.equal((await user('read_result_artifacts_v1',{p_artifact_id:resumable.artifactId,p_revision:null})).kind,'result_artifact');

 const delegate=async(parent,version,memoryBasis=[])=>{
  const ids={thread:uuid(),turn:uuid(),task:uuid(),message:uuid()};
  const response=await user('submit_planning_comparison_v1',{...admission,p_expected_goal_version:version,
   p_parent_message_id:parent,p_message_id:ids.message,p_message_key:uuid(),p_thread_id:ids.thread,p_turn_id:ids.turn,
   p_task_id:ids.task,p_task_key:uuid(),p_memory_basis:memoryBasis});
  assert.equal(response.kind,'accepted',JSON.stringify(response));return {...ids,artifactId:response.artifactId};
 };
 const cancelled=await delegate(third.message,1);
 const cancelledState=await db(`set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({session_id:a.session})}';
 set role authenticated;select state from public.cancel_chat_turn('${cancelled.turn}');`);
 assert.equal(cancelledState,'cancelled');
 assert.equal((await service('claim_planning_comparison_work_v1',{p_owner_id:a.owner,p_planning_policy_id:a.planningPolicy})).kind,'empty');
 const staleGoal=await delegate(third.message,1);
 const amendment=await user('submit_assistant_message_v1',{p_conversation_id:a.conversation,p_message_id:uuid(),p_idempotency_key:uuid(),
  p_policy_id:a.policy,p_locale:'en',p_text:'Now prefer fewer transfers',p_relationship:'amendment',p_goal_id:a.goal,
  p_expected_goal_version:1,p_task_id:null,p_parent_message_id:staleGoal.message,p_turn_id:null});
 assert.equal(amendment.kind,'accepted');assert.equal(amendment.scopeVersion,2);
 const beforeStaleProvider=providerCalls;
 assert.equal(await runPlanningComparisonWorker(rpc,rpc,rpc,{environment:'local_synthetic',ownerId:a.owner,planningPolicyId:a.planningPolicy,
  scopeId:scope,priceVersion:'test-v1',reservedMicros:1000,timeoutMs:10000,maxOutputTokens:256},
  {provider:'qwen',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',transport:fakeTransport,
   price:()=>7,evidenceLookup:async()=>{throw Error('stale goal started tools');},placeRead:async()=>{throw Error('stale goal read places');}},
  new AbortController().signal),'finished');
 assert.equal(providerCalls,beforeStaleProvider,'goal revision stops provider egress');
 assert.equal(await db(`select state from turn_private.planning_comparisons where turn_id='${staleGoal.turn}';`),'paused_unknown');

 const memory=uuid(),memoryConsent=uuid(),memoryReceipt=uuid();
 await db(`begin;insert into public.memory_consents(id,owner_id,status) values('${memoryConsent}','${a.owner}','granted');
 insert into public.memory_profiles(id,owner_id,source_receipt_id,consent_id,state,constraint_kind,summary)
 values('${memory}','${a.owner}','${memoryReceipt}','${memoryConsent}','explicit','preference','Prefer quiet areas');
 insert into public.memory_receipts(id,owner_id,memory_id,event_state,source_kind)
 values('${memoryReceipt}','${a.owner}','${memory}','explicit','user_confirmed');commit;`);
 const staleMemory=await delegate(amendment.messageId,2,[{id:memory,revision:1}]);
 await db(`update public.memory_profiles set summary='Prefer quiet areas near rail' where id='${memory}';`);
 assert.equal(await runPlanningComparisonWorker(rpc,rpc,rpc,{environment:'local_synthetic',ownerId:a.owner,planningPolicyId:a.planningPolicy,
  scopeId:scope,priceVersion:'test-v1',reservedMicros:1000,timeoutMs:10000,maxOutputTokens:256},
  {provider:'qwen',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',transport:fakeTransport,
   price:()=>7,evidenceLookup:async()=>{throw Error('stale memory started tools');},placeRead:async()=>{throw Error('stale memory read places');}},
  new AbortController().signal),'finished');
 assert.equal(providerCalls,beforeStaleProvider,'Memory correction stops provider egress');
 assert.equal(await db(`select state from turn_private.planning_comparisons where turn_id='${staleMemory.turn}';`),'paused_unknown');

 const currentMemory=await delegate(amendment.messageId,2,[{id:memory,revision:2}]);let selectedMemory=false;
 const memoryTransport=async request=>{const body=JSON.parse(request.body),prompt=JSON.parse(body.messages.at(-1).content);
  selectedMemory=prompt.explicitMemories.some(item=>item.text==='Prefer quiet areas near rail');return fakeTransport(request);};
 assert.equal(await runPlanningComparisonWorker(rpc,rpc,rpc,{environment:'local_synthetic',ownerId:a.owner,planningPolicyId:a.planningPolicy,
  scopeId:scope,priceVersion:'test-v1',reservedMicros:1000,timeoutMs:10000,maxOutputTokens:256},
  {provider:'qwen',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',transport:memoryTransport,
   price:()=>7,evidenceLookup:async()=>({schemaVersion:'planning-evidence/1',coverage:'not_integrated'}),
   placeRead:async()=>fakePlace},new AbortController().signal),'finished');
 assert.equal(selectedMemory,true,'#559 source selection includes current relevant explicit Memory');
 assert.equal((await user('read_result_artifacts_v1',{p_artifact_id:currentMemory.artifactId,p_revision:null})).basis.memories[0].revision,2);

 const inFlight=await delegate(amendment.messageId,2);let enteredProvider,releaseProvider,heldCalls=0;
 const providerReached=new Promise(resolve=>{enteredProvider=resolve;});
 const heldTransport=async()=>{heldCalls++;enteredProvider();return new Promise(resolve=>{releaseProvider=resolve;});};
 const inFlightRun=runPlanningComparisonWorker(rpc,rpc,rpc,{environment:'local_synthetic',ownerId:a.owner,planningPolicyId:a.planningPolicy,
  scopeId:scope,priceVersion:'test-v1',reservedMicros:1000,timeoutMs:10000,maxOutputTokens:256},
  {provider:'qwen',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',transport:heldTransport,
   price:()=>7,evidenceLookup:async()=>({schemaVersion:'planning-evidence/1',coverage:'not_integrated'}),
   placeRead:async()=>fakePlace},new AbortController().signal);
 let providerTimeout;try{await Promise.race([providerReached,new Promise((_,reject)=>{
  providerTimeout=setTimeout(()=>reject(Error('provider was never reached')),15000);})]);}finally{clearTimeout(providerTimeout);}
 assert.equal(await db(`set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({session_id:a.session})}';
 set role authenticated;select state from public.cancel_chat_turn('${inFlight.turn}');`),'cancelled');
 releaseProvider(Response.json({model:'qwen3.7-plus-2026-05-26',choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:'{"highlight":"jingan"}'}}],
  usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30}}));
 await inFlightRun;
 assert.equal(heldCalls,1);assert.equal(await db(`select count(*) from turn_private.result_artifacts where id='${inFlight.artifactId}';`),'0',
  'a late paid answer cannot publish after cancellation');
 assert.equal(await db(`select status from public.turns where id='${inFlight.turn}';`),'cancelled');

 const unknownCost=await delegate(amendment.messageId,2),pendingAttempt=uuid();
 await db(`insert into public.model_budget_attempts(scope_id,attempt_id,task_id,provider,model,price_version,reserved_micros,status)
 values('${scope}','${pendingAttempt}','${unknownCost.task}','qwen','qwen3.7-plus-2026-05-26','test-v1',1000,'pending');`);
 assert.equal((await service('claim_planning_comparison_work_v1',{p_owner_id:a.owner,p_planning_policy_id:a.planningPolicy})).kind,'empty');
 assert.equal(await db(`select state from turn_private.planning_comparisons where turn_id='${unknownCost.turn}';`),'paused_unknown');

 // A separate synthetic task checks that missing provider usage never becomes
 // a zero-cost success or an automatic paid retry. Reset only this fixture's
 // manually inserted pending row before that independent scenario.
 await db(`delete from public.model_budget_attempts where attempt_id='${pendingAttempt}';`);
 const unknownModel=await delegate(amendment.messageId,2),modelHitsBefore=providerCalls;
 const noUsageTransport=async()=>{providerCalls++;return Response.json({model:'qwen3.7-plus-2026-05-26',
  choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:'{"highlight":"jingan"}'}}]});};
 assert.equal(await runPlanningComparisonWorker(rpc,rpc,rpc,{environment:'local_synthetic',ownerId:a.owner,planningPolicyId:a.planningPolicy,
  scopeId:scope,priceVersion:'test-v1',reservedMicros:1000,timeoutMs:10000,maxOutputTokens:256},
  {provider:'qwen',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',transport:noUsageTransport,
   price:()=>7,evidenceLookup:async()=>({schemaVersion:'planning-evidence/1',coverage:'not_integrated'}),
   placeRead:async()=>fakePlace},new AbortController().signal),'finished');
 assert.equal(providerCalls,modelHitsBefore+1);
 assert.equal(await db(`select status from public.model_budget_attempts where task_id='${unknownModel.task}';`),'pending');
 assert.equal(await db(`select state from turn_private.planning_comparisons where turn_id='${unknownModel.turn}';`),'paused_unknown');
 assert.equal((await service('claim_planning_comparison_work_v1',{p_owner_id:a.owner,p_planning_policy_id:a.planningPolicy})).kind,'empty');
 assert.equal(providerCalls,modelHitsBefore+1,'unknown cost is not retried');

 const linkedGoal=uuid(),linkedStart=uuid(),trip=uuid(),linkedTurn=uuid();
 assert.equal((await user('submit_assistant_message_v1',{p_conversation_id:a.conversation,p_message_id:linkedStart,p_idempotency_key:uuid(),
  p_policy_id:a.policy,p_locale:'en',p_text:'Plan a linked Shanghai Trip',p_relationship:'goal_start',p_goal_id:linkedGoal,
  p_expected_goal_version:null,p_task_id:null,p_parent_message_id:null,p_turn_id:null})).kind,'accepted');
 await db(`insert into public.trips(id,owner_id,title) values('${trip}','${a.owner}','Synthetic linked Trip');
 update turn_private.assistant_goals set scope_version=2 where id='${linkedGoal}';
 insert into turn_private.assistant_goal_trip_links(goal_id,conversation_id,owner_id,link_version,goal_scope_version,operation_id,
  trip_id,trip_head_version,source_message_id,source_kind)
 values('${linkedGoal}','${a.conversation}','${a.owner}',1,2,'${uuid()}','${trip}',0,'${linkedStart}','native_user_confirmed');`);
 const linkedAttempt=await user('submit_planning_comparison_v1',{...admission,p_goal_id:linkedGoal,p_expected_goal_version:2,
  p_parent_message_id:linkedStart,p_message_id:uuid(),p_message_key:uuid(),p_thread_id:uuid(),p_turn_id:linkedTurn,
  p_task_id:uuid(),p_task_key:uuid()});
 assert.match(linkedAttempt.error,/SERVICE_TASK_CONFLICT/,'this no-Trip planner refuses a linked Trip goal');
 assert.equal(await db(`select count(*) from turn_private.work where turn_id='${linkedTurn}';`),'0','failed admission rolls back its Turn');

 const revoked=await delegate(amendment.messageId,2);
 const racedClaims=await Promise.all([service('claim_planning_comparison_work_v1',{p_owner_id:a.owner,p_planning_policy_id:a.planningPolicy}),
  service('claim_planning_comparison_work_v1',{p_owner_id:a.owner,p_planning_policy_id:a.planningPolicy})]);
 assert.deepEqual(racedClaims.map(x=>x.kind).sort(),['empty','leased'],'one existing work lease wins concurrent claim');
 const revokedLease=racedClaims.find(x=>x.kind==='leased');
 assert.equal(revokedLease.turnId,revoked.turn);
 assert.equal((await user('withdraw_planning_policy_v1',{p_policy_id:a.planningPolicy})).kind,'withdrawn');
 assert.match((await sql(container,`update turn_private.planning_consents set revoked_at=null where owner_id='${a.owner}' and policy_id='${a.planningPolicy}';`)).stderr,/IMMUTABLE_CONSENT/);
 const denied=await service('claim_planning_action_v1',{p_turn_id:revoked.turn,p_owner_id:a.owner,p_lease_token:revokedLease.leaseToken,
  p_message_id:revoked.message,p_action_key:'f'.repeat(64),p_tool_id:'place.read',p_input_digest:digest,p_memory_basis:'[]'});
 assert.equal(denied.kind,'stale_basis','withdrawn planning purpose stops a new effect');
 assert.equal((await service('authorize_planning_read_v1',{p_turn_id:revoked.turn,p_lease_token:revokedLease.leaseToken,
  p_context_digest:'0'.repeat(64)})).kind,'blocked');
});
