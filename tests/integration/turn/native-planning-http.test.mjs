// Real disposable local Auth -> native HTTP -> migrated PostgreSQL -> worker
// -> result HTTP. Provider and place observations are explicitly synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {createNativeTextEnvironment} from './native-text-environment.mjs';
import {runPlanningComparisonWorker} from '../../../lib/server/turn/planning-comparison-worker.ts';

test('native planning admission and owner result use the same durable task',{skip:process.env.VP_NATIVE_PLANNING_INTEGRATION!=='true',timeout:180000},async t=>{
 process.env.VISEPANDA_NATIVE_LOCAL_PLANNING='true';
 const e=await createNativeTextEnvironment();t.after(async()=>{delete process.env.VISEPANDA_NATIVE_LOCAL_PLANNING;await e.cleanup();});
 const request=async(path,token,method='GET',body)=>{const response=await fetch(e.api+path,{method,
  headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},
  ...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};};
 const login=async user=>{const attemptId=uuid();const issued=await request('/api/auth/native/v2/credentials',null,'POST',{email:user.email,password:user.password,attemptId});
  assert.equal(issued.status,200);assert.equal((await request('/api/auth/native/v2/login',issued.body.accessToken,'POST',{attemptId})).status,200);return issued.body.accessToken;};
 const owner=await login(e.users[0]),other=await login(e.users[1]);
 const conversation='/api/chat/native/v5/conversation',policy=(await request('/api/chat/native/v5/policy',owner)).body.policy;
 assert.equal((await request('/api/chat/native/v5/consent',owner,'POST',{policyId:policy.id,noticeHash:policy.noticeHash})).status,200);
 const planningPolicy=uuid(),notice='a'.repeat(64);
 e.sql(`insert into turn_private.planning_policies(id,text_policy_id,environment,notice_version,notice_hash,notice_zh,notice_en,effective_at,expires_at)
 values('${planningPolicy}','${policy.id}','local_synthetic','synthetic-v1','${notice}','合成规划告知','Synthetic planning notice',now()-interval '1 hour',now()+interval '1 day');`);
 const planning='/api/chat/native/v5/planning',scope=(await request(planning+'/policy',owner)).body.data;
 assert.equal(scope.kind,'planning_policy');assert.equal(scope.consentState,'not_accepted');
 assert.equal((await request(planning+'/policy',other)).body.data.kind,'unavailable','policy notice stays scoped to a consented owner');
 assert.equal((await request(planning+'/policy',owner,'POST',{policyId:planningPolicy,noticeHash:'b'.repeat(64)})).status,403);
 assert.equal((await request(planning+'/policy',owner,'POST',{policyId:planningPolicy,noticeHash:notice})).status,201);
 const conversationId=uuid(),goalId=uuid(),parentMessage=uuid();
 const started=await request(conversation,owner,'POST',{conversationId,messageId:parentMessage,idempotencyKey:uuid(),policyId:policy.id,
  locale:'en',text:'Compare Shanghai stay areas without dates',relationship:'goal_start',goalId,expectedGoalVersion:null,
  taskId:null,parentMessageId:null,turnId:null});
 assert.equal(started.status,201,JSON.stringify(started));
 const body={conversationId,goalId,expectedGoalVersion:1,parentMessageId:parentMessage,messageId:uuid(),messageKey:uuid(),
  threadId:uuid(),turnId:uuid(),taskId:uuid(),taskKey:uuid(),planningPolicyId:planningPolicy,locale:'en',
  text:'Compare Jing’an Temple and People’s Square as stay-area anchors',memoryBasis:[]};
 assert.equal((await request(planning+'/tasks',owner,'POST',{...body,tripId:uuid()})).status,400,'Trip writes are not accepted');
 assert.equal((await request(planning+'/tasks',other,'POST',body)).status,403,'another owner cannot use this conversation/policy');
 const accepted=await request(planning+'/tasks',owner,'POST',body);
 assert.equal(accepted.status,201,JSON.stringify(accepted));assert.equal(accepted.body.taskId,body.taskId);
 assert.equal((await request(planning+'/tasks',owner,'POST',body)).status,200,'same admission replays without another task');
 assert.equal((await request(planning+'/tasks',owner,'POST',{...body,text:'Changed request'})).status,409,'same keys cannot change the delegation');
 assert.equal(e.sql(`select execution_mode from turn_private.work where turn_id='${body.turnId}';`),'planning_comparison_v1');
 const empty=await request('/api/results/native/v1?artifactId='+accepted.body.artifactId,owner);
 assert.equal(empty.body.data.kind,'empty','the client sees no completed fixture before worker publication');
 const quote=value=>value===null?'null':typeof value==='number'?String(value):"'"+(typeof value==='object'?JSON.stringify(value):String(value)).replaceAll("'","''")+"'";
 const rpc=async(name,params)=>{assert.match(name,/^[a-z_0-9]+$/);const result=e.sql(`set request.jwt.claim.role='service_role';set role service_role;
  select public.${name}(${Object.entries(params).map(([key,value])=>key+'=>'+quote(value)).join(',')});`);return JSON.parse(result);};
 let modelCalls=0;
 const result=await runPlanningComparisonWorker(rpc,rpc,rpc,{environment:'local_synthetic',ownerId:e.users[0].id,
  planningPolicyId:planningPolicy,scopeId:e.users[0].scopeId,priceVersion:'synthetic-v1',reservedMicros:1000,timeoutMs:10000,maxOutputTokens:256},
  {provider:'qwen',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
   transport:async()=>{modelCalls++;return Response.json({model:'qwen3.7-plus-2026-05-26',
    choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content:'{"highlight":"peoples_square"}'}}],
    usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30}});},
   price:()=>1,evidenceLookup:async()=>({schemaVersion:'planning-evidence/1',coverage:'not_integrated'}),
   placeRead:async()=>({schemaVersion:'planning-place/1',source:'synthetic_fixture',observedAt:new Date().toISOString(),providerCalls:0,
    areas:[{id:'jingan',label:"Jing'an Temple anchor",railMinutes:21,transfers:1},
     {id:'peoples_square',label:"People's Square anchor",railMinutes:16,transfers:0}]})},new AbortController().signal);
 assert.equal(result,'finished');assert.equal(modelCalls,1);
 const saved=await request('/api/results/native/v1?artifactId='+accepted.body.artifactId,owner);
 assert.equal(saved.status,200,JSON.stringify(saved));assert.equal(saved.body.data.content.title,'Synthetic fixture: Shanghai stay-area comparison');
 assert.equal(saved.body.data.source.taskId,body.taskId);assert.equal(saved.body.data.current,true);
 const foreign=await request('/api/results/native/v1?artifactId='+accepted.body.artifactId,other);
 assert.notEqual(foreign.body.data?.kind,'result_artifact','another owner cannot read the comparison');
 assert.equal(e.sql(`select status||':'||actual_micros from public.model_budget_attempts where task_id='${body.taskId}';`),'settled:1');
});
