import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {db,owned,name as container} from './kernel.mjs';
import {command} from '../../../tests/integration/cost/fixtures/postgres-rpc.mjs';
const lit=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const query=(a,name,p)=>`begin;set role authenticated;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({session_id:a.session,role:"authenticated",is_anonymous:false})}';select public.${name}(`+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');commit;';
const raw=(a,name,p)=>command('docker',['exec','-i',container,'psql','-h','/tmp/vpj13-51fb6d9a-socket','-U','postgres','-X','-q','-At','-v','ON_ERROR_STOP=1'],query(a,name,p));
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

await owned();
const results=[];
async function check(label,fn){try{if(await fn()==='UNRUN')return;results.push({label,result:'PASS'});}catch(error){results.push({label,result:'FAIL',error:String(error)});writeFileSync(new URL('proof.json',import.meta.url),JSON.stringify(results,null,2)+'\n');throw error;}}
const x=await fixture(),cmp=uuid(),dec=uuid();
await svc('publish_result_artifact_v2',params(x,comparison,cmp));
const decision={schemaVersion:'decision/1',title:'Choice',summary:'Pending',comparisonRef:{artifactId:cmp,revision:1},state:'pending',chosenOptionId:null,actions:[]};
await svc('publish_result_artifact_v2',params(x,decision,dec));
const scope={p_policy_id:x.a.policy,p_conversation_id:x.a.conversation,p_goal_id:x.a.goal,p_goal_version:x.r.goalVersion,p_parent_message_id:x.r.messageId,p_input_sequence:Number(await db(`select sequence from turn_private.assistant_messages where id='${x.r.messageId}'`)),p_mobile_epoch:Number(await db(`select epoch from identity_private.mobile_accounts where owner_id='${x.a.owner}'`))};
const discover=(overrides={})=>call(x.a,'read_goal_return_reference_v1',{...scope,...overrides});
writeFileSync(new URL('fixture-scope.json',import.meta.url),JSON.stringify({x,cmp,dec,scope},null,2)+'\n');
await check('Pending newest is unavailable',async()=>assert.deepEqual(await discover(),{kind:'unavailable'}));
await call(x.a,'choose_result_decision_v2',{p_artifact_id:dec,p_expected_revision:1,p_operation_id:uuid(),p_option_id:'jingan'});
await check('Ordinary authenticated original choice -> qualified reference',async()=>{
 const got=await discover();assert.equal(got.kind,'goal_return');assert.equal(got.lastDecision.artifactId,dec);assert.equal(got.lastDecision.revision,2);assert.match(got.lastDecision.eventId,/^[1-9][0-9]*$/);assert.deepEqual(got.nextStep,{kind:'unknown'});
 assert.equal((await originalRead(x,dec,2)).current,true);
});
for(const [k,v] of Object.entries({p_policy_id:uuid(),p_conversation_id:uuid(),p_goal_id:uuid(),p_goal_version:2,p_parent_message_id:uuid(),p_input_sequence:scope.p_input_sequence+1}))await check('Wrong scope '+k,async()=>assert.deepEqual(await discover({[k]:v}),{kind:'unavailable'}));
await check('Replaced epoch rejects',async()=>{let failed=false;try{await discover({p_mobile_epoch:scope.p_mobile_epoch+1});}catch(e){assert.match(String(e),/SESSION_REPLACED/);failed=true;}assert.ok(failed);});
await check('Effective ACL private/public',async()=>{
 for(const role of ['anon','service_role','authenticated'])assert.equal(await db(`select has_function_privilege('${role}','turn_private.goal_return_reference_v1(uuid,uuid,uuid,integer,uuid,bigint,bigint)','EXECUTE')`),'f');
 for(const role of ['anon','service_role'])assert.equal(await db(`select has_function_privilege('${role}','public.read_goal_return_reference_v1(uuid,uuid,uuid,integer,uuid,bigint,bigint)','EXECUTE')`),'f');
});
await check('Old privacy gates after candidate',async()=>{
 const got=await db('select profile_data_private.schema_v1(),conversation_data_private.schema_supported_v1(),result_data_private.schema_supported_v1(),turn_data_private.schema_supported_v1(),turn_data_private.runtime_supported_v1();');
 assert.equal(got,'t|t|t|t|t');
});

