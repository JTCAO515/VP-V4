import {parseResultArtifactReadV2,parseResultSearchPageV2} from '../../../lib/server/artifacts/result-v2-contract.ts';
import {translationPrompt} from '../../../lib/server/media-translation/text/contract.ts';
// Current repository migrations on disposable PostgreSQL; synthetic actor
// claims/providers only. No historical Git objects or target fallback.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_TURN_DB_TEST==='1',container='vpj78-context-v2-'+uuid().slice(0,8);
const migrationSource='supabase/migrations (current checkout, lexical order)';
let created=false;
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const lit=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const query=(a,name,p)=>`begin;set role authenticated;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({session_id:a.session})}';select public.${name}(`+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');commit;';
const raw=(a,name,p)=>sql(container,query(a,name,p));
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
 await call(a,'accept_text_policy',{p_policy_id:a.policy,p_notice_hash:notice});await call(a,'accept_planning_policy_v1',{p_policy_id:a.planningPolicy,p_notice_hash:notice});
 a.input={p_conversation_id:a.conversation,p_goal_id:a.goal,p_message_id:a.source,p_parent_message_id:null,p_expected_goal_version:null,p_expected_intake_revision:0,p_idempotency_key:uuid(),p_policy_id:a.policy,p_locale:'en',p_text:goalText,p_relationship:'goal_start',p_intake:projection,p_memory_basis:[]};
 a.receipt=await call(a,'submit_assistant_travel_intake_v1',a.input);return a;
}
const planning=a=>({p_conversation_id:a.conversation,p_goal_id:a.goal,p_expected_goal_version:1,p_parent_message_id:a.source,p_message_id:uuid(),p_message_key:uuid(),p_thread_id:uuid(),p_turn_id:uuid(),p_task_id:uuid(),p_task_key:uuid(),p_text_policy_id:a.policy,p_planning_policy_id:a.planningPolicy,p_locale:'en',p_text:'Compare Shanghai areas',p_memory_basis:[]});
const correction=a=>({...a.input,p_message_id:uuid(),p_parent_message_id:a.source,p_expected_goal_version:1,p_expected_intake_revision:1,p_idempotency_key:uuid(),p_text:'Explicit full correction to balanced pace',p_relationship:'amendment',p_intake:{...projection,pace:'balanced'}});
const state=a=>db(`select jsonb_build_object('goalVersion',g.scope_version,'text',g.current_text,'sequence',c.next_sequence,'messages',(select count(*) from turn_private.assistant_messages where goal_id=g.id),'intakes',(select count(*) from turn_private.assistant_travel_intakes where goal_id=g.id),'tasks',(select count(*) from turn_private.service_tasks where owner_id=g.owner_id),'work',(select count(*) from turn_private.work where owner_id=g.owner_id),'planning',(select count(*) from turn_private.planning_comparisons where owner_id=g.owner_id),'capacity',(select count(*) from turn_private.service_task_capacity where owner_id=g.owner_id),'attempts',(select count(*) from public.model_budget_attempts b join public.model_budget_scopes s on s.id=b.scope_id where s.owner_id=g.owner_id)) from turn_private.assistant_goals g join turn_private.assistant_conversations c on c.id=g.conversation_id where g.id='${a.goal}';`);
before(async()=>{
 if(!enabled)return;
 const image='public.ecr.aws/supabase/postgres:17.6.1.159';const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh',image,'-c','umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(r.code,0,r.stderr);created=true;
 for(let i=0;i<100;i++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');

});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);

const svc=(name,p)=>db("set role service_role;set request.jwt.claim.role='service_role';select public."+name+'('+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');').then(JSON.parse);
async function fixture(output='Synthetic completed task'){
 const a=await owner('local_synthetic'),r=await call(a,'submit_planning_comparison_v1',planning(a));
 Object.assign(r,JSON.parse(await db(`select jsonb_build_object('messageId',message_id,'goalVersion',goal_version) from turn_private.planning_comparisons where turn_id='${r.turnId}';`)));
 await db(`update turn_private.text_content set output_kind='answered',output_text=${lit(output)} where turn_id='${r.turnId}';select turn_private.terminal('${r.turnId}','completed',1);`);
 return {a,r};
}
const comparison={schemaVersion:'comparison/1',title:'Areas',summary:'Transport screening',options:[{id:'jingan',title:'Jingan',tradeoff:'Unknown food'},{id:'peoples_square',title:'Peoples Square',tradeoff:'Unknown quietness'}],actions:[]};
const params=(x,content,id=uuid())=>({p_owner_id:x.a.owner,p_artifact_id:id,p_expected_revision:0,p_idempotency_key:uuid(),p_task_id:x.r.taskId,p_goal_id:x.a.goal,p_input_message_id:x.r.messageId,p_trip_id:null,p_trip_version:null,p_goal_version:x.r.goalVersion,p_memory_basis:[],p_content:content,p_evidence_basis:[]});
const read=(x,id,revision=1)=>call(x.a,'read_result_artifact_v2',{p_artifact_id:id,p_revision:revision});

