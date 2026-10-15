// Reuses original E3 behavioral assertions with owned Unix-socket transport.
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {db,owned,rawSql,output} from './kernel.mjs';
const lit=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const query=(a,name,p)=>`begin;set role authenticated;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({session_id:a.session,role:"authenticated",is_anonymous:false})}';select public.${name}(`+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');commit;';
const raw=(a,name,p)=>rawSql(query(a,name,p));
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
 const attempt=uuid();
 await db(`set role service_role;set request.jwt.claims='{"role":"service_role"}';select public.native_prepare_v2('${a.owner}','${a.session}','${attempt}');`);
 await call(a,'native_session_v2',{p_action:'login',p_attempt:attempt});
 await call(a,'accept_text_policy' ,{p_policy_id:a.policy,p_notice_hash:notice});await call(a,'accept_planning_policy_v1',{p_policy_id:a.planningPolicy,p_notice_hash:notice});
 a.input={p_conversation_id:a.conversation,p_goal_id:a.goal,p_message_id:a.source,p_parent_message_id:null,p_expected_goal_version:null,p_expected_intake_revision:0,p_idempotency_key:uuid(),p_policy_id:a.policy,p_locale:'en',p_text:goalText,p_relationship:'goal_start',p_intake:projection,p_memory_basis:[]};
 a.receipt=await call(a,'submit_assistant_travel_intake_v1',a.input);return a;
}
const planning=a=>({p_conversation_id:a.conversation,p_goal_id:a.goal,p_expected_goal_version:1,p_parent_message_id:a.source,p_message_id:uuid(),p_message_key:uuid(),p_thread_id:uuid(),p_turn_id:uuid(),p_task_id:uuid(),p_task_key:uuid(),p_text_policy_id:a.policy,p_planning_policy_id:a.planningPolicy,p_locale:'en',p_text:'Compare Shanghai areas',p_memory_basis:[]});
const correction=a=>({...a.input,p_message_id:uuid(),p_parent_message_id:a.source,p_expected_goal_version:1,p_expected_intake_revision:1,p_idempotency_key:uuid(),p_text:'Explicit full correction to balanced pace',p_relationship:'amendment',p_intake:{...projection,pace:'balanced'}});
const state=a=>db(`select jsonb_build_object('goalVersion',g.scope_version,'text',g.current_text,'sequence',c.next_sequence,'messages',(select count(*) from turn_private.assistant_messages where goal_id=g.id),'intakes',(select count(*) from turn_private.assistant_travel_intakes where goal_id=g.id),'tasks',(select count(*) from turn_private.service_tasks where owner_id=g.owner_id),'work',(select count(*) from turn_private.work where owner_id=g.owner_id),'planning',(select count(*) from turn_private.planning_comparisons where owner_id=g.owner_id),'capacity',(select count(*) from turn_private.service_task_capacity where owner_id=g.owner_id),'attempts',(select count(*) from public.model_budget_attempts b join public.model_budget_scopes s on s.id=b.scope_id where s.owner_id=g.owner_id)) from turn_private.assistant_goals g join turn_private.assistant_conversations c on c.id=g.conversation_id where g.id='${a.goal}';`);
const svc=(name,p)=>db("set role service_role;set request.jwt.claim.role='service_role';select public."+name+'('+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');').then(JSON.parse);
async function fixture(output='Synthetic completed task'){
 const a=await owner('local_synthetic'),r=await call(a,'submit_planning_comparison_v1',planning(a));
 Object.assign(r,JSON.parse(await db(`select jsonb_build_object('messageId',message_id,'goalVersion',goal_version) from turn_private.planning_comparisons where turn_id='${r.turnId}';`)));
 await db(`update turn_private.text_content set output_kind='answered',output_text=${lit(output)} where turn_id='${r.turnId}';select turn_private.terminal('${r.turnId}','completed',1);`);
 return {a,r};
}
const comparison={schemaVersion:'comparison/1',title:'Areas',summary:'Transport screening',options:[{id:'jingan',title:'Jingan',tradeoff:'Unknown food'},{id:'peoples_square',title:'Peoples Square',tradeoff:'Unknown quietness'}],actions:[]};
const params=(x,content,id=uuid())=>({p_owner_id:x.a.owner,p_artifact_id:id,p_expected_revision:0,p_idempotency_key:uuid(),p_task_id:x.r.taskId,p_goal_id:x.a.goal,p_input_message_id:x.r.messageId,p_trip_id:null,p_trip_version:null,p_goal_version:x.r.goalVersion,p_memory_basis:[],p_content:content,p_evidence_basis:[]});
const originalRead=(x,id,revision=1)=>call(x.a,'read_result_artifact_v2',{p_artifact_id:id,p_revision:revision});


