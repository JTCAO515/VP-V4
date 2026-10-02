// Explicit network-none preparation only; all dependencies from this current checkout.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../integration/cost/fixtures/postgres-rpc.mjs';
import {projectQualifiedIntakeComparison} from '../../lib/server/artifacts/qualified-intake-comparison.ts';
const enabled=process.env.VPJ79_QUALIFIED_COMPARISON_PREP==='1',container='vpj79-qualified-'+uuid().slice(0,8);
const mine='20261003030000_vpj79_private_qualified_comparison.sql';
let created=false;
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const lit=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const query=(a,name,p)=>`begin;set role authenticated;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({session_id:a.session})}';select public.${name}(`+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');commit;';
const call=async(a,name,p)=>{const r=await sql(container,query(a,name,p));assert.equal(r.code,0,r.stderr);return JSON.parse(r.stdout.trim());};
const projection={schemaVersion:'stay-area-intake/1',city:'shanghai',comparisonTarget:'area_transport',durationDays:10,partySize:2,interests:['food','photography'],pace:'relaxed',lodgingBudget:null,dates:null,mobilityConstraints:[]};
const notice='a'.repeat(64);
async function owner(environment='local_synthetic',locale='en',goalText='First China visit, ten days with partner, food and photography, relaxed pace.'){
 const a={owner:uuid(),session:uuid(),policy:uuid(),planningPolicy:uuid(),conversation:uuid(),goal:uuid(),source:uuid()};
 await db(`insert into auth.users(id) values('${a.owner}');insert into identity_private.mobile_accounts(owner_id) values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');
 insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at)
 values('${a.policy}','qwen','synthetic only','https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions','fixture','fixture','fixture','test','test','${notice}','合成','Synthetic','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day');
 insert into turn_private.planning_policies(id,text_policy_id,environment,notice_version,notice_hash,notice_zh,notice_en,effective_at,expires_at)
 values('${a.planningPolicy}','${a.policy}','${environment}','test','${notice}','合成','Synthetic',now()-interval '1 hour',now()+interval '1 day');`);
 await call(a,'accept_text_policy',{p_policy_id:a.policy,p_notice_hash:notice});await call(a,'accept_planning_policy_v1',{p_policy_id:a.planningPolicy,p_notice_hash:notice});
 a.input={p_conversation_id:a.conversation,p_goal_id:a.goal,p_message_id:a.source,p_parent_message_id:null,p_expected_goal_version:null,p_expected_intake_revision:0,p_idempotency_key:uuid(),p_policy_id:a.policy,p_locale:locale,p_text:goalText,p_relationship:'goal_start',p_intake:projection,p_memory_basis:[]};
 a.receipt=await call(a,'submit_assistant_travel_intake_v1',a.input);return a;
}
const planning=a=>({p_conversation_id:a.conversation,p_goal_id:a.goal,p_expected_goal_version:1,p_parent_message_id:a.source,p_message_id:uuid(),p_message_key:uuid(),p_thread_id:uuid(),p_turn_id:uuid(),p_task_id:uuid(),p_task_key:uuid(),p_text_policy_id:a.policy,p_planning_policy_id:a.planningPolicy,p_locale:a.input.p_locale,p_text:'Compare Shanghai areas',p_memory_basis:[]});
const correction=a=>({...a.input,p_message_id:uuid(),p_parent_message_id:a.source,p_expected_goal_version:1,p_expected_intake_revision:1,p_idempotency_key:uuid(),p_text:'Explicit full correction to balanced pace',p_relationship:'amendment',p_intake:{...projection,pace:'balanced'}});
const state=a=>db(`select jsonb_build_object('goalVersion',g.scope_version,'text',g.current_text,'sequence',c.next_sequence,'messages',(select count(*) from turn_private.assistant_messages where goal_id=g.id),'intakes',(select count(*) from turn_private.assistant_travel_intakes where goal_id=g.id),'tasks',(select count(*) from turn_private.service_tasks where owner_id=g.owner_id),'work',(select count(*) from turn_private.work where owner_id=g.owner_id),'planning',(select count(*) from turn_private.planning_comparisons where owner_id=g.owner_id),'capacity',(select count(*) from turn_private.service_task_capacity where owner_id=g.owner_id),'attempts',(select count(*) from public.model_budget_attempts b join public.model_budget_scopes s on s.id=b.scope_id where s.owner_id=g.owner_id)) from turn_private.assistant_goals g join turn_private.assistant_conversations c on c.id=g.conversation_id where g.id='${a.goal}';`);
before(async()=>{
 if(!enabled)return;
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(r.code,0,r.stderr);created=true;
 for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f!==mine).sort())await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
 const migration=readFileSync('supabase/migrations/'+mine,'utf8');await db('begin;'+migration+'rollback;');assert.equal(await db("select to_regprocedure('turn_private.project_planning_qualified_comparison_v1(uuid,uuid,uuid,text,text,jsonb,text)') is null;"),'t');await db('begin;'+migration+'commit;');
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
const v2=a=>({...planning(a),p_expected_intake_message_id:a.source,p_expected_source_sequence:1,p_expected_intake_revision:1,p_expected_intake_digest:a.receipt.contextDigest,p_intake:projection});
const bound=async(a,r,lease=null)=>JSON.parse(await db(`select turn_private.read_planning_qualified_intake_v1('${a.owner}','${r.turnId}',${lit(lease)});`));
const place=()=>({schemaVersion:'planning-place/1',source:'synthetic_fixture',observedAt:new Date().toISOString(),providerCalls:13,areas:[{id:'jingan',label:'unverified food claim must not display',railMinutes:24,transfers:1},{id:'peoples_square',label:'人民广场',railMinutes:12,transfers:null}]});
const project=async(a,r,p,locale=a.input.p_locale,lease=null,digests={})=>JSON.parse((await db(`select turn_private.project_planning_qualified_comparison_v1('${a.owner}','${r.turnId}',${lit(lease)},${lit(digests.intake??r.intakeContextDigest)},${lit(digests.planning??r.planningContextDigest)},${lit(p)}::jsonb,${lit(locale)});`))||'null');
const validates=async(a,r,p,content,locale=a.input.p_locale)=>await db(`select turn_private.valid_planning_qualified_comparison_v1('${a.owner}','${r.turnId}',null,${lit(r.intakeContextDigest)},${lit(r.planningContextDigest)},${lit(p)}::jsonb,${lit(locale)},${lit(content)}::jsonb);`);
run('fixed current binding yields exact TS projection in en/zh, no action/storage/execution authority and transactional migration rollback',async t=>{
 t.diagnostic(JSON.stringify({dependencies:'all current checkout migrations',network:'none',container}));
 for(const locale of ['en','zh']){const a=await owner('local_synthetic',locale),r=await call(a,'submit_planning_comparison_v2',v2(a)),context=await bound(a,r),p=place(),before=await state(a),s=await project(a,r,p),q=context.qualifiedIntake;
  const expected={conversationId:q.conversationId,goalId:q.goalId,goalVersion:q.goalVersion,messageId:q.messageId,messageSequence:q.messageSequence,intakeRevision:q.intakeRevision,contextDigest:q.contextDigest,memoryBasis:q.memoryBasis};
  assert.deepEqual(s,projectQualifiedIntakeComparison(q,expected,p,locale,Date.now(),'local_synthetic'));assert.equal(await validates(a,r,p,s.content),'t');assert.equal(s.readyForPublication,false);assert.equal(s.readyForProvider,false);assert.equal(await state(a),before);
  assert.equal(await db(`select count(*) from turn_private.result_artifacts where id='${r.artifactId}';`),'0');assert.equal(await db(`select count(*) from turn_private.result_events where artifact_id='${r.artifactId}';`),'0');
  for(const forged of [{...s.content,summary:'Best food and quiet hotel'}, {...s.content,actions:[{type:'confirm',url:'https://example.test'}]},{...s.content,options:[...s.content.options].reverse()}])assert.equal(await validates(a,r,p,forged),'f');
 }
});
run('wrong owner/source/lease/digests/locale and observation source/time/schema/ranges never produce a valid projection',async()=>{
 const a=await owner(),r=await call(a,'submit_planning_comparison_v2',v2(a)),p=place();
 for(const args of [[{...a,owner:uuid()},r,p],[a,{...r,turnId:uuid()},p],[a,r,p,'en',uuid()],[a,r,p,'zh'],[a,r,p,'en',null,{intake:'b'.repeat(64)}],[a,r,p,'en',null,{planning:'b'.repeat(64)}]])assert.equal(await project(...args),null);
 for(const bad of [null,{}, {...p,source:'invented'}, {...p,source:'amap'}, {...p,providerCalls:14},{...p,observedAt:'2026-02-30T00:00:00Z'},{...p,observedAt:new Date(Date.now()-301000).toISOString()},{...p,observedAt:new Date(Date.now()+6000).toISOString()}, {...p,hotelPrice:10},{...p,areas:[p.areas[0],p.areas[0]]},{...p,areas:[{...p.areas[0],railMinutes:181},p.areas[1]]}])assert.equal(await project(a,r,bad),null);
 const lease=uuid();await db(`update turn_private.work set state='leased',lease_token='${lease}',expires_at=clock_timestamp()+interval '60 seconds' where turn_id='${r.turnId}';`);assert.ok(await project(a,r,p,'en',lease));await db(`update turn_private.work set expires_at=clock_timestamp()-interval '1 second' where turn_id='${r.turnId}';`);assert.equal(await project(a,r,p,'en',lease),null);
});
run('ordinary explicit correction, source hide and consent withdrawal invalidate the old bridge binding without historical fallback',async()=>{
 for(const mutation of ['correction','hide','consent']){const a=await owner(),r=await call(a,'submit_planning_comparison_v2',v2(a)),p=place();assert.ok(await project(a,r,p));
  if(mutation==='correction')await call(a,'submit_assistant_travel_intake_v1',{...a.input,p_message_id:uuid(),p_parent_message_id:r.messageId,p_expected_goal_version:r.goalVersion,p_expected_intake_revision:r.intakeRevision,p_idempotency_key:uuid(),p_relationship:'amendment',p_intake:{...projection,pace:'balanced'}});
  if(mutation==='hide')await db(`update turn_private.text_content set hidden_at=now() where turn_id='${r.turnId}';`);
  if(mutation==='consent')await db(`update turn_private.text_consents set revoked_at=now() where owner_id='${a.owner}' and policy_id='${a.policy}';`);
  assert.equal(await project(a,r,p),null);
 }
});
run('all API roles cannot execute private functions and valid preparation cannot remove v2 completion hard fences',async()=>{
 const a=await owner(),r=await call(a,'submit_planning_comparison_v2',v2(a)),p=place(),prepared=await project(a,r,p);
 for(const role of ['anon','authenticated','service_role'])for(const signature of ['project_planning_qualified_comparison_v1(uuid,uuid,uuid,text,text,jsonb,text)','valid_planning_qualified_comparison_v1(uuid,uuid,uuid,text,text,jsonb,text,jsonb)'])assert.equal(await db(`select has_function_privilege('${role}','turn_private.${signature}','EXECUTE');`),'f');
 const before=await state(a),lease=uuid();await db(`update turn_private.work set state='leased',lease_token='${lease}',expires_at=clock_timestamp()+interval '60 seconds' where turn_id='${r.turnId}';`);
 const completion=await sql(container,`set role service_role;set request.jwt.claim.role='service_role';select public.complete_planning_comparison_v1('${r.turnId}','${a.owner}','${lease}','${'a'.repeat(64)}','${uuid()}','Synthetic',${lit(prepared.content)}::jsonb);`);
 assert.equal(completion.code,0,completion.stderr);assert.ok(['blocked','stale'].includes(JSON.parse(completion.stdout.trim()).kind));assert.equal(await state(a),before);
 assert.equal(await db(`select count(*) from turn_private.result_artifacts where id='${r.artifactId}';`),'0');assert.equal(await db(`select status from public.turns where id='${r.turnId}';`),'accepted');
});