const empty={artifact:null,trip:null,evidence:[]};
async function selected(x,id,relationship='follow_up',parent=x.r.messageId){const p={p_conversation_id:x.a.conversation,p_message_id:uuid(),p_idempotency_key:uuid(),p_policy_id:x.a.policy,p_locale:'en',p_text:'Continue selected result',p_relationship:relationship,p_goal_id:x.a.goal,p_expected_goal_version:1,p_task_id:null,p_parent_message_id:parent,p_turn_id:null,p_selected_sources:{...empty,artifact:{artifactId:id,revision:1}}};const accepted=await call(x.a,'submit_assistant_message_sources_v2',p);return {p,accepted};}
const preview=(x,p,v=1)=>call(x.a,'read_assistant_message_sources_v2',{p_policy_id:x.a.policy,p_conversation_id:x.a.conversation,p_message_id:p.p_message_id,p_goal_id:x.a.goal,p_expected_goal_version:v});
run('actual v2 domain reader supports selected journey draft and decision without old v1fallback',async()=>{
 const draft={version:0,title:'Shanghai draft',days:[{id:'day1',date:'2026-10-03',items:[]}]},x=await fixture(JSON.stringify(draft)),journey=uuid();await svc('publish_result_artifact_v2',params(x,{schemaVersion:'journey-draft/1',title:'Shanghai draft',summary:'Owned immutable draft',draft,source:{kind:'task_output',taskTurnId:x.r.turnId},actions:[]},journey));const chosen=await selected(x,journey);assert.equal((await preview(x,chosen.p)).artifact.content.schemaVersion,'journey-draft/1');
 const y=await fixture(),cmp=uuid(),decision=uuid();await svc('publish_result_artifact_v2',params(y,comparison,cmp));await svc('publish_result_artifact_v2',params(y,{schemaVersion:'decision/1',title:'Choose area',summary:'Pending owner choice',comparisonRef:{artifactId:cmp,revision:1},state:'pending',chosenOptionId:null,actions:[]},decision));const selectedDecision=await selected(y,decision);assert.equal((await preview(y,selectedDecision.p)).artifact.content.state,'pending');
});
run('practical translation uses actual domain projection; hide causes source refusal, not latest fallback',async()=>{
 const x=await fixture(),turn=uuid(),thread=uuid(),p=translationPrompt({sourceLocale:'en',targetLocale:'zh',text:'Gate 3'});await call(x.a,'submit_text_turn',{p_thread_id:thread,p_turn_id:turn,p_idempotency_key:uuid(),p_policy_id:x.a.policy,p_locale:'zh',p_text:p});await db(`update turn_private.text_content set output_kind='answered',output_text='{"translation":"3号门","backTranslation":"Gate 3"}' where turn_id='${turn}';select turn_private.terminal('${turn}','completed',1);`);
 const id=uuid(),content={schemaVersion:'practical/1',kind:'translation',sourceTurnId:turn,sourceLocale:'en',targetLocale:'zh',translation:'3号门',backTranslation:'Gate 3',actions:[]};await svc('publish_result_artifact_v2',params(x,content,id));const s=await selected(x,id);assert.equal((await preview(x,s.p)).artifact.content.translation,'3号门');
 await db(`update turn_private.text_content set hidden_at=now() where turn_id='${turn}';`);assert.notEqual((await raw(x.a,'read_assistant_message_sources_v2',{p_policy_id:x.a.policy,p_conversation_id:x.a.conversation,p_message_id:s.p.p_message_id,p_goal_id:x.a.goal,p_expected_goal_version:1})).code,0);
});
run('new domain exact comparison historical self-amend remains first-party previous reference',async t=>{
 const x=await fixture(),id=uuid();await svc('publish_result_artifact_v2',params(x,comparison,id));const s=await selected(x,id,'amendment');assert.equal(s.accepted.selectedSources.artifact.purpose,'previous_result_reference');const historical=await preview(x,s.p,2);assert.equal(historical.artifact.current,false);assert.equal(historical.artifact.historicalReadable,true);assert.equal(historical.recipient,'first_party');assert.equal(historical.readyForProvider,false);
 t.diagnostic(JSON.stringify({network:'none',container,domainSource:'68bd4b4 actual checkout',sourceAdapter:'120000 appended',old090Modified:false,providerCalls:0}));
});