await owned();const results=[];
async function check(label,fn){try{await fn();results.push({label,result:'PASS'});}catch(error){results.push({label,result:'FAIL',error:String(error)});writeFileSync(output("lifecycle-proof.json"),JSON.stringify(results,null,2)+'\n');throw error;}}
const a=await owner('local_synthetic'),trip=uuid();await db(`insert into public.trips(id,owner_id,title) values('${trip}','${a.owner}','Owned fixture Trip');`);
await call(a,'set_assistant_goal_trip_link_v1',{p_operation_id:uuid(),p_conversation_id:a.conversation,p_goal_id:a.goal,p_source_message_id:a.source,p_expected_goal_scope_version:1,p_expected_link_version:0,p_action:'link',p_trip_id:trip,p_expected_trip_version:0,p_confirmed:true});
const task=uuid(),turn=uuid(),thread=uuid(),message=uuid();
await call(a,'submit_service_task_turn',{p_thread_id:thread,p_turn_id:turn,p_idempotency_key:uuid(),p_policy_id:a.policy,p_locale:'en',p_text:'Typed Trip fixture',p_task_id:task,p_scope_version:1,p_relationship:'new_goal',p_parent_turn_id:null});
await call(a,'submit_assistant_message_v1',{p_conversation_id:a.conversation,p_message_id:message,p_idempotency_key:uuid(),p_policy_id:a.policy,p_locale:'en',p_text:'Trip fixture result',p_relationship:'follow_up',p_goal_id:a.goal,p_expected_goal_version:2,p_task_id:task,p_parent_message_id:a.source,p_turn_id:null});
const r={taskId:task,turnId:turn,messageId:message,goalVersion:2};
await db(`update turn_private.text_content set output_kind='answered',output_text='Synthetic task' where turn_id='${r.turnId}';select turn_private.terminal('${r.turnId}','completed',1);`);
const x={a,r},memory=uuid(),memoryConsent=uuid(),memoryReceipt=uuid();
await db(`begin;insert into public.memory_consents(id,owner_id,status) values('${memoryConsent}','${a.owner}','granted');insert into public.memory_profiles(id,owner_id,source_receipt_id,consent_id,state,constraint_kind,summary) values('${memory}','${a.owner}','${memoryReceipt}','${memoryConsent}','explicit','preference','Synthetic quiet');insert into public.memory_receipts(id,owner_id,memory_id,event_state,source_kind) values('${memoryReceipt}','${a.owner}','${memory}','explicit','user_confirmed');commit;`);
const cmp=uuid(),dec=uuid(),basis=[{id:memory,revision:1}];const bp=(c,id)=>({...params(x,c,id),p_memory_basis:basis,p_trip_id:trip,p_trip_version:0});
await svc('publish_result_artifact_v2',bp(comparison,cmp));await svc('publish_result_artifact_v2',bp({schemaVersion:'decision/1',title:'Choice',summary:'Pending',comparisonRef:{artifactId:cmp,revision:1},state:'pending',chosenOptionId:null,actions:[]},dec));
await call(a,'choose_result_decision_v2',{p_artifact_id:dec,p_expected_revision:1,p_operation_id:uuid(),p_option_id:'jingan'});
const scope={p_policy_id:a.policy,p_conversation_id:a.conversation,p_goal_id:a.goal,p_goal_version:r.goalVersion,p_parent_message_id:r.messageId,p_input_sequence:Number(await db(`select sequence from turn_private.assistant_messages where id='${r.messageId}'`)),p_mobile_epoch:Number(await db(`select epoch from identity_private.mobile_accounts where owner_id='${a.owner}'`))};
await check('Current Trip+explicit Memory source positive',async()=>assert.equal((await call(a,'read_goal_return_reference_v1',scope)).kind,'goal_return'));
async function negative(label,mutation){await check(label,async()=>{
 const q=query(a,'read_goal_return_reference_v1',scope).replace('begin;','begin;'+mutation+';').replace('commit;','rollback;');const raw=await rawSql(q);assert.equal(raw.code,0,raw.stderr);assert.deepEqual(JSON.parse(raw.stdout.trim().split('\n').at(-1)),{kind:'unavailable'});
});}
await negative('Changed Memory revision rejects',`update public.memory_profiles set summary='Synthetic revised' where id='${memory}'`);
await negative('Revoked Memory consent rejects',`update public.memory_consents set status='revoked' where id='${memoryConsent}'`);
await negative('Deleted Memory cannot be revived',`update public.memory_profiles set state='deleted',summary=null where id='${memory}'`);
await negative('Original queued Trip deletion rejects',query(a,'request_trip_deletion_v1',{p_request_id:uuid(),p_trip_id:trip,p_expected_version:0,p_confirmed:true}).replace('begin;','').replace('commit;',''));
await negative('Changed Trip head rejects',`update public.trips set head_version=1 where id='${trip}'`);
await negative('Original confirmed unlink rejects current reference',query(a,'set_assistant_goal_trip_link_v1',{p_operation_id:uuid(),p_conversation_id:a.conversation,p_goal_id:a.goal,p_source_message_id:null,p_expected_goal_scope_version:2,p_expected_link_version:1,p_action:'unlink',p_trip_id:null,p_expected_trip_version:null,p_confirmed:true}).replace('begin;','').replace('commit;',''));
// Corrupt a copied artifact/revision inside rollback only, preserving all triggers.
const incomplete=uuid();await negative('Missing publication head rejects without bypassing guards',`insert into turn_private.result_artifacts(id,owner_id,task_id,goal_id,input_message_id,trip_id,current_revision,lifecycle,proposal_id,source_result_id,source_turn_id) select '${incomplete}',owner_id,task_id,goal_id,input_message_id,trip_id,current_revision,lifecycle,proposal_id,source_result_id,source_turn_id from turn_private.result_artifacts where id='${cmp}';insert into turn_private.result_revisions(artifact_id,revision,owner_id,idempotency_key,request_digest,input_sequence,task_turn_id,goal_version,trip_version,memory_basis,content,trip_link_operation_id,trip_link_version,evidence_basis) select '${incomplete}',revision,owner_id,'${uuid()}',request_digest,input_sequence,task_turn_id,goal_version,trip_version,memory_basis,content,trip_link_operation_id,trip_link_version,evidence_basis from turn_private.result_revisions where artifact_id='${cmp}' and revision=1`);

async function lockNegative(label,table,condition){await check(label,async()=>{
 const app='vpj13-own-sourceblocke3sqlcurrent';const block=rawSql(`set application_name='${app}';begin;select 1 from ${table} where ${condition} for update;select pg_sleep(1);commit;`);
 let observed=false;for(let n=0;n<100;n++){if(await db(`select exists(select 1 from pg_stat_activity where application_name='${app}' and wait_event='PgSleep')`)==='t'){observed=true;break;}await new Promise(r=>setTimeout(r,10));}assert.ok(observed);
 assert.deepEqual(await call(a,'read_goal_return_reference_v1',scope),{kind:'unavailable'});assert.equal((await block).code,0);
});}
await lockNegative('Late Trip lock never reverse-waits','public.trips',`id='${trip}'`);
await lockNegative('Memory update contention is uniform unavailable','public.memory_profiles',`id='${memory}'`);
await lockNegative('Consent revoke contention is uniform unavailable','turn_private.text_consents',`owner_id='${a.owner}'`);
writeFileSync(output("lifecycle-proof.json"),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));
