import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as uuid} from 'node:crypto';
import {createNativeTextEnvironment} from './native-text-environment.mjs';

test('real Auth/HTTP cross-conversation goal pages, actor/session/consent changes fail closed',{
 skip:process.env.VP_NATIVE_TEXT_INTEGRATION!=='true',timeout:180000,
},async t=>{
 const e=await createNativeTextEnvironment();t.after(()=>e.cleanup());
 const call=async(path,token,method='GET',body)=>{
  const response=await fetch(e.api+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')};
 };
 const login=async user=>{
  const attemptId=uuid(),r=await call('/api/auth/native/v2/credentials',null,'POST',{email:user.email,password:user.password,attemptId});assert.equal(r.status,200);
  assert.equal((await call('/api/auth/native/v2/login',r.body.accessToken,'POST',{attemptId})).status,200);return r.body.accessToken;
 };
 const owner=await login(e.users[0]),other=await login(e.users[1]),base='/api/chat/native/v5',index=base+'/journeys-goals';
 for(const token of [owner,other])assert.equal((await call(base+'/consent',token,'POST',{policyId:e.policyId,noticeHash:e.noticeHash})).status,200);
 const root={conversationId:uuid(),messageId:uuid(),idempotencyKey:uuid(),policyId:e.policyId,locale:'en',text:'Undated old goal',relationship:'goal_start',goalId:uuid(),expectedGoalVersion:null,taskId:null,parentMessageId:null,turnId:null};
 assert.equal((await call(base+'/conversation',owner,'POST',root)).status,201);
 const latest={...root,conversationId:uuid(),messageId:uuid(),idempotencyKey:uuid(),goalId:uuid(),text:'Latest conversation goal'};
 assert.equal((await call(base+'/conversation',owner,'POST',latest)).status,201);
 assert.equal((await call(base+'/conversation',owner)).body.conversationId,latest.conversationId);
 e.sql(`insert into turn_private.assistant_goals(id,conversation_id,owner_id,current_text) select gen_random_uuid(),'${root.conversationId}','${e.users[0].id}','Synthetic additional old goal '||i from generate_series(1,25) i;`);
 let first=await call(index,owner);assert.equal(first.status,200);assert.equal(first.cache,'private, no-store');assert.equal(first.body.goals.length,20);assert.ok(first.body.nextCursor);
 let next=await call(index+'/'+first.body.nextCursor,owner);assert.equal(next.status,200);assert.equal(next.body.goals.length,7);assert.equal(next.body.nextCursor,null);
 const rows=[...first.body.goals,...next.body.goals];assert.ok(rows.some(r=>r.goalId===root.goalId));assert.ok(rows.some(r=>r.goalId===latest.goalId));
 assert.equal(new Set(rows.map(r=>r.goalId)).size,27);assert.ok(!Object.hasOwn(first.body,'messages'));
 assert.equal((await call(base+'/conversation?conversationId='+root.conversationId,owner)).body.goals.find(r=>r.goalId===root.goalId).scopeVersion,1);
 assert.equal((await call(index+'/'+first.body.nextCursor,other)).status,403);
 assert.equal((await call(index+'?owner='+e.users[1].id,owner)).status,400);assert.equal((await call(index,undefined)).status,401);
 assert.equal((await call(base+'/conversation',owner,'POST',{...root,messageId:uuid(),idempotencyKey:uuid(),relationship:'amendment',expectedGoalVersion:1,parentMessageId:root.messageId,text:'Corrected old goal'})).status,201);
 assert.equal((await call(index+'/'+first.body.nextCursor,owner)).status,403);
 first=await call(index,owner);e.sql(`delete from turn_private.assistant_goals where id='${first.body.goals[0].goalId}';`);assert.equal((await call(index+'/'+first.body.nextCursor,owner)).status,403);
 const replacement=await login(e.users[0]);assert.equal((await call(index,owner)).status,401);assert.equal((await call(index+'/'+first.body.nextCursor,replacement)).status,403);
 assert.equal((await call(base+'/consent',replacement,'DELETE',{policyId:e.policyId})).status,200);
 const withdrawn=await call(index,replacement);assert.equal(withdrawn.status,403);assert.deepEqual(withdrawn.body,{error:{code:'DATA_POLICY_BLOCKED'}});
 assert.equal(e.counts.http,0,'read-only/goal records never call even the synthetic model');
});
