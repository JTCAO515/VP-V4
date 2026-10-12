import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {createGoalReturnAuthEnvironment} from './environment.mjs';
import {parseGoalReturn,qualifyGoalReturnArtifact} from '../../../../lib/server/journey-entry/goal-return/contract.ts';

test('E3: real GoTrue signed native session, original SQL choice, current HTTP readback and cancellation',
 {skip:process.env.VPJ13_E3_AUTH!=='true',timeout:180000},async t=>{
 const e=await createGoalReturnAuthEnvironment();t.after(()=>e.cleanup());
 const request=async(path,token,method='GET',body,headers={},signal)=>{
  const response=await fetch(e.api+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},
   ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:signal??AbortSignal.timeout(25000)});
  assert.match(response.headers.get('content-type')??'',/application\/json/);
  return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')};
 };
 const login=async user=>{
  const attemptId=uuid(),r=await request('/api/auth/native/v2/credentials',null,'POST',{email:user.email,password:user.password,attemptId});
  assert.equal(r.status,200,'Actual ordinary credential exchange');
  assert.equal((await request('/api/auth/native/v2/login',r.body.accessToken,'POST',{attemptId})).status,200,'Actual original mobile login');
  return r.body.accessToken; // in memory only, never in evidence/diagnostics.
 };
 const token=await login(e.users[0]),other=await login(e.users[1]),native=e.client(token);
 const rpc=async(client,name,params)=>{const r=await client.rpc(name,params);assert.equal(r.error,null,'Actual original RPC '+name);return r.data;};
 assert.equal((await request('/api/chat/native/v5/consent',token,'POST',{policyId:e.policyId,noticeHash:e.noticeHash})).status,200);
 const planningPolicyId=uuid(),notice='a'.repeat(64);
 e.sql(`insert into turn_private.planning_policies(id,text_policy_id,environment,notice_version,notice_hash,notice_zh,notice_en,effective_at,expires_at)
 values('${planningPolicyId}','${e.policyId}','local_synthetic','synthetic','${notice}','合成','Synthetic',now()-interval '1 minute',now()+interval '1 day');`);
 await rpc(native,'accept_planning_policy_v1',{p_policy_id:planningPolicyId,p_notice_hash:notice});
 const conversationId=uuid(),goalId=uuid(),parent=uuid();
 await rpc(native,'submit_assistant_travel_intake_v1',{p_conversation_id:conversationId,p_goal_id:goalId,p_message_id:parent,p_parent_message_id:null,
  p_expected_goal_version:null,p_expected_intake_revision:0,p_idempotency_key:uuid(),p_policy_id:e.policyId,p_locale:'en',p_text:'Owned synthetic Shanghai comparison',
  p_relationship:'goal_start',p_intake:{schemaVersion:'stay-area-intake/1',city:'shanghai',comparisonTarget:'area_transport',durationDays:10,partySize:2,interests:['food'],pace:'relaxed',lodgingBudget:null,dates:null,mobilityConstraints:[]},p_memory_basis:[]});
 const sourceMessageId=uuid(),admitted=await rpc(native,'submit_planning_comparison_v1',{p_conversation_id:conversationId,p_goal_id:goalId,p_expected_goal_version:1,
  p_parent_message_id:parent,p_message_id:sourceMessageId,p_message_key:uuid(),p_thread_id:uuid(),p_turn_id:uuid(),p_task_id:uuid(),p_task_key:uuid(),
  p_text_policy_id:e.policyId,p_planning_policy_id:planningPolicyId,p_locale:'en',p_text:'Owned synthetic areas',p_memory_basis:[]});
 // Controlled source completion only. No worker/provider or invented RPC reply.
 e.sql(`update turn_private.text_content set output_kind='answered',output_text='Owned synthetic completed source' where turn_id='${admitted.turnId}';select turn_private.terminal('${admitted.turnId}','completed',1);`);
 const sequence=Number(e.sql(`select sequence from turn_private.assistant_messages where id='${sourceMessageId}'`));
 const source={p_owner_id:e.users[0].id,p_expected_revision:0,p_idempotency_key:uuid(),p_task_id:admitted.taskId,p_goal_id:goalId,p_input_message_id:sourceMessageId,
  p_trip_id:null,p_trip_version:null,p_goal_version:1,p_memory_basis:[],p_evidence_basis:[]};
 const comparisonId=uuid(),decisionId=uuid();
 await rpc(e.service,'publish_result_artifact_v2',{...source,p_artifact_id:comparisonId,p_content:{schemaVersion:'comparison/1',title:'Synthetic comparison',summary:'No real-world recommendation',options:[{id:'a',title:'A',tradeoff:'Unknown'},{id:'b',title:'B',tradeoff:'Unknown'}],actions:[]}});
 await rpc(e.service,'publish_result_artifact_v2',{...source,p_idempotency_key:uuid(),p_artifact_id:decisionId,p_content:{schemaVersion:'decision/1',title:'Synthetic decision',summary:'Pending',comparisonRef:{artifactId:comparisonId,revision:1},state:'pending',chosenOptionId:null,actions:[]}});
 const scope={conversationId,goalId,goalVersion:1,parentMessageId:sourceMessageId,inputSequence:sequence};
 const path='/api/chat/native/v5/goal-return?'+new URLSearchParams(Object.entries(scope).map(([k,v])=>[k,String(v)]));
 const unavailable={version:5,kind:'unavailable',nextStep:{kind:'unknown'}};
 assert.deepEqual((await request(path,token)).body,unavailable,'Pending is not an older fallback');
 assert.equal((await request(path,null)).status,401);
 assert.deepEqual((await request(path,other)).body,unavailable,'Foreign owner has same unavailable shape');
 assert.equal((await request(path,token,'GET',undefined,{Cookie:''})).status,400);
 assert.equal((await request(path,token,'GET',undefined,{Origin:e.api})).status,400);
 assert.equal((await request(path+'&goalId='+goalId,token)).status,400);
 const choose=async(revision,optionId)=>{
  const r=await request('/api/results/native/v2/decision',token,'POST',{artifactId:decisionId,expectedRevision:revision,operationId:uuid(),optionId});
  assert.equal(r.status,200,'Original atomic owner choice');return r.body.data??r.body;
 };
 await choose(1,'a');
 const count=()=>e.sql(`select jsonb_build_array((select count(*) from turn_private.result_revisions where owner_id='${e.users[0].id}'),(select count(*) from turn_private.assistant_messages where owner_id='${e.users[0].id}'),(select count(*) from turn_private.service_tasks where owner_id='${e.users[0].id}'),(select count(*) from public.trips where owner_id='${e.users[0].id}'),(select count(*) from public.memory_profiles where owner_id='${e.users[0].id}'));`);
 const before=count(),positive=await request(path,token);assert.equal(positive.status,200);assert.equal(positive.cache,'private, no-store');
 const ref=parseGoalReturn(Object.fromEntries(Object.entries(positive.body).filter(([k])=>k!=='version')),scope);assert.ok(ref);assert.equal(ref.lastDecision.revision,2);
 const exact=await request(`/api/results/native/v2?artifactId=${decisionId}&revision=2`,token);assert.equal(exact.status,200);assert.ok(qualifyGoalReturnArtifact(exact.body.data,ref,scope));
 assert.equal(count(),before,'GET caused no result/goal/Task/Trip/Memory writes');
 const session=await rpc(native,'native_session_v2',{p_action:'session'});
 const params={p_policy_id:e.policyId,p_conversation_id:conversationId,p_goal_id:goalId,p_goal_version:1,p_parent_message_id:sourceMessageId,p_input_sequence:sequence,p_mobile_epoch:session.mobileEpoch};
 assert.match((await native.rpc('read_goal_return_reference_v1',{...params,p_mobile_epoch:session.mobileEpoch+1})).error?.message??'',/SESSION_REPLACED/);
 assert.ok((await e.service.rpc('read_goal_return_reference_v1',params)).error,'Service cannot proxy new ordinary read');
 // Hold an actual unchanged 200 response, record a real new original choice,
 // then release old bytes. Final rediscovery must refuse that stale reference.
 e.timing.arm();const late=request(path,token);await e.timing.wait('waiting');await choose(2,'b');e.timing.release();
 assert.deepEqual((await late).body,unavailable,'Actual late revision2 readback is unavailable after revision3');
 assert.equal((await request(path,token)).body.lastDecision.revision,3);
 // Real Auth/RPC have completed; only delivery of that original Response waits.
 // No fabricated status/body. Production request scope must abort at15s.
 e.timing.arm();const deadlineStart=performance.now(),timed=await request(path,token);
 const deadlineElapsed=Math.round(performance.now()-deadlineStart);assert.equal(timed.status,503);assert.deepEqual(timed.body,{error:{code:'PROVIDER_UNAVAILABLE'}});
 assert.ok(deadlineElapsed>=14000 && deadlineElapsed<=18000,'Actual15s request deadline');assert.equal(e.timing.read().state,'cancelled');
 // Actual caller disconnect must propagate to the same production scope.
 e.timing.arm();const caller=new AbortController(),cancelled=request(path,token,'GET',undefined,{},caller.signal);
 await e.timing.wait('waiting');caller.abort();await assert.rejects(cancelled,/abort/i);await e.timing.wait('cancelled');
 assert.ok(e.timing.read().elapsedMs<5000,'Caller cancellation reached actual delayed HTTP fetch');
 // Preserve role/server config. Measure a real PostgREST RPC blocked on original
 // mobile row, without claiming function SET5s established the outer timer.
 const lock=await e.lockAccount(e.users[0].id);let blocked;
 try{const start=performance.now();const r=await request(path,token);blocked=Math.round(performance.now()-start);assert.equal(r.status,503);assert.ok(blocked<=18000);}finally{await lock.release();}
 assert.equal((await request(path,token)).body.lastDecision.revision,3,'Timeout and cancellation preserved session/source');
 const replacement=await login(e.users[0]);assert.equal((await request(path,token)).status,401);assert.equal((await request(path,replacement)).body.lastDecision.revision,3);
 assert.equal((await request('/api/chat/native/v5/consent',replacement,'DELETE',{policyId:e.policyId})).status,200);
 assert.deepEqual((await request(path,replacement)).body,unavailable,'Actual original withdrawal is not historical action');
 assert.equal(e.sql(`select count(*) from public.model_budget_attempts where task_id='${admitted.taskId}'`),'0');
 assert.equal(e.sql('select profile_data_private.schema_v1(),conversation_data_private.schema_supported_v1(),result_data_private.schema_supported_v1(),turn_data_private.schema_supported_v1(),turn_data_private.runtime_supported_v1()'),'t|t|t|t|t');
 t.diagnostic('E3_AUTH_HTTP '+JSON.stringify({ordinaryActors:2,signedGoTrue:true,actualRPC:true,actualSource:true,lateReadback:'PASS',controlledDeliveryDeadlineMs:deadlineElapsed,
  callerCancellation:'PASS',actualBlockedPostgRESTMs:blocked,outerPostgREST5s:'UNRUN/no role setting change',budgetAttemptRows:0,providerWorkerStarted:false}));
});
