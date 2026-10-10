import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {spawn} from 'node:child_process';
import {createNativeTextEnvironment} from '../turn/native-text-environment.mjs';
import {identityLocalEnv} from '../identity/local-supabase.mjs';

test('existing pending Proposal references save/read exactly without executing or copying confirmation; live scope/lifecycle and comparison compatibility',{
 skip:process.env.VP_NATIVE_TEXT_INTEGRATION!=='true',timeout:240000,
},async t=>{
 const e=await createNativeTextEnvironment();t.after(()=>e.cleanup());
 const local=identityLocalEnv();assert.match(local.API_URL,/^http:\/\/127\.0\.0\.1:\d+$/);
 const service=createClient(local.API_URL,local.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const call=async(path,token,method='GET',body)=>{const r=await fetch(e.api+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});const text=await r.text();return {status:r.status,body:text?JSON.parse(text):null,cache:r.headers.get('cache-control')};};
 const ok=async(path,token,method='GET',body)=>{const r=await call(path,token,method,body);assert.ok(r.status>=200&&r.status<300,JSON.stringify({status:r.status,body:r.body}));return r.body;};
 const login=async user=>{const attemptId=uuid(),r=await ok('/api/auth/native/v2/credentials',null,'POST',{email:user.email,password:user.password,attemptId});await ok('/api/auth/native/v2/login',r.accessToken,'POST',{attemptId});return r.accessToken;};
 const owner=await login(e.users[0]),other=await login(e.users[1]);
 await ok('/api/chat/native/v5/consent',owner,'POST',{policyId:e.policyId,noticeHash:e.noticeHash});
 const fixture=async({baseVersion=0}={})=>{
  const a={trip:uuid(),goal:uuid(),conversation:uuid(),root:uuid(),input:uuid(),task:uuid(),turn:uuid(),artifact:uuid(),baseVersion};
  await ok('/api/trips/native/v2',owner,'POST',{tripId:a.trip,title:'Synthetic unchanged Trip'});
  if(baseVersion===1){
   // Legal versioned synthetic baseline only; no fake applied Proposal/event/receipt.
   // Archive metadata is injected below to isolate its eligibility guard.
   e.sql(`update public.trips set head_version=1 where id='${a.trip}';insert into public.trip_version_snapshots(trip_id,owner_id,version,title,content) select id,owner_id,1,title,public.trip_content_snapshot(id,title) from public.trips where id='${a.trip}';`);
  }
  const root={conversationId:a.conversation,messageId:a.root,idempotencyKey:uuid(),policyId:e.policyId,locale:'en',text:'Synthetic reference task context',relationship:'goal_start',goalId:a.goal,expectedGoalVersion:null,taskId:null,parentMessageId:null,turnId:null};
  await ok('/api/chat/native/v5/conversation',owner,'POST',root);
  await ok('/api/chat/native/v5/goals/'+a.goal+'/trip',owner,'POST',{operationId:uuid(),conversationId:a.conversation,sourceMessageId:a.root,expectedGoalScopeVersion:1,expectedLinkVersion:0,action:'link',tripId:a.trip,expectedTripVersion:baseVersion,confirmed:true});
  await ok('/api/chat/native/v2/turns',owner,'POST',{threadId:uuid(),turnId:a.turn,idempotencyKey:uuid(),policyId:e.policyId,locale:'en',text:'Synthetic already-completed source task',serviceTask:{id:a.task,scopeVersion:1,relationship:'new_goal',parentTurnId:null}});
  await ok('/api/chat/native/v5/conversation',owner,'POST',{...root,messageId:a.input,idempotencyKey:uuid(),relationship:'follow_up',expectedGoalVersion:2,parentMessageId:a.root,taskId:a.task});
  for(let n=0;n<160 && e.sql(`select status from public.turns where id='${a.turn}';`)!=='completed';n++)await new Promise(r=>setTimeout(r,100));
  assert.equal(e.sql(`select status from public.turns where id='${a.turn}';`),'completed','actual disposable synthetic source worker completed before artifact publication');
  const patch={expectedVersion:baseVersion,operations:[{kind:'set_title',title:'Synthetic proposed title, never applied'}]};
  const p=await ok('/api/trips/native/v2/'+a.trip+'/proposal',owner,'POST',{patch});
  a.proposal=p.proposalId;a.proposalRevision=p.revision;
  const canonical=await ok('/api/trips/native/v2/'+a.trip+'/proposal?proposalId='+a.proposal,owner);
  assert.equal(canonical.proposal.id,a.proposal);assert.equal(canonical.proposal.revision,a.proposalRevision);
  return a;
 };
 const params=(a,overrides={})=>({p_owner_id:e.users[0].id,p_artifact_id:a.artifact,p_expected_revision:0,p_idempotency_key:uuid(),p_task_id:a.task,p_goal_id:a.goal,p_input_message_id:a.input,p_trip_id:a.trip,p_trip_version:a.baseVersion,p_goal_version:2,p_memory_basis:[],p_content:{schemaVersion:'change-proposal-reference/1',proposalId:a.proposal,proposalRevision:a.proposalRevision,actions:[]},...overrides});
 const pub=async(a,overrides={})=>{const r=await service.rpc('publish_change_proposal_reference_v1',params(a,overrides));assert.ifError(r.error);return r.data;};
 const path=a=>'/api/results/native/v1/change-proposal-reference?artifactId='+a.artifact+'&revision=1';
 const read=async(a,token=owner)=>{const r=await call(path(a),token);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.cache,'private, no-store');return r.body.data;};
 const state=trip=>e.sql(`select jsonb_build_array(t.title,t.head_version,(select count(*) from public.trip_events where trip_id=t.id),(select count(*) from public.trip_idempotency where owner_id=t.owner_id and proposal_id in(select id from public.trip_proposals where trip_id=t.id))) from public.trips t where t.id='${trip}';`);
 const a=await fixture(),before=state(a.trip),providerBefore=e.requests.length,p=params(a);
 const published=await service.rpc('publish_change_proposal_reference_v1',p);assert.ifError(published.error);assert.equal(published.data.revision,1);
 const replay=await service.rpc('publish_change_proposal_reference_v1',p);assert.ifError(replay.error);assert.equal(replay.data.reused,true);
 assert.equal((await service.rpc('publish_change_proposal_reference_v1',{...p,p_content:{...p.p_content,proposalRevision:2}})).error.message,'IDEMPOTENCY_KEY_REUSE');
 const receipt=await read(a);assert.equal(receipt.content.proposalId,a.proposal);assert.equal(receipt.content.proposalRevision,1);assert.equal(receipt.source.tripVersion,0);assert.equal(receipt.current,true);
 assert.deepEqual(Object.keys(receipt.content).sort(),['actions','proposalId','proposalRevision','schemaVersion']);
 assert.equal((await read(a,other)).kind,'empty');assert.equal((await call(path(a))).status,401);
 assert.equal((await call('/api/results/native/v1/change-proposal-reference',owner)).status,400);
 assert.equal((await call(path(a)+'&type=confirm',owner)).status,400);
 assert.equal((await call(path(a),owner,'POST',{})).status,405);
 assert.equal(state(a.trip),before,'reference publication/read never changes Trip, events or confirmation receipts');assert.equal(e.requests.length,providerBefore,'artifact path performs no model request');
 const ordinary=createClient(local.API_URL,local.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+owner}}});
 assert.ok((await ordinary.rpc('publish_change_proposal_reference_v1',params(a))).error,'owner has no artifact writer authority');
 assert.equal((await service.rpc('read_change_proposal_reference_v1',{p_artifact_id:a.artifact,p_revision:1})).error.code,'42501','service cannot impersonate owner reads');
 for(const content of [{...p.p_content,patch:{}},{...p.p_content,digest:'trip-v2:must-not-copy'},{...p.p_content,actions:[{type:'confirm'}]},{...p.p_content,schemaVersion:'change-proposal-reference/99'}]){
  assert.match((await service.rpc('publish_change_proposal_reference_v1',params(a,{p_artifact_id:uuid(),p_content:content}))).error.message,/INVALID_INPUT/);
 }
 // Publication cannot wait in a Proposal->Trip/Trip->Proposal lock cycle.
 const locked={...a,artifact:uuid()};
 const holder=spawn('docker',['exec','-i',local.DB_CONTAINER,'psql','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});
 const done=new Promise((resolve,reject)=>{holder.once('error',reject);holder.once('exit',code=>code===0?resolve():reject(Error('Local lock holder failed')));});
 const ready=new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>{holder.kill('SIGTERM');reject(Error('Local lock readiness timed out'));},10000);holder.stdout.on('data',chunk=>{output+=chunk;if(output.includes('REFERENCE_LOCK_READY')){clearTimeout(timer);resolve();}});holder.once('error',error=>{clearTimeout(timer);reject(error);});holder.once('exit',()=>{clearTimeout(timer);reject(Error('Lock holder ended before readiness'));});});
 holder.stderr.resume();holder.stdin.write(`begin;select 1 from public.trip_proposals where id='${a.proposal}' for update;select 'REFERENCE_LOCK_READY';\n`);
 done.catch(()=>{});
 try {
  await ready;
  const r=await service.rpc('publish_change_proposal_reference_v1',params(locked));
  assert.match(r.error?.message??'',/STALE_BASIS/);
  assert.equal(e.sql(`select count(*) from turn_private.result_artifacts where id='${locked.artifact}';`),'0','busy canonical intent cannot publish a partial result');
 } finally {holder.stdin.end('rollback;');await done;}
 await pub(locked);assert.equal((await read(locked)).current,true,'same exact canonical reference can be retried after its lock is released');
 // Earlier comparison stays readable even after a newer reference on the same source.
 const comparison=uuid(),comparisonContent={schemaVersion:'comparison/1',title:'Existing comparison',summary:'Synthetic only',options:[{id:'a',title:'A',tradeoff:'Unknown'},{id:'b',title:'B',tradeoff:'Unknown'}],actions:[]};
 assert.ifError((await service.rpc('publish_comparison_result_v1',params(a,{p_artifact_id:comparison,p_content:comparisonContent}))).error);
 const newest={...a,artifact:uuid()};await pub(newest);
 for(let n=0;n<65;n++)await pub({...a,artifact:uuid()});
 assert.equal((await ok('/api/results/native/v1',owner)).data.artifactId,comparison);
 assert.equal((await ok('/api/results/native/v1?artifactId='+newest.artifact+'&revision=1',owner)).data.kind,'unavailable');
 assert.equal((await ok('/api/results/native/v1/trip?tripId='+a.trip,owner)).data.artifactId,comparison);
 assert.equal((await ok('/api/results/native/v1/task?taskId='+a.task,owner)).data.artifactId,comparison);
 const child=await ok('/api/trips/native/v2/'+a.trip+'/proposal/revision',owner,'POST',{proposalId:a.proposal,patch:{expectedVersion:0,operations:[{kind:'set_title',title:'Revised existing proposal'}]}});
 assert.notEqual(child.proposalId,a.proposal);assert.equal(child.revision,2);assert.equal((await read(a)).kind,'unavailable');
 const revised={...a,proposal:child.proposalId,proposalRevision:2,artifact:uuid()};await pub(revised);assert.equal((await read(revised)).content.proposalRevision,2);
 await ok('/api/trips/native/v2/'+a.trip+'/proposal/reject',owner,'POST',{proposalId:child.proposalId});assert.equal((await read(revised)).kind,'unavailable');
 for(const mutation of ['expire','tripHead','archive','sourceTurnDelete','proposalDelete','revision','actor','withdraw','sourceHide','goal','taskTerminal']){
  const b=await fixture({baseVersion:mutation==='archive'?1:0});const initial=state(b.trip);await pub(b);
  if(mutation==='expire')e.sql(`update public.trip_proposals set expires_at=now()-interval '1 second' where id='${b.proposal}';`);
  if(mutation==='tripHead')e.sql(`update public.trips set head_version=1 where id='${b.trip}';`);
  if(mutation==='archive')e.sql(`insert into public.trip_archives(trip_id,owner_id,archived_version,idempotency_key) values('${b.trip}','${e.users[0].id}',1,'${uuid()}');`);
  if(mutation==='sourceTurnDelete'){
   // Admin synthetic missing-parent fault, not a user deletion capability.
   // Private child DELETE remains denied; original accepted Turn parent/FK
   // erasure removes this completed source without touching the confirmed Trip.
   assert.throws(()=>e.sql(`delete from turn_private.assistant_messages where id='${b.input}';`),/ASSISTANT_EVENT_ERASE_AUTHORITY/);
   assert.equal((await read(b)).current,true,'denied child deletion preserves current reference');
   e.sql(`delete from public.turns where id='${b.turn}' and owner_id='${e.users[0].id}';`);
   assert.equal(e.sql(`select count(*) from public.turns where id='${b.turn}';`),'0');
  }
  if(mutation==='proposalDelete')e.sql(`delete from public.trip_proposals where id='${b.proposal}';`);
  if(mutation==='revision')e.sql(`update public.trip_proposals set revision=2 where id='${b.proposal}';`);
  if(mutation==='actor')e.sql(`update public.trip_proposals set owner_id='${e.users[1].id}' where id='${b.proposal}';`);
  if(mutation==='withdraw')assert.ifError((await service.rpc('withdraw_result_artifact_v1',{p_owner_id:e.users[0].id,p_artifact_id:b.artifact,p_expected_revision:1})).error);
  if(mutation==='sourceHide')e.sql(`update turn_private.text_content set hidden_at=now() where turn_id='${b.turn}';`);
  if(mutation==='goal')e.sql(`update turn_private.assistant_goals set scope_version=3 where id='${b.goal}';`);
  if(mutation==='taskTerminal')e.sql(`update public.turns set status='failed' where id='${b.turn}';`);
  assert.ok(['empty','unavailable'].includes((await read(b)).kind),mutation);
  if(mutation!=='tripHead')assert.equal(state(b.trip),initial,'reference path did not change the legal initial Trip snapshot: '+mutation);
  // The negative fixture is finished: erase only its owned disposable Trip.
  // Keep the production capacity guard; every assertion above runs before cleanup.
  e.sql(`begin;delete from turn_private.assistant_goal_trip_links where owner_id='${e.users[0].id}' and goal_id='${b.goal}' and trip_id='${b.trip}';delete from public.trips where id='${b.trip}' and owner_id='${e.users[0].id}';commit;`);
  assert.equal(e.sql(`select count(*) from public.trips where id='${b.trip}';`),'0');
 }
 const c=await fixture();await pub(c);
 e.sql(`update turn_private.text_consents set revoked_at=now() where owner_id='${e.users[0].id}' and policy_id='${e.policyId}';`);
 assert.equal((await read(c)).kind,'unavailable');
 await login(e.users[0]);assert.equal((await call(path(c),owner)).status,401,'replaced native session has no reference read');
 t.diagnostic('Actual Auth/Next/Postgres canonical Proposal create/exact read/revision/reject, scoped reference publication/read, live invalidation and comparison compatibility PASS; zero Proposal-confirm calls.');
});
