// Original complete-worker synthetic fixture functions reused at base bdb92b2b.
// This remains administrator synthetic provenance, no provider/target evidence.
import assert from 'node:assert/strict';
import {randomUUID as uuid,createHash} from 'node:crypto';
import {createPlanningV2ModelOutputReceipt as create} from '../../../../../lib/server/turn/planning-v2-model-output-receipt.ts';
import {db} from './runtime.mjs';
import {sql} from '../../../cost/fixtures/postgres-rpc.mjs';
const container=process.env.VP_RESULT_DATA_SQL_CONTAINER??'vpj58-result-data-sql-20261007';
const lit=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const query=(a,name,p)=>`begin;set role authenticated;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({session_id:a.session,role:'authenticated',is_anonymous:false})}';select public.${name}(`+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');commit;';
const call=async(a,name,p)=>{const r=await sql(container,query(a,name,p));assert.equal(r.code,0,r.stderr);return JSON.parse(r.stdout.trim());};
const memoryCall=async(a,name,p)=>{const r=await sql(container,query(a,name,p).replace('select public.',"select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from public.").replace(');commit;',') m;commit;'));assert.equal(r.code,0,r.stderr);return JSON.parse(r.stdout.trim());};
const projection={schemaVersion:'stay-area-intake/1',city:'shanghai',comparisonTarget:'area_transport',durationDays:10,partySize:2,interests:['food','photography'],pace:'relaxed',lodgingBudget:null,dates:null,mobilityConstraints:[]};
const notice='a'.repeat(64);
async function owner(environment='local_synthetic',locale='en',goalText='First China visit, ten days with partner, food and photography, relaxed pace.',memory=false){
 const a={owner:uuid(),session:uuid(),policy:uuid(),planningPolicy:uuid(),conversation:uuid(),goal:uuid(),source:uuid()};
 await db(`insert into auth.users(id) values('${a.owner}');insert into identity_private.mobile_accounts(owner_id,session_id,epoch) values('${a.owner}','${a.session}',1);insert into identity_private.mobile_attempts(owner_id,attempt_id,session_id,epoch) values('${a.owner}','${uuid()}','${a.session}',1);insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');
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

const v2=a=>({...planning(a),p_expected_intake_message_id:a.source,p_expected_source_sequence:1,p_expected_intake_revision:1,p_expected_intake_digest:a.receipt.contextDigest,p_intake:projection});
const bound=async(a,r,lease=null)=>JSON.parse(await db(`select turn_private.read_planning_qualified_intake_v1('${a.owner}','${r.turnId}',${lit(lease)});`));

const adm=async(name,params)=>JSON.parse(await db('select to_jsonb(public.'+name+'('+Object.entries(params).map(([k,v])=>k+'=>'+lit(v)).join(',')+'));'));
async function fixture(){
 const a=await owner(),r=await call(a,'submit_planning_comparison_v2',v2(a)),scope=uuid(),tariff=uuid(),profile=uuid(),principal=uuid(),price='synthetic-'+uuid().slice(0,8);
 await db(`insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at) values('${scope}','${a.owner}','CNY',10000000,3000000,1,1,true,now()+interval '1 day');insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled) values('${scope}','qwen','qwen3.7-plus-2026-05-26','${price}',10000000,3000000,true);
 insert into turn_private.planning_v2_registered_tariffs(id,provider,model,price_version,currency,unit,input_rate,output_rate,source_authority,enabled,valid_until) values('${tariff}','qwen','qwen3.7-plus-2026-05-26','${price}','CNY','micros',1000000,1000000,'administrator synthetic tariff, not provider origin',true,now()+interval '1 day');
 insert into turn_private.planning_v2_collector_principals(id,jwt_role,jwt_subject,database_role,gateway_session_user,valid_until) values('${principal}','planning_worker_v2_collector','${uuid()}','planning_worker_v2_collector','authenticator',now()+interval '1 day');
 insert into turn_private.planning_v2_execution_profiles(id,revision,owner_id,enabled,environment,collector_principal_id,collector_jwt_role,collector_jwt_subject,local_admin_fixture,text_policy_id,planning_policy_id,scope_id,tariff_id,provider_configuration_id,provider_configuration_version,endpoint,recipient,reserved_micros,timeout_ms,max_output_tokens,map_fee_window_id,map_fee_window_until,map_fee_approved,valid_until) values('${profile}',1,'${a.owner}',true,'local_synthetic','${principal}','planning_worker_v2_collector','${uuid()}',true,'${a.policy}','${a.planningPolicy}','${scope}','${tariff}','${uuid()}',1,'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions','synthetic only',2000000,60000,128,'${uuid()}',now()+interval '1 day',true,now()+interval '1 day');`);
 const claimed=await adm('claim_planning_intake_work_v1',{p_owner_id:a.owner,p_planning_policy_id:a.planningPolicy,p_execution_profile_id:profile});assert.equal(claimed.kind,'leased',JSON.stringify(claimed));const l=claimed.lease,e=claimed.execution;
 const six={p_owner:a.owner,p_task:r.taskId,p_turn:r.turnId,p_lease:l.leaseToken,p_intake_digest:l.intakeContextDigest,p_planning_digest:l.planningContextDigest};
 const b={owner:a.owner,task:r.taskId,turn:r.turnId,lease:l.leaseToken,textPolicy:a.policy,planningPolicy:a.planningPolicy,scope,attempt:uuid(),provider:'qwen',model:e.model,priceVersion:e.priceVersion,intakeDigest:l.intakeContextDigest,planningDigest:l.planningContextDigest};
 const tuple={p_owner:b.owner,p_task:b.task,p_turn:b.turn,p_lease:b.lease,p_text_policy:b.textPolicy,p_planning_policy:b.planningPolicy,p_scope:b.scope,p_attempt:b.attempt,p_provider:b.provider,p_model:b.model,p_price_version:b.priceVersion,p_intake_digest:b.intakeDigest,p_planning_digest:b.planningDigest};
 return {a,r,l,e,six,b,tuple,profile};
}

const budget=(f,effect,extra={})=>adm('planning_intake_budget_v1',{p_effect:effect,p_binding:f.b,p_reserved_micros:null,p_actual_micros:null,p_outcome:null,...extra});
async function prepared({recoverPlace=false,recoverOutput=false}={}){const f=await fixture();assert.equal((await adm('claim_planning_intake_place_v1',f.six)).kind,'claimed');
 const place={schemaVersion:'planning-place/1',source:'synthetic_fixture',observedAt:new Date().toISOString(),providerCalls:1,areas:[{id:'jingan',label:"Jing'an Temple",railMinutes:15,transfers:1},{id:'peoples_square',label:"People's Square",railMinutes:10,transfers:0}]};
 assert.equal((await adm('authorize_planning_intake_external_read_v1',{...f.six,p_scope:f.b.scope,p_max_calls:13})).kind,'authorized');assert.equal(await adm('save_planning_intake_place_v1',{...f.six,p_observation:place}),true);
 if(recoverPlace){await db(`update turn_private.work set expires_at=clock_timestamp()-interval '1 second' where turn_id='${f.b.turn}';`);const again=await adm('claim_planning_intake_work_v1',{p_owner_id:f.a.owner,p_planning_policy_id:f.a.planningPolicy,p_execution_profile_id:f.profile});assert.equal(again.kind,'leased');f.l=again.lease;f.six.p_lease=f.l.leaseToken;f.b.lease=f.l.leaseToken;f.tuple.p_lease=f.l.leaseToken;}
 assert.equal((await budget(f,'reserve',{p_reserved_micros:f.e.reservedMicros})).kind,'reserved');assert.equal((await adm('bind_planning_intake_model_attempt_v1',f.tuple)).kind,'model_attempt_binding');
 const q=await adm('read_planning_intake_work_v1',f.six);
 const prompt=`You are selecting which of two Shanghai stay-area options deserves attention based only on the supplied current goal, explicit memories and observed rail-access metrics.
