// Isolated protocol preparation only. Synthetic actor claims, fixture-only
// durable checkpoint table, private SQL as fixture admin; no service grant.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
import {decodePlanningV2Read,runPlanningV2LocalProtocol} from '../../../lib/server/turn/planning-intake-worker-protocol.ts';
import {readShanghaiStayAreaRoutes} from '../../../lib/server/tools/planning-place-read.ts';
const enabled=process.env.VPJ80_V2_PROTOCOL_TEST==='1',container='vpj80-v2-protocol-'+uuid().slice(0,8),fixed='f9cea1735b42cbb7f9cec76503116e9e256cc86e',privateFile='20261003030000_vpj79_private_qualified_comparison.sql';
let created=false,server,mapCalls=0,hook=null;
const db=async q=>{const r=await sql(container,q);assert.equal(r.code,0,r.stderr);return r.stdout.trim();};
const lit=v=>v===null?'null':typeof v==='number'||typeof v==='boolean'?String(v):"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
const rpc=async(a,name,p)=>JSON.parse(await db(`set role authenticated;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${a.ownerId}';set request.jwt.claims='${JSON.stringify({session_id:a.session})}';select public.${name}(`+Object.entries(p).map(([k,v])=>k+'=>'+lit(v)).join(',')+');'));
const intake={schemaVersion:'stay-area-intake/1',city:'shanghai',comparisonTarget:'area_transport',durationDays:10,partySize:2,interests:['food','photography'],pace:'relaxed',lodgingBudget:null,dates:null,mobilityConstraints:[]};
async function owner(){
 const a={ownerId:uuid(),session:uuid(),policy:uuid(),planningPolicyId:uuid(),conversationId:uuid(),goalId:uuid(),sourceId:uuid()};const notice='a'.repeat(64);
 await db(`insert into auth.users(id) values('${a.ownerId}');insert into identity_private.mobile_accounts(owner_id) values('${a.ownerId}');insert into auth.sessions(id,user_id) values('${a.session}','${a.ownerId}');
 insert into turn_private.text_policies(id,provider,recipient,endpoint,source_region,processing_region,storage_region,terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,effective_at,expires_at,terms_recheck_at) values('${a.policy}','qwen','synthetic','https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions','fixture','fixture','fixture','test','test','${notice}','合成','Synthetic','retain_after_hide_v1',now()-interval '1 hour',now()+interval '1 day',now()+interval '1 day');
 insert into turn_private.planning_policies(id,text_policy_id,environment,notice_version,notice_hash,notice_zh,notice_en,effective_at,expires_at) values('${a.planningPolicyId}','${a.policy}','staging','test','${notice}','合成','Synthetic',now()-interval '1 hour',now()+interval '1 day');`);
 await rpc(a,'accept_text_policy',{p_policy_id:a.policy,p_notice_hash:notice});await rpc(a,'accept_planning_policy_v1',{p_policy_id:a.planningPolicyId,p_notice_hash:notice});
 a.intakeRequest={p_conversation_id:a.conversationId,p_goal_id:a.goalId,p_message_id:a.sourceId,p_parent_message_id:null,p_expected_goal_version:null,p_expected_intake_revision:0,p_idempotency_key:uuid(),p_policy_id:a.policy,p_locale:'en',p_text:'First China visit, ten days with partner, food and photography, relaxed pace.',p_relationship:'goal_start',p_intake:intake,p_memory_basis:[]};
 const initial=await rpc(a,'submit_assistant_travel_intake_v1',a.intakeRequest),r=await rpc(a,'submit_planning_comparison_v2',{p_conversation_id:a.conversationId,p_goal_id:a.goalId,p_expected_goal_version:1,p_parent_message_id:a.sourceId,p_message_id:uuid(),p_message_key:uuid(),p_thread_id:uuid(),p_turn_id:uuid(),p_task_id:uuid(),p_task_key:uuid(),p_text_policy_id:a.policy,p_planning_policy_id:a.planningPolicyId,p_locale:'en',p_text:'Compare Shanghai areas',p_memory_basis:[],p_expected_intake_message_id:a.sourceId,p_expected_source_sequence:initial.messageSequence,p_expected_intake_revision:initial.intakeRevision,p_expected_intake_digest:initial.contextDigest,p_intake:intake});
 a.lease={ownerId:a.ownerId,taskId:r.taskId,turnId:r.turnId,artifactId:r.artifactId,leaseToken:uuid(),planningPolicyId:a.planningPolicyId,intakeContextDigest:r.intakeContextDigest,planningContextDigest:r.planningContextDigest,source:{conversationId:a.conversationId,goalId:a.goalId,goalVersion:r.goalVersion,messageId:r.messageId,messageSequence:r.messageSequence,intakeRevision:r.intakeRevision,memoryBasis:[]},environment:'staging',locale:'en'};
 await db(`update turn_private.work set state='leased',lease_token='${a.lease.leaseToken}',expires_at=clock_timestamp()+interval '120 seconds' where turn_id='${r.turnId}';insert into protocol_fixture.steps values('${a.ownerId}','${r.taskId}','${r.turnId}','${r.intakeContextDigest}','${r.planningContextDigest}','missing',null);`);return a;
}
const read=l=>db(`select turn_private.read_planning_qualified_intake_v1('${l.ownerId}','${l.turnId}','${l.leaseToken}');`).then(JSON.parse);
const keys=l=>`owner_id='${l.ownerId}' and task_id='${l.taskId}' and turn_id='${l.turnId}' and intake_digest='${l.intakeContextDigest}' and planning_digest='${l.planningContextDigest}'`;
function ports(a){const l=a.lease;return {mode:'local_protocol_test',read:()=>read(l),now:()=>Date.now(),checkpoints:async()=>{
 const place=JSON.parse(await db(`select case when state='completed' then jsonb_build_object('state',state,'observation',observation) else jsonb_build_object('state',state) end from protocol_fixture.steps where ${keys(l)};`));
 const attempt=await db(`select coalesce((select status from public.model_budget_attempts where task_id='${l.taskId}' order by case status when 'pending' then 0 when 'dispatched' then 1 when 'reserved' then 2 when 'settled' then 3 else 4 end limit 1),'none');`);
 return {schemaVersion:'planning-v2-checkpoints/1',ownerId:l.ownerId,taskId:l.taskId,turnId:l.turnId,intakeContextDigest:l.intakeContextDigest,planningContextDigest:l.planningContextDigest,place,modelAttempt:attempt};},
 permit:async()=>({kind:'local_protocol_permit',ownerId:l.ownerId,taskId:l.taskId,turnId:l.turnId,leaseToken:l.leaseToken,intakeContextDigest:l.intakeContextDigest,planningContextDigest:l.planningContextDigest}),
 claimPlace:async()=>await db(`update protocol_fixture.steps set state='started' where ${keys(l)} and state='missing' returning state;`)==='started'?'claimed':'unknown',
 place:(signal,beforeRequest)=>readShanghaiStayAreaRoutes({env:{AMAP_SEARCH_ENABLED:'true',AMAP_DETAIL_ENABLED:'true',AMAP_ROUTES_ENABLED:'true',AMAP_WEB_SERVICE_KEY:'SYNTHETIC_PROTOCOL_KEY'},signal,beforeRequest,fetcher:async(input,init)=>{const u=new URL(String(input));assert.equal(u.origin,'https://restapi.amap.com');return fetch('http://127.0.0.1:'+server.address().port+u.pathname+u.search,init);}}),
 savePlace:async(_lease,observation)=>await db(`update protocol_fixture.steps set state='completed',observation=${lit(observation)} where ${keys(l)} and state='started' returning state;`)==='completed',
 unknownPlace:()=>db(`update protocol_fixture.steps set state='unknown' where ${keys(l)} and state='started';`),
 prepare:(_lease,place)=>db(`select turn_private.project_planning_qualified_comparison_v1('${l.ownerId}','${l.turnId}','${l.leaseToken}','${l.intakeContextDigest}','${l.planningContextDigest}',${lit(place)},'en');`).then(v=>v?JSON.parse(v):null),
 verifyPreparation:async(_lease,place,content)=>await db(`select turn_private.valid_planning_qualified_comparison_v1('${l.ownerId}','${l.turnId}','${l.leaseToken}','${l.intakeContextDigest}','${l.planningContextDigest}',${lit(place)},'en',${lit(content)});`)==='t'};}
