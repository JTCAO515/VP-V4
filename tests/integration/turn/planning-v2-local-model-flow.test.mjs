// Current-checkout private SQL/TS; network-none PostgreSQL and loopback fake HTTP only.
import {PROTOCOL_MODELS} from '../../../lib/server/model-gateway/adapters/provider-protocol.ts';
import {PLANNING_COMPARISON_PROMPT} from '../../../lib/server/model-gateway/prompt/planning-comparison.ts';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid,createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {createPlanningV2ModelRequest as createRequest} from '../../../lib/server/turn/planning-v2-model-request.ts';
import {createPlanningV2ModelOutputReceipt as createOutput} from '../../../lib/server/turn/planning-v2-model-output-receipt.ts';
import {parsePlanningV2ModelJournalRead as parseRead,parsePlanningV2ModelJournalWrite as parseWrite} from '../../../lib/server/turn/planning-v2-model-journal.ts';
import http from 'node:http';
import {command,sql} from '../cost/fixtures/postgres-rpc.mjs';
const enabled=process.env.VP_TURN_DB_TEST==='1',container='vpj80-local-model-flow-'+uuid().slice(0,8);
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
before(async()=>{
 if(!enabled)return;
 const image='public.ecr.aws/supabase/postgres:17.6.1.159';const r=await command('docker',['run','--pull=never','--rm','-d','--network','none','--name',container,'--user','postgres','--entrypoint','/bin/sh',image,'-c','umask 077; mkdir /tmp/vpj59-socket; initdb -D /tmp/vpj59-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj59-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj59-socket -c unix_socket_permissions=0700']);assert.equal(r.code,0,r.stderr);created=true;
 for(let i=0;i<100;i++){if((await command('docker',['exec',container,'pg_isready','-h','/tmp/vpj59-socket','-U','postgres'])).code===0)break;await new Promise(r=>setTimeout(r,100));}
 await db(readFileSync('tests/integration/turn/fixtures/durable-work-schema.sql','utf8'));await db("create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;create schema extensions;create extension pgcrypto with schema extensions;");
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db('begin;'+readFileSync('supabase/migrations/'+f,'utf8')+'commit;');
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
function wire(x,actualMicros=0,fake={output:{highlight:'none'},usage:{inputTokens:12,outputTokens:8,totalTokens:20,cachedInputTokens:null,uncachedInputTokens:null,reasoningTokens:null,cost:'unknown'}}){const b=x.tuple,observedAt=new Date().toISOString();return createOutput({schemaVersion:'planning-v2-model-output/1',binding:b,output:fake.output,observedAt,usageReceipt:{schemaVersion:'validated-planning-usage/1',attempt:{scopeId:b.scope,ownerId:b.owner,taskId:b.task,attemptId:b.attempt,provider:'qwen',model:b.model,priceVersion:b.priceVersion,reservedMicros:10,timeoutMs:1000},turnId:b.turn,policyId:b.planningPolicy,usage:fake.usage,actualMicros,observedAt}},b);}
const decoded=(raw,x,write=false,out=null)=>{const expected={...x.expected,...(out?{outputDigest:out.outputDigest,usageDigest:out.usageDigest}:{})},parsed=(write?parseWrite:parseRead)(raw,expected);assert.ok(parsed);return parsed;};
const fakeResponse={source:'local_fake_provider/1',output:{highlight:'jingan'},usage:{inputTokens:12,outputTokens:8,totalTokens:20,cachedInputTokens:null,uncachedInputTokens:null,reasoningTokens:null,cost:'unknown'}};
const ledger=x=>db(`select to_jsonb(b) from public.model_budget_attempts b where scope_id='${x.scope}' and attempt_id='${x.attempt}';`);
async function localProvider(t,mode='success'){
 const received=[];
 const server=http.createServer((req,res)=>{const chunks=[];req.on('data',b=>chunks.push(b));req.on('end',()=>{received.push(Buffer.concat(chunks));assert.equal(req.method,'POST');assert.equal(req.headers.authorization,undefined);
 if(mode==='disconnected'){req.socket.destroy();return;}if(mode==='timeout')return;
 res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(fakeResponse));});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 return {port:server.address().port,received};
}
async function sendOnce(x,provider){
 const current=decoded(await journal(x),x);
 assert.equal(current.unknownAt,null,'sticky unknown cannot send');
 assert.equal(current.phase,'intent_saved','recorded local send cannot retry');
 assert.equal((await dispatch(x)).kind,'dispatched');
 const req=http.request({hostname:'127.0.0.1',port:provider.port,path:'/local-fake',method:'POST',headers:{'content-type':'application/json','content-length':Buffer.byteLength(x.request.body)}});
 const responseResult=new Promise(resolve=>{req.on('error',error=>resolve({error}));req.on('response',res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('error',error=>resolve({error}));res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks)}));});});
 const sent=new Promise((resolve,reject)=>{req.once('finish',resolve);req.once('error',reject);});
 const timer=setTimeout(()=>{const error=new Error('local transport timeout');error.code='LOCAL_TIMEOUT';req.destroy(error);},750);
 try{
  req.end(Buffer.from(x.request.body,'utf8'));await sent;
  // Node finish observes the completed local write; it does not establish provider origin.
  const sendAck=decoded(await send(x,obs(x,'send_ack')),x,true);assert.equal(sendAck.phase,'send_ack_recorded');assert.equal(sendAck.providerOriginVerified,false);
  const result=await responseResult;if(result.error)throw result.error;
  assert.equal(result.status,200);const fake=JSON.parse(result.body.toString('utf8'));assert.equal(fake.source,'local_fake_provider/1');
  const output=wire(x,0,fake);assert.ok(output);return output;
 }finally{clearTimeout(timer);req.destroy();}
}
async function noPublication(x){
 assert.equal(await db(`select count(*) from turn_private.result_artifacts where id='${x.r.artifactId}';`),'0');
 assert.equal(await db(`select count(*) from turn_private.work where turn_id='${x.r.turnId}' and state='completed';`),'0');
}
run('exact serializer bytes make one loopback HTTP round trip and strict real SQL response readback survives lost write ACK',async t=>{
 const x=await fixture(),provider=await localProvider(t);decoded(await intent(x),x,true);
 const output=await sendOnce(x,provider),before=await ledger(x);
 // Commit the real response, deliberately discard the returned ACK, recover only by read.
 await assert.rejects((async()=>{await response(x,obs(x,'response_received'),output);throw new Error('controlled local response write ACK loss');})(),/controlled local response write ACK loss/);
 const result=decoded(await journal(x,output),x,false,output);
 assert.equal(result.phase,'response_recorded');assert.equal(result.revision,3);assert.equal(result.unknownAt,null);
 assert.deepEqual(result.outputWire,output);assert.equal(result.providerOriginVerified,false);assert.equal(result.executionAvailable,false);assert.equal(result.readyForPublication,false);assert.equal(result.reconciliationRequired,true);
 assert.equal(provider.received.length,1);assert.deepEqual(provider.received[0],Buffer.from(x.request.body,'utf8'));assert.equal(createHash('sha256').update(provider.received[0]).digest('hex'),x.request.payloadDigest);
 await assert.rejects(sendOnce(x,provider),/recorded local send cannot retry/);assert.equal(provider.received.length,1);
 assert.equal(await ledger(x),before);assert.equal(JSON.parse(before).status,'dispatched');
 assert.equal(await db(`select count(*) from turn_private.planning_v2_model_local_journal where request_id='${x.request.requestId}';`),'1');await noPublication(x);
 t.diagnostic(JSON.stringify({source:'current-checkout SQL/TS',providerSends:1,exactBytes:true,readRevision:3,providerOriginVerified:false,actualMicros:'synthetic known zero; ledger remains dispatched'}));
});
for(const mode of ['timeout','disconnected'])run(`local transport ${mode} becomes sticky unknown without retry or lease adoption`,async t=>{
 const x=await fixture(),provider=await localProvider(t,mode);await intent(x);
 await assert.rejects(sendOnce(x,provider),mode==='timeout'?/local transport timeout/:/socket hang up/);
 const before=await ledger(x),prior=decoded(await journal(x),x);assert.equal(prior.phase,'send_ack_recorded');
 const marked=decoded(await privateCall('unknown_planning_v2_request_v1',x,[x.request.requestId,x.request.requestDigest,prior.revision,mode]),x,true);assert.ok(marked.unknownAt);
 const result=decoded(await journal(x),x);assert.equal(result.revision,3);assert.equal(result.outputWire,null);assert.equal(result.providerOriginVerified,false);
 await assert.rejects(sendOnce(x,provider),/sticky unknown cannot send/);assert.equal(provider.received.length,1);
 assert.deepEqual(await journal({...x,tuple:{...x.tuple,lease:uuid()}}),{kind:'blocked'});
 assert.deepEqual(await response(x,obs(x,'response_received'),wire(x)),{kind:'blocked'});
 assert.equal(await ledger(x),before);await noPublication(x);
 t.diagnostic(JSON.stringify({mode,providerSends:1,stickyUnknown:true,providerOriginVerified:false,ledgerUnchanged:true}));
});
