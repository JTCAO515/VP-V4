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
const x=await fixture(),cmp=uuid(),dec=uuid();await svc('publish_result_artifact_v2',params(x,comparison,cmp));
const decision={schemaVersion:'decision/1',title:'Choice',summary:'Pending',comparisonRef:{artifactId:cmp,revision:1},state:'pending',chosenOptionId:null,actions:[]};
await svc('publish_result_artifact_v2',params(x,decision,dec));await call(x.a,'choose_result_decision_v2',{p_artifact_id:dec,p_expected_revision:1,p_operation_id:uuid(),p_option_id:'jingan'});
const scope={p_policy_id:x.a.policy,p_conversation_id:x.a.conversation,p_goal_id:x.a.goal,p_goal_version:x.r.goalVersion,p_parent_message_id:x.r.messageId,p_input_sequence:Number(await db(`select sequence from turn_private.assistant_messages where id='${x.r.messageId}'`)),p_mobile_epoch:Number(await db(`select epoch from identity_private.mobile_accounts where owner_id='${x.a.owner}'`))};
async function seen(app,event){for(let n=0;n<100;n++){if(await db(`select exists(select 1 from pg_stat_activity where application_name='${app}' and wait_event='${event}')`)==='t')return;await new Promise(r=>setTimeout(r,10));}throw Error('Expected real wait absent '+app+':'+event);}
const readerApp='vpj13-own-readere3sqlcurrent';
const reader=rawSql(query(x.a,'read_goal_return_reference_v1',scope).replace('begin;',`set application_name='${readerApp}';begin;`).replace('commit;','select pg_sleep(1.5);commit;'));
await seen(readerApp,'PgSleep');
const publishedId=uuid();const pp=params(x,comparison,publishedId);
const publisherApp='vpj13-own-publishere3sqlcurrent';const publisher=rawSql(`set application_name='${publisherApp}';set lock_timeout='0';set statement_timeout='10s';set role service_role;set request.jwt.claim.role='service_role';select public.publish_result_artifact_v2(${Object.entries(pp).map(([k,v])=>k+'=>'+lit(v)).join(',')});`);
const pr=await publisher;assert.notEqual(pr.code,0);assert.match(pr.stderr,/could not obtain lock.*assistant_goals/);results.push({case:'Original publisher source guard KEY SHARE NOWAIT rejects under Goal UPDATE fence',result:'PASS'});
const rr=await reader;assert.equal(rr.code,0,rr.stderr);assert.equal(JSON.parse(rr.stdout.trim().split('\n')[0]).lastDecision.artifactId,dec);
assert.equal((await svc('publish_result_artifact_v2',pp)).kind,'published');
assert.equal((await call(x.a,'read_goal_return_reference_v1',scope)).lastDecision.artifactId,dec);
results.push({case:'Original publisher retry after reader commit succeeds with complete new membership',result:'PASS'});
// Existing source-qualified choose must likewise wait on the original identity/Goal/artifact rows.
const laterId=uuid();await svc('publish_result_artifact_v2',params(x,decision,laterId));
await call(x.a,'choose_result_decision_v2',{p_artifact_id:laterId,p_expected_revision:1,p_operation_id:uuid(),p_option_id:'jingan'});
const r2=rawSql(query(x.a,'read_goal_return_reference_v1',scope).replace('begin;',`set application_name='${readerApp}';begin;`).replace('commit;','select pg_sleep(1.5);commit;'));
await seen(readerApp,'PgSleep');
const op={p_artifact_id:laterId,p_expected_revision:2,p_operation_id:uuid(),p_option_id:'peoples_square'};
const chooseApp='vpj13-own-choosee3sqlcurrent';const chooser=rawSql(query(x.a,'choose_result_decision_v2',op).replace('begin;',`set application_name='${chooseApp}';set lock_timeout='0';set statement_timeout='10s';begin;`));
await seen(chooseApp,'transactionid');const [rc,cc]=await Promise.all([r2,chooser]);assert.equal(rc.code,0,rc.stderr);assert.equal(cc.code,0,cc.stderr);
assert.equal(JSON.parse(rc.stdout.trim().split('\n')[0]).lastDecision.revision,2);assert.equal((await call(x.a,'read_goal_return_reference_v1',scope)).lastDecision.revision,3);
results.push({case:'Original choose waits and new immutable revision is observed after release',result:'PASS'});
const wr=rawSql(query(x.a,'read_goal_return_reference_v1',scope).replace('begin;',`set application_name='${readerApp}';begin;`).replace('commit;','select pg_sleep(1.5);commit;'));await seen(readerApp,'PgSleep');
const withdrawalApp='vpj13-own-withdrawe3sqlcurrent';const withdrawal=rawSql(`set application_name='${withdrawalApp}';set lock_timeout='0';set role service_role;set request.jwt.claim.role='service_role';select public.withdraw_result_artifact_v1('${x.a.owner}','${laterId}',3);`);await seen(withdrawalApp,'transactionid');const [beforeWithdraw,withdrawResult]=await Promise.all([wr,withdrawal]);assert.equal(beforeWithdraw.code,0,beforeWithdraw.stderr);assert.equal(withdrawResult.code,0,withdrawResult.stderr);assert.deepEqual(await call(x.a,'read_goal_return_reference_v1',scope),{kind:'unavailable'});results.push({case:'Original withdrawal serializes after discovery and rediscovery invalidates without older fallback',result:'PASS'});
// Exact original membership fence encountered at entry returns unknown, never waits.
const goalBlock=rawSql(`set application_name='vpj13-own-goalblocke3sqlcurrent';begin;select 1 from turn_private.assistant_goals where id='${x.a.goal}' for update;select pg_sleep(1);commit;`);
await seen('vpj13-own-goalblocke3sqlcurrent','PgSleep');const began=Date.now();assert.deepEqual(await call(x.a,'read_goal_return_reference_v1',scope),{kind:'unavailable'});assert.ok(Date.now()-began<750);assert.equal((await goalBlock).code,0);results.push({case:'Busy original Goal NOWAIT returns uniform unavailable',result:'PASS'});
// A function-local SET statement_timeout cannot establish the outer RPC timer.
const mobileBlock=rawSql(`set application_name='vpj13-own-mobileblocke3sqlcurrent';begin;select 1 from identity_private.mobile_accounts where owner_id='${x.a.owner}' for update;select pg_sleep(1);commit;`);
await seen('vpj13-own-mobileblocke3sqlcurrent','PgSleep');
const timeoutQuery=query(x.a,'read_goal_return_reference_v1',scope).replace('begin;',"set statement_timeout='100ms';begin;");
const timed=await rawSql(timeoutQuery);assert.notEqual(timed.code,0);assert.match(timed.stderr,/statement timeout/);assert.equal((await mobileBlock).code,0);results.push({case:'Actual outer SQL timeout propagates cancellation, not success',result:'PASS',outerTimeout:'100ms fixture only; PostgREST5s UNRUN'});
writeFileSync(output("concurrency-proof.json"),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));