before(async()=>{if(!enabled)return;const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh','public.ecr.aws/supabase/postgres:17.6.1.159','-c','umask 077;mkdir /tmp/vpj59-socket;initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(r.code,0,r.stderr);created=true;
 for(let i=0;i<100;i++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
 if(!readdirSync('supabase/migrations').includes(privateFile)){const f=await command('git',['show',fixed+':supabase/migrations/'+privateFile]);assert.equal(f.code,0,f.stderr);await db('begin;'+f.stdout+'commit;');}
 await db('create schema protocol_fixture;create table protocol_fixture.steps(owner_id uuid,task_id uuid,turn_id uuid primary key,intake_digest text,planning_digest text,state text,observation jsonb);');
 server=createServer(async(req,res)=>{mapCalls++;const u=new URL(req.url,'http://fixture'),q=u.searchParams.get('keywords'),id=u.searchParams.get('id'),ids={'静安寺':'j','人民广场':'p','上海站':'s'},coords={j:'121.440000,31.220000',p:'121.480000,31.230000',s:'121.450000,31.250000'};assert.equal(u.searchParams.get('key'),'SYNTHETIC_PROTOCOL_KEY');let body;
 if(u.pathname.includes('place/text'))body={status:'1',infocode:'10000',pois:[{id:ids[q],name:q}]};else if(u.pathname.includes('place/detail'))body={status:'1',infocode:'10000',pois:[{id,name:id,location:coords[id],citycode:'021',address:'Synthetic'}]};else{const transit=u.pathname.includes('transit');body={status:'1',infocode:'10000',route:{origin:u.searchParams.get('origin'),destination:u.searchParams.get('destination'),[transit?'transits':'paths']:[{distance:'1000',cost:{duration:'960'},steps:[{instruction:'Synthetic'}],segments:[{walking:{distance:'100',steps:[{instruction:'Synthetic'}]},bus:{buslines:[{name:'Synthetic',departure_stop:{name:'A'},arrival_stop:{name:'B'}}]}}]}]}};}
 if(hook){const h=hook;hook=null;await h();}res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(body));});server.listen(0,'127.0.0.1');await once(server,'listening');});
