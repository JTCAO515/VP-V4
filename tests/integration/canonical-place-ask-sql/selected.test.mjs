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
