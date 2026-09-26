import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createNativeTextEnvironment} from './native-text-environment.mjs';
import {waitUntil} from '../identity/database-barrier.mjs';
import {identityLocalEnv} from '../identity/local-supabase.mjs';
import {createClient} from '@supabase/supabase-js';

test('real local Auth, native HTTP, consent, durable worker and recovery enforce owner/session boundaries',{skip:process.env.VP_NATIVE_TEXT_INTEGRATION!=='true',timeout:180000},async t=>{
 const continuous=process.env.VP_NATIVE_TEXT_SERVICE_INTEGRATION==='true';
 const e=await createNativeTextEnvironment({continuous});t.after(()=>e.cleanup());
 const call=async(path,token,method='GET',body,headers={})=>{
  const r=await fetch(e.api+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};
 };
 const login=async(user)=>{const attemptId=randomUUID();const c=await call('/api/auth/native/v2/credentials',null,'POST',{email:user.email,password:user.password,attemptId});assert.equal(c.status,200);assert.equal((await call('/api/auth/native/v2/login',c.body.accessToken,'POST',{attemptId})).status,200);return c.body.accessToken;};
 const token=await login(e.users[0]),other=await login(e.users[1]),base='/api/chat/native/v1';
 assert.equal((await call(base+'/policy')).status,401);
 assert.equal((await call(base+'/policy',token,'GET',undefined,{Origin:e.api})).status,400);
 assert.equal((await call(base+'/policy',token,'GET',undefined,{Cookie:'synthetic=only'})).status,400);
 const policy=(await call(base+'/policy',token)).body.policy;assert.equal(policy.id,e.policyId);assert.equal(policy.consentState,'not_accepted');assert.ok(policy.noticeEn.includes('Local synthetic'));
 const input={threadId:randomUUID(),turnId:randomUUID(),idempotencyKey:randomUUID(),policyId:e.policyId,locale:'en',text:'Synthetic local request'};
 assert.equal((await call(base+'/turns',token,'POST',input)).status,403);
 assert.equal(e.sql(`select count(*) from public.chat_threads where id='${input.threadId}';`),'0','denied submission leaves no orphan thread');
 assert.equal((await call(base+'/consent',token,'POST',{policyId:e.policyId,noticeHash:'b'.repeat(64)})).status,403);
 assert.equal((await call(base+'/consent',token,'POST',{policyId:e.policyId,noticeHash:e.noticeHash})).status,200);
 const accepted=await Promise.all([call(base+'/turns',token,'POST',input),call(base+'/turns',token,'POST',input)]);assert.deepEqual(accepted.map(r=>r.status).sort(),[200,201]);
 await waitUntil(async()=>{const r=await call(base+'/turns',token);return r.body.turns?.some(t=>t.turnId===input.turnId&&t.outcome==='answered');},30000,'actual worker final answer');
 const final=(await call(base+'/turns',token)).body.turns[0];assert.equal(final.output,'Local synthetic answer: request completed.');assert.equal(e.counts.http,1);
 const receiptCount=continuous?e.serviceEvidence().runs.flat().filter(r=>r.schemaVersion==='provider-destination/1').length:e.counts.destinationReceipts;
 assert.equal(receiptCount,3,'configured/attempted/buffered metadata hooks ran');
 assert.equal(e.sql(`select status||':'||actual_micros from public.model_budget_attempts where task_id='${input.turnId}';`),'settled:1','synthetic reviewed tariff rounds up once after model/usage validation');
 assert.equal((await call(base+'/turns',other)).body.turns.length,0);
 assert.equal((await call(base+'/turns',token,'POST',{...input,text:'Changed'})).status,409);
 assert.equal((await call(base+'/turns',token,'POST',{...input,reasoning:'forbidden extra field'})).status,400);
 if(continuous){
  await e.restartServiceWorkers();
  assert.equal(e.sql(`select status||':'||actual_micros from public.model_budget_attempts where task_id='${input.turnId}';`),'settled:1','process restart retains the settled ledger');
  assert.equal((await call(base+'/turns',token,'POST',input)).status,200);
 }
 const taskBase='/api/chat/native/v2',taskId=randomUUID();
 const goal={...input,threadId:randomUUID(),turnId:randomUUID(),idempotencyKey:randomUUID(),text:'Synthetic kind=clarification',serviceTask:{id:taskId,scopeVersion:1,relationship:'new_goal',parentTurnId:null}};
 const submit=body=>call(taskBase+'/turns',token,'POST',body);
 const waitOutcome=async(turnId,outcome)=>waitUntil(async()=>{const r=await call(taskBase+'/turns',token);return r.body.version===2&&r.body.turns?.some(t=>t.turnId===turnId&&t.outcome===outcome&&t.serviceTaskId===taskId);},30000,'actual ServiceTask outcome');
 assert.equal((await submit({...goal,serviceTask:{...goal.serviceTask,extra:true}})).status,400);
 assert.equal((await submit(goal)).status,201);await waitOutcome(goal.turnId,'clarification');
 const clarification={...goal,turnId:randomUUID(),idempotencyKey:randomUUID(),text:'Synthetic kind=technical_failure',serviceTask:{...goal.serviceTask,relationship:'clarification',parentTurnId:goal.turnId}};
 assert.deepEqual((await Promise.all([submit(clarification),submit(clarification)])).map(r=>r.status).sort(),[200,201]);await waitOutcome(clarification.turnId,'technical_failure');
 assert.equal((await submit(goal)).status,200);
 const repair={...goal,turnId:randomUUID(),idempotencyKey:randomUUID(),text:'Synthetic repaired answer',serviceTask:{...goal.serviceTask,relationship:'repair',parentTurnId:clarification.turnId}};
 assert.equal((await submit(repair)).status,201);await waitOutcome(repair.turnId,'answered');
 assert.equal(e.sql(`select count(*)||':'||sum(actual_micros) from public.model_budget_attempts where task_id='${taskId}' and status='settled';`),'3:3');
 assert.equal((await call(taskBase+'/turns',other)).body.turns.length,0);
 assert.equal((await submit({...repair,turnId:randomUUID(),idempotencyKey:randomUUID()})).status,409);
 const {serviceTask:ignored,...legacy}=goal;void ignored;
 assert.equal((await call(base+'/turns',token,'POST',{...legacy,turnId:randomUUID(),idempotencyKey:randomUUID()})).status,409);
 const contextBase='/api/chat/native/v3',contextId=randomUUID();
 const contextGoal={...goal,policyId:e.taskPolicyId,threadId:randomUUID(),turnId:randomUUID(),idempotencyKey:randomUUID(),text:'Synthetic original goal kind=clarification',serviceTask:{id:contextId,scopeVersion:1,relationship:'new_goal',parentTurnId:null}};
 assert.equal((await call(contextBase+'/policy',token)).body.policy.consentState,'not_accepted');
 assert.equal((await call(contextBase+'/turns',token,'POST',contextGoal)).status,403,'old consent does not grant history mode');
 assert.equal((await call(contextBase+'/consent',token,'POST',{policyId:e.taskPolicyId,noticeHash:e.noticeHash})).status,403);
 assert.equal((await call(contextBase+'/consent',token,'POST',{policyId:e.taskPolicyId,noticeHash:e.taskNoticeHash})).status,200);
 const waitContext=async(turnId,outcome)=>waitUntil(async()=>{const r=await call(contextBase+'/turns',token);return r.body.version===3&&r.body.turns?.some(t=>t.turnId===turnId&&t.outcome===outcome);},30000,'actual context-mode outcome');
 assert.equal((await call(contextBase+'/turns',token,'POST',contextGoal)).status,201);await waitContext(contextGoal.turnId,'clarification');
 const contextNext={...contextGoal,turnId:randomUUID(),idempotencyKey:randomUUID(),text:'North.',serviceTask:{...contextGoal.serviceTask,relationship:'clarification',parentTurnId:contextGoal.turnId}};
 assert.equal((await call(contextBase+'/turns',token,'POST',contextNext)).status,201);await waitContext(contextNext.turnId,'answered');
 const sent=e.requests.find(r=>r.messages.at(-1).content==='North.');assert.ok(sent);assert.equal(sent.messages.length,4);
 assert.equal(sent.messages[1].content,contextGoal.text);assert.equal(sent.messages[2].content,'Local synthetic answer: request completed.');
 assert.equal(e.sql(`select count(*)||':'||sum(actual_micros) from public.model_budget_attempts where task_id='${contextId}' and status='settled';`),'2:2');
 assert.equal((await call(contextBase+'/turns',other)).body.turns.length,0);
 assert.equal((await submit(goal)).status,200,'v2 original policy replay still works after v3 use');
 assert.equal((await call(contextBase+'/consent',token,'DELETE',{policyId:e.taskPolicyId})).status,200);
 assert.equal((await call(contextBase+'/turns',token)).body.turns.length,0);
 if(continuous)assert.deepEqual(e.serviceEvidence().failures,[],'normal processing and restart have no failed exits');
 const beforeHeld=e.counts.http;
 const held={...input,threadId:randomUUID(),turnId:randomUUID(),idempotencyKey:randomUUID(),text:'Synthetic HOLD request'};
 assert.equal((await call(base+'/turns',token,'POST',held)).status,201);
 await waitUntil(()=>e.counts.http===beforeHeld+1,10000,'held provider request');
 assert.equal((await call(base+'/turns/'+held.turnId+'/cancel',token,'POST',{})).status,200);e.releaseModels();
 await waitUntil(()=>e.sql(`select status from public.turns where id='${held.turnId}';`)==='cancelled',5000,'cancelled terminal');
 assert.equal(e.sql(`select output_text is null from turn_private.text_content where turn_id='${held.turnId}';`),'t');
 assert.equal((await call(base+'/consent',token,'DELETE',{policyId:e.policyId})).status,200);
 assert.equal((await call(base+'/turns',token)).body.turns.length,0);
 assert.equal((await call(base+'/policy',token)).body.policy.consentState,'withdrawn');
 assert.equal((await call(base+'/consent',token,'POST',{policyId:e.policyId,noticeHash:e.noticeHash})).status,403);
 await login(e.users[0]);assert.equal((await call(base+'/policy',token)).status,401,'replaced mobile token rejected');
 if(continuous){
  await waitUntil(()=>e.serviceEvidence().failures.length===1,5000,'cancelled in-flight poll stops service');
  const evidence=e.serviceEvidence();assert.deepEqual(evidence.failures,['service-exit-1']);assert.equal(evidence.runs.length,4);
  assert.equal(evidence.runs[2].at(-1).reason,'unavailable','cancelled work cannot trigger automatic retries');
  assert.equal(e.counts.http,beforeHeld+1,'cancelled request was sent only once');
  assert.equal(evidence.runs[0][0].expiresAt,evidence.runs[2][0].expiresAt,'restart cannot renew expiry');
  assert.equal(evidence.runs[1][0].expiresAt,evidence.runs[3][0].expiresAt);
  assert.ok(evidence.runs[2].some(r=>r.phase==='poll-returned'&&r.result==='finished'),'new process consumes later requests');
  assert.ok(evidence.runs[3].some(r=>r.phase==='poll-returned'&&r.result==='finished'),'task mode continues after process restart');
 }
});

