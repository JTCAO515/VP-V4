import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {NextRequest} from 'next/server.js';
import {createNativeTextEnvironment} from './native-text-environment.mjs';
import {identityLocalEnv} from '../identity/local-supabase.mjs';
import {nativeAssistantHTTP,nativeAssistantTextHTTP} from '../../../lib/server/turn/native-assistant-http.ts';
import {nativeAssistantTasksHTTP} from '../../../lib/server/turn/native-assistant-tasks-http.ts';
import {nativeTextHTTP} from '../../../lib/server/turn/native-http.ts';

test('assistant producer rollback preserves authorized conversation reads and cancellation without new writes',{
 skip:process.env.VP_NATIVE_TEXT_INTEGRATION!=='true',timeout:180000,
},async t=>{
 const e=await createNativeTextEnvironment();t.after(()=>e.cleanup());
 const call=async(path,token,method='GET',body)=>{
  const response=await fetch(e.api+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),
   ...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,body:await response.json()};
 };
 const login=async user=>{
  const attemptId=randomUUID(),credential=await call('/api/auth/native/v2/credentials',null,'POST',{email:user.email,password:user.password,attemptId});
  assert.equal(credential.status,200);
  assert.equal((await call('/api/auth/native/v2/login',credential.body.accessToken,'POST',{attemptId})).status,200);
  return credential.body.accessToken;
 };
 const owner=await login(e.users[0]),other=await login(e.users[1]),base='/api/chat/native/v5';
 for(const actor of [owner,other])assert.equal((await call(base+'/consent',actor,'POST',{policyId:e.policyId,noticeHash:e.noticeHash})).status,200);
 const root={conversationId:randomUUID(),messageId:randomUUID(),idempotencyKey:randomUUID(),policyId:e.policyId,
  locale:'en',text:'Synthetic goal retained through rollback',relationship:'goal_start',goalId:randomUUID(),
  expectedGoalVersion:null,taskId:null,parentMessageId:null,turnId:null};
 assert.equal((await call(base+'/conversation',owner,'POST',root)).status,201);
 const taskId=randomUUID(),turnId=randomUUID();
 const task={threadId:randomUUID(),turnId,idempotencyKey:randomUUID(),policyId:e.policyId,locale:'en',text:'Synthetic HOLD result',
  serviceTask:{id:taskId,scopeVersion:1,relationship:'new_goal',parentTurnId:null}};
 assert.equal((await call('/api/chat/native/v2/turns',owner,'POST',task)).status,201);
 const link={...root,messageId:randomUUID(),idempotencyKey:randomUUID(),relationship:'follow_up',
  text:'Synthetic accepted task reference',expectedGoalVersion:1,parentMessageId:root.messageId,taskId};
 assert.equal((await call(base+'/conversation',owner,'POST',link)).status,201);
 const second={...root,conversationId:randomUUID(),messageId:randomUUID(),idempotencyKey:randomUUID(),goalId:randomUUID(),text:'Second synthetic conversation'};
 assert.equal((await call(base+'/conversation',owner,'POST',second)).status,201);
 const latest=await call(base+'/conversation',owner);assert.equal(latest.body.conversationId,second.conversationId);
 const isolated=await call(base+'/conversation?conversationId='+root.conversationId,owner);
 assert.equal(isolated.body.conversationId,root.conversationId);
 assert.deepEqual(isolated.body.messages.map(x=>x.messageId),[root.messageId,link.messageId]);
 const extra={...second,messageId:randomUUID(),idempotencyKey:randomUUID(),text:'Stay with explicitly selected original',
   conversationId:root.conversationId,goalId:randomUUID()};
 assert.equal((await call(base+'/conversation',owner,'POST',extra)).status,201);
 assert.equal((await call(base+'/conversation?conversationId='+second.conversationId,owner)).body.messages.length,1);
 // Task authority still exists, but 21 unrelated text Turns displace it from the legacy window.
 e.sql(`with rows as (select gen_random_uuid() thread_id,gen_random_uuid() turn_id,n from generate_series(1,21) n),
 threads as (insert into public.chat_threads(id,owner_id) select thread_id,'${e.users[0].id}' from rows returning id),
 turns as (insert into public.turns(id,owner_id,thread_id,status,created_at)
   select turn_id,'${e.users[0].id}',thread_id,'cancelled',now()+n*interval '1 second' from rows returning id,thread_id)
 insert into turn_private.text_content(turn_id,owner_id,thread_id,policy_id,consent_id,locale,input_text)
 select t.id,'${e.users[0].id}',t.thread_id,'${e.policyId}',c.consent_id,'en','Unrelated synthetic text'
 from turns t cross join turn_private.text_consents c where c.owner_id='${e.users[0].id}' and c.policy_id='${e.policyId}' and c.revoked_at is null;`);
 const displaced=await call('/api/chat/native/v2/turns',owner);
 assert.equal(displaced.status,200);assert.deepEqual(displaced.body.turns,[],'baseline owner-20 excludes the older conversation Task');
 assert.equal((await call(base+'/conversation?conversationId='+root.conversationId,owner)).body.messages.find(x=>x.messageId===link.messageId).taskId,taskId);
 console.log('VPJ81_BASELINE_TASK_DISPLACEMENT_REPRODUCED');
 const tasksPath=base+'/conversations/'+root.conversationId+'/tasks';
 let scoped=await call(tasksPath,owner);
 assert.equal(scoped.status,200);assert.equal(scoped.body.kind,'conversation_tasks');
 assert.equal(scoped.body.messages[0].messageId,link.messageId);
 assert.equal(scoped.body.turns[0].turnId,turnId);assert.equal(scoped.body.turns[0].serviceTaskId,taskId);
 assert.equal(scoped.body.turns[0].outcome,null,'status projection omits all private input/output bodies');
 assert.equal(Object.hasOwn(scoped.body.turns[0],'input'),false);assert.equal(Object.hasOwn(scoped.body.turns[0],'output'),false);
 assert.deepEqual((await call(base+'/conversations/'+second.conversationId+'/tasks',owner)).body.messages,[]);
 assert.equal((await call(tasksPath,other)).status,403);
 assert.equal((await call(tasksPath+'?taskId='+taskId,owner)).status,400);
 // Complete only this disposable fixture; no real provider result is claimed.
 e.sql(`update public.turns set status='completed' where id='${turnId}';update turn_private.text_content set output_kind='answered',output_text='Synthetic completed task' where turn_id='${turnId}';`);
 const artifact=randomUUID(),content={schemaVersion:'comparison/1',actions:[],title:'Synthetic comparison',summary:'Two synthetic options',options:[{id:'a',title:'A',tradeoff:'Synthetic A'},{id:'b',title:'B',tradeoff:'Synthetic B'}]};
 assert.equal(JSON.parse(e.sql(`set request.jwt.claim.role='service_role';select public.publish_comparison_result_v1('${e.users[0].id}','${artifact}',0,'${randomUUID()}','${taskId}','${root.goalId}','${link.messageId}',null,null,1,'[]'::jsonb,'${JSON.stringify(content)}'::jsonb);`)).kind,'published');
 scoped=await call(tasksPath,owner);assert.equal(scoped.body.turns[0].status,'completed');
 const result=await call('/api/results/native/v1/task?taskId='+taskId,owner);
 assert.equal(result.body.data.artifactId,artifact);assert.equal(result.body.data.kind,'result_reference');
 assert.equal((await call('/api/results/native/v1?artifactId='+artifact+'&revision=1',owner)).body.data.current,true);
 // Association remains readable after it leaves the 50-message transcript window.
 for(let n=0;n<51;n++)assert.equal((await call(base+'/conversation',owner,'POST',{...extra,messageId:randomUUID(),idempotencyKey:randomUUID(),relationship:'follow_up',
   expectedGoalVersion:1,parentMessageId:extra.messageId,goalId:extra.goalId,text:'Synthetic transcript continuation '+n})).status,201);
 assert.equal((await call(base+'/conversation?conversationId='+root.conversationId,owner)).body.messages.some(x=>x.messageId===link.messageId),false);
 assert.equal((await call(tasksPath,owner)).body.messages[0].messageId,link.messageId);
 // Canonical last_turn_id only: an older completed root cannot mask a failed/cancelled latest Turn.
 const later=randomUUID();
 e.sql(`insert into public.turns(id,owner_id,thread_id,status) values('${later}','${e.users[0].id}','${task.threadId}','failed');
 insert into turn_private.text_content(turn_id,owner_id,thread_id,policy_id,consent_id,locale,input_text)
 select '${later}',owner_id,thread_id,policy_id,consent_id,'en','Synthetic latest failure' from turn_private.text_content where turn_id='${turnId}';
 insert into turn_private.service_task_turns(turn_id,task_id,owner_id,parent_turn_id,relationship,idempotency_key,request_digest)
 values('${later}','${taskId}','${e.users[0].id}','${turnId}','repair','${randomUUID()}','${'f'.repeat(64)}');
 update turn_private.service_tasks set last_turn_id='${later}' where id='${taskId}';`);
 scoped=await call(tasksPath,owner);assert.equal(scoped.body.turns[0].turnId,later);assert.equal(scoped.body.turns[0].status,'failed');
 assert.notEqual((await call('/api/results/native/v1/task?taskId='+taskId,owner)).body.data.kind,'result_reference');
 e.sql(`update public.turns set status='cancelled' where id='${later}';`);
 assert.equal((await call(tasksPath,owner)).body.turns[0].status,'cancelled');
 e.sql(`update turn_private.text_content set hidden_at=now() where turn_id='${later}';`);
 assert.deepEqual((await call(tasksPath,owner)).body.turns,[],'hidden latest must not fall back to old completed root');
 e.sql(`update turn_private.text_content set hidden_at=null where turn_id='${later}';update public.chat_threads set status='archived' where id='${task.threadId}';`);
 assert.deepEqual((await call(tasksPath,owner)).body.turns,[]);
 e.sql(`update public.chat_threads set status='active' where id='${task.threadId}';update turn_private.service_tasks set last_turn_id='${turnId}' where id='${taskId}';
 update public.turns set status='accepted' where id='${turnId}';update turn_private.text_content set output_kind=null,output_text=null where turn_id='${turnId}';`);
 // Keyset pages cover all Task memberships, independent of the transcript window.
 e.sql(`with rows as (select gen_random_uuid() thread_id,gen_random_uuid() turn_id,gen_random_uuid() task_id,gen_random_uuid() message_id,n from generate_series(1,21) n),
 threads as (insert into public.chat_threads(id,owner_id) select thread_id,'${e.users[0].id}' from rows returning id),
 turns as (insert into public.turns(id,owner_id,thread_id,status) select turn_id,'${e.users[0].id}',thread_id,'completed' from rows returning id),
 content as (insert into turn_private.text_content(turn_id,owner_id,thread_id,policy_id,consent_id,locale,input_text,output_kind,output_text)
 select r.turn_id,'${e.users[0].id}',r.thread_id,c.policy_id,c.consent_id,'en','Synthetic paging Task','answered','Synthetic paging answer'
 from rows r cross join turn_private.assistant_conversations c where c.id='${root.conversationId}' returning turn_id),
 tasks as (insert into turn_private.service_tasks(id,owner_id,thread_id,goal_turn_id,last_turn_id,policy_id,consent_id,scope_version,goal_digest)
 select r.task_id,'${e.users[0].id}',r.thread_id,r.turn_id,r.turn_id,c.policy_id,c.consent_id,1,'${'c'.repeat(64)}'
 from rows r cross join turn_private.assistant_conversations c where c.id='${root.conversationId}' returning id),
 links as (insert into turn_private.service_task_turns(turn_id,task_id,owner_id,relationship,idempotency_key,request_digest)
 select turn_id,task_id,'${e.users[0].id}','new_goal',gen_random_uuid(),'${'c'.repeat(64)}' from rows returning turn_id)
 insert into turn_private.assistant_messages(id,conversation_id,owner_id,sequence,idempotency_key,request_digest,policy_id,consent_id,locale,input_text,relationship,goal_id,scope_version,task_id,parent_message_id)
 select r.message_id,c.id,c.owner_id,c.next_sequence+r.n-1,gen_random_uuid(),'${'c'.repeat(64)}',c.policy_id,c.consent_id,'en','Synthetic paging membership '||r.n,'follow_up','${root.goalId}',1,r.task_id,'${root.messageId}'
 from rows r cross join turn_private.assistant_conversations c where c.id='${root.conversationId}';
 update turn_private.assistant_conversations set next_sequence=next_sequence+21 where id='${root.conversationId}';`);
 const firstPage=await call(tasksPath,owner);assert.equal(firstPage.status,200);assert.equal(firstPage.body.messages.length,20);assert.ok(firstPage.body.nextCursor);
 const secondPage=await call(tasksPath+'?cursor='+firstPage.body.nextCursor,owner);
 assert.equal(secondPage.status,200);assert.equal(secondPage.body.messages.length,2);assert.equal(secondPage.body.nextCursor,null);
 assert.equal(new Set([...firstPage.body.turns,...secondPage.body.turns].map(x=>x.serviceTaskId)).size,22);
 assert.equal((await call(tasksPath+'?cursor='+firstPage.body.nextCursor,other)).status,403);
 assert.equal((await call(tasksPath+'?cursor='+firstPage.body.nextCursor+'&cursor='+firstPage.body.nextCursor,owner)).status,400);
 // Fresh membership invalidates the old cursor. A forged anchor cannot grant Task authority.
 const decoded=JSON.parse(Buffer.from(firstPage.body.nextCursor,'base64url').toString());
 const forged=Buffer.from(JSON.stringify({...decoded,messageId:randomUUID()})).toString('base64url');
 assert.equal((await call(tasksPath+'?cursor='+forged,owner)).status,403);
 const seq=e.sql(`select next_sequence from turn_private.assistant_conversations where id='${root.conversationId}';`);
 e.sql(`update turn_private.assistant_conversations set next_sequence=next_sequence+1 where id='${root.conversationId}';`);
 assert.equal((await call(tasksPath+'?cursor='+firstPage.body.nextCursor,owner)).status,403);
 e.sql(`update turn_private.assistant_conversations set next_sequence=${seq} where id='${root.conversationId}';`);
 const local=identityLocalEnv();assert.ok(local?.API_URL&&local.ANON_KEY);
 const patch={NEXT_PUBLIC_SUPABASE_URL:local.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:local.ANON_KEY,
  VISEPANDA_NATIVE_LOCAL_TEXT:'true',VISEPANDA_NATIVE_LOCAL_TEXT_POLICY:e.policyId,
  VISEPANDA_NATIVE_LOCAL_ASSISTANT_CONVERSATION:'false',VISEPANDA_NATIVE_LOCAL_TRIP:'true'};
 const previous=new Map(Object.keys(patch).map(key=>[key,process.env[key]]));Object.assign(process.env,patch);
 const request=(path,token=owner,method='GET',body,extra={})=>new NextRequest(e.api+path,{method,
  headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...extra},
  ...(body===undefined?{}:{body:JSON.stringify(body)})});
 try{
  const read=await nativeAssistantHTTP(request(base+'/conversation'));
  assert.equal((await nativeAssistantTasksHTTP(request(tasksPath),root.conversationId)).status,200,'new read survives producer-off');
  assert.equal(read.status,200,'disabling new intake must not hide accepted work');
  assert.equal(read.headers.get('cache-control'),'private, no-store');
  const data=await read.json();assert.equal(data.conversationId,second.conversationId);
  const rootRead=await nativeAssistantHTTP(request(base+'/conversation?conversationId='+root.conversationId));
  assert.equal((await rootRead.json()).messages.some(x=>x.messageId===link.messageId),false,'transcript remains its actual recent-50 window');
  assert.equal((await nativeAssistantTextHTTP(request(base+'/policy'),'policy')).status,200,'native policy bootstrap remains readable');
  const stranger=await nativeAssistantHTTP(request(base+'/conversation',other));
  assert.equal(stranger.status,200);assert.deepEqual((await stranger.json()).messages,[]);
  assert.equal((await nativeAssistantHTTP(request(base+'/conversation',null))).status,401);
  assert.equal((await nativeAssistantHTTP(request(base+'/conversation',owner,'GET',undefined,{Cookie:'synthetic=only'}))).status,400);
  assert.equal((await nativeAssistantHTTP(request(base+'/conversation',owner,'GET',undefined,{Origin:e.api}))).status,400);
  const selected = await nativeAssistantHTTP(request(base+'/conversation?conversationId='+root.conversationId));
  assert.equal(selected.status,200);assert.equal((await selected.json()).conversationId,root.conversationId);
  assert.equal((await nativeAssistantHTTP(request(base+'/conversation?conversationId='+root.conversationId,other))).status,403);
  assert.equal((await nativeAssistantHTTP(request(base+'/conversation?conversationId='+root.conversationId+'&conversationId='+root.conversationId))).status,400);
  assert.equal((await nativeAssistantHTTP(request(base+'/conversation?conversationId=invalid'))).status,400);
  assert.equal((await nativeAssistantHTTP(request(base+'/conversations?anything=true'),'list')).status,400);
  const list = await nativeAssistantHTTP(request(base+'/conversations'),'list');
  assert.equal(list.status,200);assert.equal(list.headers.get('cache-control'),'private, no-store');
  assert.deepEqual((await list.json()).conversations.map(x=>x.conversationId),[second.conversationId,root.conversationId]);
  const otherList = await nativeAssistantHTTP(request(base+'/conversations',other),'list');
  assert.deepEqual((await otherList.json()).conversations,[]);
  // Historical consent and expired policy cannot appear in summaries or selected reads.
  const historical=randomUUID();
  e.sql(`insert into turn_private.assistant_conversations(id,owner_id,policy_id,consent_id) values('${historical}','${e.users[0].id}','${e.policyId}','${randomUUID()}');`);
  assert.equal((await nativeAssistantHTTP(request(base+'/conversation?conversationId='+historical))).status,403);
  assert.equal((await (await nativeAssistantHTTP(request(base+'/conversations'),'list')).json()).conversations.length,2);
  const expired=randomUUID();
  e.sql(`insert into turn_private.text_policies select (jsonb_populate_record(null::turn_private.text_policies,to_jsonb(p)||jsonb_build_object('id','${expired}','expires_at',now()-interval '1 second'))).* from turn_private.text_policies p where id='${e.policyId}';`);
  process.env.VISEPANDA_NATIVE_LOCAL_TEXT_POLICY=expired;
  assert.equal((await nativeAssistantTasksHTTP(request(tasksPath),root.conversationId)).status,403);
  assert.equal((await nativeAssistantHTTP(request(base+'/conversations'),'list')).status,403);
  assert.equal((await nativeAssistantHTTP(request(base+'/conversation?conversationId='+root.conversationId))).status,403);
  process.env.VISEPANDA_NATIVE_LOCAL_TEXT_POLICY=e.policyId;
  e.sql(`insert into turn_private.assistant_conversations(id,owner_id,policy_id,consent_id,created_at)
    select gen_random_uuid(),owner_id,policy_id,consent_id,now()+n*interval '1 second'
    from turn_private.assistant_conversations cross join generate_series(1,21) n where id='${root.conversationId}';`);
  const bounded=await (await nativeAssistantHTTP(request(base+'/conversations'),'list')).json();
  assert.equal(bounded.conversations.length,20);assert.equal(bounded.limit,20);
  assert.ok(bounded.conversations.every(x=>x.preview===''));
  assert.equal((await nativeAssistantHTTP(request(base+'/conversation?conversationId='+root.conversationId))).status,200,'explicit older selection is independent of the list cap');
  const before=e.sql(`select count(*) from turn_private.assistant_messages where owner_id='${e.users[0].id}';`);
  assert.equal((await nativeAssistantHTTP(request(base+'/conversation',owner,'POST',{...link,messageId:randomUUID(),idempotencyKey:randomUUID()}))).status,503);
  assert.equal((await nativeAssistantTextHTTP(request(base+'/consent',other,'POST',{policyId:e.policyId,noticeHash:e.noticeHash}),'accept')).status,503);
  assert.equal(e.sql(`select count(*) from turn_private.assistant_messages where owner_id='${e.users[0].id}';`),before);
  assert.equal((await nativeTextHTTP(request('/api/chat/native/v1/turns/'+turnId+'/cancel',owner,'POST',{}),'cancel',turnId)).status,200);
  assert.equal(e.sql(`select status from public.turns where id='${turnId}';`),'cancelled');
  e.sql(`with rows as (select gen_random_uuid() id,n from generate_series(1,130) n)
   insert into turn_private.assistant_messages(id,conversation_id,owner_id,sequence,idempotency_key,request_digest,policy_id,consent_id,locale,input_text,relationship,goal_id,scope_version,task_id,parent_message_id)
   select r.id,c.id,c.owner_id,c.next_sequence+r.n-1,gen_random_uuid(),'${'b'.repeat(64)}',c.policy_id,c.consent_id,'en','Synthetic repeated membership','follow_up','${root.goalId}',1,'${taskId}','${root.messageId}'
   from rows r cross join turn_private.assistant_conversations c where c.id='${root.conversationId}';
   update turn_private.assistant_conversations set next_sequence=next_sequence+130 where id='${root.conversationId}';`);
  const sparse=await nativeAssistantTasksHTTP(request(tasksPath),root.conversationId);
  assert.equal(sparse.status,403);assert.equal((await sparse.json()).error.code,'DATA_POLICY_BLOCKED','raw128+sentinel never reports partial/empty completion');
  process.env.VISEPANDA_NATIVE_LOCAL_TEXT='false';
  assert.equal((await nativeAssistantHTTP(request(base+'/conversation'))).status,503,'the base text runtime kill switch remains authoritative');
  process.env.VISEPANDA_NATIVE_LOCAL_TEXT='true';
  assert.equal((await nativeAssistantTextHTTP(request(base+'/consent',owner,'DELETE',{policyId:e.policyId}),'withdraw')).status,200);
  assert.equal((await nativeAssistantHTTP(request(base+'/conversation'))).status,403,'rollback cannot recover withdrawn content');
  assert.equal((await nativeAssistantHTTP(request(base+'/conversations'),'list')).status,403);
  assert.equal((await nativeAssistantHTTP(request(base+'/conversation?conversationId='+root.conversationId))).status,403);
  assert.equal((await nativeAssistantTasksHTTP(request(tasksPath),root.conversationId)).status,403,'withdrawal hides conversation Task state');
  const replacement=await login(e.users[1]);
  assert.equal((await nativeAssistantHTTP(request(base+'/conversation',other))).status,401,'mobile-session replacement rejects the old token');
  assert.equal((await nativeAssistantTasksHTTP(request(tasksPath,other),root.conversationId)).status,401);
  assert.equal((await nativeAssistantHTTP(request(base+'/conversation',replacement))).status,200);
 }finally{for(const [key,value] of previous)value===undefined?delete process.env[key]:process.env[key]=value;}
});
