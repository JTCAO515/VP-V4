import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createNativeTextEnvironment} from '../turn/native-text-environment.mjs';
import {identityLocalEnv} from '../identity/local-supabase.mjs';

test('owned Trip discovers newest eligible Proposal reference with bounded sentinel and exact reopen revalidation',{
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
 const discover=async(trip,token=owner)=>{const r=await call('/api/results/native/v1/change-proposal-reference/trip?tripId='+trip,token);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.cache,'private, no-store');return r.body.data;};
 const open=async reference=>ok('/api/results/native/v1/change-proposal-reference?artifactId='+reference.artifactId+'&revision='+reference.revision,owner);
 const a=await fixture(),before=state(a.trip);
 assert.deepEqual(await discover(a.trip),{kind:'empty'});
 // An eligible comparison alone is never a proposal-reference discovery fallback.
 const comparison=uuid(),comparisonContent={schemaVersion:'comparison/1',title:'Existing comparison',summary:'Synthetic only',options:[{id:'a',title:'A',tradeoff:'Unknown'},{id:'b',title:'B',tradeoff:'Unknown'}],actions:[]};
 assert.ifError((await service.rpc('publish_comparison_result_v1',params(a,{p_artifact_id:comparison,p_content:comparisonContent}))).error);
 assert.deepEqual(await discover(a.trip),{kind:'empty'});
 await pub(a);
 const expected={kind:'result_reference',tripId:a.trip,artifactId:a.artifact,revision:1};
 const first=await discover(a.trip);assert.deepEqual(first,expected);
 assert.equal((await open(first)).data.content.proposalId,a.proposal);
 assert.deepEqual(await discover(a.trip,other),{kind:'empty'});
 assert.deepEqual(await discover(uuid()),{kind:'empty'});
 const discoveryPath='/api/results/native/v1/change-proposal-reference/trip';
 assert.equal((await call(discoveryPath+'?tripId='+a.trip)).status,401);
 for(const query of ['', '?tripId=invalid','?tripId='+a.trip+'&tripId='+a.trip,'?tripId='+a.trip+'&artifactId='+a.artifact])assert.equal((await call(discoveryPath+query,owner)).status,400);
 const newer={...a,artifact:uuid()};await pub(newer);
 assert.equal((await discover(a.trip)).artifactId,newer.artifact);
 // Deterministic tie-break and live revision: neither IDs nor revision are a fixture entry input.
 e.sql(`update turn_private.result_artifacts set created_at='2026-10-02T00:00:00Z' where id in('${a.artifact}','${newer.artifact}');`);
 const max=[a.artifact,newer.artifact].sort().at(-1);
 assert.equal((await discover(a.trip)).artifactId,max);
 const head={...a,artifact:max};await pub(head,{p_expected_revision:1});
 const revision2=await discover(a.trip);assert.equal(revision2.revision,2);
 assert.equal((await open(revision2)).data.revision,2);
 assert.equal(state(a.trip),before,'discovery/publication/open never mutate Trip or confirmation state');
 // Discovery is not permission to open later: real canonical supersession closes the captured pointer.
 const child=await ok('/api/trips/native/v2/'+a.trip+'/proposal/revision',owner,'POST',{proposalId:a.proposal,patch:{expectedVersion:0,operations:[{kind:'set_title',title:'Revised pending intent'}]}});
 assert.equal((await open(revision2)).data.kind,'unavailable');
 assert.deepEqual(await discover(a.trip),{kind:'empty'});
 const current={...a,proposal:child.proposalId,proposalRevision:2,artifact:uuid()};await pub(current);
 assert.equal((await discover(a.trip)).artifactId,current.artifact);
 await ok('/api/trips/native/v2/'+a.trip+'/proposal/reject',owner,'POST',{proposalId:child.proposalId});
 assert.deepEqual(await discover(a.trip),{kind:'empty'});
 // Exactly 64 newer stale candidates may not hide a still-current older one.
 const b=await fixture(),bBefore=state(b.trip);await pub(b);
 const active={...b,artifact:uuid()};await pub(active);
 const clones=(count)=>e.sql(`with clones as(select gen_random_uuid() id from generate_series(1,${count})), copied as(
  insert into turn_private.result_artifacts(id,owner_id,task_id,goal_id,input_message_id,trip_id,proposal_id,current_revision)
  select c.id,a.owner_id,a.task_id,a.goal_id,a.input_message_id,a.trip_id,a.proposal_id,1 from clones c cross join turn_private.result_artifacts a where a.id='${b.artifact}' returning id)
  insert into turn_private.result_revisions(artifact_id,revision,owner_id,idempotency_key,request_digest,input_sequence,task_turn_id,goal_version,trip_version,trip_link_operation_id,trip_link_version,memory_basis,content)
  select c.id,1,r.owner_id,gen_random_uuid(),r.request_digest,r.input_sequence,r.task_turn_id,r.goal_version+1,r.trip_version,r.trip_link_operation_id,r.trip_link_version,r.memory_basis,r.content
  from copied c cross join turn_private.result_revisions r where r.artifact_id='${b.artifact}' and r.revision=1;`);
 clones(63);
 assert.equal((await discover(b.trip)).artifactId,active.artifact,'63 stale plus newest current remains inside64');
 clones(1);
 assert.deepEqual(await discover(b.trip),{kind:'unavailable'},'64 newer stale hide the current65th; do not invent empty');
 e.sql(`delete from turn_private.result_artifacts where trip_id='${b.trip}' and id not in('${b.artifact}','${active.artifact}');`);
 // All 64 stale = empty; 65 stale = unavailable; no hidden cursor/body appears.
 e.sql(`update public.trip_proposals set expires_at=now()-interval '1 second' where id='${b.proposal}';`);
 clones(62);assert.deepEqual(await discover(b.trip),{kind:'empty'});
 clones(1);assert.deepEqual(await discover(b.trip),{kind:'unavailable'});
 assert.equal(state(b.trip),bBefore,'discovery/bounded sentinels never mutate the initial Trip or confirmation state');
 t.diagnostic('Real Auth/SQL discovery and exact open, cross-owner denial, canonical supersession, deterministic latest/head and64+sentinel boundaries PASS; no Proposal-confirm call.');
});
