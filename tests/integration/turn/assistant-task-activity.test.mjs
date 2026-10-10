// Disposable real Auth/HTTP/PostgreSQL; receipt fixtures are synthetic, no provider execution claimed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {NextRequest} from 'next/server.js';
import {createNativeTextEnvironment} from './native-text-environment.mjs';
import {identityLocalEnv} from '../identity/local-supabase.mjs';
import {nativeAssistantTaskActivityHTTP} from '../../../lib/server/turn/native-assistant-task-activity-http.ts';

test('owner activity projects only canonical current-authority receipts, bounded and truthful',{
 skip:process.env.VP_NATIVE_TEXT_INTEGRATION!=='true',timeout:180000,
},async t=>{
 const e=await createNativeTextEnvironment();t.after(()=>e.cleanup());
 const call=async(path,token,method='GET',body)=>{
  const r=await fetch(e.api+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),
   ...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:r.status,body:await r.json()};
 };
 const login=async user=>{const attemptId=uuid(),r=await call('/api/auth/native/v2/credentials',null,'POST',{email:user.email,password:user.password,attemptId});
  assert.equal(r.status,200);assert.equal((await call('/api/auth/native/v2/login',r.body.accessToken,'POST',{attemptId})).status,200);return r.body.accessToken;};
 const owner=await login(e.users[0]),other=await login(e.users[1]),base='/api/chat/native/v5';
 for(const token of [owner,other])assert.equal((await call(base+'/consent',token,'POST',{policyId:e.policyId,noticeHash:e.noticeHash})).status,200);
 const root={conversationId:uuid(),goalId:uuid(),messageId:uuid(),idempotencyKey:uuid(),policyId:e.policyId,locale:'en',
  text:'Synthetic activity goal',relationship:'goal_start',expectedGoalVersion:null,taskId:null,parentMessageId:null,turnId:null};
 assert.equal((await call(base+'/conversation',owner,'POST',root)).status,201);
 const taskId=uuid(),turnId=uuid(),threadId=uuid(),messageId=uuid(),planningPolicy=uuid();
 assert.equal((await call('/api/chat/native/v2/turns',owner,'POST',{threadId,turnId,idempotencyKey:uuid(),policyId:e.policyId,
  locale:'en',text:'Synthetic HOLD activity',serviceTask:{id:taskId,scopeVersion:1,relationship:'new_goal',parentTurnId:null}})).status,201);
 assert.equal((await call(base+'/conversation',owner,'POST',{...root,messageId,idempotencyKey:uuid(),taskId,
  parentMessageId:root.messageId,relationship:'follow_up',expectedGoalVersion:1})).status,201);
 e.sql(`insert into turn_private.planning_policies(id,text_policy_id,environment,notice_version,notice_hash,notice_zh,notice_en,effective_at,expires_at)
 values('${planningPolicy}','${e.policyId}','local_synthetic','activity-fixture','${'a'.repeat(64)}','合成测试','Synthetic test',now()-interval '1 hour',now()+interval '1 day');
 insert into turn_private.planning_consents(owner_id,policy_id) values('${e.users[0].id}','${planningPolicy}');
 insert into turn_private.planning_comparisons(turn_id,owner_id,task_id,goal_id,message_id,goal_version,planning_policy_id,planning_consent_id,memory_basis,artifact_id,publication_key)
 select '${turnId}','${e.users[0].id}','${taskId}','${root.goalId}','${messageId}',1,'${planningPolicy}',consent_id,'[]','${uuid()}','${uuid()}'
 from turn_private.planning_consents where owner_id='${e.users[0].id}' and policy_id='${planningPolicy}';`);
 const path=base+'/conversations/'+root.conversationId+'/tasks/'+taskId+'/activity';
 let r=await call(path,owner);assert.equal(r.status,200,JSON.stringify(r));
 assert.deepEqual(r.body.actions,[]);assert.equal(r.body.recording,'unrecorded');assert.equal(r.body.turnId,turnId);
 assert.equal((await call(path,other)).status,403);
 assert.equal((await call(path.replace(root.conversationId,uuid()),owner)).status,403);
 assert.equal((await call(path.replace(taskId,uuid()),owner)).status,403);
 assert.equal((await call(path,null)).status,401);
 assert.equal((await call(path+'?turnId='+turnId,owner)).status,400);
 const tools=['evidence.lookup','place.read','constraints.evaluate','result.prepare'];
 const insert=(key,tool,state)=>e.sql(`insert into turn_private.planning_action_receipts(turn_id,action_key,owner_id,task_id,message_id,lease_token,tool_id,input_digest,basis_digest,memory_basis,state,receipt_digest)
 values('${turnId}','${key}','${e.users[0].id}','${taskId}','${messageId}','${uuid()}','${tool}','${'b'.repeat(64)}',
 turn_private.planning_action_basis('${turnId}','${e.users[0].id}','${messageId}','[]'),'[]','${state}',${state==='completed'?"'"+'c'.repeat(64)+"'":'null'});`);
 insert('1111111111111111111111111111111111111111111111111111111111111111',tools[0],'completed');insert('2222222222222222222222222222222222222222222222222222222222222222',tools[1],'unknown');
 insert('3333333333333333333333333333333333333333333333333333333333333333',tools[2],'started');insert('4444444444444444444444444444444444444444444444444444444444444444',tools[3],'completed');
 r=await call(path,owner);assert.equal(r.status,200);
 assert.deepEqual(r.body.actions,tools.map((tool,i)=>({tool,state:['completed','unknown','started','completed'][i]})));
 assert.equal(r.body.recording,'recorded');assert.equal(r.body.limit,4);
 assert.deepEqual(Object.keys(r.body).sort(),['version','kind','conversationId','taskId','turnId','turnStatus','limit','recording','actions'].sort());
 assert.equal(JSON.stringify(r.body).includes('synthetic-secret'),false);
 for(const [status,jobState] of [['cancelled','paused_unknown'],['failed','paused_unknown'],['completed','completed']]){
  e.sql(`update public.turns set status='${status}' where id='${turnId}';update turn_private.text_content set output_kind=${status==='completed'?"'answered'":'null'} ,output_text=${status==='completed'?"'Synthetic completed output'":'null'} where turn_id='${turnId}';
   update turn_private.planning_comparisons set state='${jobState}' where turn_id='${turnId}';`);
  r=await call(path,owner);assert.equal(r.status,200);assert.equal(r.body.turnStatus,status);assert.equal(r.body.actions[1].state,'unknown');
 }
 e.sql(`update public.turns set status='accepted' where id='${turnId}';update turn_private.text_content set output_kind=null,output_text=null where turn_id='${turnId}';
 update turn_private.planning_comparisons set state='queued' where turn_id='${turnId}';`);
 // Separate synthetic cancelled Task for overflow: preserve base four-receipt
 // source, claims and all subsequent authority negatives; no extra worker dispatch.
 const overflowTask=uuid(),overflowTurn=uuid(),overflowThread=uuid(),overflowMessage=uuid();
 e.sql(`insert into public.chat_threads(id,owner_id) values('${overflowThread}','${e.users[0].id}');
 insert into public.turns(id,owner_id,thread_id,status) values('${overflowTurn}','${e.users[0].id}','${overflowThread}','cancelled');
 insert into turn_private.text_content(turn_id,owner_id,thread_id,policy_id,consent_id,locale,input_text)
 select '${overflowTurn}',owner_id,'${overflowThread}',policy_id,consent_id,locale,input_text from turn_private.text_content where turn_id='${turnId}';
 insert into turn_private.service_tasks(id,owner_id,thread_id,goal_turn_id,last_turn_id,policy_id,consent_id,scope_version,goal_digest)
 select '${overflowTask}',owner_id,'${overflowThread}','${overflowTurn}','${overflowTurn}',policy_id,consent_id,1,goal_digest from turn_private.service_tasks where id='${taskId}';
 insert into turn_private.service_task_turns(turn_id,task_id,owner_id,relationship,idempotency_key,request_digest)
 values('${overflowTurn}','${overflowTask}','${e.users[0].id}','new_goal','${uuid()}','${'a'.repeat(64)}');
 insert into turn_private.assistant_messages(id,conversation_id,owner_id,sequence,idempotency_key,request_digest,policy_id,consent_id,locale,input_text,relationship,goal_id,scope_version,task_id,parent_message_id)
 select '${overflowMessage}',id,owner_id,next_sequence,'${uuid()}','${'a'.repeat(64)}',policy_id,consent_id,'en','Synthetic isolated overflow','follow_up','${root.goalId}',1,'${overflowTask}','${root.messageId}' from turn_private.assistant_conversations where id='${root.conversationId}';
 update turn_private.assistant_conversations set next_sequence=next_sequence+1 where id='${root.conversationId}';
 insert into turn_private.work(turn_id,owner_id,session_id,state,max_attempts,lease_ms)
 select '${overflowTurn}',owner_id,session_id,'cancelled',max_attempts,lease_ms from turn_private.work where turn_id='${turnId}';
 insert into turn_private.planning_comparisons(turn_id,owner_id,task_id,goal_id,message_id,goal_version,planning_policy_id,planning_consent_id,memory_basis,artifact_id,publication_key,state)
 select '${overflowTurn}',owner_id,'${overflowTask}',goal_id,'${overflowMessage}',goal_version,planning_policy_id,planning_consent_id,memory_basis,'${uuid()}','${uuid()}','queued' from turn_private.planning_comparisons where turn_id='${turnId}';
 insert into turn_private.planning_action_receipts(turn_id,action_key,owner_id,task_id,message_id,lease_token,tool_id,input_digest,basis_digest,memory_basis,state,receipt_digest)
 select '${overflowTurn}',action_key,owner_id,'${overflowTask}','${overflowMessage}',lease_token,tool_id,input_digest,turn_private.planning_action_basis('${overflowTurn}',owner_id,'${overflowMessage}',memory_basis),memory_basis,state,receipt_digest from turn_private.planning_action_receipts where turn_id='${turnId}';
`);
 const overflowPath=base+'/conversations/'+root.conversationId+'/tasks/'+overflowTask+'/activity';
 const overflowBefore=await call(overflowPath,owner);assert.equal(overflowBefore.status,200);assert.equal(overflowBefore.body.actions.length,4);
 e.sql(`insert into turn_private.planning_action_receipts(turn_id,action_key,owner_id,task_id,message_id,lease_token,tool_id,input_digest,basis_digest,memory_basis,state)
 values('${overflowTurn}','${'5'.repeat(64)}','${e.users[0].id}','${overflowTask}','${overflowMessage}','${uuid()}','${tools[0]}','${'b'.repeat(64)}',turn_private.planning_action_basis('${overflowTurn}','${e.users[0].id}','${overflowMessage}','[]'),'[]','started');`);
 e.sql(`update turn_private.planning_comparisons set state='paused_unknown' where turn_id='${overflowTurn}';`);
 assert.equal((await call(overflowPath,owner)).status,403,'overflow cannot masquerade as four completed steps');
 assert.throws(()=>e.sql(`delete from turn_private.planning_action_receipts where turn_id='${overflowTurn}' and action_key='${'5'.repeat(64)}';`),/ASSISTANT_EVENT_ERASE_AUTHORITY/);
 assert.equal((await call(path,owner)).status,200,'base four-receipt fixture remains independent');
 e.sql(`update turn_private.planning_action_receipts set basis_digest='${'d'.repeat(64)}' where turn_id='${turnId}' and action_key='1111111111111111111111111111111111111111111111111111111111111111';`);
 assert.equal((await call(path,owner)).status,403,'stale receipt basis leaks no status');
 e.sql(`update turn_private.planning_action_receipts set basis_digest=turn_private.planning_action_basis('${turnId}','${e.users[0].id}','${messageId}','[]') where turn_id='${turnId}';
 update turn_private.assistant_goals set scope_version=2 where id='${root.goalId}';`);
 assert.equal((await call(path,owner)).status,403,'goal amendment invalidates old activity');
 e.sql(`update turn_private.assistant_goals set scope_version=1 where id='${root.goalId}';
 update turn_private.text_content set hidden_at=now() where turn_id='${turnId}';`);
 assert.equal((await call(path,owner)).status,403);
 e.sql(`update turn_private.text_content set hidden_at=null where turn_id='${turnId}';update public.chat_threads set status='archived' where id='${threadId}';`);
 assert.equal((await call(path,owner)).status,403);
 e.sql(`update public.chat_threads set status='active' where id='${threadId}';`);
 const later=uuid();
 e.sql(`insert into public.turns(id,owner_id,thread_id,status) values('${later}','${e.users[0].id}','${threadId}','failed');
 insert into turn_private.text_content(turn_id,owner_id,thread_id,policy_id,consent_id,locale,input_text)
 select '${later}',owner_id,thread_id,policy_id,consent_id,'en','Synthetic latest Turn' from turn_private.text_content where turn_id='${turnId}';
 insert into turn_private.service_task_turns(turn_id,task_id,owner_id,parent_turn_id,relationship,idempotency_key,request_digest)
 values('${later}','${taskId}','${e.users[0].id}','${turnId}','repair','${uuid()}','${'f'.repeat(64)}');
 update turn_private.service_tasks set last_turn_id='${later}' where id='${taskId}';`);
 assert.equal((await call(path,owner)).status,403,'latest without matching planning authority never falls back');
 e.sql(`update turn_private.service_tasks set last_turn_id='${turnId}' where id='${taskId}';`);
 // Producer-off uses real owner JWT + RPC, while writes remain disabled.
 const local=identityLocalEnv(),patch={NEXT_PUBLIC_SUPABASE_URL:local.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:local.PUBLISHABLE_KEY||local.ANON_KEY,
  VISEPANDA_NATIVE_LOCAL_TEXT:'true',VISEPANDA_NATIVE_LOCAL_TEXT_POLICY:e.policyId,VISEPANDA_NATIVE_LOCAL_ASSISTANT_CONVERSATION:'false'};
 const prior=new Map(Object.keys(patch).map(k=>[k,process.env[k]]));Object.assign(process.env,patch);
 try{assert.equal((await nativeAssistantTaskActivityHTTP(new NextRequest(e.api+path,{headers:{Authorization:'Bearer '+owner}}),root.conversationId,taskId)).status,200);}
 finally{for(const[k,v]of prior)v===undefined?delete process.env[k]:process.env[k]=v;}
 // Independent authority negatives use transaction-local fixture changes and the real logged-in session claims.
 const claims=JSON.parse(Buffer.from(owner.split('.')[1],'base64url').toString());
 const invalidAuthority=change=>{
  const result=e.sql(`begin;${change};set local request.jwt.claims='${JSON.stringify(claims).replaceAll("'","''")}';set local role authenticated;
   select public.read_assistant_task_activity_v1('${e.policyId}','${root.conversationId}','${taskId}');rollback;`);
  assert.equal(JSON.parse(result).kind,'unavailable');
 };
 invalidAuthority(`update turn_private.text_consents set revoked_at=now() where owner_id='${e.users[0].id}' and policy_id='${e.policyId}'`);
 invalidAuthority(`update turn_private.text_policies set revoked_at=now() where id='${e.policyId}'`);
 invalidAuthority(`update turn_private.planning_policies set revoked_at=now() where id='${planningPolicy}'`);
 invalidAuthority(`update turn_private.planning_comparisons set memory_basis='[{"id":"${uuid()}","revision":1}]' where turn_id='${turnId}'`);
 invalidAuthority(`update turn_private.text_content set hidden_at=now() where turn_id='${turnId}'`);
 e.sql(`update turn_private.planning_consents set revoked_at=now() where owner_id='${e.users[0].id}' and policy_id='${planningPolicy}';`);
 r=await call(path,owner);assert.equal(r.status,403);assert.deepEqual(Object.keys(r.body),['error']);
 console.log('VPJ80_ACTIVITY_AUTH_SQL_HTTP_PASS: synthetic receipt states only; real provider/native/staging UNRUN');
});
