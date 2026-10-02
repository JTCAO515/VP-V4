// Explicit network-none preparation only; all dependencies from this current checkout.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid,createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFileSync,readdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_TURN_DB_TEST==='1',container='vpj78-journal-'+uuid().slice(0,8);

let created=false;
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const lit=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const query=(a,name,p)=>`begin;set role authenticated;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.owner}';set request.jwt.claims='${JSON.stringify({session_id:a.session})}';select public.${name}(`+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');commit;';
const call=async(a,name,p)=>{const r=await sql(container,query(a,name,p));assert.equal(r.code,0,r.stderr);return JSON.parse(r.stdout.trim());};
const memoryCall=async(a,name,p)=>{const r=await sql(container,query(a,name,p).replace('select public.',"select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from public.").replace(');commit;',') m;commit;'));assert.equal(r.code,0,r.stderr);return JSON.parse(r.stdout.trim());};
const projection={schemaVersion:'stay-area-intake/1',city:'shanghai',comparisonTarget:'area_transport',durationDays:10,partySize:2,interests:['food','photography'],pace:'relaxed',lodgingBudget:null,dates:null,mobilityConstraints:[]};
const notice='a'.repeat(64);
async function owner(environment='local_synthetic',locale='en',goalText='First China visit, ten days with partner, food and photography, relaxed pace.',memory=false){
 const a={owner:uuid(),session:uuid(),policy:uuid(),planningPolicy:uuid(),conversation:uuid(),goal:uuid(),source:uuid()};
 await db(`insert into auth.users(id) values('${a.owner}');insert into identity_private.mobile_accounts(owner_id) values('${a.owner}');insert into auth.sessions(id,user_id) values('${a.session}','${a.owner}');
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
const correction=a=>({...a.input,p_message_id:uuid(),p_parent_message_id:a.source,p_expected_goal_version:1,p_expected_intake_revision:1,p_idempotency_key:uuid(),p_text:'Explicit full correction to balanced pace',p_relationship:'amendment',p_intake:{...projection,pace:'balanced'}});
const state=a=>db(`select jsonb_build_object('goalVersion',g.scope_version,'text',g.current_text,'sequence',c.next_sequence,'messages',(select count(*) from turn_private.assistant_messages where goal_id=g.id),'intakes',(select count(*) from turn_private.assistant_travel_intakes where goal_id=g.id),'tasks',(select count(*) from turn_private.service_tasks where owner_id=g.owner_id),'work',(select count(*) from turn_private.work where owner_id=g.owner_id),'planning',(select count(*) from turn_private.planning_comparisons where owner_id=g.owner_id),'capacity',(select count(*) from turn_private.service_task_capacity where owner_id=g.owner_id),'attempts',(select count(*) from public.model_budget_attempts b join public.model_budget_scopes s on s.id=b.scope_id where s.owner_id=g.owner_id)) from turn_private.assistant_goals g join turn_private.assistant_conversations c on c.id=g.conversation_id where g.id='${a.goal}';`);
before(async()=>{
 if(!enabled)return;
 const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(r.code,0,r.stderr);created=true;
 for(let n=0;n<100;n++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');


});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
const v2=a=>({...planning(a),p_expected_intake_message_id:a.source,p_expected_source_sequence:1,p_expected_intake_revision:1,p_expected_intake_digest:a.receipt.contextDigest,p_intake:projection});
const bound=async(a,r,lease=null)=>JSON.parse(await db(`select turn_private.read_planning_qualified_intake_v1('${a.owner}','${r.turnId}',${lit(lease)});`));

const svc=async(name,p)=>JSON.parse(await db("set role service_role;set request.jwt.claim.role='service_role';select public."+name+'('+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');'));
async function fixture(memory=false,mode='v2'){const a=await owner('local_synthetic','en','Synthetic model binding fixture',memory),r=mode==='v2'?await call(a,'submit_planning_comparison_v2',v2(a)):await call(a,'submit_planning_comparison_v1',planning(a)),lease=uuid(),scope=uuid(),attempt=uuid();await db(`update turn_private.work set state='leased',lease_token='${lease}',expires_at=clock_timestamp()+interval '120 seconds' where turn_id='${r.turnId}';
 insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at) values('${scope}','${a.owner}','CNY',10000,1000,3,3,true,now()+interval '1 day');insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled) values('${scope}','qwen','synthetic-model','synthetic-v1',10000,1000,true);`);
 assert.deepEqual(await svc('reserve_model_budget',{p_scope_id:scope,p_owner_id:a.owner,p_task_id:r.taskId,p_attempt_id:attempt,p_provider:'qwen',p_model:'synthetic-model',p_price_version:'synthetic-v1',p_reserved_micros:10}),{kind:'reserved'});return {a,r,lease,scope,attempt};}
const blocked={kind:'blocked'},args=x=>[x.a.owner,x.r.taskId,x.r.turnId,x.lease,x.a.policy,x.a.planningPolicy,x.scope,x.attempt,'qwen','synthetic-model','synthetic-v1',x.r.intakeContextDigest,x.r.planningContextDigest];
const privateQuery=(name,p)=>`select turn_private.${name}(${p.map(lit).join(',')});`;
const invoke=async(name,x,p=args(x))=>JSON.parse(await db(privateQuery(name,p)));
const bind=x=>invoke('bind_planning_v2_model_attempt_v1',x),read=x=>invoke('read_planning_v2_model_binding_v1',x),unknown=x=>invoke('unknown_planning_v2_model_attempt_v1',x);
const ledger=x=>db(`select jsonb_agg(to_jsonb(a)) from public.model_budget_attempts a where task_id='${x.r.taskId}';`),stored=x=>db(`select coalesce(jsonb_agg(to_jsonb(b)),'[]') from turn_private.planning_v2_model_attempt_bindings b where turn_id='${x.r.turnId}';`);
const dispatch=x=>svc('dispatch_model_budget',{p_scope_id:x.scope,p_owner_id:x.a.owner,p_attempt_id:x.attempt});
const finish=(x,action,actual=null)=>svc('finish_model_budget',{p_scope_id:x.scope,p_owner_id:x.a.owner,p_attempt_id:x.attempt,p_action:action,p_actual_micros:actual});
const tupleKeys=['owner','task','turn','lease','textPolicy','planningPolicy','scope','attempt','provider','model','priceVersion','intakeDigest','planningDigest'];
const fixedTuple=['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000008','qwen','qwen3.7-plus-2026-05-26','synthetic-v1','a'.repeat(64),'b'.repeat(64)];
const binding=Object.fromEntries(tupleKeys.map((k,i)=>[k,fixedTuple[i]])),requestId='00000000-0000-0000-0000-000000000009';
const prompt=`You are selecting which of two Shanghai stay-area options deserves attention based only on the supplied current goal, explicit memories and observed rail-access metrics.
Return exactly one JSON object: {"highlight":"jingan"}, {"highlight":"peoples_square"}, or {"highlight":"none"}.
Do not invent hotel prices, availability, safety, walking access, bookings, sources, or Trip changes. Missing or conflicting evidence means "none". This selection is advisory; domain code will construct the factual comparison.`;
const payload=text=>({model:binding.model,messages:[{role:'system',content:prompt},{role:'user',content:text}],stream:false,max_tokens:128,enable_thinking:false,response_format:{type:'json_object'}});
const sha=s=>createHash('sha256').update(s).digest('hex');
const serialize=(t,id,p)=>db(`select turn_private.serialize_planning_v2_request_v1(${lit(t)}::jsonb,${lit(id)},${lit(p)}::jsonb);`).then(v=>v?JSON.parse(v):null);
run('real SQL request bytes equal lowercase shared golden hashes and JS Unicode/control/65536 boundaries',async t=>{
 const texts=['Shanghai rail comparison','上海 "引号"\\路径\n\t é é 😀 \u2028','😀\b\f\n\r\t\u0001\u000b'];
 for(const text of texts){const p=payload(text),body=JSON.stringify(p),pd=sha(body),rd=sha(JSON.stringify(['planning-v2-model-request/1',fixedTuple,requestId,pd])),r=await serialize(binding,requestId,p);assert.equal(r.body,body);assert.equal(r.payloadDigest,pd);assert.equal(r.requestDigest,rd);assert.equal(r.executionAvailable,false);}
 assert.equal((await serialize(binding,requestId,payload(texts[0]))).payloadDigest,'2e7dad093f1d5a2a222edf52d1734e3b3da5666021e3ac8eefd73efaef6695bd');
 assert.equal((await serialize(binding,requestId,payload(texts[1]))).requestDigest,'bc38245050e58039ce5eb580b6b9d18335be5963354058399cb858ffb0823a1c');
 const n=65536-Buffer.byteLength(JSON.stringify(payload(''))),text='\u0001'.repeat(Math.floor(n/6))+'x'.repeat(n%6);assert.equal(Buffer.byteLength((await serialize(binding,requestId,payload(text))).body),65536);assert.equal(await serialize(binding,requestId,payload(text+'x')),null);
 assert.equal(await serialize({...binding,owner:'ABCDEFAB-0000-0000-0000-000000000001'},requestId,payload('x')),null);assert.equal(await serialize(binding,requestId,payload('\uFEFF')),null);
 t.diagnostic(JSON.stringify({goldenSource:'4cc lowercase vectors, superseded final9c9 UUID rule',network:'none',container,providerCalls:0}));
});

run('SQL independently validates closed output and recomputes exact fixed TS digest bytes',async t=>{
 const source=gunzipSync(readFileSync('tests/integration/turn/fixtures/planning-v2-pure-output-9c9c96cc.ts.gz')),folder=mkdtempSync(join(tmpdir(),'journal-pure-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));const file=join(folder,'pure.ts');writeFileSync(file,source.toString().replace('"../model-gateway/budget/usage-receipt.ts"',JSON.stringify(pathToFileURL(resolve('lib/server/model-gateway/budget/usage-receipt.ts')).href)));const {createPlanningV2ModelOutputReceipt:create}=await import(pathToFileURL(file).href);
 const raw={schemaVersion:'planning-v2-model-output/1',binding,output:{highlight:'none'},observedAt:'2026-10-03T00:00:01.000Z',usageReceipt:{schemaVersion:'validated-planning-usage/1',attempt:{scopeId:binding.scope,ownerId:binding.owner,taskId:binding.task,attemptId:binding.attempt,provider:'qwen',model:binding.model,priceVersion:binding.priceVersion,reservedMicros:10,timeoutMs:1000},turnId:binding.turn,policyId:binding.planningPolicy,usage:{inputTokens:12,outputTokens:8,totalTokens:20,cachedInputTokens:null,uncachedInputTokens:null,reasoningTokens:null,cost:'unknown'},actualMicros:0,observedAt:'2026-10-03T00:00:00.000Z'}};
 const w=create(raw,binding);assert.ok(w);const valid=async v=>await db(`select turn_private.validate_planning_v2_output_v1(${lit(v)}::jsonb,${lit(binding)}::jsonb);`)==='t';assert.equal(await valid(w),true);
 for(const v of [{...w,output:{highlight:'jingan'}},{...w,usageReceipt:{...w.usageReceipt,actualMicros:1}},{...w,usageDigest:'0'.repeat(64)},{...w,binding:{...binding,owner:'ABCDEFAB-0000-0000-0000-000000000001'}},{...w,extra:true}])assert.equal(await valid(v),false);
 const changed=create({...raw,output:{highlight:'jingan'},usageReceipt:{...raw.usageReceipt,usage:{...raw.usageReceipt.usage,cachedInputTokens:0,uncachedInputTokens:12,reasoningTokens:0},actualMicros:3}},binding);assert.ok(changed);assert.equal(await valid(changed),true);
});
