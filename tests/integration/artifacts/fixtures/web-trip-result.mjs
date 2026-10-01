// Synthetic local fixture only. No external model, provider or payment call.
import assert from 'node:assert/strict';
import { randomUUID as uuid } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

export async function webActor(state) {
 assert.match(state.API_URL,/^http:\/\/127\.0\.0\.1:\d+$/,'only disposable loopback Auth is allowed');
 const client=createClient(state.API_URL,state.PUBLISHABLE_KEY||state.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const email='web-result-'+uuid()+'@example.test',password='Local-only-'+uuid();
 const login=await client.auth.signUp({email,password});assert.ifError(login.error);assert.ok(login.data.session);
 const jar=new Map(),ssr=createServerClient(state.API_URL,state.PUBLISHABLE_KEY||state.ANON_KEY,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});
 assert.ifError((await ssr.auth.setSession({access_token:login.data.session.access_token,refresh_token:login.data.session.refresh_token})).error);
 return {client,owner:login.data.user.id,email,password,cookie:[...jar].map(([name,value])=>name+'='+value).join('; ')};
}

export async function webTripResult(state,sql,actor,{memory=false}={}) {
 assert.match(state.API_URL,/^http:\/\/127\.0\.0\.1:\d+$/,'only disposable loopback result data is allowed');
 const ids=Object.fromEntries(['trip','policy','conversation','goal','root','task','turn','thread','message','artifact','link'].map(key=>[key,uuid()]));
 const rpc=async(name,input)=>{const r=await actor.client.rpc(name,input);assert.ifError(r.error);return r.data;};
 assert.ifError((await actor.client.from('trips').insert({id:ids.trip,owner_id:actor.owner,title:'Synthetic Web Planning Trip'})).error);
 const proposal=await rpc('create_trip_proposal_patch',{p_trip_id:ids.trip,p_patch:{expectedVersion:0,operations:[{kind:'set_title',title:'Synthetic Web Planning Trip'}]}});
 const proof=await rpc('read_trip_proposal_v2',{p_proposal_id:proposal[0].proposal_id});
 await rpc('confirm_and_apply_trip_proposal',{p_proposal_id:proposal[0].proposal_id,p_idempotency_key:uuid(),p_digest:proof[0].digest});
 sql(`insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at)
 values('${ids.policy}','qwen','Local fixture only','https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions','fixture','fixture','fixture','fixture','fixture','${'a'.repeat(64)}','仅限合成测试','Synthetic local test only','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day');`);
 await rpc('accept_text_policy',{p_policy_id:ids.policy,p_notice_hash:'a'.repeat(64)});
 await rpc('submit_assistant_message_v1',{p_conversation_id:ids.conversation,p_message_id:ids.root,p_idempotency_key:uuid(),p_policy_id:ids.policy,p_locale:'en',p_text:'Synthetic Web comparison',p_relationship:'goal_start',p_goal_id:ids.goal,p_expected_goal_version:null,p_task_id:null,p_parent_message_id:null,p_turn_id:null});
 await rpc('set_assistant_goal_trip_link_v1',{p_operation_id:ids.link,p_conversation_id:ids.conversation,p_goal_id:ids.goal,p_source_message_id:ids.root,p_expected_goal_scope_version:1,p_expected_link_version:0,p_action:'link',p_trip_id:ids.trip,p_expected_trip_version:1,p_confirmed:true});
 await rpc('submit_service_task_turn',{p_thread_id:ids.thread,p_turn_id:ids.turn,p_idempotency_key:uuid(),p_policy_id:ids.policy,p_locale:'en',p_text:'Synthetic result task',p_task_id:ids.task,p_scope_version:1,p_relationship:'new_goal',p_parent_turn_id:null});
 await rpc('submit_assistant_message_v1',{p_conversation_id:ids.conversation,p_message_id:ids.message,p_idempotency_key:uuid(),p_policy_id:ids.policy,p_locale:'en',p_text:'Synthetic linked Task',p_relationship:'follow_up',p_goal_id:ids.goal,p_expected_goal_version:2,p_task_id:ids.task,p_parent_message_id:ids.root,p_turn_id:null});
 sql(`update public.turns set status='completed' where id='${ids.turn}';update turn_private.text_content set output_kind='answered',output_text='Synthetic answer, no provider call' where turn_id='${ids.turn}';`);
 let memoryBasis=[];
 if(memory){const consent=await rpc('create_memory_retrieval_consent',{});ids.memory=uuid();
  await rpc('create_explicit_memory_profile_v2',{p_memory_id:ids.memory,p_receipt_id:uuid(),p_consent_id:consent[0].consent_id,p_constraint_kind:'preference',p_summary:'Synthetic preference'});memoryBasis=[{id:ids.memory,revision:1}];}
 const content={schemaVersion:'comparison/1',title:'Synthetic saved comparison',summary:'Local fixture only. <img src=x onerror=alert(1)>',options:[{id:'a',title:'Option A',tradeoff:'Time unknown'},{id:'b',title:'Option B',tradeoff:'Availability unknown'}],actions:[]};
 const service=createClient(state.API_URL,state.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const published=await service.rpc('publish_comparison_result_v1',{p_owner_id:actor.owner,p_artifact_id:ids.artifact,p_expected_revision:0,p_idempotency_key:uuid(),p_task_id:ids.task,p_goal_id:ids.goal,p_input_message_id:ids.message,p_trip_id:ids.trip,p_trip_version:1,p_goal_version:2,p_memory_basis:memoryBasis,p_content:content});
 assert.ifError(published.error);assert.equal(published.data.revision,1);
 return {...ids,content,rpc};
}