test('v5 comparison binds only a confirmed goal Trip and reads one exact revision across native entries',{skip:process.env.VP_NATIVE_TEXT_INTEGRATION!=='true',timeout:180000},async t=>{
 const e=await createNativeTextEnvironment();t.after(()=>e.cleanup());
 const local=identityLocalEnv();assert.ok(local?.API_URL&&local.SERVICE_ROLE_KEY);
 const call=async(path,token,method='GET',body)=>{const response=await fetch(e.api+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};};
 const login=async user=>{const attemptId=randomUUID();const credentials=await call('/api/auth/native/v2/credentials',null,'POST',{email:user.email,password:user.password,attemptId});assert.equal(credentials.status,200);assert.equal((await call('/api/auth/native/v2/login',credentials.body.accessToken,'POST',{attemptId})).status,200);return credentials.body.accessToken;};
 const owner=await login(e.users[0]),other=await login(e.users[1]);
 assert.equal((await call('/api/chat/native/v5/consent',owner,'POST',{policyId:e.policyId,noticeHash:e.noticeHash})).status,200);
 const tripA=randomUUID(),tripB=randomUUID(),tripC=randomUUID(),foreignTrip=randomUUID();
 for(const [token,id] of [[owner,tripA],[owner,tripB],[owner,tripC],[other,foreignTrip]])
  assert.equal((await call('/api/trips/native/v2',token,'POST',{tripId:id,title:'Synthetic owned Trip'})).status,201);
 const patchTrip=async(tripId,version)=>{
  const proposal=await call('/api/trips/native/v2/'+tripId+'/proposal',owner,'POST',{patch:{expectedVersion:version,operations:[{kind:'set_title',title:'Synthetic confirmed Trip '+(version+1)}]}});
  assert.equal(proposal.status,201,JSON.stringify(proposal.body));
  const pending=await call('/api/trips/native/v2/'+tripId+'/proposal?proposalId='+proposal.body.proposalId,owner);
  assert.equal((await call('/api/trips/native/v2/'+tripId+'/confirm',owner,'POST',{proposalId:proposal.body.proposalId,idempotencyKey:randomUUID(),digest:pending.body.proposal.digest})).status,200);
 };
 await patchTrip(tripA,0);
 const conversationId=randomUUID(),goalId=randomUUID();
 const message=(relationship,overrides={})=>({conversationId,messageId:randomUUID(),idempotencyKey:randomUUID(),policyId:e.policyId,
  locale:'en',text:'Synthetic result basis',relationship,goalId,expectedGoalVersion:null,taskId:null,parentMessageId:null,turnId:null,...overrides});
 const root=message('goal_start');assert.equal((await call('/api/chat/native/v5/conversation',owner,'POST',root)).status,201);
 const attachTask=async(scope,parent,text)=>{
  const taskId=randomUUID(),turnId=randomUUID();
  assert.equal((await call('/api/chat/native/v2/turns',owner,'POST',{threadId:randomUUID(),turnId,idempotencyKey:randomUUID(),policyId:e.policyId,
   locale:'en',text,serviceTask:{id:taskId,scopeVersion:1,relationship:'new_goal',parentTurnId:null}})).status,201);
  const input=message('follow_up',{expectedGoalVersion:scope,parentMessageId:parent,taskId,text:'Attach '+text});
  assert.equal((await call('/api/chat/native/v5/conversation',owner,'POST',input)).status,201);
  await waitUntil(()=>e.sql(`select status from public.turns where id='${turnId}';`)==='completed',30000,'real task answer');
  return {taskId,turnId,input};
 };
 const old=await attachTask(1,root.messageId,'Synthetic old task');
 const linkPath='/api/chat/native/v5/goals/'+goalId+'/trip';
 const link=(tripId,goalVersion,linkVersion,sourceMessageId,tripVersion)=>({operationId:randomUUID(),conversationId,sourceMessageId,
  expectedGoalScopeVersion:goalVersion,expectedLinkVersion:linkVersion,action:'link',tripId,expectedTripVersion:tripVersion,confirmed:true});
 const firstLink=await call(linkPath,owner,'POST',link(tripA,1,0,old.input.messageId,1));
 assert.equal(firstLink.status,201,JSON.stringify(firstLink.body));
 assert.equal(firstLink.body.goalScopeVersion,2);
 const content={schemaVersion:'comparison/1',title:'Synthetic directions',summary:'Fixture only; no travel advice.',options:[
  {id:'one',title:'Synthetic one',tradeoff:'Timing unknown'},{id:'two',title:'Synthetic two',tradeoff:'Availability unknown'}],actions:[]};
 const params=(artifactId,task,input,tripId,tripVersion,goalVersion,key=randomUUID())=>({p_owner_id:e.users[0].id,p_artifact_id:artifactId,
  p_expected_revision:0,p_idempotency_key:key,p_task_id:task.taskId,p_goal_id:goalId,p_input_message_id:input.messageId,
  p_trip_id:tripId,p_trip_version:tripVersion,p_goal_version:goalVersion,p_memory_basis:[],p_content:content});
 const publish=async body=>{const response=await fetch(local.API_URL+'/rest/v1/rpc/publish_comparison_result_v1',{method:'POST',
  headers:{apikey:local.SERVICE_ROLE_KEY,Authorization:'Bearer '+local.SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};};
 assert.equal((await publish(params(randomUUID(),old,old.input,tripA,1,1))).body.message,'STALE_BASIS','pre-link Task and scope cannot inherit the later link');
 const recycled=message('follow_up',{expectedGoalVersion:2,parentMessageId:old.input.messageId,taskId:old.taskId,text:'Try old Task after link'});
 assert.equal((await call('/api/chat/native/v5/conversation',owner,'POST',recycled)).status,201);
 assert.equal((await publish(params(randomUUID(),old,recycled,tripA,1,2))).body.message,'STALE_BASIS','new message cannot launder an old Task');
 const taskA=await attachTask(2,recycled.messageId,'Synthetic linked A');
 assert.equal((await publish(params(randomUUID(),taskA,taskA.input,tripB,0,2))).body.message,'STALE_BASIS','same-owner but unlinked Trip is denied');
 assert.equal((await publish(params(randomUUID(),taskA,taskA.input,foreignTrip,0,2))).body.message,'STALE_BASIS','foreign Trip is denied');
 const artifactA=randomUUID(),attempts=await Promise.all([publish(params(artifactA,taskA,taskA.input,tripA,1,2)),publish(params(artifactA,taskA,taskA.input,tripA,1,2))]);
 assert.equal(attempts.filter(x=>x.status===200).length,1,'concurrent CAS has one winner');
 const lost=attempts.find(x=>x.status!==200);
 assert.ok(lost && ((lost.status===400&&lost.body.message==='REVISION_CONFLICT')
  || (lost.status===409&&lost.body.code==='23505'&&/result_artifacts_pkey/.test(lost.body.message))));
 assert.equal(e.sql(`select count(*) from turn_private.result_revisions where artifact_id='${artifactA}';`),'1');
 assert.equal(e.sql(`select count(*) from turn_private.result_events where artifact_id='${artifactA}';`),'1');
 const exactA='/api/results/native/v1?artifactId='+artifactA+'&revision=1';
 const directA=await call(exactA,owner),latest=await call('/api/results/native/v1',owner);
 const referenceA=await call('/api/results/native/v1/trip?tripId='+tripA,owner);
 assert.equal(directA.status,200,JSON.stringify(directA.body));assert.equal(directA.body.data.current,true);
 assert.deepEqual([latest.body.data.artifactId,latest.body.data.revision],[artifactA,1]);
 assert.deepEqual([referenceA.body.data.artifactId,referenceA.body.data.revision],[artifactA,1]);
 assert.equal(directA.body.data.source.tripId,tripA);assert.equal(directA.body.data.source.tripVersion,1);
 assert.equal((await call('/api/results/native/v1/trip?tripId='+tripB,owner)).body.data.kind,'empty');
 assert.equal((await call('/api/results/native/v1/trip?tripId='+tripA,other)).body.data.kind,'empty');
 assert.equal((await call(exactA,other)).body.data.kind,'empty');
 assert.equal((await call('/api/results/native/v1/trip?tripId=invalid',owner)).status,400);
 const secondGoal=randomUUID(),secondRoot=message('goal_start',{goalId:secondGoal,text:'Another goal on the same Trip'});
 assert.equal((await call('/api/chat/native/v5/conversation',owner,'POST',secondRoot)).status,201);
 const secondLinkPath='/api/chat/native/v5/goals/'+secondGoal+'/trip';
 assert.equal((await call(secondLinkPath,owner,'POST',link(tripA,1,0,secondRoot.messageId,1))).status,201);
 const secondTask=randomUUID(),secondTurn=randomUUID();
 assert.equal((await call('/api/chat/native/v2/turns',owner,'POST',{threadId:randomUUID(),turnId:secondTurn,idempotencyKey:randomUUID(),
  policyId:e.policyId,locale:'en',text:'Synthetic second-goal task',serviceTask:{id:secondTask,scopeVersion:1,relationship:'new_goal',parentTurnId:null}})).status,201);
 const secondInput=message('follow_up',{goalId:secondGoal,expectedGoalVersion:2,parentMessageId:secondRoot.messageId,taskId:secondTask});
 assert.equal((await call('/api/chat/native/v5/conversation',owner,'POST',secondInput)).status,201);
 await waitUntil(()=>e.sql(`select status from public.turns where id='${secondTurn}';`)==='completed',30000,'second goal answer');
 const secondArtifact=randomUUID(),secondTaskRef={taskId:secondTask};
 assert.equal((await publish({...params(secondArtifact,secondTaskRef,secondInput,tripA,1,2),p_goal_id:secondGoal})).status,200);
 assert.equal((await call('/api/results/native/v1/trip?tripId='+tripA,owner)).body.data.artifactId,secondArtifact,'newer eligible goal wins');
 const laterTurn=randomUUID();
 e.sql(`begin;insert into public.turns(id,owner_id,status) values('${laterTurn}','${e.users[0].id}','accepted');
   insert into turn_private.text_content(turn_id,owner_id,thread_id,policy_id,consent_id,locale,input_text)
   select '${laterTurn}',owner_id,thread_id,policy_id,consent_id,'en','Synthetic later Task Turn' from turn_private.service_tasks where id='${secondTask}';
   update turn_private.service_tasks set last_turn_id='${laterTurn}' where id='${secondTask}';commit;`);
 assert.equal((await call('/api/results/native/v1?artifactId='+secondArtifact+'&revision=1',owner)).body.data.current,false);
 assert.equal((await call('/api/results/native/v1/trip?tripId='+tripA,owner)).body.data.artifactId,artifactA,
  'an ineligible newest artifact must not hide an older current goal result');
 // Fixture-only private rows make the candidate scan overflow without changing
 // any user-authorised link or result. Overflow must be unavailable, not empty.
 e.sql(`with clones as materialized (select gen_random_uuid() id,gen_random_uuid() key from generate_series(1,64)),
   inserted as (insert into turn_private.result_artifacts(id,owner_id,task_id,goal_id,input_message_id,trip_id,current_revision)
     select c.id,a.owner_id,a.task_id,a.goal_id,a.input_message_id,a.trip_id,a.current_revision
     from clones c cross join turn_private.result_artifacts a where a.id='${secondArtifact}' returning id)
   insert into turn_private.result_revisions(artifact_id,revision,owner_id,idempotency_key,request_digest,input_sequence,
     task_turn_id,goal_version,trip_version,trip_link_operation_id,trip_link_version,memory_basis,content)
   select c.id,r.revision,r.owner_id,c.key,r.request_digest,r.input_sequence,r.task_turn_id,r.goal_version,
     r.trip_version,r.trip_link_operation_id,r.trip_link_version,r.memory_basis,r.content
   from clones c join inserted x on x.id=c.id cross join turn_private.result_revisions r where r.artifact_id='${secondArtifact}';`);
 assert.equal((await call('/api/results/native/v1/trip?tripId='+tripA,owner)).body.data.kind,'unavailable',
  'bounded overflow cannot claim that an older eligible result does not exist');
 e.sql(`delete from turn_private.result_artifacts where task_id='${secondTask}' and id<>'${secondArtifact}';`);
 assert.equal((await call('/api/results/native/v1/trip?tripId='+tripA,owner)).body.data.artifactId,artifactA);
 assert.equal((await call('/api/trips/native/v2/'+tripA+'/archive',owner,'POST',{expectedVersion:1,idempotencyKey:randomUUID(),confirmed:true})).status,200);
 const archivedA=(await call(exactA,owner)).body.data;
 assert.equal(archivedA.current,false,'archive keeps history but invalidates currentness');
 assert.equal(archivedA.historicalReadable,true);
 assert.equal((await call('/api/results/native/v1/trip?tripId='+tripA,owner)).body.data.kind,'empty');
 const retarget=await call(linkPath,owner,'POST',link(tripB,2,1,taskA.input.messageId,0));
 assert.equal(retarget.status,201,JSON.stringify(retarget.body));assert.equal(retarget.body.goalScopeVersion,3);
 const taskB=await attachTask(3,taskA.input.messageId,'Synthetic linked B');
 const artifactB=randomUUID();assert.equal((await publish(params(artifactB,taskB,taskB.input,tripB,0,3))).status,200);
 const exactB='/api/results/native/v1?artifactId='+artifactB+'&revision=1';
 assert.equal((await call(exactB,owner)).body.data.current,true);
 assert.equal((await call(linkPath,owner,'POST',link(tripC,3,2,taskB.input.messageId,0))).status,201);
 assert.equal((await call(exactB,owner)).body.data.current,false,'retarget invalidates an otherwise current Trip result');
 assert.equal((await call('/api/results/native/v1/trip?tripId='+tripB,owner)).body.data.kind,'empty');
 const returnMessage=message('follow_up',{expectedGoalVersion:4,parentMessageId:taskB.input.messageId,text:'Return to Trip B'});
 assert.equal((await call('/api/chat/native/v5/conversation',owner,'POST',returnMessage)).status,201);
 assert.equal((await call(linkPath,owner,'POST',link(tripB,4,3,returnMessage.messageId,0))).status,201);
 const taskB2=await attachTask(5,returnMessage.messageId,'Synthetic linked B again');
 const artifactB2=randomUUID();assert.equal((await publish(params(artifactB2,taskB2,taskB2.input,tripB,0,5))).status,200);
 const exactB2='/api/results/native/v1?artifactId='+artifactB2+'&revision=1';
 assert.equal((await call(exactB2,owner)).body.data.current,true);
 const unlink={operationId:randomUUID(),conversationId,sourceMessageId:null,expectedGoalScopeVersion:5,expectedLinkVersion:4,
  action:'unlink',tripId:null,expectedTripVersion:null,confirmed:true};
 assert.equal((await call(linkPath,owner,'POST',unlink)).status,201);
 const unlinkedB=(await call(exactB2,owner)).body.data;
 assert.equal(unlinkedB.current,false,'unlink does not erase authorised history');
 assert.equal(unlinkedB.historicalReadable,true);
 assert.equal((await call('/api/results/native/v1/trip?tripId='+tripB,owner)).body.data.kind,'empty');
 const deletionId=randomUUID();assert.equal((await call('/api/privacy/native/v1/trips',owner,'POST',{requestId:deletionId,tripId:tripB,expectedVersion:0,confirmed:true})).status,202);
 assert.equal((await call(exactB2,owner)).body.data.kind,'unavailable','queued deletion hides linked history');
 assert.match(e.sql(`select public.execute_trip_deletion_v1('${deletionId}');`),/completed/);
 assert.equal((await call(exactB,owner)).body.data.kind,'empty','Trip deletion cascades result revisions');
 assert.equal((await call(exactB2,owner)).body.data.kind,'empty');
 assert.equal((await call(exactA,owner)).body.data.kind,'result_artifact','unrelated Trip history survives');
 const currentMessage=message('follow_up',{expectedGoalVersion:6,parentMessageId:taskB2.input.messageId,text:'Use a third Trip'});
 assert.equal((await call('/api/chat/native/v5/conversation',owner,'POST',currentMessage)).status,201);
 assert.equal((await call(linkPath,owner,'POST',link(tripC,6,5,currentMessage.messageId,0))).status,201);
 const taskC=await attachTask(7,currentMessage.messageId,'Synthetic linked C');
 const artifactC=randomUUID();assert.equal((await publish(params(artifactC,taskC,taskC.input,tripC,0,7))).status,200);
 const exactC='/api/results/native/v1?artifactId='+artifactC+'&revision=1';
 assert.equal((await call(exactC,owner)).body.data.current,true);
 await patchTrip(tripC,0);
 assert.equal((await call(exactC,owner)).body.data.current,false,'new Trip head invalidates exact saved base');
 assert.equal((await call('/api/results/native/v1/trip?tripId='+tripC,owner)).body.data.kind,'empty');
 assert.equal((await publish(params(randomUUID(),taskC,taskC.input,tripC,0,7))).body.message,'STALE_BASIS','late worker cannot publish on old head');
 assert.equal((await call('/api/chat/native/v5/consent',owner,'DELETE',{policyId:e.policyId})).status,200);
 assert.equal((await call(exactC,owner)).body.data.kind,'unavailable','withdrawn source cannot be read');
 await login(e.users[0]);assert.equal((await call(exactC,owner)).status,401,'replaced session cannot read exact history');
});

test('v5 conversation persists independent answer and versioned goal changes without extra task attempts',{skip:process.env.VP_NATIVE_TEXT_INTEGRATION!=='true',timeout:180000},async t=>{
 const e=await createNativeTextEnvironment();t.after(()=>e.cleanup());
 const call=async(path,token,method='GET',body)=>{const response=await fetch(e.api+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};};
 const login=async(user)=>{const attemptId=randomUUID();const c=await call('/api/auth/native/v2/credentials',null,'POST',{email:user.email,password:user.password,attemptId});assert.equal(c.status,200);assert.equal((await call('/api/auth/native/v2/login',c.body.accessToken,'POST',{attemptId})).status,200);return c.body.accessToken;};
 const owner=await login(e.users[0]),other=await login(e.users[1]),base='/api/chat/native/v5';
 const policy=(await call(base+'/policy',owner)).body.policy;
 const conversationId=randomUUID();
 const make=(relationship,overrides={})=>({conversationId,messageId:randomUUID(),idempotencyKey:randomUUID(),policyId:policy.id,locale:'en',text:'Synthetic independent question',relationship,goalId:null,expectedGoalVersion:null,taskId:null,parentMessageId:null,turnId:relationship==='independent_question'?randomUUID():null,...overrides});
 const question=make('independent_question');
 assert.equal((await call(base+'/conversation',owner,'POST',question)).status,403,'consent required');
 assert.equal(e.sql(`select count(*) from turn_private.assistant_conversations where id='${conversationId}';`),'0');
 assert.equal((await call(base+'/consent',owner,'POST',{policyId:policy.id,noticeHash:policy.noticeHash})).status,200);
 const responses=await Promise.all([call(base+'/conversation',owner,'POST',question),call(base+'/conversation',owner,'POST',question)]);
 assert.deepEqual(responses.map(x=>x.status).sort(),[200,201]);
 await waitUntil(async()=>{const read=await call(base+'/conversation',owner);return read.body.messages?.[0]?.outcome==='answered';},30000,'v5 independent text answer');
 let read=(await call(base+'/conversation',owner)).body;
 assert.equal(read.version,5);assert.equal(read.conversationId,conversationId);assert.equal(read.messages[0].output,'Local synthetic answer: request completed.');
 assert.equal((await call(base+'/conversation',other)).status,403,'other owner without consent sees nothing');
 assert.equal((await call(base+'/consent',other,'POST',{policyId:policy.id,noticeHash:policy.noticeHash})).status,200);
 assert.deepEqual((await call(base+'/conversation',other)).body.messages,[],'consented other owner sees no conversation');
 assert.equal((await call(base+'/conversation',other,'POST',make('goal_start',{goalId:randomUUID(),turnId:null}))).status,403,'other owner cannot append to conversation');
 assert.equal((await call(base+'/conversation',owner,'POST',{...question,text:'Changed'})).status,409);
 assert.equal((await call(base+'/conversation',owner,'POST',{...question,selectedArtifactId:randomUUID()})).status,400,'unknown artifact field closed');
 const goalId=randomUUID();const start=make('goal_start',{text:'Plan a China trip without dates',goalId,turnId:null});
 assert.equal((await call(base+'/conversation',owner,'POST',start)).status,201);
 read=(await call(base+'/conversation',owner)).body;
 assert.equal(read.goals[0].scopeVersion,1);assert.equal(read.messages.length,2);
 const amend=make('amendment',{text:'Prefer rail and fewer transfers',goalId,expectedGoalVersion:1,parentMessageId:start.messageId,turnId:null});
 const conflict=make('amendment',{text:'Prefer buses',goalId,expectedGoalVersion:1,parentMessageId:start.messageId,turnId:null});
 const raced=await Promise.all([call(base+'/conversation',owner,'POST',amend),call(base+'/conversation',owner,'POST',conflict)]);
 assert.deepEqual(raced.map(x=>x.status).sort(),[201,409]);
 const winner=raced[0].status===201?amend:conflict;
 read=(await call(base+'/conversation',owner)).body;
 assert.equal(read.goals[0].scopeVersion,2);assert.deepEqual(read.messages.map(x=>x.sequence),[1,2,3]);
 const follow=make('follow_up',{text:'Please keep this in mind',goalId,expectedGoalVersion:2,parentMessageId:winner.messageId,turnId:null});
 assert.equal((await call(base+'/conversation',owner,'POST',follow)).status,201);
 assert.equal((await call(base+'/conversation',owner,'POST',{...follow,expectedGoalVersion:1,messageId:randomUUID(),idempotencyKey:randomUUID()})).status,409);
 assert.equal((await call(base+'/conversation',owner,'POST',{...follow,taskId:randomUUID(),messageId:randomUUID(),idempotencyKey:randomUUID()})).status,409,'unowned task rejected');
 assert.equal(e.sql(`select count(*) from public.model_budget_attempts where scope_id='${e.users[0].scopeId}';`),'1','goal edits did not enqueue or settle another attempt');
 const taskIds=[],taskTurns=[],links=[];
 for(let index=0;index<2;index++){
  const taskId=randomUUID(),taskTurn=randomUUID();taskIds.push(taskId);taskTurns.push(taskTurn);
  const task={threadId:randomUUID(),turnId:taskTurn,idempotencyKey:randomUUID(),policyId:policy.id,locale:'en',text:'Synthetic related task '+index,serviceTask:{id:taskId,scopeVersion:1,relationship:'new_goal',parentTurnId:null}};
  assert.equal((await call('/api/chat/native/v2/turns',owner,'POST',task)).status,201,'existing task explicitly admitted');
  const link=make('follow_up',{text:'Attach accepted task '+index,goalId,expectedGoalVersion:2,parentMessageId:follow.messageId,taskId,turnId:null});
  assert.equal((await call(base+'/conversation',owner,'POST',link)).status,201,'goal references existing task');
  links.push(link);
 }
 read=(await call(base+'/conversation',owner)).body;
 assert.deepEqual(read.messages.filter(x=>x.taskId).map(x=>x.taskId),taskIds);
 const heldTask=randomUUID(),heldTurn=randomUUID();
 const held={threadId:randomUUID(),turnId:heldTurn,idempotencyKey:randomUUID(),policyId:policy.id,locale:'en',text:'Synthetic HOLD result',
   serviceTask:{id:heldTask,scopeVersion:1,relationship:'new_goal',parentTurnId:null}};
 assert.equal((await call('/api/chat/native/v2/turns',owner,'POST',held)).status,201);
 const heldLink=make('follow_up',{text:'Attach cancellable task',goalId,expectedGoalVersion:2,parentMessageId:links[1].messageId,taskId:heldTask,turnId:null});
 assert.equal((await call(base+'/conversation',owner,'POST',heldLink)).status,201);
 await waitUntil(()=>e.requests.some(r=>r.messages.at(-1)?.content==='Synthetic HOLD result'),10000,'held task reached local provider');
 assert.equal((await call('/api/chat/native/v1/turns/'+heldTurn+'/cancel',owner,'POST',{})).status,200);
 assert.equal(e.sql(`select status from public.turns where id='${heldTurn}';`),'cancelled');
 e.releaseModels();
 const cancelledArtifact=randomUUID();
 assert.throws(()=>e.sql(`set request.jwt.claim.role='service_role';select public.publish_comparison_result_v1('${e.users[0].id}','${cancelledArtifact}',0,'${randomUUID()}',
   '${heldTask}','${goalId}','${heldLink.messageId}',null,null,2,'[]'::jsonb,
   '{"schemaVersion":"comparison/1","title":"Cancelled","summary":"Must not publish","options":[{"id":"a","title":"A","tradeoff":"X"},{"id":"b","title":"B","tradeoff":"Y"}],"actions":[]}'::jsonb);`),/STALE_BASIS/,
   'a cancelled latest Turn cannot publish a result');
 assert.equal(e.sql(`select count(*) from turn_private.result_artifacts where id='${cancelledArtifact}';`),'0');
 await waitUntil(()=>e.sql(`select status from public.turns where id='${taskTurns[0]}';`)==='completed',10000,'source task completed before publication');
 const artifactId=randomUUID(),publicationKey=randomUUID();
 const content={schemaVersion:'comparison/1',title:'Synthetic directions',summary:'Fixture only; no travel recommendation.',options:[
  {id:'one',title:'Synthetic A',tradeoff:'Unknown travel time.'},{id:'two',title:'Synthetic B',tradeoff:'Unknown availability.'}],actions:[]};
 const publish=(expected=0,key=publicationKey,body=content)=>{
  const literal=JSON.stringify(body).replaceAll("'","''");
  return e.sql(`set request.jwt.claim.role='service_role';select public.publish_comparison_result_v1('${e.users[0].id}','${artifactId}',${expected},'${key}','${taskIds[0]}','${goalId}','${links[0].messageId}',null,null,2,'[]'::jsonb,'${literal}'::jsonb);`);
 };
 const published=JSON.parse(publish());assert.deepEqual({kind:published.kind,artifactId:published.artifactId,revision:published.revision,reused:published.reused},
  {kind:'published',artifactId,revision:1,reused:false});
 assert.equal(JSON.parse(publish()).reused,true,'idempotent publication returns the same immutable revision');
 assert.throws(()=>publish(0,randomUUID()),/REVISION_CONFLICT/,'CAS prevents a second revision one');
 assert.throws(()=>publish(1,randomUUID(),{...content,actions:[{kind:'open_url',url:'https://example.test'}]}),/INVALID_INPUT/,'action URL is rejected at storage');
 const resultPath='/api/results/native/v1?artifactId='+artifactId+'&revision=1';
 const saved=await call(resultPath,owner);assert.equal(saved.status,200,JSON.stringify(saved.body));
 assert.equal(saved.body.data.artifactId,artifactId);assert.equal(saved.body.data.revision,1);assert.equal(saved.body.data.current,true);
 assert.equal(saved.body.data.source.inputMessageId,links[0].messageId);
 assert.equal(saved.body.data.source.taskTurnId,taskTurns[0]);
 const second=JSON.parse(publish(1,randomUUID(),{...content,summary:'Synthetic revision two; still no travel recommendation.'}));
 assert.equal(second.revision,2);
 const currentPath='/api/results/native/v1?artifactId='+artifactId+'&revision=2';
 assert.equal((await call(currentPath,owner)).body.data.current,true);
 assert.equal((await call(resultPath,owner)).body.data.current,false,'older immutable revision cannot remain current');
 assert.throws(()=>e.sql(`update turn_private.result_revisions set content='{}'::jsonb where artifact_id='${artifactId}' and revision=1;`),/IMMUTABLE_RESULT_REVISION/);
 const serviceKey=identityLocalEnv()?.SERVICE_ROLE_KEY;assert.ok(serviceKey);
 const raceId=randomUUID();
 const raceParams=(key)=>({p_owner_id:e.users[0].id,p_artifact_id:raceId,p_expected_revision:0,p_idempotency_key:key,
   p_task_id:taskIds[0],p_goal_id:goalId,p_input_message_id:links[0].messageId,p_trip_id:null,p_trip_version:null,
   p_goal_version:2,p_memory_basis:[],p_content:content});
 const raceCall=async(key)=>{const response=await fetch(identityLocalEnv().API_URL+'/rest/v1/rpc/publish_comparison_result_v1',{
   method:'POST',headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'},body:JSON.stringify(raceParams(key))});
   return {status:response.status,body:await response.json()};};
 const racedPublish=await Promise.all([raceCall(randomUUID()),raceCall(randomUUID())]);
 assert.equal(racedPublish.filter(x=>x.status===200).length,1,'concurrent distinct keys get exactly one CAS winner');
 const loser=racedPublish.find(x=>x.status!==200);
 assert.ok(loser && ((loser.status===400 && loser.body.message==='REVISION_CONFLICT')
   || (loser.status===409 && loser.body.code==='23505' && /result_artifacts_pkey/.test(loser.body.message))),
   'loser must be an explicit revision or artifact-key conflict');
 assert.equal(e.sql(`select count(*) from turn_private.result_revisions where artifact_id='${raceId}';`),'1');
 assert.equal(e.sql(`select count(*) from turn_private.result_events where artifact_id='${raceId}';`),'1');
 await waitUntil(()=>e.sql(`select status from public.turns where id='${taskTurns[1]}';`)==='completed',10000,'second task completed before publication');
 const shiftedId=randomUUID(),shiftedPath='/api/results/native/v1?artifactId='+shiftedId+'&revision=1';
 assert.equal(JSON.parse(e.sql(`set request.jwt.claim.role='service_role';select public.publish_comparison_result_v1('${e.users[0].id}','${shiftedId}',0,'${randomUUID()}',
   '${taskIds[1]}','${goalId}','${links[1].messageId}',null,null,2,'[]'::jsonb,'${JSON.stringify(content).replaceAll("'","''")}'::jsonb);`)).revision,1);
 assert.equal((await call(shiftedPath,owner)).body.data.current,true);
 const nextTaskTurn=randomUUID();
 e.sql(`begin;
   insert into public.turns(id,owner_id,status) values('${nextTaskTurn}','${e.users[0].id}','accepted');
   insert into turn_private.text_content(turn_id,owner_id,thread_id,policy_id,consent_id,locale,input_text)
     select '${nextTaskTurn}',owner_id,thread_id,policy_id,consent_id,'en','Synthetic later turn' from turn_private.service_tasks where id='${taskIds[1]}';
   update turn_private.service_tasks set last_turn_id='${nextTaskTurn}' where id='${taskIds[1]}';commit;`);
 assert.equal((await call(shiftedPath,owner)).body.data.current,false,'new latest Task Turn invalidates old result without changing goal version');
 assert.equal((await call(shiftedPath,owner)).body.data.historicalReadable,true);
 assert.equal(JSON.parse(e.sql(`set request.jwt.claim.role='service_role';select public.withdraw_result_artifact_v1('${e.users[0].id}','${shiftedId}',1);`)).reused,false,
   'withdraw remains available after source Task advances');
 assert.equal((await call(shiftedPath,owner)).body.data.kind,'unavailable');
 assert.throws(()=>e.sql(`set request.jwt.claim.role='service_role';select public.publish_comparison_result_v1('${e.users[0].id}','${shiftedId}',1,'${randomUUID()}',
   '${taskIds[1]}','${goalId}','${links[1].messageId}',null,null,2,'[]'::jsonb,'${JSON.stringify(content).replaceAll("'","''")}'::jsonb);`),/STALE_BASIS/);
 assert.equal((await call(resultPath,other)).body.data.kind,'empty','other owner cannot read the result');
 assert.equal((await call('/api/results/native/v1?artifactId='+artifactId+'&revision=3',owner)).body.data.kind,'empty');
 const revised=make('amendment',{text:'Change synthetic planning basis',goalId,expectedGoalVersion:2,parentMessageId:links[1].messageId,turnId:null});
 assert.equal((await call(base+'/conversation',owner,'POST',revised)).status,201);
 const stale=await call(currentPath,owner);assert.equal(stale.body.data.current,false,'goal CAS makes prior basis stale');
 assert.equal(stale.body.data.historicalReadable,true,'authorized history remains readable');
 assert.equal(e.sql(`select count(*) from turn_private.result_events where artifact_id='${artifactId}' and event_type='ready';`),'1','result and ready outbox were committed together');
 assert.equal((await call('/api/results/native/v1?artifactId=bad',owner)).status,400);
 const currentLink=make('follow_up',{text:'Attach task under current scope',goalId,expectedGoalVersion:3,parentMessageId:revised.messageId,taskId:taskIds[0],turnId:null});
 assert.equal((await call(base+'/conversation',owner,'POST',currentLink)).status,201);
 const memoryId=randomUUID(),memoryConsent=randomUUID(),memoryReceipt=randomUUID();
 e.sql(`begin;set constraints all deferred;
   insert into public.memory_consents(id,owner_id,status) values('${memoryConsent}','${e.users[0].id}','granted');
   insert into public.memory_profiles(id,owner_id,source_receipt_id,consent_id,state,constraint_kind,summary)
     values('${memoryId}','${e.users[0].id}','${memoryReceipt}','${memoryConsent}','explicit','preference','Synthetic pace');
   insert into public.memory_receipts(id,owner_id,memory_id,event_state,source_kind)
     values('${memoryReceipt}','${e.users[0].id}','${memoryId}','explicit','system');commit;`);
 const dependentId=randomUUID(),dependentKey=randomUUID(),tripId=randomUUID();
 e.sql(`insert into public.trips(id,owner_id,title) values('${tripId}','${e.users[0].id}','Synthetic trip');`);
 const dependentPath='/api/results/native/v1?artifactId='+dependentId+'&revision=1';
 const dependentContent=JSON.stringify(content).replaceAll("'","''");
 const basis=JSON.stringify([{id:memoryId,revision:1}]).replaceAll("'","''");
 assert.throws(()=>e.sql(`set request.jwt.claim.role='service_role';select public.publish_comparison_result_v1('${e.users[0].id}','${dependentId}',0,'${dependentKey}',
   '${taskIds[0]}','${goalId}','${currentLink.messageId}','${tripId}',0,3,'${basis}'::jsonb,'${dependentContent}'::jsonb);`),/STALE_BASIS/,
   'same-owner but unlinked Trip still cannot receive this result');
 const dependentPublish=e.sql(`set request.jwt.claim.role='service_role';select public.publish_comparison_result_v1('${e.users[0].id}','${dependentId}',0,'${dependentKey}',
   '${taskIds[0]}','${goalId}','${currentLink.messageId}',null,null,3,'${basis}'::jsonb,'${dependentContent}'::jsonb);`);
 assert.equal(JSON.parse(dependentPublish).revision,1);
 assert.equal((await call(dependentPath,owner)).body.data.current,true);
 e.sql(`update public.memory_profiles set summary='Changed synthetic pace' where id='${memoryId}';`);
 assert.equal((await call(dependentPath,owner)).body.data.current,false,'memory revision invalidates currentness');
 assert.equal((await call(dependentPath,owner)).body.data.historicalReadable,true);
 e.sql(`update public.memory_profiles set state='deleted',summary=null where id='${memoryId}';`);
 assert.equal((await call(dependentPath,owner)).body.data.kind,'unavailable','deleted memory cannot be recovered from result content');
 e.sql(`delete from public.trips where id='${tripId}';`);
 assert.equal(e.sql(`select count(*) from turn_private.result_artifacts where id='${dependentId}';`),'1','unrelated Trip deletion leaves an unbound result alone');
 const withdraw=()=>JSON.parse(e.sql(`set request.jwt.claim.role='service_role';select public.withdraw_result_artifact_v1('${e.users[0].id}','${artifactId}',2);`));
 assert.equal(withdraw().reused,false);
 assert.equal(withdraw().reused,true,'withdrawal replay has one durable event');
 assert.equal((await call(resultPath,owner)).body.data.kind,'unavailable','withdrawn content is hidden');
 assert.equal(e.sql(`select count(*) from turn_private.result_events where artifact_id='${artifactId}' and event_type='withdrawn';`),'1');
 const otherGoalId=randomUUID(),otherStart=make('goal_start',{text:'A separate goal',goalId:otherGoalId,turnId:null});
 assert.equal((await call(base+'/conversation',owner,'POST',otherStart)).status,201);
 assert.equal((await call(base+'/conversation',owner,'POST',make('follow_up',{text:'Do not reassign the first task',goalId:otherGoalId,expectedGoalVersion:1,parentMessageId:otherStart.messageId,taskId:taskIds[0],turnId:null}))).status,409);
 await login(e.users[0]);assert.equal((await call(base+'/conversation',owner)).status,401,'replaced session cannot read');
 assert.equal((await call(resultPath,owner)).status,401,'replaced session cannot read result');
 const replacement=await login(e.users[0]);
 assert.equal((await call(base+'/conversation',replacement)).body.messages.length,10,'new session reads durable conversation');
 assert.equal((await call(base+'/consent',replacement,'DELETE',{policyId:policy.id})).status,200);
 assert.equal((await call(base+'/conversation',replacement)).status,403,'withdrawal hides transcript');
 assert.equal((await call(resultPath,replacement)).body.data.kind,'unavailable','withdrawal hides result content');
 assert.equal((await call(base+'/conversation',replacement,'POST',make('independent_question'))).status,403,'withdrawal denies new work');
});

test('v5 goal context manifest selects current owner Memory without dispatch or stale reuse',{skip:process.env.VP_NATIVE_TEXT_INTEGRATION!=='true',timeout:180000},async t=>{
 const e=await createNativeTextEnvironment();t.after(()=>e.cleanup());
 const local=identityLocalEnv();assert.ok(local?.API_URL && local.ANON_KEY);
 const call=async(path,token,method='GET',body)=>{const r=await fetch(e.api+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
 const login=async(user)=>{const attemptId=randomUUID();const c=await call('/api/auth/native/v2/credentials',null,'POST',{email:user.email,password:user.password,attemptId});assert.equal(c.status,200);assert.equal((await call('/api/auth/native/v2/login',c.body.accessToken,'POST',{attemptId})).status,200);return c.body.accessToken;};
 const token=await login(e.users[0]),other=await login(e.users[1]);
 assert.equal((await call('/api/chat/native/v5/consent',token,'POST',{policyId:e.policyId,noticeHash:e.noticeHash})).status,200);
 const conversationId=randomUUID(),goalId=randomUUID(),messageId=randomUUID();
 const goal={conversationId,messageId,idempotencyKey:randomUUID(),policyId:e.policyId,locale:'en',text:'Plan rail travel in China',relationship:'goal_start',goalId,expectedGoalVersion:null,taskId:null,parentMessageId:null,turnId:null};
 assert.equal((await call('/api/chat/native/v5/conversation',token,'POST',goal)).status,201);
 const headers={apikey:local.ANON_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'};
 const memoryRpc=async(name,body)=>{const r=await fetch(local.API_URL+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 const consent=await memoryRpc('create_memory_retrieval_consent',{});assert.equal(consent.status,200);
 const memoryId=randomUUID(),receiptId=randomUUID();
 const created=await memoryRpc('create_explicit_memory_profile_v2',{p_memory_id:memoryId,p_receipt_id:receiptId,p_consent_id:consent.body[0].consent_id,p_constraint_kind:'preference',p_summary:'Prefer rail and fewer transfers'});
 assert.equal(created.status,200,JSON.stringify(created.body));
 const input={conversationId,goalId,messageId,expectedGoalVersion:1,memoryIds:[memoryId]};
 const context=()=>call('/api/chat/native/v5/context',token,'POST',input);
 const first=await context();assert.equal(first.status,200,JSON.stringify(first.body));
 assert.equal(first.body.schemaVersion,'assistant-goal-context/1');assert.equal(first.body.readyForProvider,false);
 assert.equal(first.body.selectedMemoryCount,1);
 assert.ok(first.body.context.sourceRefs.some(r=>r.id==='memory:'+memoryId&&r.sourceVersion==='revision:1:receipt:'+receiptId));
 assert.equal(JSON.stringify(first.body).includes('Prefer rail and fewer transfers'),false,'manifest contains no Memory management text');
 assert.equal(e.counts.http,0,'manifest does not invoke the synthetic model');
 assert.equal((await call('/api/chat/native/v5/consent',other,'POST',{policyId:e.policyId,noticeHash:e.noticeHash})).status,200);
 assert.equal((await call('/api/chat/native/v5/context',other,'POST',input)).status,403,'consented other owner cannot use this conversation');
 assert.equal((await call('/api/chat/native/v5/context',token,'POST',{...input,memoryIds:[randomUUID()]})).status,403,'unknown and unowned Memory have one denial');
 assert.equal((await memoryRpc('transition_memory_profile',{p_memory_id:memoryId,p_next_state:'paused'})).status,200);
 assert.equal((await context()).status,403,'paused Memory is not projected from an old source version');
 assert.equal((await memoryRpc('transition_memory_profile',{p_memory_id:memoryId,p_next_state:'explicit'})).status,200);
 const updated=await context();assert.equal(updated.status,200);
 assert.ok(updated.body.context.sourceRefs.some(r=>r.id==='memory:'+memoryId&&r.sourceVersion==='revision:3:receipt:'+receiptId));
 const amended={...goal,messageId:randomUUID(),idempotencyKey:randomUUID(),text:'Prefer rail with an easy transfer',relationship:'amendment',expectedGoalVersion:1,parentMessageId:goal.messageId};
 assert.equal((await call('/api/chat/native/v5/conversation',token,'POST',amended)).status,201);
 assert.equal((await context()).status,409,'old goal basis cannot be reused after amendment');
 const current=await call('/api/chat/native/v5/context',token,'POST',{...input,messageId:amended.messageId,expectedGoalVersion:2});
 assert.equal(current.status,200);
 assert.equal((await memoryRpc('revoke_memory_retrieval_consent',{p_consent_id:consent.body[0].consent_id})).status,200);
 assert.equal((await call('/api/chat/native/v5/context',token,'POST',{...input,messageId:amended.messageId,expectedGoalVersion:2})).status,403,'revoked retrieval consent denies a previously selected Memory');
 await login(e.users[0]);assert.equal((await context()).status,401,'replaced mobile session cannot return a manifest');
});

test('v5 explicit goal Trip link has CAS, owner, deletion and revoked-consent boundaries',{skip:process.env.VP_NATIVE_TEXT_INTEGRATION!=='true',timeout:180000},async t=>{
 const e=await createNativeTextEnvironment();t.after(()=>e.cleanup());
 const call=async(path,token,method='GET',body)=>{const r=await fetch(e.api+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
 const login=async user=>{const attemptId=randomUUID();const c=await call('/api/auth/native/v2/credentials',null,'POST',{email:user.email,password:user.password,attemptId});assert.equal(c.status,200);assert.equal((await call('/api/auth/native/v2/login',c.body.accessToken,'POST',{attemptId})).status,200);return c.body.accessToken;};
 const owner=await login(e.users[0]),other=await login(e.users[1]);
 assert.equal((await call('/api/chat/native/v5/consent',owner,'POST',{policyId:e.policyId,noticeHash:e.noticeHash})).status,200);
 const tripA=randomUUID(),tripB=randomUUID(),foreignTrip=randomUUID();
 for(const [token,tripId,title] of [[owner,tripA,'Owned A'],[owner,tripB,'Owned B'],[other,foreignTrip,'Other owner']])
  assert.equal((await call('/api/trips/native/v2',token,'POST',{tripId,title})).status,201);
 const conversationId=randomUUID(),goalId=randomUUID(),rootMessageId=randomUUID();
 const message=(relationship,overrides={})=>({conversationId,messageId:randomUUID(),idempotencyKey:randomUUID(),policyId:e.policyId,locale:'en',text:'Plan my Trip',relationship,
  goalId,expectedGoalVersion:null,taskId:null,parentMessageId:null,turnId:null,...overrides});
 const start=message('goal_start',{messageId:rootMessageId});
 assert.equal((await call('/api/chat/native/v5/conversation',owner,'POST',start)).status,201);
 const path='/api/chat/native/v5/goals/'+goalId+'/trip';
 const binding=(tripId,expectedGoalScopeVersion,expectedLinkVersion,sourceMessageId,overrides={})=>({operationId:randomUUID(),conversationId,
  sourceMessageId,expectedGoalScopeVersion,expectedLinkVersion,action:'link',tripId,expectedTripVersion:0,confirmed:true,...overrides});
 const first=binding(tripA,1,0,rootMessageId);
 assert.equal((await call(path,owner,'POST',{...first,confirmed:false})).status,400);
 assert.equal((await call(path,owner,'POST',{...first,tripId:foreignTrip})).status,403,'same actor cannot select another owner Trip');
 assert.equal((await call(path,owner,'POST',{...first,expectedTripVersion:1})).status,409,'Trip head CAS required');
 const pair=await Promise.all([call(path,owner,'POST',first),call(path,owner,'POST',first)]);
 assert.deepEqual(pair.map(r=>r.status).sort(),[200,201]);
 assert.equal((await call(path,owner)).body.tripId,tripA);
 assert.equal((await call(path,owner)).body.linkVersion,1);
 assert.equal((await call(path,other)).status,403);
 assert.equal((await call(path,owner,'POST',{...first,tripId:tripB})).status,409,'same operation cannot switch Trip');
 assert.equal((await call(path,owner,'POST',binding(tripB,1,0,rootMessageId))).status,409,'stale scope/link cannot retarget');
 const proposal=await call('/api/trips/native/v2/'+tripA+'/proposal',owner,'POST',{patch:{expectedVersion:0,operations:[{kind:'set_title',title:'Owned A revised'}]}});
 assert.equal(proposal.status,201);
 const pending=await call('/api/trips/native/v2/'+tripA+'/proposal?proposalId='+proposal.body.proposalId,owner);
 assert.equal((await call('/api/trips/native/v2/'+tripA+'/confirm',owner,'POST',{proposalId:proposal.body.proposalId,idempotencyKey:randomUUID(),digest:pending.body.proposal.digest})).status,200);
 assert.equal((await call(path,owner)).body.current,false,'a newer confirmed Trip version makes the old binding stale');
 assert.equal(e.sql(`select head_version from public.trips where id='${tripA}';`),'1','only separate confirmed proposal changed Trip');
 const follow=message('follow_up',{expectedGoalVersion:2,parentMessageId:rootMessageId,text:'Use a different existing Trip'});
 assert.equal((await call('/api/chat/native/v5/conversation',owner,'POST',follow)).status,201);
 assert.equal((await call(path,owner,'POST',binding(tripB,2,1,follow.messageId))).status,201,'explicit retarget increments both versions');
 let read=(await call(path,owner)).body;assert.deepEqual([read.tripId,read.linkVersion,read.goalScopeVersion,read.current],[tripB,2,3,true]);
 const unlink={operationId:randomUUID(),conversationId,sourceMessageId:null,expectedGoalScopeVersion:3,expectedLinkVersion:2,action:'unlink',tripId:null,expectedTripVersion:null,confirmed:true};
 assert.equal((await call(path,owner,'POST',unlink)).status,201);assert.equal((await call(path,owner,'POST',unlink)).body.reused,true);
 read=(await call(path,owner)).body;assert.deepEqual([read.tripId,read.linkVersion,read.goalScopeVersion],[null,3,4]);
 const next=message('follow_up',{expectedGoalVersion:4,parentMessageId:follow.messageId,text:'Use owned B again'});
 assert.equal((await call('/api/chat/native/v5/conversation',owner,'POST',next)).status,201);
 assert.equal((await call(path,owner,'POST',binding(tripB,4,3,next.messageId))).status,201);
 const otherGoalId=randomUUID(),otherRoot=message('goal_start',{goalId:otherGoalId,messageId:randomUUID(),text:'Another goal for owned A'});
 assert.equal((await call('/api/chat/native/v5/conversation',owner,'POST',otherRoot)).status,201);
 const otherPath='/api/chat/native/v5/goals/'+otherGoalId+'/trip';
 assert.equal((await call(otherPath,owner,'POST',{...binding(tripA,1,0,otherRoot.messageId),expectedTripVersion:1})).status,201);
 const racingTrip=randomUUID(),racingGoal=randomUUID(),racingRoot=message('goal_start',{goalId:racingGoal,messageId:randomUUID(),text:'Concurrent deletion goal'});
 assert.equal((await call('/api/trips/native/v2',owner,'POST',{tripId:racingTrip,title:'Racing Trip'})).status,201);
 assert.equal((await call('/api/chat/native/v5/conversation',owner,'POST',racingRoot)).status,201);
 const racingPath='/api/chat/native/v5/goals/'+racingGoal+'/trip',racingRequest=randomUUID();
 const raced=await Promise.all([
  call(racingPath,owner,'POST',binding(racingTrip,1,0,racingRoot.messageId)),
  call('/api/privacy/native/v1/trips',owner,'POST',{requestId:racingRequest,tripId:racingTrip,expectedVersion:0,confirmed:true}),
 ]);
 assert.ok([201,409,503].includes(raced[0].status));
 const raceDeletion=raced[1].status===202?raced[1]:await call('/api/privacy/native/v1/trips',owner,'POST',{requestId:racingRequest,tripId:racingTrip,expectedVersion:0,confirmed:true});
 assert.equal(raceDeletion.status,202,'either order must permit the confirmed deletion transaction');
 assert.equal((await call(racingPath,owner)).body.tripId,null,'a queued deletion and live goal link cannot coexist');
 assert.match(e.sql(`select public.execute_trip_deletion_v1('${racingRequest}');`),/completed/);
 const requestId=randomUUID();
 const deletion={requestId,tripId:tripB,expectedVersion:0,confirmed:true};
 const queued=await call('/api/privacy/native/v1/trips',owner,'POST',deletion);
 assert.equal(queued.status,202,JSON.stringify(queued.body));assert.equal(queued.body.state,'queued');
 read=(await call(path,owner)).body;
 assert.deepEqual([read.tripId,read.linkVersion,read.goalScopeVersion,read.sourceKind],[null,5,6,'trip_deletion_confirmed']);
 const otherLink=(await call(otherPath,owner)).body;
 assert.deepEqual([otherLink.tripId,otherLink.goalScopeVersion,otherLink.current],[tripA,2,true],'confirmed deletion detached only the selected Trip');
 assert.equal((await call('/api/privacy/native/v1/trips',owner,'POST',deletion)).body.state,'queued');
 assert.equal((await call(path,owner)).body.linkVersion,5,'request replay cannot detach twice');
 const afterDelete=message('follow_up',{expectedGoalVersion:6,parentMessageId:next.messageId,text:'Do not reattach deleting Trip'});
 assert.equal((await call('/api/chat/native/v5/conversation',owner,'POST',afterDelete)).status,201);
 assert.equal((await call(path,owner,'POST',binding(tripB,6,5,afterDelete.messageId))).status,409,'queued tombstone denies new link');
 // A fixture-only private write simulates a corrupt late link: execution must
 // reject it by name before it can claim deletion complete, then recover.
 e.sql(`update turn_private.assistant_goal_trip_links set trip_id='${tripB}',trip_head_version=0,source_message_id='${afterDelete.messageId}',source_kind='native_user_confirmed' where goal_id='${goalId}';`);
 assert.throws(()=>e.sql(`select public.execute_trip_deletion_v1('${requestId}');`),/TRIP_HAS_CHAT_REFERENCES/);
 e.sql(`update turn_private.assistant_goal_trip_links set trip_id=null,trip_head_version=null,source_message_id=null,source_kind='trip_deletion_confirmed' where goal_id='${goalId}';`);
 assert.match(e.sql(`select public.execute_trip_deletion_v1('${requestId}');`),/completed/);
 assert.equal(e.sql(`select count(*) from public.trips where id='${tripB}';`),'0');
 assert.equal(e.sql(`select count(*) from public.trips where id='${tripA}';`),'1','unrelated Trip survives');
 const finalMessage=message('follow_up',{expectedGoalVersion:6,parentMessageId:afterDelete.messageId,text:'Keep my remaining Trip'});
 assert.equal((await call('/api/chat/native/v5/conversation',owner,'POST',finalMessage)).status,201);
 assert.equal((await call(path,owner,'POST',binding(tripA,6,5,finalMessage.messageId,{expectedTripVersion:1}))).status,201);
 assert.equal((await call('/api/chat/native/v5/consent',owner,'DELETE',{policyId:e.policyId})).status,200);
 read=(await call(path,owner)).body;assert.equal(read.current,false);assert.equal(read.sourceMessageId,null);
 const privacyList=await call('/api/chat/native/v5/goal-trips',owner);
 assert.equal(privacyList.status,200);
 assert.ok(privacyList.body.links.some(link=>link.goalId===goalId&&link.tripId===tripA));
 assert.equal(JSON.stringify(privacyList.body).includes('Keep my remaining Trip'),false,'privacy list does not restore withdrawn goal text');
 const privacyUnlink={...unlink,operationId:randomUUID(),expectedGoalScopeVersion:7,expectedLinkVersion:6};
 const runtime=identityLocalEnv();assert.ok(runtime?.API_URL && runtime.ANON_KEY);
 const envPatch={NEXT_PUBLIC_SUPABASE_URL:runtime.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:runtime.ANON_KEY,
  VISEPANDA_NATIVE_LOCAL_TRIP:'true',VISEPANDA_NATIVE_LOCAL_TEXT:'false',VISEPANDA_NATIVE_LOCAL_ASSISTANT_CONVERSATION:'false'};
 const previous=new Map(Object.keys(envPatch).map(key=>[key,process.env[key]]));
 Object.assign(process.env,envPatch);
 try {
  const {nativeAssistantTripHTTP,nativeAssistantTripPrivacyHTTP}=await import('../../../lib/server/turn/native-assistant-trip-http.ts');
  const {NextRequest}=await import('next/server.js');
  const origin='http://127.0.0.1:59651',headers={Authorization:'Bearer '+owner};
  const privacyRead=await nativeAssistantTripPrivacyHTTP(new NextRequest(origin+'/api/chat/native/v5/goal-trips',{headers}));
  assert.equal(privacyRead.status,200);
  assert.ok((await privacyRead.json()).links.some(link=>link.goalId===goalId));
  const detached=await nativeAssistantTripHTTP(new NextRequest(origin+path,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(privacyUnlink)}),goalId);
  assert.equal(detached.status,201,'unlink remains available after text consent and v5 producer withdrawal');
 } finally {for(const [key,value] of previous)value===undefined?delete process.env[key]:process.env[key]=value;}
 assert.equal((await call(path,owner)).body.tripId,null);
 assert.equal((await call('/api/chat/native/v5/goal-trips',owner)).body.links.some(link=>link.goalId===goalId),false);
 assert.equal((await call(path,owner,'POST',binding(tripA,8,7,finalMessage.messageId,{expectedTripVersion:1}))).status,403,'withdrawal denies new link');
 const local=identityLocalEnv();assert.ok(local?.API_URL && local.SERVICE_ROLE_KEY);
 const service=createClient(local.API_URL,local.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const ordinary=createClient(local.API_URL,local.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+owner}}});
 assert.ok((await ordinary.rpc('assistant_goal_trip_export_owner_v1',{p_owner:e.users[0].id})).error,'ordinary actor cannot call export helper');
 assert.ok((await ordinary.rpc('assistant_goal_trip_erase_owner_v1',{p_owner:e.users[0].id})).error,'ordinary actor cannot erase links directly');
 const exported=await service.rpc('assistant_goal_trip_export_owner_v1',{p_owner:e.users[0].id});
 assert.ifError(exported.error);
 assert.ok(exported.data.links.length>=2&&exported.data.links.length<=3,'racing link may lose to deletion without ever creating a row');
 assert.ok((await service.rpc('assistant_goal_trip_erase_owner_v1',{p_owner:e.users[0].id})).data.receipts>=8);
 assert.equal(e.sql(`select count(*) from turn_private.assistant_goal_trip_links where owner_id='${e.users[0].id}';`),'0');
 assert.equal(e.counts.http,0,'Trip linking and deletion never invokes a model');
 await login(e.users[0]);assert.equal((await call(path,owner)).status,401,'replaced session cannot read old link');
});

test('v5 Trip deletion takes the Trip lock before goal/link and fences an interleaved retarget',{skip:process.env.VP_NATIVE_TEXT_INTEGRATION!=='true',timeout:180000},async t=>{
 const e=await createNativeTextEnvironment();t.after(()=>e.cleanup());
 const call=async(path,token,method='GET',body)=>{const r=await fetch(e.api+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
 const attemptId=randomUUID();const credentials=await call('/api/auth/native/v2/credentials',null,'POST',{email:e.users[0].email,password:e.users[0].password,attemptId});
 assert.equal(credentials.status,200);
 const owner=credentials.body.accessToken;
 assert.equal((await call('/api/auth/native/v2/login',owner,'POST',{attemptId})).status,200);
 assert.equal((await call('/api/chat/native/v5/consent',owner,'POST',{policyId:e.policyId,noticeHash:e.noticeHash})).status,200);
 const oldTrip=randomUUID(),nextTrip=randomUUID(),conversationId=randomUUID(),goalId=randomUUID(),messageId=randomUUID();
 for(const [tripId,title] of [[oldTrip,'Held Trip'],[nextTrip,'Next Trip']])
  assert.equal((await call('/api/trips/native/v2',owner,'POST',{tripId,title})).status,201);
 const goal={conversationId,messageId,idempotencyKey:randomUUID(),policyId:e.policyId,locale:'en',text:'Plan a Trip',relationship:'goal_start',goalId,expectedGoalVersion:null,taskId:null,parentMessageId:null,turnId:null};
 assert.equal((await call('/api/chat/native/v5/conversation',owner,'POST',goal)).status,201);
 const path='/api/chat/native/v5/goals/'+goalId+'/trip';
 const link={operationId:randomUUID(),conversationId,sourceMessageId:messageId,expectedGoalScopeVersion:1,expectedLinkVersion:0,action:'link',tripId:oldTrip,expectedTripVersion:0,confirmed:true};
 assert.equal((await call(path,owner,'POST',link)).status,201);
 // This disposable trigger runs before the production guard, after the delete
 // RPC has locked oldTrip. It makes the opposing lock order deterministic.
 const key=827001;
 e.sql(`create function turn_private.test_pause_goal_trip_delete() returns trigger language plpgsql set search_path='' as $$begin perform pg_catalog.pg_advisory_xact_lock(${key});perform pg_catalog.pg_sleep(0.8);return new;end$$;create trigger a_pause_goal_trip_delete before insert on privacy_private.trip_deletions for each row execute function turn_private.test_pause_goal_trip_delete();`);
 const requestId=randomUUID();
 try {
  const deletion=call('/api/privacy/native/v1/trips',owner,'POST',{requestId,tripId:oldTrip,expectedVersion:0,confirmed:true});
  await waitUntil(()=>e.sql(`select pg_catalog.pg_try_advisory_lock(${key});`)==='f',3000,'confirmed deletion entered the Trip-locked trigger');
  const retarget=call(path,owner,'POST',{...link,operationId:randomUUID(),sourceMessageId:null,expectedGoalScopeVersion:2,expectedLinkVersion:1,tripId:nextTrip});
  const [deleted,moved]=await Promise.all([deletion,retarget]);
  assert.equal(deleted.status,202,JSON.stringify(deleted.body));
  assert.equal(moved.status,409,JSON.stringify(moved.body));
  const read=await call(path,owner);
  assert.equal(read.status,200);assert.equal(read.body.tripId,null);
  assert.equal(read.body.sourceKind,'trip_deletion_confirmed');
  assert.equal(e.sql(`select state from privacy_private.trip_deletions where request_id='${requestId}';`),'queued');
  assert.match(e.sql(`select public.execute_trip_deletion_v1('${requestId}');`),/completed/);
  assert.equal(e.sql(`select count(*) from public.trips where id='${nextTrip}';`),'1');
 } finally {
  e.sql('drop trigger a_pause_goal_trip_delete on privacy_private.trip_deletions;drop function turn_private.test_pause_goal_trip_delete();');
 }
});

test('v5 Trip unlink and confirmed deletion reserve a terminal goal version at the ordinary cap',{skip:process.env.VP_NATIVE_TEXT_INTEGRATION!=='true',timeout:180000},async t=>{
 const e=await createNativeTextEnvironment();t.after(()=>e.cleanup());
 const call=async(path,token,method='GET',body)=>{const r=await fetch(e.api+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
 const attemptId=randomUUID(),credentials=await call('/api/auth/native/v2/credentials',null,'POST',{email:e.users[0].email,password:e.users[0].password,attemptId});
 assert.equal(credentials.status,200);
 const owner=credentials.body.accessToken;
 assert.equal((await call('/api/auth/native/v2/login',owner,'POST',{attemptId})).status,200);
 assert.equal((await call('/api/chat/native/v5/consent',owner,'POST',{policyId:e.policyId,noticeHash:e.noticeHash})).status,200);
 for(const route of ['explicit','deletion']){
  const tripId=randomUUID(),conversationId=randomUUID(),goalId=randomUUID(),messageId=randomUUID(),path='/api/chat/native/v5/goals/'+goalId+'/trip';
  assert.equal((await call('/api/trips/native/v2',owner,'POST',{tripId,title:'Cap '+route})).status,201);
  const start={conversationId,messageId,idempotencyKey:randomUUID(),policyId:e.policyId,locale:'en',text:'Plan capped goal',relationship:'goal_start',goalId,expectedGoalVersion:null,taskId:null,parentMessageId:null,turnId:null};
  assert.equal((await call('/api/chat/native/v5/conversation',owner,'POST',start)).status,201);
  assert.equal((await call(path,owner,'POST',{operationId:randomUUID(),conversationId,sourceMessageId:messageId,
   expectedGoalScopeVersion:1,expectedLinkVersion:0,action:'link',tripId,expectedTripVersion:0,confirmed:true})).status,201);
  // Disposable privileged fixture places a valid active reference at the old
  // maximum; no real user must perform thousands of edits to reach this case.
  e.sql(`update turn_private.assistant_goals set scope_version=10000 where id='${goalId}';
    update turn_private.assistant_goal_trip_links set link_version=10000,goal_scope_version=10000 where goal_id='${goalId}';
    update turn_private.assistant_messages set scope_version=10000 where id='${messageId}';`);
  const before=await call('/api/chat/native/v5/context',owner,'POST',{conversationId,goalId,messageId,expectedGoalVersion:10000,memoryIds:[]});
  assert.equal(before.status,200);
  const amend={...start,messageId:randomUUID(),idempotencyKey:randomUUID(),text:'Do not consume terminal version',relationship:'amendment',expectedGoalVersion:10000,parentMessageId:messageId};
  assert.equal((await call('/api/chat/native/v5/conversation',owner,'POST',amend)).status,409,'ordinary amendment cannot consume terminal version');
  if(route==='explicit'){
   const unlink={operationId:randomUUID(),conversationId,sourceMessageId:null,expectedGoalScopeVersion:10000,
    expectedLinkVersion:10000,action:'unlink',tripId:null,expectedTripVersion:null,confirmed:true};
   const response=await call(path,owner,'POST',unlink);
   assert.equal(response.status,201,JSON.stringify(response.body));
   assert.deepEqual([response.body.goalScopeVersion,response.body.linkVersion],[10001,10001]);
  }else{
   const requestId=randomUUID();
   const accepted=await call('/api/privacy/native/v1/trips',owner,'POST',{requestId,tripId,expectedVersion:0,confirmed:true});
   assert.equal(accepted.status,202,JSON.stringify(accepted.body));
   assert.equal((await call('/api/privacy/native/v1/trips',owner,'POST',{requestId,tripId,expectedVersion:0,confirmed:true})).body.state,'queued');
   assert.match(e.sql(`select public.execute_trip_deletion_v1('${requestId}');`),/completed/);
  }
  const read=await call(path,owner);
  assert.deepEqual([read.body.tripId,read.body.linkVersion,read.body.goalScopeVersion,read.body.terminalUnlinked],[null,10001,10001,true]);
  assert.equal(e.sql(`select trip_terminal from turn_private.assistant_goals where id='${goalId}';`),'t');
  assert.equal((await call('/api/chat/native/v5/context',owner,'POST',{conversationId,goalId,messageId,expectedGoalVersion:10000,memoryIds:[]})).status,409,
   'the old goal/context basis is stale after terminal unlink');
  assert.equal((await call(path,owner,'POST',{operationId:randomUUID(),conversationId,sourceMessageId:null,
   expectedGoalScopeVersion:10001,expectedLinkVersion:10001,action:'link',tripId,expectedTripVersion:0,confirmed:true})).status,400,
   'terminal goal cannot silently re-link under the old contract');
 }
});

test('v5 owner privacy cursor reaches and can unlink the 101st active link after withdrawal',{skip:process.env.VP_NATIVE_TEXT_INTEGRATION!=='true',timeout:180000},async t=>{
 const e=await createNativeTextEnvironment();t.after(()=>e.cleanup());
 const call=async(path,token,method='GET',body)=>{const r=await fetch(e.api+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
 const attemptId=randomUUID(),c=await call('/api/auth/native/v2/credentials',null,'POST',{email:e.users[0].email,password:e.users[0].password,attemptId});
 assert.equal(c.status,200);const owner=c.body.accessToken;
 assert.equal((await call('/api/auth/native/v2/login',owner,'POST',{attemptId})).status,200);
 assert.equal((await call('/api/chat/native/v5/consent',owner,'POST',{policyId:e.policyId,noticeHash:e.noticeHash})).status,200);
 const candidateTrip=randomUUID(),dummyTrip=randomUUID(),conversationId=randomUUID(),goalId=randomUUID(),messageId=randomUUID(),dummyConversation=randomUUID();
 for(const [tripId,title] of [[candidateTrip,'New candidate'],[dummyTrip,'Owned prior links']])
  assert.equal((await call('/api/trips/native/v2',owner,'POST',{tripId,title})).status,201);
 const goal={conversationId,messageId,idempotencyKey:randomUUID(),policyId:e.policyId,locale:'en',text:'One more goal',relationship:'goal_start',goalId,expectedGoalVersion:null,taskId:null,parentMessageId:null,turnId:null};
 assert.equal((await call('/api/chat/native/v5/conversation',owner,'POST',goal)).status,201);
 const consent=e.sql(`select consent_id from turn_private.text_consents where owner_id='${e.users[0].id}' and policy_id='${e.policyId}';`);
 e.sql(`insert into turn_private.assistant_conversations(id,owner_id,policy_id,consent_id) values('${dummyConversation}','${e.users[0].id}','${e.policyId}','${consent}');
 with goals as (insert into turn_private.assistant_goals(id,conversation_id,owner_id,current_text)
   select gen_random_uuid(),'${dummyConversation}','${e.users[0].id}','Synthetic bounded link' from generate_series(1,100) returning id)
 insert into turn_private.assistant_goal_trip_links(goal_id,conversation_id,owner_id,link_version,goal_scope_version,operation_id,trip_id,trip_head_version,source_kind)
 select id,'${dummyConversation}','${e.users[0].id}',1,1,gen_random_uuid(),'${dummyTrip}',0,'native_user_confirmed' from goals;`);
 const privacy=cursor=>call('/api/chat/native/v5/goal-trips'+(cursor?'/'+cursor:''),owner);
 const allPages=async()=>{
  const links=[];let cursor=null;
  do {
   const page=await privacy(cursor);assert.equal(page.status,200,JSON.stringify(page.body));
   assert.ok(page.body.links.length<=50);
   links.push(...page.body.links);cursor=page.body.nextCursor;
  }while(cursor);
  assert.equal(new Set(links.map(link=>link.goalId)).size,links.length);
  return links;
 };
 assert.equal((await allPages()).length,100,'no active owner link is hidden by the first-page bound');
 const path='/api/chat/native/v5/goals/'+goalId+'/trip',input={operationId:randomUUID(),conversationId,sourceMessageId:messageId,
  expectedGoalScopeVersion:1,expectedLinkVersion:0,action:'link',tripId:candidateTrip,expectedTripVersion:0,confirmed:true};
 assert.equal((await call(path,owner,'POST',input)).status,201,'a 101st link is allowed and must be pageable');
 assert.equal((await call('/api/chat/native/v5/consent',owner,'DELETE',{policyId:e.policyId})).status,200);
 const links=await allPages();assert.equal(links.length,101);
 const last=links.at(-1),unlink={operationId:randomUUID(),conversationId:last.conversationId,sourceMessageId:null,
  expectedGoalScopeVersion:last.goalScopeVersion,expectedLinkVersion:last.linkVersion,
  action:'unlink',tripId:null,expectedTripVersion:null,confirmed:true};
 assert.equal((await call('/api/chat/native/v5/goals/'+last.goalId+'/trip',owner,'POST',unlink)).status,201);
 assert.equal((await allPages()).length,100,'the far-page link remains removable after consent withdrawal');
 e.sql(`delete from turn_private.assistant_goal_trip_links where owner_id='${e.users[0].id}';
  delete from turn_private.assistant_goal_trip_receipts where owner_id='${e.users[0].id}';`);
});