after(async()=>{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(created)assert.equal((await command('docker',['rm','-f',container])).code,0);});
const run=(name,fn)=>test(name,{skip:!enabled,timeout:120000},fn);
run('actual old worker read rejects the synthetic valid v2 lease; new protocol stops at prepared',async t=>{
 const a=await owner(),l=a.lease,before=mapCalls;const old=JSON.parse(await db(`set role service_role;set request.jwt.claim.role='service_role';select public.read_planning_comparison_work_v1('${l.turnId}','${l.leaseToken}');`));assert.equal(old.kind,'blocked');
 const r=await runPlanningV2LocalProtocol(l,ports(a),new AbortController().signal);assert.equal(r.kind,'prepared');assert.equal(r.readyForPublication,false);assert.equal(r.executionAvailable,false);assert.equal(mapCalls-before,13);
 assert.equal(await db(`select count(*) from turn_private.result_artifacts where id='${l.artifactId}';`),'0');assert.equal(await db(`select status from public.turns where id='${l.turnId}';`),'accepted');assert.equal(await db(`select count(*) from public.model_budget_attempts where task_id='${l.taskId}';`),'0');
 const again=await runPlanningV2LocalProtocol(l,ports(a),new AbortController().signal);assert.equal(again.kind,'prepared');assert.equal(mapCalls-before,13,'completed checkpoint is not re-read');
 t.diagnostic(JSON.stringify({container,privateSource:fixed,oldRead:old.kind,protocol:r.kind,mapCalls:13,modelAttempts:0,artifacts:0,publication:false}));
});
run('decoder rejects swapped hashes, foreign identities and execution/publication capability inflation',async()=>{
 const a=await owner(),raw=await read(a.lease);assert.ok(decodePlanningV2Read(raw,a.lease));
 for(const patch of [{ownerId:uuid()},{taskId:uuid()},{turnId:uuid()},{artifactId:uuid()},{executionAvailable:true},{readyForProvider:true},{extra:'invented'},{intakeContextDigest:a.lease.planningContextDigest},{planningContextDigest:a.lease.intakeContextDigest}])assert.equal(decodePlanningV2Read({...raw,...patch},a.lease),null);
 for(const patch of [{messageId:uuid()},{goalVersion:2},{contextDigest:'0'.repeat(64)},{readyForProvider:true},{readiness:{kind:'ready',scope:'transport_screening',unknown:[]}}])assert.equal(decodePlanningV2Read({...raw,qualifiedIntake:{...raw.qualifiedIntake,...patch}},a.lease),null);
});
run('ordinary correction after response one prevents later requests and started/unknown effects never replay',async()=>{
 const a=await owner(),before=mapCalls;hook=()=>rpc(a,'submit_assistant_travel_intake_v1',{...a.intakeRequest,p_message_id:uuid(),p_parent_message_id:a.lease.source.messageId,p_expected_goal_version:a.lease.source.goalVersion,p_expected_intake_revision:a.lease.source.intakeRevision,p_idempotency_key:uuid(),p_relationship:'amendment',p_text:'Explicit full correction',p_intake:{...intake,pace:'balanced'}});
 assert.equal((await runPlanningV2LocalProtocol(a.lease,ports(a),new AbortController().signal)).kind,'unknown_effect');assert.equal(mapCalls-before,1);assert.equal(await db(`select state from protocol_fixture.steps where turn_id='${a.lease.turnId}';`),'unknown');
 assert.equal((await runPlanningV2LocalProtocol(a.lease,ports(a),new AbortController().signal)).kind,'blocked');assert.equal(mapCalls-before,1);
 const b=await owner(),n=mapCalls;await db(`update protocol_fixture.steps set state='started' where turn_id='${b.lease.turnId}';`);assert.equal((await runPlanningV2LocalProtocol(b.lease,ports(b),new AbortController().signal)).kind,'unknown_effect');assert.equal(mapCalls,n);
});
run('existing actual attempt states never cause a new tool/model invocation',async()=>{
 for(const status of ['reserved','dispatched','pending']){const a=await owner(),l=a.lease,scope=uuid(),before=mapCalls;
  await db(`insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at) values('${scope}','${a.ownerId}','CNY',100000,10000,4,1,true,now()+interval '1 day');insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled) values('${scope}','qwen','qwen3.7-plus-2026-05-26','synthetic-protocol',100000,1000,true);insert into public.model_budget_attempts(scope_id,attempt_id,task_id,provider,model,price_version,reserved_micros,status) values('${scope}','${uuid()}','${l.taskId}','qwen','qwen3.7-plus-2026-05-26','synthetic-protocol',1000,'${status}');`);
  const r=await runPlanningV2LocalProtocol(l,ports(a),new AbortController().signal);assert.equal(r.kind,['dispatched','pending'].includes(status)?'unknown_effect':'blocked');assert.equal(mapCalls,before);assert.equal(await db(`select count(*) from public.model_budget_attempts where task_id='${l.taskId}';`),'1');
 }
});
run('completed checkpoint survives a new process lease and persistence uncertainty does not replay',async()=>{
 const a=await owner(),l=a.lease,before=mapCalls;assert.equal((await runPlanningV2LocalProtocol(l,ports(a),new AbortController().signal)).kind,'prepared');
 const next={...l,leaseToken:uuid()};await db(`update turn_private.work set lease_token='${next.leaseToken}',expires_at=clock_timestamp()+interval '120 seconds' where turn_id='${l.turnId}';`);
 const restarted={...a,lease:next};assert.equal((await runPlanningV2LocalProtocol(next,ports(restarted),new AbortController().signal)).kind,'prepared');assert.equal(mapCalls-before,13);
 const b=await owner(),n=mapCalls,p=ports(b);p.savePlace=async()=>false;assert.equal((await runPlanningV2LocalProtocol(b.lease,p,new AbortController().signal)).kind,'checkpoint_pending');assert.equal(mapCalls-n,13);assert.equal((await runPlanningV2LocalProtocol(b.lease,ports(b),new AbortController().signal)).kind,'unknown_effect');assert.equal(mapCalls-n,13);
});
run('projection forgery or late correction cannot inflate prepared coverage or publication',async()=>{
 for(const change of ['coverage','observation','publication','correction']){const a=await owner(),p=ports(a),original=p.prepare;
  p.prepare=async(l,place,signal)=>{const value=await original(l,place,signal);if(change==='coverage')return {...value,coverage:{...value.coverage,unknown:[]}};if(change==='observation')return {...value,observation:{...value.observation,providerCalls:0}};if(change==='publication')return {...value,readyForPublication:true};
   await rpc(a,'submit_assistant_travel_intake_v1',{...a.intakeRequest,p_message_id:uuid(),p_parent_message_id:l.source.messageId,p_expected_goal_version:l.source.goalVersion,p_expected_intake_revision:l.source.intakeRevision,p_idempotency_key:uuid(),p_relationship:'amendment',p_text:'Explicit late correction',p_intake:{...intake,pace:'balanced'}});return value;};
  assert.equal((await runPlanningV2LocalProtocol(a.lease,p,new AbortController().signal)).kind,'blocked');assert.equal(await db(`select count(*) from turn_private.result_artifacts where id='${a.lease.artifactId}';`),'0');
 }
});
run('missing fake permit and nonlocal protocol mode send zero requests',async()=>{
 const a=await owner(),before=mapCalls,p=ports(a);p.permit=async()=>({kind:'authorized'});assert.equal((await runPlanningV2LocalProtocol(a.lease,p,new AbortController().signal)).kind,'blocked');assert.equal(mapCalls,before);
 p.mode='staging';p.read=async()=>{throw Error('nonlocal must stop before read');};assert.equal((await runPlanningV2LocalProtocol(a.lease,p,new AbortController().signal)).kind,'blocked');assert.equal(mapCalls,before);
});
run('released later attempt cannot hide an earlier unresolved effect',async()=>{
 const a=await owner(),l=a.lease,scope=uuid(),before=mapCalls;
 await db(`insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,task_attempt_limit,concurrency_limit,enabled,expires_at) values('${scope}','${a.ownerId}','CNY',100000,10000,4,1,true,now()+interval '1 day');insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,limit_micros,attempt_limit_micros,enabled) values('${scope}','qwen','qwen3.7-plus-2026-05-26','synthetic-protocol',100000,1000,true);insert into public.model_budget_attempts(scope_id,attempt_id,task_id,provider,model,price_version,reserved_micros,status) values('${scope}','${uuid()}','${l.taskId}','qwen','qwen3.7-plus-2026-05-26','synthetic-protocol',1000,'pending'),('${scope}','${uuid()}','${l.taskId}','qwen','qwen3.7-plus-2026-05-26','synthetic-protocol',1000,'released');`);
 assert.equal((await runPlanningV2LocalProtocol(l,ports(a),new AbortController().signal)).kind,'unknown_effect');assert.equal(mapCalls,before);assert.equal(await db(`select count(*) from public.model_budget_attempts where task_id='${l.taskId}';`),'2');
});