async function rollbackMutation(label,mutation,expected={kind:'unavailable'}){
 await check(label,async()=>{
  const q=query(x.a,'read_goal_return_reference_v1',scope).replace('begin;','begin;'+mutation+';').replace('commit;','rollback;');
  const rawResult=await command('docker',['exec','-i',container,'psql','-h','/tmp/vpj13-51fb6d9a-socket','-U','postgres','-X','-q','-At','-v','ON_ERROR_STOP=1'],q);
  if(rawResult.code!==0 && /ASSISTANT_EVENT_ERASE_AUTHORITY|immutable|IMMUTABLE|SOURCE|GENERATION|not-null/.test(rawResult.stderr)){results.push({label:label+' injection',result:'UNRUN',reason:rawResult.stderr.trim()});return 'UNRUN';}assert.equal(rawResult.code,0,rawResult.stderr);assert.deepEqual(JSON.parse(rawResult.stdout.trim().split('\n').at(-1)),expected);
 });
}
await rollbackMutation('Missing owned head event rejects',`delete from turn_private.result_events where artifact_id='${dec}' and revision=2`);
await rollbackMutation('Duplicate ready/revised head rejects',`insert into turn_private.result_events(owner_id,artifact_id,revision,event_type) values('${x.a.owner}','${dec}',2,'ready')`);
await rollbackMutation('Foreign head event rejects',`update turn_private.result_events set owner_id=(select owner_id from turn_private.result_artifacts where owner_id<>'${x.a.owner}' limit 1) where artifact_id='${dec}' and revision=2`);
await rollbackMutation('Withdrawn latest rejects',`update turn_private.result_artifacts set lifecycle='withdrawn' where id='${dec}'`);
await rollbackMutation('Withdrawn consent rejects',`update turn_private.text_consents set revoked_at=now() where owner_id='${x.a.owner}'`);
await rollbackMutation('Hidden source Turn rejects',`update turn_private.text_content set hidden_at=now() where turn_id='${x.r.turnId}'`);
const otherTurn=await call(x.a,'submit_service_task_turn',{p_thread_id:uuid(),p_turn_id:uuid(),p_idempotency_key:uuid(),p_policy_id:x.a.policy,p_locale:'en',p_text:'Synthetic next generation',p_task_id:uuid(),p_scope_version:1,p_relationship:'new_goal',p_parent_turn_id:null});
await rollbackMutation('Changed Task generation rejects',`update turn_private.service_tasks set last_turn_id='${otherTurn.turnId}' where id='${x.r.taskId}'`);
// Original service publisher adds a newer pending decision: older chosen is never fallback.
const later=uuid();await svc('publish_result_artifact_v2',params(x,decision,later));
await check('Newer pending never falls back to older chosen',async()=>assert.deepEqual(await discover(),{kind:'unavailable'}));
await call(x.a,'choose_result_decision_v2',{p_artifact_id:later,p_expected_revision:1,p_operation_id:uuid(),p_option_id:'peoples_square'});
await check('Newest original publication event wins',async()=>assert.equal((await discover()).lastDecision.artifactId,later));
// Add nondecision memberships through the original publisher; all are counted.
for(let n=3;n<63;n++)await svc('publish_result_artifact_v2',params(x,comparison));
await check('64 full membership admits',async()=>{assert.equal(await db(`select count(*) from turn_private.result_artifacts where goal_id='${x.a.goal}'`),'63');await svc('publish_result_artifact_v2',params(x,comparison));assert.equal((await discover()).kind,'goal_return');});
await svc('publish_result_artifact_v2',params(x,comparison));
await check('65th nondecision sentinel rejects',async()=>assert.deepEqual(await discover(),{kind:'unavailable'}));
writeFileSync(new URL('fixture-scope.json',import.meta.url),JSON.stringify({x,cmp,dec,scope},null,2)+'\n');
writeFileSync(new URL('proof.json',import.meta.url),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));
