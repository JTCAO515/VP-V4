// Actual base migrations plus fixed pre-review fixed0d949 journal SQL. Synthetic actor/ledger only.
import {createPlanningV2ModelRequest as createRequest} from '../../lib/server/turn/planning-v2-model-request.ts';
import {createPlanningV2ModelOutputReceipt as createOutput} from '../../lib/server/turn/planning-v2-model-output-receipt.ts';
import {parsePlanningV2ModelJournalRead as parseRead,parsePlanningV2ModelJournalWrite as parseWrite} from '../../lib/server/turn/planning-v2-model-journal.ts';
import {PROTOCOL_MODELS} from '../../lib/server/model-gateway/adapters/provider-protocol.ts';
import {PLANNING_COMPARISON_PROMPT} from '../../lib/server/model-gateway/prompt/planning-comparison.ts';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {command,sql} from '../integration/cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_TURN_DB_TEST==='1',container='vpj79-journal-real-'+uuid().slice(0,8);
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
 for(const file of ['20261003050000_vpj78_v2_model_attempt_binding.sql','20261003060000_vpj78_v2_model_local_journal.sql']){const fixed=await command('git',['show','0d949ad96e2bcb46ae712c9507df69812217fb8c:supabase/migrations/'+file]);assert.equal(fixed.code,0,fixed.stderr);await db('begin;'+fixed.stdout+'commit;');}
});
after(async()=>{if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);

const fields=['owner','task','turn','lease','textPolicy','planningPolicy','scope','attempt','provider','model','priceVersion','intakeDigest','planningDigest'];
const args=t=>fields.map(k=>lit(t[k])).join(',');
const privateCall=(name,x,rest)=>db(`select turn_private.${name}(${args(x.tuple)},${rest.map(lit).join(',')});`).then(JSON.parse);
const svc=(name,p)=>db("set role service_role;set request.jwt.claim.role='service_role';select public."+name+'('+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');').then(JSON.parse);
async function fixture(){
 const a=await owner('local_synthetic'),r=await call(a,'submit_planning_comparison_v2',{...planning(a),p_expected_intake_message_id:a.source,p_expected_source_sequence:1,p_expected_intake_revision:1,p_expected_intake_digest:a.receipt.contextDigest,p_intake:projection}),lease=uuid(),scope=uuid(),attempt=uuid();
 await db(`update turn_private.work set state='leased',lease_token='${lease}',expires_at=clock_timestamp()+interval '5 minutes' where turn_id='${r.turnId}';insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at) values('${scope}','${a.owner}','CNY',10000,1000,3,3,true,now()+interval '1 day');insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled) values('${scope}','qwen','${PROTOCOL_MODELS.qwen}','synthetic-v1',10000,1000,true);`);
 assert.equal((await svc('reserve_model_budget',{p_scope_id:scope,p_owner_id:a.owner,p_task_id:r.taskId,p_attempt_id:attempt,p_provider:'qwen',p_model:PROTOCOL_MODELS.qwen,p_price_version:'synthetic-v1',p_reserved_micros:10})).kind,'reserved');
 const tuple={owner:a.owner,task:r.taskId,turn:r.turnId,lease,textPolicy:a.policy,planningPolicy:a.planningPolicy,scope,attempt,provider:'qwen',model:PROTOCOL_MODELS.qwen,priceVersion:'synthetic-v1',intakeDigest:r.intakeContextDigest,planningDigest:r.planningContextDigest};
 const bound=JSON.parse(await db(`select turn_private.bind_planning_v2_model_attempt_v1(${args(tuple)});`));assert.equal(bound.kind,'model_attempt_binding');
 const requestId=uuid(),request=createRequest({schemaVersion:'planning-v2-model-request/1',binding:tuple,requestId,payload:{model:tuple.model,messages:[{role:'system',content:PLANNING_COMPARISON_PROMPT},{role:'user',content:'Synthetic 上海旅程'}],stream:false,max_tokens:128,enable_thinking:false,response_format:{type:'json_object'}}},tuple);assert.ok(request);
 const expected={binding:tuple,requestId,requestDigest:request.requestDigest,payloadDigest:request.payloadDigest,outputDigest:null,usageDigest:null};
 return {a,r,tuple,request,expected,scope,attempt};
}
const intent=x=>privateCall('create_planning_v2_request_intent_v1',x,[x.request.requestId,x.request.body,x.request.payloadDigest,x.request.requestDigest,0]);
const journal=(x,out=null)=>privateCall('read_planning_v2_request_journal_v1',x,[x.request.requestId,x.request.requestDigest,out?.outputDigest??null,out?.usageDigest??null]);
const obs=(x,kind)=>({schemaVersion:'planning-v2-local-observation/1',source:'local_observation',kind,requestId:x.request.requestId,requestDigest:x.request.requestDigest,observedAt:new Date().toISOString()});
const send=(x,o)=>privateCall('record_planning_v2_send_ack_v1',x,[x.request.requestId,x.request.requestDigest,1,o]);
const response=(x,o,w)=>privateCall('record_planning_v2_response_v1',x,[x.request.requestId,x.request.requestDigest,2,o,w]);
const dispatch=x=>svc('dispatch_model_budget',{p_scope_id:x.scope,p_owner_id:x.a.owner,p_attempt_id:x.attempt});
const finish=(x,value)=>svc('finish_model_budget',{p_scope_id:x.scope,p_owner_id:x.a.owner,p_attempt_id:x.attempt,p_action:'settle',p_actual_micros:value});
function wire(x,actualMicros=0){const b=x.tuple,observedAt=new Date().toISOString();return createOutput({schemaVersion:'planning-v2-model-output/1',binding:b,output:{highlight:'none'},observedAt,usageReceipt:{schemaVersion:'validated-planning-usage/1',attempt:{scopeId:b.scope,ownerId:b.owner,taskId:b.task,attemptId:b.attempt,provider:'qwen',model:b.model,priceVersion:b.priceVersion,reservedMicros:10,timeoutMs:1000},turnId:b.turn,policyId:b.planningPolicy,usage:{inputTokens:12,outputTokens:8,totalTokens:20,cachedInputTokens:null,uncachedInputTokens:null,reasoningTokens:null,cost:'unknown'},actualMicros,observedAt}},b);}
const decoded=(raw,x,write=false,out=null)=>{const expected={...x.expected,...(out?{outputDigest:out.outputDigest,usageDigest:out.usageDigest}:{})},parsed=(write?parseWrite:parseRead)(raw,expected);assert.ok(parsed);return parsed;};
run('real intent/send/response commits survive discarded write acknowledgments with exact qualified readback and no resend',async t=>{
 const x=await fixture();let sends=0;
 await intent(x);const initial=decoded(await journal(x),x);assert.equal(initial.phase,'intent_saved');assert.equal(initial.revision,1);assert.equal(initial.sendAckRecordedAt,null);
 assert.equal(decoded(await intent(x),x,true).reused,true);assert.equal((await dispatch(x)).kind,'dispatched');
 const ack=obs(x,'send_ack');await send(x,ack);assert.equal(decoded(await journal(x),x).phase,'send_ack_recorded');assert.equal(decoded(await send(x,ack),x,true).reused,true);
 const w=wire(x);assert.ok(w);const observation=obs(x,'response_received');await response(x,observation,w);
 const result=decoded(await journal(x,w),x,false,w);assert.equal(result.phase,'response_recorded');assert.equal(result.revision,3);assert.equal(result.outputWire.usageReceipt.actualMicros,0);assert.equal(result.providerOriginVerified,false);assert.equal(result.reconciliationRequired,true);
 assert.equal(decoded(await response(x,observation,w),x,true,w).reused,true);assert.equal(sends,0);
 assert.deepEqual(await journal(x,{...w,outputDigest:'f'.repeat(64)}),{kind:'conflict'});
 assert.equal(await db(`select count(*) from turn_private.planning_v2_model_local_journal where request_id='${x.request.requestId}';`),'1');
 assert.equal(await db(`select count(*) from turn_private.result_artifacts where id='${x.r.artifactId}';`),'0');
 t.diagnostic(JSON.stringify({source:'0d949ad96e2bcb46ae712c9507df69812217fb8c',discardedWriteACK:'controlled fixture',readKeys:Object.keys(result).length,revision:result.revision,providerSends:sends,providerOriginVerified:false}));
});
run('real SQL server timestamp truncation preserves internal microseconds and nullable phase fields for TS decoder',async()=>{
 const x=await fixture();await intent(x);
 assert.equal(await db("select turn_private.planning_v2_server_ms_v1('2026-10-03T00:00:00.123987Z'::timestamptz);"),'2026-10-03T00:00:00.123Z');assert.equal(await db("select turn_private.planning_v2_server_ms_v1(null) is null;"),'t');
 const raw=JSON.parse(await db(`select turn_private.planning_v2_journal_wire_v1(jsonb_populate_record(null::turn_private.planning_v2_model_local_journal,to_jsonb(j)||jsonb_build_object('intent_at','2026-10-03T00:00:00.123987Z'))) from turn_private.planning_v2_model_local_journal j where request_id='${x.request.requestId}';`));
 const result=decoded(raw,x);assert.equal(result.intentRecordedAt,'2026-10-03T00:00:00.123Z');assert.equal(result.responseRecordedAt,null);assert.equal(result.unknownAt,null);
 assert.equal((await db(`select extract(microseconds from '2026-10-03T00:00:00.123987Z'::timestamptz)::integer;`)),'123987');
});
run('real unknown/original lease/current source and settled-amount conflict fail closed without changing recorded phase',async()=>{
 const x=await fixture();await intent(x);await dispatch(x);await send(x,obs(x,'send_ack'));const w=wire(x);assert.ok(w);
 const marked=await privateCall('unknown_planning_v2_request_v1',x,[x.request.requestId,x.request.requestDigest,2,'ack_lost']);assert.equal(decoded(marked,x,true).revision,3);assert.ok(decoded(await journal(x),x).unknownAt);
 assert.deepEqual(await response(x,obs(x,'response_received'),w),{kind:'blocked'});
 const old=await journal({...x,tuple:{...x.tuple,lease:uuid()}});assert.deepEqual(decoded(old,x),{kind:'blocked'});
 await call(x.a,'submit_assistant_travel_intake_v1',{...x.a.input,p_message_id:uuid(),p_parent_message_id:x.r.messageId,p_expected_goal_version:x.r.goalVersion,p_expected_intake_revision:x.r.intakeRevision,p_idempotency_key:uuid(),p_relationship:'amendment',p_intake:{...projection,pace:'balanced'}});assert.deepEqual(decoded(await journal(x),x),{kind:'blocked'});
 const y=await fixture();await intent(y);await dispatch(y);await send(y,obs(y,'send_ack'));assert.equal((await finish(y,7)).kind,'settled');
 assert.deepEqual(await response(y,obs(y,'response_received'),wire(y,0)),{kind:'blocked'});assert.equal(decoded(await journal(y),y).phase,'send_ack_recorded');
 const actual=wire(y,7);assert.ok(actual);assert.equal(decoded(await response(y,obs(y,'response_received'),actual),y,true,actual).phase,'response_recorded');
});


run('fixed NULL digest rejection returns strict false/blocked and preserves journal/ledger with trigger rollback',async()=>{
 const x=await fixture();await intent(x);await dispatch(x);const ack=obs(x,'send_ack');await send(x,ack);const w=wire(x);assert.ok(w);
 const snapshot=()=>db(`select jsonb_build_object('journal',(select to_jsonb(j) from turn_private.planning_v2_model_local_journal j where request_id='${x.request.requestId}'),'ledger',(select to_jsonb(b) from public.model_budget_attempts b where scope_id='${x.scope}' and attempt_id='${x.attempt}'));`);
 const before=await snapshot(),readback=await journal(x);
 for(const patch of [{outputDigest:null},{usageDigest:null},{outputDigest:null,usageDigest:null}]){
  const bad={...w,...patch};assert.equal(await db(`select turn_private.validate_planning_v2_output_v1(${lit(bad)}::jsonb,${lit(x.tuple)}::jsonb);`),'f');
  const refused=await response(x,obs(x,'response_received'),bad);assert.deepEqual(refused,{kind:'blocked'});assert.deepEqual(decoded(refused,x,true),{kind:'blocked'});assert.equal(await snapshot(),before);
  assert.equal(parseRead({...readback,phase:'response_recorded',revision:3,responseRecordedAt:new Date().toISOString(),responseObservation:obs(x,'response_received'),outputWire:bad},x.expected),null);
 }
 const bad={...w,outputDigest:null,usageDigest:null},failed=await sql(container,`begin;update turn_private.planning_v2_model_local_journal set phase='response_recorded',revision=revision+1,response_at=clock_timestamp(),response_observation=${lit(obs(x,'response_received'))}::jsonb,output_wire=${lit(bad)}::jsonb where request_id='${x.request.requestId}';commit;`);
 assert.notEqual(failed.code,0);assert.match(failed.stderr,/INVALID_LOCAL_OUTPUT/);assert.equal(await snapshot(),before);
 const stable=decoded(await journal(x),x);assert.equal(stable.phase,'send_ack_recorded');assert.equal(stable.revision,2);assert.equal(stable.outputWire,null);
});
