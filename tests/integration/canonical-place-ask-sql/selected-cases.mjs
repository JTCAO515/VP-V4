import test from 'node:test';
import {writeFileSync} from 'node:fs';
import {root} from './db.mjs';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {actorRpc,privileged,sourceFixture,fixture,query,scalar,close} from './fixtures.mjs';
const submit=(f,bytes=JSON.stringify(f.request),actor=f.owner)=>actorRpc(actor,'grounded_ai_assist_work_v1',{p_input:{action:'selected_submit',requestBytes:bytes}});
test.after(close);
test('ordinary authenticated original Task admission and canonical proof share one original Turn transaction',async()=>{
 const f=await fixture(),bytes=JSON.stringify(f.request);const accepted=await submit(f,bytes);
 assert.equal(accepted.kind,'accepted');assert.equal(accepted.originalReceipt.turnId,f.submission.turnId);assert.equal(accepted.binding.serviceTaskId,f.submission.serviceTask.id);
 assert.equal(accepted.binding.requestDigest,createHash('sha256').update(bytes).digest('hex'));
 assert.equal(await scalar('select expected_result value from turn_private.service_tasks where id=$1',[f.submission.serviceTask.id]),'text_answer');
 assert.equal(await scalar('select count(*)::int value from turn_private.service_task_turns where task_id=$1',[f.submission.serviceTask.id]),1);
 assert.deepEqual(await submit(f,bytes),accepted);
 await assert.rejects(submit(f,bytes+' '),/IDEMPOTENCY_KEY_REUSE/);
 const plain=await actorRpc(null,'claim_text_work',{p_owner_id:f.owner.id,p_policy_id:f.policy},'service_role');assert.equal(plain.kind,'empty');
 const lease=await actorRpc(null,'claim_grounded_work',{p_owner_id:f.owner.id,p_policy_id:f.policy},'service_role');assert.equal(lease.turnId,f.submission.turnId,JSON.stringify(lease));
 const keys={p_turn_id:lease.turnId,p_lease_token:lease.leaseToken};
 const input=await actorRpc(null,'read_grounded_work',keys,'service_role');assert.equal(input.kind,'intent_input');assert.equal(input.text,f.submission.text,'no selected facts, Guide caption or source prose into model');
 assert.equal((await actorRpc(null,'read_text_work',keys,'service_role')).kind,'blocked');
 assert.equal((await actorRpc(null,'authorize_text_dispatch',{...keys,p_policy_id:f.policy,p_provider:'qwen'},'service_role')).kind,'blocked');
 assert.equal((await actorRpc(null,'authorize_text_task_dispatch',{...keys,p_policy_id:f.policy,p_provider:'qwen',p_context_digest:input.contextDigest},'service_role')).kind,'blocked');
 assert.equal((await actorRpc(null,'complete_text_work',{...keys,p_kind:'answered',p_text:'Wrong text worker output'},'service_role')).kind,'blocked');
 assert.equal((await actorRpc(null,'authorize_grounded_dispatch',{...keys,p_policy_id:f.policy,p_provider:'qwen',p_context_digest:input.contextDigest},'service_role')).kind,'authorized');
 assert.equal((await actorRpc(null,'complete_grounded_place_work',{...keys,p_intent:'place_opening_hours',p_request_scope:'single',p_unanswered_needs:'[]',p_place_name:'Untrusted model alias'},'service_role')).kind,'finished');
 const current=await actorRpc(f.owner,'read_grounded_turn',{p_turn_id:lease.turnId});assert.equal(current.kind,'grounded_turn',JSON.stringify(current));assert.equal(current.result.placeSubjectId,f.subject);assert.equal(current.result.originalOutcome,'answered');
 const recovered=await actorRpc(f.owner,'grounded_ai_assist_work_v1',{p_input:{action:'selected_read',operation:accepted.operation}});assert.deepEqual(recovered.receipt,accepted);assert.equal(recovered.current.kind,'grounded');
 writeFileSync(root+'/wire-positive.json',JSON.stringify({schemaVersion:'canonical-place-ask-fixture/1',environment:'nativePG17.11 synthetic Auth claims, no provider call',mode:'task',policyContextMode:'current_input_v1',requestBytes:bytes,request:f.request,accepted,recovered},null,2)+'\n');
 assert.equal(await scalar('select count(*)::int value from turn_private.service_tasks where owner_id=$1',[f.owner.id]),1);
 await assert.rejects(actorRpc(f.owner,'read_place_action_context_v1',{p_trip:f.trip,p_input:{action:'context',expectedTripVersion:0,selection:{canonicalPoiId:f.canonical,provider:'amap',providerPoiId:f.expectation.providerPoiId},locale:'en'}}),/permission denied/);
});
const counts=async(owner)=>(await query(`select (select count(*)::int from public.turns where owner_id=$1) turns,(select count(*)::int from turn_private.service_tasks where owner_id=$1) tasks,(select count(*)::int from turn_private.service_task_turns where owner_id=$1) links,(select count(*)::int from turn_private.service_task_capacity where owner_id=$1) capacity,(select count(*)::int from public.model_budget_attempts where task_id in(select id from turn_private.service_tasks where owner_id=$1)) attempts,(select count(*)::int from turn_private.grounded_turns where owner_id=$1) grounded`,[owner])).rows[0];
const rpcRead=(f,operation,actor=f.owner)=>actorRpc(actor,'grounded_ai_assist_work_v1',{p_input:{action:'selected_read',operation}});
test('wrong actor/entity/provider/head/source/ref/locale and stale scope leave zero admission or accounting rows',async()=>{
 const f=await fixture(),before=await counts(f.owner.id);
 for(const patch of [{tripId:randomUUID()},{canonicalPoiId:randomUUID()},{provider:'tencent'},{providerPoiId:'OTHER'},{headVersion:1},{mappingDigest:'b'.repeat(64)},{contextDigest:'c'.repeat(64)},{referenceId:randomUUID()},{referenceId:null},{locale:'zh'}]){
  await assert.rejects(submit(f,JSON.stringify({...f.request,expectation:{...f.expectation,...patch}})),/FORBIDDEN|MAPPING_CHANGED|INVALID_INPUT/);
  assert.deepEqual(await counts(f.owner.id),before);
 }
 await assert.rejects(submit(f,JSON.stringify(f.request),f.reviewer),/DATA_POLICY_BLOCKED|FORBIDDEN/);assert.deepEqual(await counts(f.owner.id),before);
 await privileged(f.reviewer,'ops_review_workspace',{p_input:{action:'revoke_statement',operationId:randomUUID(),candidateId:f.source.candidate,expectedPublicationVersion:1,note:'Withdraw own synthetic source'}});
 const fresh=await privileged(f.owner,'read_place_action_context_v1',{p_trip:f.trip,p_input:{action:'context',expectedTripVersion:0,selection:f.context.selection,locale:'en'}});f.request.expectation.contextDigest=fresh.contextDigest;
 const unavailable=await submit(f);assert.equal(unavailable.kind,'unavailable');assert.equal(unavailable.reason,'source_unavailable');assert.deepEqual(await counts(f.owner.id),before);
});
test('assistant envelope unavailable, extra/unknown input rejected, incompatible original Task never spawns replacement',async()=>{
 const f=await fixture(),before=await counts(f.owner.id);
 const b={conversationId:randomUUID(),messageId:randomUUID(),idempotencyKey:randomUUID(),policyId:f.policy,locale:'en',text:'Keep my actual question',relationship:'goal_start',goalId:randomUUID(),expectedGoalVersion:null,taskId:null,parentMessageId:null,turnId:null};
 assert.equal((await submit(f,JSON.stringify({...f.request,submission:b}))).reason,'original_submission_unsupported');assert.deepEqual(await counts(f.owner.id),before);
 await assert.rejects(submit(f,JSON.stringify({...f.request,subjectId:f.subject})),/INVALID_INPUT/);
 const first=await submit(f);const again=structuredClone(f.request);again.submission.turnId=randomUUID();again.submission.idempotencyKey=randomUUID();again.submission.serviceTask.relationship='repair';again.submission.serviceTask.parentTurnId=f.submission.turnId;
 await assert.rejects(submit(f,JSON.stringify(again)),/SERVICE_TASK_CONFLICT/);assert.equal((await counts(f.owner.id)).tasks,1);assert.equal((await counts(f.owner.id)).turns,1);
 const altered=structuredClone(f.request);altered.submission.text+=' different';await assert.rejects(submit(f,JSON.stringify(altered)),/IDEMPOTENCY_KEY_REUSE/);
 const wrong=structuredClone(first.operation);wrong.turnId=randomUUID();await assert.rejects(rpcRead(f,wrong),/FORBIDDEN/);
 await assert.rejects(rpcRead(f,first.operation,f.reviewer),/FORBIDDEN/);
});
test('concurrent exact byte submissions admit one Task/Turn; recovery preserves receipt separately from withdrawn current selection',async()=>{
 const f=await fixture(),bytes=JSON.stringify(f.request);const pair=await Promise.all([submit(f,bytes),submit(f,bytes)]);assert.deepEqual(pair[0],pair[1]);assert.equal((await counts(f.owner.id)).tasks,1);
 const accepted=pair[0];await query('update public.provider_poi_mappings set matched_at=clock_timestamp() where canonical_poi_id=$1',[f.canonical]);
 const recovered=await rpcRead(f,accepted.operation);assert.deepEqual(recovered.receipt,accepted);assert.equal(recovered.current.kind,'unavailable');
 assert.equal((await actorRpc(null,'claim_grounded_work',{p_owner_id:f.owner.id,p_policy_id:f.policy},'service_role')).kind,'empty');
});
test('proof immutability, cancel and withdrawn consent block claim/read/dispatch without reviving work',async()=>{
 const f=await fixture();const accepted=await submit(f);await assert.rejects(query("update turn_private.grounded_turns set selected_place_request=jsonb_set(selected_place_request,'{requestDigest}',to_jsonb(repeat('f',64))) where turn_id=$1",[f.submission.turnId]),/IMMUTABLE_BINDING/);
 await actorRpc(f.owner,'cancel_chat_turn',{p_turn_id:f.submission.turnId});const current=await rpcRead(f,accepted.operation);assert.equal(current.current.kind,'unavailable');assert.deepEqual(current.receipt,accepted);
 const f2=await fixture();const a2=await submit(f2);await query('update turn_private.text_consents set revoked_at=clock_timestamp() where owner_id=$1 and policy_id=$2',[f2.owner.id,f2.policy]);
 assert.equal((await actorRpc(null,'claim_grounded_work',{p_owner_id:f2.owner.id,p_policy_id:f2.policy},'service_role')).kind,'empty');assert.equal((await rpcRead(f2,a2.operation)).current.kind,'unavailable');
});
test('new selected export keeps proof and typed answer basis; actual original erasure removes slot and permanent source-PK fence rejects late restore',async()=>{
 const f=await fixture();const accepted=await submit(f);
 const lease=await actorRpc(null,'claim_grounded_work',{p_owner_id:f.owner.id,p_policy_id:f.policy},'service_role');assert.equal(lease.turnId,f.submission.turnId);
 const keys={p_turn_id:lease.turnId,p_lease_token:lease.leaseToken};const input=await actorRpc(null,'read_grounded_work',keys,'service_role');
 assert.equal((await actorRpc(null,'authorize_grounded_dispatch',{...keys,p_policy_id:f.policy,p_provider:'qwen',p_context_digest:input.contextDigest},'service_role')).kind,'authorized');
 assert.equal((await actorRpc(null,'complete_grounded_place_work',{...keys,p_intent:'place_opening_hours',p_request_scope:'single',p_unanswered_needs:'[]',p_place_name:'Model alias'},'service_role')).kind,'finished');
 // Existing lifecycle RPC remains postgres-only. Its actor/epoch logic still runs.
 await query('update identity_private.mobile_accounts set session_id=$2,epoch=1 where owner_id=$1',[f.owner.id,f.owner.session]);
 await query('insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch) values($1,$2,$3,1)',[f.owner.id,randomUUID(),f.owner.session]);
 const before=await scalar('select to_jsonb(g) value from turn_private.grounded_turns g where turn_id=$1',[f.submission.turnId]);
 const exported=await scalar('select turn_data_private.export_source_v1($1) value',[f.owner.id]);
 const group=exported.snapshot.sources.find(x=>x.relation==='turn_private.grounded_turns');assert.equal(group.rows.length,1);assert.deepEqual(group.rows[0].selected_place_request,before.selected_place_request);
 const scope={scope:'turn-sensitive-data/1',requestId:randomUUID(),turnId:f.submission.turnId,objectIds:[]};
 const call=command=>privileged(f.owner,'privacy_turn_data_v1',{p_action:command.action,p_input_bytes:JSON.stringify(command),p_expected_epoch:1});
 const preview=await call({action:'preview',...scope});assert.equal(preview.eligible,true,JSON.stringify(preview));
 const erase={action:'erase',...scope,sourceDigest:preview.sourceDigest,previewDigest:preview.previewDigest,confirmed:true};
 const receipt=await call(erase);assert.equal(receipt.kind,'receipt');assert.equal(receipt.state,'erased');assert.equal(await scalar('select count(*)::int value from turn_private.grounded_turns where turn_id=$1',[f.submission.turnId]),0);
 assert.equal((await rpcRead(f,accepted.operation)).kind,'unknown','erased proof never becomes false not_submitted');
 const fence=await scalar("select turn_data_private.source_key_fenced_v1('turn_private.grounded_turns',jsonb_build_object('turn_id',$1::uuid)) value",[f.submission.turnId]);assert.equal(fence,true);
 await assert.rejects(query('insert into turn_private.grounded_turns select * from jsonb_populate_record(null::turn_private.grounded_turns,$1::jsonb)',[JSON.stringify(before)]),/TURN_CONFLICT/);
 await assert.rejects(query("update turn_private.text_content set input_text='late original payload' where turn_id=$1",[f.submission.turnId]),/TURN_CONFLICT/);
 await assert.rejects(submit(f),/IDEMPOTENCY_KEY_REUSE|TURN_CONFLICT|DATA_POLICY_BLOCKED/);
 const recovered=await call({action:'recover',...scope,mutationBytes:JSON.stringify(erase)});assert.deepEqual(recovered,receipt);
});
test('strict new proof/input versions, input authority, UUID identity casing and current worker fences stay closed',async()=>{
 const f=await fixture();const r=structuredClone(f.request);
 for(const key of ['threadId','turnId','idempotencyKey','policyId'])r.submission[key]=r.submission[key].toUpperCase();r.submission.serviceTask.id=r.submission.serviceTask.id.toUpperCase();
 for(const key of ['tripId','canonicalPoiId','referenceId'])r.expectation[key]=r.expectation[key].toUpperCase();
 const accepted=await submit(f,JSON.stringify(r));assert.equal(accepted.kind,'accepted');assert.equal(accepted.binding.turnId,f.submission.turnId);
 const read=await rpcRead(f,accepted.operation);assert.equal(read.current.kind,'pending');
 const invalid=structuredClone(f.request);invalid.submission.idempotencyKey=randomUUID();invalid.submission.turnId=randomUUID();invalid.submission.serviceTask.id=randomUUID();invalid.submission.serviceTask.scopeVersion='1';await assert.rejects(submit(f,JSON.stringify(invalid)),/INVALID_INPUT/);
 await query("update turn_private.text_content set input_text='altered original question' where turn_id=$1",[f.submission.turnId]);
 assert.equal((await rpcRead(f,accepted.operation)).current.kind,'unavailable');assert.equal((await actorRpc(null,'claim_grounded_work',{p_owner_id:f.owner.id,p_policy_id:f.policy},'service_role')).kind,'empty');
 const f2=await fixture();await submit(f2);const lease=await actorRpc(null,'claim_grounded_work',{p_owner_id:f2.owner.id,p_policy_id:f2.policy},'service_role');const keys={p_turn_id:lease.turnId,p_lease_token:lease.leaseToken};
 const input=await actorRpc(null,'read_grounded_work',keys,'service_role');assert.equal(input.kind,'intent_input');
 assert.equal((await actorRpc(null,'authorize_grounded_dispatch',{...keys,p_policy_id:f2.policy,p_provider:'wrong',p_context_digest:input.contextDigest},'service_role')).kind,'blocked');
 await privileged(f2.reviewer,'ops_review_workspace',{p_input:{action:'revoke_statement',operationId:randomUUID(),candidateId:f2.source.candidate,expectedPublicationVersion:1,note:'Withdraw before dispatch'}});
 assert.equal((await actorRpc(null,'read_grounded_work',keys,'service_role')).kind,'blocked');
 assert.equal((await actorRpc(null,'authorize_grounded_dispatch',{...keys,p_policy_id:f2.policy,p_provider:'qwen',p_context_digest:input.contextDigest},'service_role')).kind,'blocked');
 assert.equal((await actorRpc(null,'complete_grounded_place_work',{...keys,p_intent:'place_opening_hours',p_request_scope:'single',p_unanswered_needs:'[]',p_place_name:'alias'},'service_role')).kind,'blocked');
 assert.equal(await scalar('select completed_at value from turn_private.grounded_turns where turn_id=$1',[f2.submission.turnId]),null);
});
test('original AI-assist job current/read/complete/replay requalifies canonical proof after legitimate blocked resolver',async()=>{
 const f=await fixture();await sourceFixture(f.owner,f.reviewer,f.subject,true);await submit(f);
 const lease=await actorRpc(null,'claim_grounded_work',{p_owner_id:f.owner.id,p_policy_id:f.policy},'service_role');const keys={p_turn_id:lease.turnId,p_lease_token:lease.leaseToken};
 const input=await actorRpc(null,'read_grounded_work',keys,'service_role');assert.equal((await actorRpc(null,'authorize_grounded_dispatch',{...keys,p_policy_id:f.policy,p_provider:'qwen',p_context_digest:input.contextDigest},'service_role')).kind,'authorized');
 assert.equal((await actorRpc(null,'complete_grounded_place_work',{...keys,p_intent:'place_opening_hours',p_request_scope:'single',p_unanswered_needs:'[]',p_place_name:'ignored'},'service_role')).kind,'finished');
 const current=await actorRpc(f.owner,'read_grounded_turn',{p_turn_id:f.submission.turnId});assert.equal(current.result.originalOutcome,'blocked');
 const context=await actorRpc(f.owner,'read_grounded_ai_assist_context_v1',{p_turn_id:f.submission.turnId});assert.equal(context.kind,'context');assert.equal(context.placeSubjectId,f.subject);
 const claim=await actorRpc(f.owner,'grounded_ai_assist_work_v1',{p_input:{action:'ensure',turnId:f.submission.turnId}});assert.equal(claim.kind,'claimed');
 await privileged(f.reviewer,'ops_review_workspace',{p_input:{action:'revoke_statement',operationId:randomUUID(),candidateId:f.source.candidate,expectedPublicationVersion:1,note:'Withdraw selected original source'}});
 assert.equal((await actorRpc(f.owner,'read_grounded_ai_assist_context_v1',{p_turn_id:f.submission.turnId})).kind,'unavailable');
 const finished=await actorRpc(f.owner,'grounded_ai_assist_work_v1',{p_input:{action:'complete',jobId:claim.jobId,claimToken:claim.claimToken,outcome:{kind:'succeeded',result:{kind:'unavailable',reason:'retrieval_miss'}}}});assert.equal(finished.kind,'unavailable');
 assert.equal((await actorRpc(f.owner,'grounded_ai_assist_work_v1',{p_input:{action:'ensure',turnId:f.submission.turnId}})).kind,'unavailable');
 assert.equal(await scalar('select status value from turn_private.grounded_ai_assist_jobs where id=$1',[claim.jobId]),'running','denied currentness does not claim success or retry');
});
test('original mobile account/attempt epoch and stored root session fence both actor and service worker',async()=>{
 const f=await fixture();await query('update identity_private.mobile_accounts set session_id=$2,epoch=1 where owner_id=$1',[f.owner.id,f.owner.session]);await query('insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch) values($1,$2,$3,1)',[f.owner.id,randomUUID(),f.owner.session]);
 const accepted=await submit(f);await query('update identity_private.mobile_accounts set epoch=2 where owner_id=$1',[f.owner.id]);
 await assert.rejects(rpcRead(f,accepted.operation),/SESSION_REPLACED/);assert.equal((await actorRpc(null,'claim_grounded_work',{p_owner_id:f.owner.id,p_policy_id:f.policy},'service_role')).kind,'empty');
 const f2=await fixture();const a2=await submit(f2);const other={id:f2.owner.id,session:randomUUID()};await query('insert into auth.sessions(id,user_id) values($1,$2)',[other.session,other.id]);await assert.rejects(rpcRead(f2,a2.operation,other),/FORBIDDEN/);
 await query('delete from auth.sessions where id=$1',[f2.owner.session]);assert.equal((await actorRpc(null,'claim_grounded_work',{p_owner_id:f2.owner.id,p_policy_id:f2.policy},'service_role')).kind,'empty');
});
test('actual original D2 request and lease emit complete Place-only export3 page without fixture grants',async()=>{
 const f=await fixture();await submit(f);
 await query('update identity_private.mobile_accounts set session_id=$2,epoch=1 where owner_id=$1',[f.owner.id,f.owner.session]);await query('insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch) values($1,$2,$3,1)',[f.owner.id,randomUUID(),f.owner.session]);
 await query("insert into export_private.core_policies_v1(id,revision,enabled,environment,key_id,max_run_ms,artifact_ttl_ms,ticket_ttl_ms,max_pages,page_size,max_bytes,valid_until) select $1,1,true,'local','canonical-place-fixture-key',90000,600000,300000,1000,100,8388608,clock_timestamp()+interval '1 hour' where not exists(select 1 from export_private.core_policies_v1 where enabled)",[randomUUID()]);
 const requestId=randomUUID();const requested=await privileged(f.owner,'privacy_core_export_v1',{p_action:'request',p_input:{requestId,confirmed:true}});assert.ok(requested,JSON.stringify(requested));
 const lease=await actorRpc(null,'privacy_core_export_v1',{p_action:'claim',p_input:{requestId,operationId:randomUUID(),maxRunMs:90000,expectedEnvironment:'local',expectedKeyId:'canonical-place-fixture-key'}},'postgres_service');assert.equal(lease.kind,'privacy_export_lease/1',JSON.stringify(lease));
 const page=await actorRpc(null,'privacy_core_export_v1',{p_action:'turn_page',p_input:{requestId,leaseId:lease.leaseId,generation:lease.generation,section:'snapshot',cursor:null,limit:100}},'postgres_service');
 assert.equal(page.schemaVersion,'turn-core-export/3');assert.equal(page.items[0].sources.length,38);assert.ok(page.items[0].sources.find(g=>g.relation==='turn_private.grounded_turns').rows[0].selected_place_request);
 writeFileSync(root+'/export3-page.json',JSON.stringify({owner:f.owner.id,limit:100,now:Date.now(),page},null,2)+'\n');
 await assert.rejects(actorRpc(null,'privacy_core_export_v1',{p_action:'turn_page',p_input:{requestId,leaseId:lease.leaseId,generation:lease.generation,section:'snapshot',cursor:null,limit:100}},'service_role'),/permission denied/);
});
test('unknown selected proof shapes cannot be restored through existing root source row contract',async()=>{
 const f=await fixture();await submit(f);const row=await scalar('select to_jsonb(g) value from turn_private.grounded_turns g where turn_id=$1',[f.submission.turnId]);
 for(const proof of [{...row.selected_place_request,schemaVersion:'canonical-place-proof/99'},{...row.selected_place_request,extra:true},{...row.selected_place_request,expectation:{...row.selected_place_request.expectation,locale:null}}]){
  await assert.rejects(query('insert into turn_private.grounded_turns select * from jsonb_populate_record(null::turn_private.grounded_turns,$1::jsonb)',[JSON.stringify({...row,selected_place_request:proof})]),/grounded_selected_place_request_shape/);
 }
});
test('a legitimate original technical-failure repair keeps the same compatible Task and original parent/goal bytes',async()=>{
 const f=await fixture(),s=f.submission;
 const original=await actorRpc(f.owner,'submit_service_task_turn',{p_thread_id:s.threadId,p_turn_id:s.turnId,p_idempotency_key:s.idempotencyKey,p_policy_id:f.policy,p_locale:s.locale,p_text:s.text,p_task_id:s.serviceTask.id,p_scope_version:1,p_relationship:'new_goal',p_parent_turn_id:null});assert.equal(original.kind,'accepted');
 const lease=await actorRpc(null,'claim_text_work',{p_owner_id:f.owner.id,p_policy_id:f.policy},'service_role');assert.equal(lease.turnId,s.turnId);
 assert.equal((await actorRpc(null,'complete_text_work',{p_turn_id:lease.turnId,p_lease_token:lease.leaseToken,p_kind:'technical_failure',p_text:'Controlled transport failure'},'service_role')).kind,'finished');
 const before=await scalar('select jsonb_build_object(\'goal\',goal_turn_id,\'digest\',goal_digest,\'policy\',policy_id,\'expected\',expected_result) value from turn_private.service_tasks where id=$1',[s.serviceTask.id]);
 const repair=structuredClone(f.request);repair.submission.turnId=randomUUID();repair.submission.idempotencyKey=randomUUID();repair.submission.serviceTask.relationship='repair';repair.submission.serviceTask.parentTurnId=s.turnId;
 const accepted=await submit(f,JSON.stringify(repair));assert.equal(accepted.originalReceipt.relationship,'repair');assert.equal(accepted.originalReceipt.parentTurnId,s.turnId);assert.equal(accepted.binding.serviceTaskId,s.serviceTask.id);assert.equal((await counts(f.owner.id)).tasks,1);assert.equal((await counts(f.owner.id)).turns,2);
 assert.deepEqual(await scalar('select jsonb_build_object(\'goal\',goal_turn_id,\'digest\',goal_digest,\'policy\',policy_id,\'expected\',expected_result) value from turn_private.service_tasks where id=$1',[s.serviceTask.id]),before);
 assert.equal((await rpcRead(f,accepted.operation)).current.kind,'pending');
});
test('accepted707 original Trip producer and canonical Place admission export all 43 sources together without losing original Trip wire',async()=>{
 const {fixturePorts}=await import('../service-task-trip/fixture.mjs');
 const {produceTripCandidate}=await import('../service-task-trip/producer-fixture.mjs');
 const {connect}=await import('./db.mjs');
 const db=async sql=>{const c=await connect();try{await c.query('begin');const result=await c.query(sql);await c.query('commit');return (Array.isArray(result)?result.at(-1):result).rows;}catch(e){await c.query('rollback');throw e;}finally{await c.end();}};
 await query('update turn_private.service_task_capacity_settings set trip_enabled=true,enabled=false');
 const ports=fixturePorts(db);const trip=await produceTripCandidate(ports,db,{proposal:true});
 assert.equal((await scalar('select count(*)::int value from turn_private.service_tasks where owner_id=$1',[trip.a.owner])),1,'original Trip admission, never seeded Task');
 const originalActor={id:trip.a.owner,session:trip.a.session};
 await query("insert into export_private.core_policies_v1(id,revision,enabled,environment,key_id,max_run_ms,artifact_ttl_ms,ticket_ttl_ms,max_pages,page_size,max_bytes,valid_until) select $1,1,true,'local','canonical-place-fixture-key',90000,600000,300000,1000,100,8388608,clock_timestamp()+interval '1 hour' where not exists(select 1 from export_private.core_policies_v1 where enabled)",[randomUUID()]);
 const requestId=randomUUID();await privileged(originalActor,'privacy_core_export_v1',{p_action:'request',p_input:{requestId,confirmed:true}});
 const lease=await actorRpc(null,'privacy_core_export_v1',{p_action:'claim',p_input:{requestId,operationId:randomUUID(),maxRunMs:90000,expectedEnvironment:'local',expectedKeyId:'canonical-place-fixture-key'}},'postgres_service');assert.equal(lease.kind,'privacy_export_lease/1');
 const input={requestId,leaseId:lease.leaseId,generation:lease.generation,section:'snapshot',cursor:null,limit:100};
 const onlyTrip=await actorRpc(null,'privacy_core_export_v1',{p_action:'turn_page',p_input:input},'postgres_service');assert.equal(onlyTrip.schemaVersion,'turn-trip-core-export/1');assert.equal(onlyTrip.items[0].sources.length,43);
 writeFileSync(root+'/trip-export-page.json',JSON.stringify({owner:trip.a.owner,limit:100,now:Date.now(),page:onlyTrip},null,2)+'\n');
 const f=await fixture('current_input_v1',originalActor);const accepted=await submit(f);assert.equal(accepted.kind,'accepted');
 const mixed=await actorRpc(null,'privacy_core_export_v1',{p_action:'turn_page',p_input:input},'postgres_service');assert.equal(mixed.schemaVersion,'turn-core-export/3');assert.equal(mixed.items[0].sources.length,43);
 const sources=new Map(mixed.items[0].sources.map(g=>[g.relation,g.rows]));
 for(const relation of ['scoped_edit_private.contexts_v1','scoped_edit_private.work_v1','scoped_edit_private.requests_v1','scoped_edit_private.operations_v1','scoped_edit_private.lineage_v1'])assert.ok(sources.get(relation)?.length>0,relation);
 assert.equal(sources.get('turn_private.service_tasks').length,2);assert.ok(sources.get('turn_private.service_tasks').some(t=>t.id===trip.task.taskId&&t.expected_result==='trip_modification'&&t.trip_objective));assert.ok(sources.get('turn_private.service_tasks').some(t=>t.id===f.submission.serviceTask.id&&t.expected_result==='text_answer'));
 assert.ok(sources.get('turn_private.grounded_turns').some(g=>g.turn_id===f.submission.turnId&&g.selected_place_request));
 writeFileSync(root+'/mixed-export3-page.json',JSON.stringify({owner:trip.a.owner,limit:100,now:Date.now(),page:mixed},null,2)+'\n');
});
test('ordinary text/read/Task history attach only current selected result and retain own Task with unavailable facts after source withdrawal',async()=>{
 const f=await fixture();const accepted=await submit(f);const lease=await actorRpc(null,'claim_grounded_work',{p_owner_id:f.owner.id,p_policy_id:f.policy},'service_role');const keys={p_turn_id:lease.turnId,p_lease_token:lease.leaseToken};const input=await actorRpc(null,'read_grounded_work',keys,'service_role');
 await actorRpc(null,'authorize_grounded_dispatch',{...keys,p_policy_id:f.policy,p_provider:'qwen',p_context_digest:input.contextDigest},'service_role');assert.equal((await actorRpc(null,'complete_grounded_place_work',{...keys,p_intent:'place_opening_hours',p_request_scope:'single',p_unanswered_needs:'[]',p_place_name:'ignored'},'service_role')).kind,'finished');
 const read=await actorRpc(f.owner,'read_text_turn',{p_turn_id:f.submission.turnId});const textHistory=await actorRpc(f.owner,'list_text_turns',{p_policy_id:f.policy,p_limit:20});const history=await actorRpc(f.owner,'list_service_task_turns',{p_policy_id:f.policy,p_limit:20});
 assert.equal(read.result.placeSubjectId,f.subject);assert.equal(read.result.placeName,null);assert.equal(read.result.projection,'current');assert.equal(history.turns.length,1);assert.equal(history.turns[0].result.placeSubjectId,f.subject);assert.equal(history.turns[0].canonicalPlaceProof.basis.subjectId,f.subject);assert.equal(read.canonicalPlaceProof.originalReceipt.serviceTaskId,f.submission.serviceTask.id);assert.equal(textHistory.turns[0].result.projection,'current');
 writeFileSync(root+'/history-positive.json',JSON.stringify({now:Date.now(),owner:f.owner.id,limit:20,requestBytes:JSON.stringify(f.request),request:f.request,accepted,sqlRead:read,sqlTextHistory:textHistory,sqlTaskHistory:history},null,2)+'\n');
 await privileged(f.reviewer,'ops_review_workspace',{p_input:{action:'revoke_statement',operationId:randomUUID(),candidateId:f.source.candidate,expectedPublicationVersion:1,note:'Withdraw selected source before history refresh'}});
 // The original functions demonstrate the reviewed bypass on the same actual Turn.
 const {connect}=await import('./db.mjs');const {readFileSync}=await import('node:fs');const c=await connect();try{await c.query('begin');await c.query(readFileSync(root+'/before/read_text_turn.sql','utf8'));await c.query(readFileSync(root+'/before/list_text_turns.sql','utf8'));await c.query("select set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[f.owner.id,JSON.stringify({role:'authenticated',session_id:f.owner.session,is_anonymous:false})]);await c.query('set local role authenticated');
  assert.equal((await c.query('select public.read_text_turn($1) value',[f.submission.turnId])).rows[0].value.input,f.submission.text);assert.equal((await c.query('select public.list_service_task_turns($1,20) value',[f.policy])).rows[0].value.turns.length,1);
 }finally{await c.query('rollback');await c.end();}
 const withdrawnRead=await actorRpc(f.owner,'read_text_turn',{p_turn_id:f.submission.turnId}),withdrawnTextHistory=await actorRpc(f.owner,'list_text_turns',{p_policy_id:f.policy,p_limit:20}),withdrawnTaskHistory=await actorRpc(f.owner,'list_service_task_turns',{p_policy_id:f.policy,p_limit:20});
 assert.equal(withdrawnRead.kind,'text');assert.equal(withdrawnRead.input,f.submission.text);assert.equal(withdrawnRead.result.projection,'unavailable');assert.equal(withdrawnRead.result.knowledge,null);for(const h of [withdrawnTextHistory,withdrawnTaskHistory]){assert.equal(h.turns.length,1);assert.equal(h.turns[0].result.projection,'unavailable');assert.equal(h.turns[0].result.knowledge,null);assert.equal(h.turns[0].outcome,'answered');}
 const captured=JSON.parse(readFileSync(root+'/history-positive.json','utf8'));captured.withdrawn={now:Date.now(),sqlRead:withdrawnRead,sqlTextHistory:withdrawnTextHistory,sqlTaskHistory:withdrawnTaskHistory};writeFileSync(root+'/history-positive.json',JSON.stringify(captured,null,2)+'\n');
});
test('enabled original capacity settles once or releases every selected terminal; rollback and unknown never duplicate reservation',async()=>{
 const {connect}=await import('./db.mjs');const prior=await scalar('select enabled value from turn_private.service_task_capacity_settings where singleton');await query('update turn_private.service_task_capacity_settings set enabled=true where singleton');
 const capacity=async f=>scalar('select to_jsonb(c) value from turn_private.service_task_capacity c where task_id=$1',[f.submission.serviceTask.id]);
 try{for(const mode of ['answered','partial','blocked','technical_failure','cancelled']){
  const f=await fixture();if(mode==='blocked')await sourceFixture(f.owner,f.reviewer,f.subject,true);const bytes=JSON.stringify(f.request);const accepted=await submit(f,bytes);assert.equal((await capacity(f)).state,'reserved');assert.equal(await scalar('select capacity_enforced value from turn_private.service_tasks where id=$1',[f.submission.serviceTask.id]),true);
  if(mode==='cancelled'){await actorRpc(f.owner,'cancel_chat_turn',{p_turn_id:f.submission.turnId});assert.equal((await capacity(f)).state,'released');continue;}
  const lease=await actorRpc(null,'claim_grounded_work',{p_owner_id:f.owner.id,p_policy_id:f.policy},'service_role');const keys={p_turn_id:lease.turnId,p_lease_token:lease.leaseToken};const input=await actorRpc(null,'read_grounded_work',keys,'service_role');await actorRpc(null,'authorize_grounded_dispatch',{...keys,p_policy_id:f.policy,p_provider:'qwen',p_context_digest:input.contextDigest},'service_role');
  const args=mode==='technical_failure'?{...keys,p_intent:'technical_failure',p_request_scope:'unknown'}:{...keys,p_intent:mode==='partial'?'place_address_and_hours':'place_opening_hours',p_request_scope:'single',p_unanswered_needs:'[]',p_place_name:'ignored'};const method=mode==='technical_failure'?'complete_grounded_work':'complete_grounded_place_work';
  if(mode==='answered'){
   const before=await capacity(f);const c=await connect();try{await c.query('begin');await c.query("select set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true)");await c.query('set local role service_role');const entries=Object.entries(args);assert.equal((await c.query('select public.'+method+'('+entries.map(([k],i)=>k+'=>$'+(i+1)).join(',')+') value',entries.map(([,v])=>v))).rows[0].value.kind,'finished');await c.query('reset role');assert.equal((await c.query('select state from turn_private.service_task_capacity where task_id=$1',[f.submission.serviceTask.id])).rows[0].state,'settled');}finally{await c.query('rollback');await c.end();}assert.deepEqual(await capacity(f),before);assert.equal(await scalar('select completed_at value from turn_private.grounded_turns where turn_id=$1',[f.submission.turnId]),null);
  }
  assert.equal((await actorRpc(null,method,args,'service_role')).kind,'finished');const row=await capacity(f);assert.equal(row.state,mode==='answered'?'settled':'released');
  assert.deepEqual((await rpcRead(f,accepted.operation)).receipt,accepted);assert.deepEqual(await submit(f,bytes),accepted);assert.deepEqual(await capacity(f),row);assert.equal((await counts(f.owner.id)).capacity,1);
 }
 const f=await fixture(),before=await counts(f.owner.id);await assert.rejects(submit(f,JSON.stringify({...f.request,expectation:{...f.expectation,headVersion:9}})),/MAPPING_CHANGED/);assert.deepEqual(await counts(f.owner.id),before);
 }finally{await query('update turn_private.service_task_capacity_settings set enabled=$1 where singleton',[prior]);}
});
test('generic claim_turn_work cannot lease or consume attempts from selected queued work, including concurrent canonical claim and revoked source',async()=>{
 const f=await fixture();await submit(f);const before=await scalar('select attempt value from turn_private.work where turn_id=$1',[f.submission.turnId]);
 const [generic,canonical]=await Promise.all([actorRpc(null,'claim_turn_work',{},'service_role'),actorRpc(null,'claim_grounded_work',{p_owner_id:f.owner.id,p_policy_id:f.policy},'service_role')]);assert.notEqual(generic.turnId,f.submission.turnId);assert.equal(canonical.turnId,f.submission.turnId);assert.equal(await scalar('select attempt value from turn_private.work where turn_id=$1',[f.submission.turnId]),before+1);
 const f2=await fixture();await submit(f2);await privileged(f2.reviewer,'ops_review_workspace',{p_input:{action:'revoke_statement',operationId:randomUUID(),candidateId:f2.source.candidate,expectedPublicationVersion:1,note:'Withdraw before generic claim'}});const original=await scalar('select to_jsonb(w) value from turn_private.work w where turn_id=$1',[f2.submission.turnId]);
 assert.notEqual((await actorRpc(null,'claim_turn_work',{},'service_role')).turnId,f2.submission.turnId);assert.equal((await actorRpc(null,'claim_grounded_work',{p_owner_id:f2.owner.id,p_policy_id:f2.policy},'service_role')).kind,'empty');assert.deepEqual(await scalar('select to_jsonb(w) value from turn_private.work w where turn_id=$1',[f2.submission.turnId]),original);
});
test('original synthetic Sandbox grant is rechecked atomically and completion/cancel serialize without capacity leakage',async()=>{
 const prior=await scalar('select enabled value from turn_private.service_task_capacity_settings where singleton');await query('update turn_private.service_task_capacity_settings set enabled=true where singleton');
 try{
 const f=await fixture();const grant={ownerId:f.owner.id,appAccountToken:f.owner.id,transactionId:'canonical-self-only-'+randomUUID(),environment:'Sandbox',productId:'synthetic-fixture-only',purchaseAt:new Date(Date.now()-60000).toISOString(),catalogVersion:1,policyVersion:'service-task-development/1',capacitySnapshot:{period:{kind:'per_grant',hours:720,quantity:80},burst:{kind:'account_rolling',hours:24,quantity:12}}};
 assert.equal((await actorRpc(null,'storekit_apply_verified_v1',{p_input:grant},'service_role')).state,'active','trusted local claim fixture only; no real transaction verification');
 await submit(f);assert.equal(await scalar('select tier value from turn_private.service_task_capacity where task_id=$1',[f.submission.serviceTask.id]),'journey_pass');
 const lease=await actorRpc(null,'claim_grounded_work',{p_owner_id:f.owner.id,p_policy_id:f.policy},'service_role');const keys={p_turn_id:lease.turnId,p_lease_token:lease.leaseToken};const input=await actorRpc(null,'read_grounded_work',keys,'service_role');await actorRpc(null,'authorize_grounded_dispatch',{...keys,p_policy_id:f.policy,p_provider:'qwen',p_context_digest:input.contextDigest},'service_role');
 assert.equal((await actorRpc(null,'storekit_apply_verified_v1',{p_input:{...grant,revokedAt:new Date().toISOString()}},'service_role')).state,'revoked');
 await assert.rejects(actorRpc(null,'complete_grounded_place_work',{...keys,p_intent:'place_opening_hours',p_request_scope:'single',p_unanswered_needs:'[]',p_place_name:'ignored'},'service_role'),/SERVICE_TASK_GRANT_UNAVAILABLE/);
 assert.equal(await scalar('select completed_at value from turn_private.grounded_turns where turn_id=$1',[f.submission.turnId]),null);assert.equal(await scalar('select state value from turn_private.service_task_capacity where task_id=$1',[f.submission.serviceTask.id]),'reserved');await actorRpc(f.owner,'cancel_chat_turn',{p_turn_id:f.submission.turnId});assert.equal(await scalar('select state value from turn_private.service_task_capacity where task_id=$1',[f.submission.serviceTask.id]),'released');
 const race=await fixture();await submit(race);const l=await actorRpc(null,'claim_grounded_work',{p_owner_id:race.owner.id,p_policy_id:race.policy},'service_role');const k={p_turn_id:l.turnId,p_lease_token:l.leaseToken};const i=await actorRpc(null,'read_grounded_work',k,'service_role');await actorRpc(null,'authorize_grounded_dispatch',{...k,p_policy_id:race.policy,p_provider:'qwen',p_context_digest:i.contextDigest},'service_role');
 const pair=await Promise.allSettled([actorRpc(null,'complete_grounded_place_work',{...k,p_intent:'place_opening_hours',p_request_scope:'single',p_unanswered_needs:'[]',p_place_name:'ignored'},'service_role'),actorRpc(race.owner,'cancel_chat_turn',{p_turn_id:race.submission.turnId})]);for(const r of pair)if(r.status==='rejected'){if(r.reason?.code==='40P01')writeFileSync(root+'/capacity-race-failure.json',JSON.stringify({message:r.reason.message,code:r.reason.code,detail:r.reason.detail,where:r.reason.where},null,2)+'\n');assert.doesNotMatch(String(r.reason),/deadlock|40P01/);}
 assert.ok(['settled','released'].includes(await scalar('select state value from turn_private.service_task_capacity where task_id=$1',[race.submission.serviceTask.id])));assert.equal((await counts(race.owner.id)).capacity,1);
 }finally{await query('update turn_private.service_task_capacity_settings set enabled=$1 where singleton',[prior]);}
});
test('selected cancel waits for mobile before acquiring capacity34; real blocked completion/cancel then serialize',async()=>{
 const {connect}=await import('./db.mjs');const prior=await scalar('select enabled value from turn_private.service_task_capacity_settings where singleton');await query('update turn_private.service_task_capacity_settings set enabled=true where singleton');
 const f=await fixture();await submit(f);const l=await actorRpc(null,'claim_grounded_work',{p_owner_id:f.owner.id,p_policy_id:f.policy},'service_role');const keys={p_turn_id:l.turnId,p_lease_token:l.leaseToken};const input=await actorRpc(null,'read_grounded_work',keys,'service_role');await actorRpc(null,'authorize_grounded_dispatch',{...keys,p_policy_id:f.policy,p_provider:'qwen',p_context_digest:input.contextDigest},'service_role');
 const barrier=await connect(),cancel=await connect(),completion=await connect();let cancelTask,completionTask;
 try{
  await barrier.query('begin');await barrier.query('select 1 from identity_private.mobile_accounts where owner_id=$1 for update',[f.owner.id]);
  await cancel.query('begin');await cancel.query("select set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[f.owner.id,JSON.stringify({role:'authenticated',session_id:f.owner.session,is_anonymous:false})]);await cancel.query('set local role authenticated');const pid=(await cancel.query('select pg_backend_pid() pid')).rows[0].pid;
  cancelTask=(async()=>{try{const r=await cancel.query('select public.cancel_chat_turn($1) value',[f.submission.turnId]);await cancel.query('commit');return r;}catch(e){await cancel.query('rollback');throw e;}})().then(value=>({value}),error=>({error}));
  let waiting=false;for(let n=0;n<50;n++){waiting=await scalar("select wait_event_type='Lock' value from pg_stat_activity where pid=$1",[pid]);if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(waiting,true,'actual cancel is blocked on owned mobile row');
  assert.equal(await scalar("select count(*)::int value from pg_locks where pid=$1 and locktype='advisory' and granted",[pid]),0,'no capacity34 acquired before mobile');
  await completion.query('begin');await completion.query("select set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true)");await completion.query('set local role service_role');
  completionTask=(async()=>{try{const r=await completion.query("select public.complete_grounded_place_work($1,$2,'place_opening_hours','single','[]','ignored') value",[l.turnId,l.leaseToken]);await completion.query('commit');return r;}catch(e){await completion.query('rollback');throw e;}})().then(value=>({value}),error=>({error}));
  await barrier.query('commit');const pair=await Promise.all([cancelTask,completionTask]);for(const r of pair)if(r.error)assert.doesNotMatch(String(r.error),/deadlock|40P01/);
  assert.ok(['settled','released'].includes(await scalar('select state value from turn_private.service_task_capacity where task_id=$1',[f.submission.serviceTask.id])));
 }finally{
  await barrier.query('rollback');if(cancelTask)await cancelTask;if(completionTask)await completionTask;await cancel.end();await completion.end();await barrier.end();await query('update turn_private.service_task_capacity_settings set enabled=$1 where singleton',[prior]);
 }
});

test('source-withdrawn pending selected Task remains owner-visible and original Cancel releases its reservation',async()=>{
 const prior=await scalar('select enabled value from turn_private.service_task_capacity_settings where singleton');await query('update turn_private.service_task_capacity_settings set enabled=true where singleton');
 try{const f=await fixture();await submit(f);await privileged(f.reviewer,'ops_review_workspace',{p_input:{action:'revoke_statement',operationId:randomUUID(),candidateId:f.source.candidate,expectedPublicationVersion:1,note:'Withdraw pending selection'}});
 const history=await actorRpc(f.owner,'list_service_task_turns',{p_policy_id:f.policy,p_limit:20});assert.equal(history.turns.length,1);const row=history.turns[0];assert.equal(row.turnId,f.submission.turnId);assert.equal(row.input,f.submission.text);assert.equal(row.result.projection,'unavailable');assert.equal(row.result.knowledge,null);assert.equal(row.result.completedAt,null);assert.equal(row.output,null);
 assert.equal((await actorRpc(f.reviewer,'read_text_turn',{p_turn_id:f.submission.turnId})).kind,'unavailable');
 await actorRpc(f.owner,'cancel_chat_turn',{p_turn_id:f.submission.turnId});assert.equal(await scalar('select state value from turn_private.service_task_capacity where task_id=$1',[f.submission.serviceTask.id]),'released');const cancelled=await actorRpc(f.owner,'list_service_task_turns',{p_policy_id:f.policy,p_limit:20});assert.equal(cancelled.turns[0].status,'cancelled');assert.equal(cancelled.turns[0].result.knowledge,null);
 writeFileSync(root+'/pending-unavailable-history.json',JSON.stringify({owner:f.owner.id,now:Date.now(),history,cancelled},null,2)+'\n');
 }finally{await query('update turn_private.service_task_capacity_settings set enabled=$1 where singleton',[prior]);}
});
test('qualified dispatched non-Place classification becomes original unsupported terminal and releases capacity',async()=>{
 const prior=await scalar('select enabled value from turn_private.service_task_capacity_settings where singleton');await query('update turn_private.service_task_capacity_settings set enabled=true where singleton');
 try{const f=await fixture();await submit(f);const l=await actorRpc(null,'claim_grounded_work',{p_owner_id:f.owner.id,p_policy_id:f.policy},'service_role');const keys={p_turn_id:l.turnId,p_lease_token:l.leaseToken};
 assert.equal((await actorRpc(null,'complete_grounded_work_with_needs',{...keys,p_intent:'rail_boarding_documents',p_request_scope:'additional_needs',p_unanswered_needs:JSON.stringify(['What time'])},'service_role')).kind,'blocked');assert.equal(await scalar('select completed_at value from turn_private.grounded_turns where turn_id=$1',[l.turnId]),null);
 const input=await actorRpc(null,'read_grounded_work',keys,'service_role');await actorRpc(null,'authorize_grounded_dispatch',{...keys,p_policy_id:f.policy,p_provider:'qwen',p_context_digest:input.contextDigest},'service_role');
 assert.equal((await actorRpc(null,'complete_grounded_work_with_needs',{...keys,p_lease_token:randomUUID(),p_intent:'rail_boarding_documents',p_request_scope:'additional_needs',p_unanswered_needs:JSON.stringify(['What time'])},'service_role')).kind,'blocked');
 assert.equal((await actorRpc(null,'complete_grounded_work_with_needs',{...keys,p_intent:'rail_boarding_documents',p_request_scope:'additional_needs',p_unanswered_needs:JSON.stringify(['What time'])},'service_role')).kind,'finished');const row=await scalar('select to_jsonb(g) value from turn_private.grounded_turns g where turn_id=$1',[l.turnId]);assert.equal(row.intent,'unsupported');assert.equal(row.original_outcome,'blocked');assert.equal(row.place_subject_id,null);assert.equal(row.basis,null);assert.deepEqual(row.unanswered_needs,[]);assert.equal(await scalar('select state value from turn_private.service_task_capacity where task_id=$1',[f.submission.serviceTask.id]),'released');assert.equal((await actorRpc(null,'claim_grounded_work',{p_owner_id:f.owner.id,p_policy_id:f.policy},'service_role')).kind,'empty');
 }finally{await query('update turn_private.service_task_capacity_settings set enabled=$1 where singleton',[prior]);}
});
test('explicit C0 qwen endpoint is inserted once without changing policy purpose or enabling a provider',async()=>{
 const endpoint='https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';const f=await fixture('current_input_v1',null,endpoint);const p=await scalar('select jsonb_build_object(\'endpoint\',endpoint,\'mode\',context_mode) value from turn_private.text_policies where id=$1',[f.policy]);assert.deepEqual(p,{endpoint,mode:'current_input_v1'});
 const users=await scalar('select count(*)::int value from auth.users');await assert.rejects(fixture('current_input_v1',null,'https://not-allowed.invalid'),/Unsupported C0 fixture endpoint/);assert.equal(await scalar('select count(*)::int value from auth.users'),users);
});
