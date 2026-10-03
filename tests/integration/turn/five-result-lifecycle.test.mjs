import {parseResultArtifactReadV2,parseResultSearchPageV2} from '../../../lib/server/artifacts/result-v2-contract.ts';
import {translationPrompt} from '../../../lib/server/media-translation/text/contract.ts';
// Current repository migrations on disposable PostgreSQL; synthetic actor
// claims/providers only. No historical Git objects or target fallback.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_TURN_DB_TEST==='1',container='vpj79-five-results-'+uuid().slice(0,8);
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
run('five-type migration current source installs with API ACL and validates closed types',async()=>{
 assert.equal(await db("select has_function_privilege('anon','public.publish_result_artifact_v2(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,integer,integer,jsonb,jsonb,jsonb)','EXECUTE');"),'f');
 assert.equal(await db(`select turn_private.valid_result_content_v2(${lit({...comparison,actions:[{url:'https://example.test'}]})}::jsonb);`),'f');
});
run('comparison and decision share atomic revision/events and explicit owner choice CAS; service cannot choose',async()=>{
 const x=await fixture(),cmp=uuid();assert.equal((await svc('publish_result_artifact_v2',params(x,comparison,cmp))).kind,'published');assert.ok(parseResultArtifactReadV2(await read(x,cmp)));
 const content={schemaVersion:'decision/1',title:'Choose an area',summary:'Pending owner choice',comparisonRef:{artifactId:cmp,revision:1},state:'pending',chosenOptionId:null,actions:[]},decision=uuid();await svc('publish_result_artifact_v2',params(x,content,decision));assert.ok(parseResultArtifactReadV2(await read(x,decision)));
 const op=uuid(),choice={p_artifact_id:decision,p_expected_revision:1,p_operation_id:op,p_option_id:'jingan'},selected=await call(x.a,'choose_result_decision_v2',choice);assert.equal(selected.kind,'selected');assert.equal(selected.revision,2);assert.equal((await call(x.a,'choose_result_decision_v2',choice)).reused,true);
 const result=await read(x,decision,2);assert.equal(result.content.state,'chosen');assert.ok(parseResultArtifactReadV2(result));assert.equal((await read(x,decision,1)).current,false);
 const page=await call(x.a,'search_result_artifacts_v2',{p_query:'',p_cursor:null});assert.ok(parseResultSearchPageV2(page));assert.equal(page.results.length,2);
 const foreign=await owner('local_synthetic');assert.equal((await call(foreign,'read_result_artifact_v2',{p_artifact_id:decision,p_revision:2})).kind,'empty');
 const bad=await sql(container,"set role service_role;set request.jwt.claim.role='service_role';select public.publish_result_artifact_v2("+Object.entries(params(x,{...content,state:'chosen',chosenOptionId:'jingan'})).map(([k,v])=>k+'=>'+lit(v)).join(',')+');');assert.notEqual(bad.code,0);assert.match(bad.stderr,/OWNER_CHOICE_REQUIRED/);
 assert.equal(await db(`select count(*) from turn_private.result_events where artifact_id='${decision}';`),'2');
});
run('journey task draft is immutable domain preview; practical content comes from real saved translation projection',async()=>{
 const draft={version:0,title:'Shanghai draft',days:[{id:'day1',date:'2026-10-03',items:[{id:'i1',dayId:'day1',title:'Visit'}]}]},x=await fixture(JSON.stringify(draft)),journey=uuid();
 const content={schemaVersion:'journey-draft/1',title:'Shanghai draft',summary:'Not a saved Trip',draft,source:{kind:'task_output',taskTurnId:x.r.turnId},actions:[]};await svc('publish_result_artifact_v2',params(x,content,journey));assert.ok(parseResultArtifactReadV2(await read(x,journey)));
 const t=uuid(),thread=uuid(),prompt=translationPrompt({sourceLocale:'en',targetLocale:'zh',text:'Gate 3'});await call(x.a,'submit_text_turn',{p_thread_id:thread,p_turn_id:t,p_idempotency_key:uuid(),p_policy_id:x.a.policy,p_locale:'zh',p_text:prompt});
 await db(`update turn_private.text_content set output_kind='answered',output_text='{"translation":"3号门","backTranslation":"Gate 3"}' where turn_id='${t}';select turn_private.terminal('${t}','completed',1);`);
 const practical={schemaVersion:'practical/1',kind:'translation',sourceTurnId:t,sourceLocale:'en',targetLocale:'zh',translation:'3号门',backTranslation:'Gate 3',actions:[]},id=uuid();await svc('publish_result_artifact_v2',params(x,practical,id));assert.ok(parseResultArtifactReadV2(await read(x,id)));
 await db(`update turn_private.text_content set hidden_at=now() where turn_id='${t}';`);assert.equal((await read(x,id)).kind,'unavailable');
});
run('Trip snapshot/proposal preview/reference share real domain basis; new Trip/proposal bases invalidate without executing a change',async()=>{
 const a=await owner('local_synthetic'),trip=uuid();await db(`insert into public.trips(id,owner_id,title) values('${trip}','${a.owner}','Owned Trip');`);
 await call(a,'set_assistant_goal_trip_link_v1',{p_operation_id:uuid(),p_conversation_id:a.conversation,p_goal_id:a.goal,p_source_message_id:a.source,p_expected_goal_scope_version:1,p_expected_link_version:0,p_action:'link',p_trip_id:trip,p_expected_trip_version:0,p_confirmed:true});
 const task=uuid(),turn=uuid(),thread=uuid(),message=uuid();await call(a,'submit_service_task_turn',{p_thread_id:thread,p_turn_id:turn,p_idempotency_key:uuid(),p_policy_id:a.policy,p_locale:'en',p_text:'Typed Trip draft',p_task_id:task,p_scope_version:1,p_relationship:'new_goal',p_parent_turn_id:null});
 await call(a,'submit_assistant_message_v1',{p_conversation_id:a.conversation,p_message_id:message,p_idempotency_key:uuid(),p_policy_id:a.policy,p_locale:'en',p_text:'Trip draft result',p_relationship:'follow_up',p_goal_id:a.goal,p_expected_goal_version:2,p_task_id:task,p_parent_message_id:a.source,p_turn_id:null});
 await db(`update turn_private.text_content set output_kind='answered',output_text='Typed result' where turn_id='${turn}';select turn_private.terminal('${turn}','completed',1);`);
 const x={a,r:{taskId:task,turnId:turn,messageId:message,goalVersion:2}},snap=JSON.parse(await db(`select content||jsonb_build_object('version',0) from public.trip_version_snapshots where trip_id='${trip}' and version=0;`)),id=uuid(),content={schemaVersion:'journey-draft/1',title:'Owned Trip',summary:'Immutable snapshot',draft:snap,source:{kind:'trip_snapshot',tripId:trip,tripVersion:0},actions:[]};
 const bound=(c,id)=>({...params(x,c,id),p_trip_id:trip,p_trip_version:0});await svc('publish_result_artifact_v2',bound(content,id));assert.ok(parseResultArtifactReadV2(await read(x,id)));
 const proposal=uuid();await db(`insert into public.trip_proposals(id,owner_id,trip_id,revision,base_trip_version,status,patch,expires_at) values('${proposal}','${a.owner}','${trip}',1,0,'pending','{"title":"Preview Title"}',now()+interval '1 day');`);
 const preview=JSON.parse(await db(`select public.apply_trip_content_patch(content,'{"title":"Preview Title"}')||jsonb_build_object('version',1) from public.trip_version_snapshots where trip_id='${trip}' and version=0;`)),draftId=uuid(),previewContent={schemaVersion:'journey-draft/1',title:'Preview Title',summary:'Not confirmed',draft:preview,source:{kind:'proposal_preview',proposalId:proposal,proposalRevision:1},actions:[]};
 await svc('publish_result_artifact_v2',bound(previewContent,draftId));assert.ok(parseResultArtifactReadV2(await read(x,draftId)));
 const reference=uuid();await svc('publish_result_artifact_v2',bound({schemaVersion:'change-proposal-reference/1',proposalId:proposal,proposalRevision:1,actions:[]},reference));assert.ok(parseResultArtifactReadV2(await read(x,reference)));
 assert.equal(await db(`select head_version from public.trips where id='${trip}';`),'0');
 await db(`update public.trip_proposals set revision=2 where id='${proposal}';`);assert.equal((await read(x,reference)).kind,'unavailable');assert.equal((await read(x,draftId)).current,false);
 // Synthetic committed new domain base: this result writer itself never calls Trip confirmation/mutation.
 await db(`update public.trips set head_version=1 where id='${trip}';`);assert.equal((await read(x,id)).current,false);
});
run('canonical knowledge evidence revocation, CAS rollback, export and cascading source deletion protect every result',async()=>{
 const x=await fixture(),author=await owner('local_synthetic'),reviewer=await owner('local_synthetic');
 await db(`update knowledge_review_private.settings set enabled=true;update knowledge_review_private.publication_settings set enabled=true;insert into knowledge_review_private.members(actor_id,active) values('${author.owner}',true),('${reviewer.owner}',true);`);
 const source={sourceKey:'result-evidence-fixture',revisionLabel:'one',publisher:'Synthetic',uri:'urn:vpj15:synthetic:results',locator:'Fixture',snippet:'PRIVATE SOURCE MUST NOT COPY',usageDeclaration:'Synthetic'},statement={schemaVersion:'knowledge-statement/1',assertion:{subjectId:'rail_eticket_boarding',predicate:'requires_document',objectId:'original_valid_booking_id',conditions:[],exclusions:[]},scope:{cities:['shanghai'],scene:'rail',audience:'international_independent_traveler'},expressions:{en:{text:'Synthetic evidence',conditions:[],exclusions:[]},zh:{text:'合成依据',conditions:[],exclusions:[]}},sources:[source]},candidate=uuid();
 await call(author,'ops_review_workspace',{p_input:{action:'submit_statement',operationId:uuid(),candidateId:candidate,title:'Evidence',statement}});await call(reviewer,'ops_review_workspace',{p_input:{action:'review',operationId:uuid(),candidateId:candidate,expectedVersion:1,decision:'reviewed',note:'Independent synthetic review'}});await call(reviewer,'ops_review_workspace',{p_input:{action:'publish_statement',operationId:uuid(),candidateId:candidate,expectedVersion:2,expiresAt:new Date(Date.now()+3600000).toISOString(),useBasis:'original_factual_summary',useNote:'Synthetic'}});
 const evidence=JSON.parse(await db(`select jsonb_build_object('factId',p.fact_id,'assertionId',s.statement_id,'assertionRevision',s.revision,'city','shanghai','scene','rail') from knowledge_review_private.publications p join knowledge_review_private.statements s using(candidate_id) where candidate_id='${candidate}';`)),id=uuid(),p={...params(x,comparison,id),p_evidence_basis:[evidence]};await svc('publish_result_artifact_v2',p);const got=await read(x,id);assert.deepEqual(got.basis.evidence,[evidence]);assert.ok(parseResultArtifactReadV2(got));
 const exported=await svc('result_artifact_export_owner_v1',{p_owner:x.a.owner,p_section:'revisions',p_cursor:null,p_limit:100});assert.ok(JSON.stringify(exported).includes('evidenceBasis'));assert.equal(JSON.stringify(exported).includes('PRIVATE SOURCE'),false);
 const before=await db(`select count(*) from turn_private.result_events where artifact_id='${id}';`),invalid={...p,p_expected_revision:9,p_idempotency_key:uuid()};const failed=await sql(container,"set role service_role;set request.jwt.claim.role='service_role';select public.publish_result_artifact_v2("+Object.entries(invalid).map(([k,v])=>k+'=>'+lit(v)).join(',')+');');assert.notEqual(failed.code,0);assert.match(failed.stderr,/REVISION_CONFLICT/);assert.equal(await db(`select count(*) from turn_private.result_events where artifact_id='${id}';`),before);
 await call(reviewer,'ops_review_workspace',{p_input:{action:'revoke_statement',operationId:uuid(),candidateId:candidate,expectedPublicationVersion:1,note:'Withdrawn synthetic'}});assert.equal((await read(x,id)).kind,'unavailable');assert.equal((await call(x.a,'search_result_artifacts_v2',{p_query:'',p_cursor:null})).results.length,0);
 const y=await fixture(),cmp=uuid(),dec=uuid();await svc('publish_result_artifact_v2',params(y,comparison,cmp));await svc('publish_result_artifact_v2',params(y,{schemaVersion:'decision/1',title:'Choice',summary:'Pending',comparisonRef:{artifactId:cmp,revision:1},state:'pending',chosenOptionId:null,actions:[]},dec));await db(`delete from turn_private.result_artifacts where id='${cmp}';`);assert.equal(await db(`select count(*) from turn_private.result_artifacts where id='${dec}';`),'0');
});
run('publication retry cannot manufacture a current receipt after source consent withdrawal',async()=>{
 const x=await fixture(),p=params(x,comparison);await svc('publish_result_artifact_v2',p);assert.equal((await svc('publish_result_artifact_v2',p)).reused,true);
 await db(`update turn_private.text_consents set revoked_at=now() where owner_id='${x.a.owner}' and policy_id='${x.a.policy}';`);
 const r=await sql(container,"set role service_role;set request.jwt.claim.role='service_role';select public.publish_result_artifact_v2("+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');');assert.notEqual(r.code,0);assert.match(r.stderr,/STALE_BASIS/);assert.equal(await db(`select count(*) from turn_private.result_revisions where artifact_id='${p.p_artifact_id}';`),'1');
});