Return exactly one JSON object: {"highlight":"jingan"}, {"highlight":"peoples_square"}, or {"highlight":"none"}.
Do not invent hotel prices, availability, safety, walking access, bookings, sources, or Trip changes. Missing or conflicting evidence means "none". This selection is advisory; domain code will construct the factual comparison.`;
 const payload={model:f.b.model,messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify({goal:q.goalText,delegation:q.delegation,intake:q.qualifiedIntake.intake,observation:place,unknown:['hotel_price','availability','safety','quietness','food','photography','pace_suitability']})}],stream:false,max_tokens:128,enable_thinking:false,response_format:{type:'json_object'}};
 const canonical=JSON.parse(await db(`select turn_private.serialize_planning_v2_request_v1(${lit(f.b)}::jsonb,'${f.b.attempt}',${lit(payload)}::jsonb);`));
 const privateCall=async(name,p)=>JSON.parse(await db('select turn_private.'+name+'('+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');'));
 const original={...f.tuple,p_request_id:f.b.attempt,p_request_digest:canonical.requestDigest};
 assert.equal((await privateCall('create_planning_v2_request_intent_v1',{...original,p_payload_text:canonical.body,p_payload_digest:canonical.payloadDigest,p_expected_revision:0})).kind,'model_request_journal');assert.equal((await budget(f,'dispatch')).kind,'dispatched');
 const obs=kind=>({schemaVersion:'planning-v2-local-observation/1',source:'local_observation',kind,requestId:f.b.attempt,requestDigest:canonical.requestDigest,observedAt:new Date().toISOString()});
 assert.equal((await privateCall('record_planning_v2_send_ack_v1',{...original,p_expected_revision:1,p_local_observation:obs('send_ack')})).kind,'model_request_journal');
 const invocationId=uuid(),destination=phase=>({schemaVersion:'provider-destination/1',invocationId,provider:'qwen',model:f.b.model,endpoint:f.e.endpoint,configurationId:f.e.providerConfigurationId,configurationVersion:f.e.providerConfigurationVersion,phase,observedAt:new Date().toISOString()});
 const send=phase=>adm('record_planning_intake_provider_destination_v1',{...f.tuple,p_destination:destination(phase),p_request_id:f.b.attempt,p_request_digest:canonical.requestDigest,p_payload_digest:canonical.payloadDigest,p_payload_text:canonical.body});
 for(const phase of ['configured','attempted','response_buffered'])assert.equal((await send(phase)).kind,'destination_recorded');assert.equal((await send('configured')).kind,'blocked');
 const output=create({schemaVersion:'planning-v2-model-output/1',binding:f.b,usageReceipt:{schemaVersion:'validated-planning-usage/1',turnId:f.b.turn,policyId:f.b.planningPolicy,attempt:{scopeId:f.b.scope,ownerId:f.b.owner,taskId:f.b.task,attemptId:f.b.attempt,provider:f.b.provider,model:f.b.model,priceVersion:f.b.priceVersion,reservedMicros:f.e.reservedMicros,timeoutMs:f.e.timeoutMs},usage:{inputTokens:10,outputTokens:5,totalTokens:15,cachedInputTokens:null,uncachedInputTokens:null,reasoningTokens:null,cost:'unknown'},actualMicros:15,observedAt:new Date().toISOString()},output:{highlight:'jingan'},observedAt:new Date().toISOString()},f.b);assert.ok(output);
 assert.equal((await privateCall('record_planning_v2_response_v1',{...original,p_expected_revision:2,p_local_observation:obs('response_received'),p_output_wire:output})).kind,'model_request_journal');
 assert.equal((await adm('record_planning_intake_model_output_v1',{...f.tuple,p_output_wire:output})).kind,'output_recorded');assert.equal((await budget(f,'finish',{p_outcome:'settle',p_actual_micros:15})).kind,'settled');
 if(recoverOutput){await db(`update turn_private.work set expires_at=clock_timestamp()-interval '1 second' where turn_id='${f.b.turn}';`);const again=await adm('claim_planning_intake_work_v1',{p_owner_id:f.a.owner,p_planning_policy_id:f.a.planningPolicy,p_execution_profile_id:f.profile});assert.equal(again.kind,'leased');f.l=again.lease;f.six.p_lease=f.l.leaseToken;}
 const projected=await adm('project_planning_intake_comparison_v1',{...f.six,p_observation:place});assert.equal(projected.schemaVersion,'qualified-intake-comparison-projection/1');const content=projected.content,digest=createHash('sha256').update(JSON.stringify([content.schemaVersion,content.title,content.summary,content.options.map(o=>[o.id,o.title,o.tradeoff]),content.actions])).digest('hex'),key=createHash('sha256').update(JSON.stringify([f.b.task,f.b.turn,f.b.intakeDigest,f.b.planningDigest,'result.prepare',digest])).digest('hex');
 assert.equal((await adm('claim_planning_intake_result_v1',{...f.six,p_action_key:key,p_content_digest:digest})).kind,'claimed');
 f.complete={...f.six,p_action_key:key,p_scope:f.b.scope,p_attempt:f.b.attempt,p_output_digest:output.outputDigest,p_usage_digest:output.usageDigest,p_content:content};
 f.read={p_owner:f.b.owner,p_task:f.b.task,p_turn:f.b.turn,p_artifact:f.l.artifactId,p_intake_digest:f.b.intakeDigest,p_planning_digest:f.b.planningDigest,p_scope:f.b.scope,p_attempt:f.b.attempt,p_output_digest:output.outputDigest,p_usage_digest:output.usageDigest};return f;
}

export {prepared,adm};
