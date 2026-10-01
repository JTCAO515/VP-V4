import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {NextRequest} from 'next/server.js';
import {createNativeTextEnvironment} from './native-text-environment.mjs';
import {identityLocalEnv} from '../identity/local-supabase.mjs';
import {nativeAssistantHTTP,nativeAssistantTextHTTP} from '../../../lib/server/turn/native-assistant-http.ts';
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
  assert.equal(read.status,200,'disabling new intake must not hide accepted work');
  assert.equal(read.headers.get('cache-control'),'private, no-store');
  const data=await read.json();assert.equal(data.conversationId,root.conversationId);
  assert.equal(data.messages.at(-1).taskId,taskId);
  assert.equal((await nativeAssistantTextHTTP(request(base+'/policy'),'policy')).status,200,'native policy bootstrap remains readable');
  const stranger=await nativeAssistantHTTP(request(base+'/conversation',other));
  assert.equal(stranger.status,200);assert.deepEqual((await stranger.json()).messages,[]);
  assert.equal((await nativeAssistantHTTP(request(base+'/conversation',null))).status,401);
  assert.equal((await nativeAssistantHTTP(request(base+'/conversation',owner,'GET',undefined,{Cookie:'synthetic=only'}))).status,400);
  assert.equal((await nativeAssistantHTTP(request(base+'/conversation',owner,'GET',undefined,{Origin:e.api}))).status,400);
  assert.equal((await nativeAssistantHTTP(request(base+'/conversation?conversationId='+root.conversationId))).status,400);
  const before=e.sql(`select count(*) from turn_private.assistant_messages where owner_id='${e.users[0].id}';`);
  assert.equal((await nativeAssistantHTTP(request(base+'/conversation',owner,'POST',{...link,messageId:randomUUID(),idempotencyKey:randomUUID()}))).status,503);
  assert.equal((await nativeAssistantTextHTTP(request(base+'/consent',other,'POST',{policyId:e.policyId,noticeHash:e.noticeHash}),'accept')).status,503);
  assert.equal(e.sql(`select count(*) from turn_private.assistant_messages where owner_id='${e.users[0].id}';`),before);
  assert.equal((await nativeTextHTTP(request('/api/chat/native/v1/turns/'+turnId+'/cancel',owner,'POST',{}),'cancel',turnId)).status,200);
  assert.equal(e.sql(`select status from public.turns where id='${turnId}';`),'cancelled');
  process.env.VISEPANDA_NATIVE_LOCAL_TEXT='false';
  assert.equal((await nativeAssistantHTTP(request(base+'/conversation'))).status,503,'the base text runtime kill switch remains authoritative');
  process.env.VISEPANDA_NATIVE_LOCAL_TEXT='true';
  assert.equal((await nativeAssistantTextHTTP(request(base+'/consent',owner,'DELETE',{policyId:e.policyId}),'withdraw')).status,200);
  assert.equal((await nativeAssistantHTTP(request(base+'/conversation'))).status,403,'rollback cannot recover withdrawn content');
  const replacement=await login(e.users[1]);
  assert.equal((await nativeAssistantHTTP(request(base+'/conversation',other))).status,401,'mobile-session replacement rejects the old token');
  assert.equal((await nativeAssistantHTTP(request(base+'/conversation',replacement))).status,200);
 }finally{for(const [key,value] of previous)value===undefined?delete process.env[key]:process.env[key]=value;}
});
