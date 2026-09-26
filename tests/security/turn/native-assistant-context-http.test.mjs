import assert from 'node:assert/strict';
import test from 'node:test';
import {NextRequest} from 'next/server.js';
import {nativeAssistantContextHTTP,getNativeGoalContextConfig} from '../../../lib/server/turn/native-assistant-context-http.ts';
import {nativeFixture,subject,sessionId} from '../../contract/identity/native-fixture.ts';

const policyId='11111111-1111-4111-8111-111111111111';
const conversationId='22222222-2222-4222-8222-222222222222';
const goalId='33333333-3333-4333-8333-333333333333';
const messageId='44444444-4444-4444-8444-444444444444';
const memoryId='55555555-5555-4555-8555-555555555555';
const receiptId='66666666-6666-4666-8666-666666666666';
const consentId='77777777-7777-4777-8777-777777777777';
const input={conversationId,goalId,messageId,expectedGoalVersion:1,memoryIds:[memoryId]};
const conversation={kind:'conversation',conversationId,goals:[{goalId,scopeVersion:1,text:'Plan rail travel in China'}],
 messages:[{messageId,sequence:1,goalId,scopeVersion:1,text:'Compare rail routes',taskId:null}]};
const memory={id:memoryId,owner_id:subject,source_receipt_id:receiptId,consent_id:consentId,
 state:'explicit',constraint_kind:'preference',summary:'Prefer rail with fewer transfers',updated_at:'2026-09-27T00:00:00.000Z',revision:1};
let port=58250;
async function setup(t){
 const fixture=await nativeFixture(t,'http://127.0.0.1:'+port++);
 const patch={NEXT_PUBLIC_SUPABASE_URL:fixture.config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:fixture.config.publishableKey,
  VISEPANDA_NATIVE_LOCAL_TEXT:'true',VISEPANDA_NATIVE_LOCAL_TEXT_POLICY:policyId,VISEPANDA_NATIVE_LOCAL_ASSISTANT_CONVERSATION:'true',VISEPANDA_NATIVE_LOCAL_GOAL_CONTEXT:'true'};
 const prior=new Map(Object.keys(patch).map(key=>[key,process.env[key]]));
 Object.assign(process.env,patch);t.after(()=>{for(const [key,value] of prior)value===undefined?delete process.env[key]:process.env[key]=value;});
 return {...fixture,request:(signal)=>new NextRequest('http://127.0.0.1/api/chat/native/v5/context',{
  method:'POST',headers:{Authorization:'Bearer '+fixture.token,'Content-Type':'application/json'},body:JSON.stringify(input),signal})};
}
const pathOf=input=>new URL(typeof input==='string'?input:input.url??String(input)).pathname;

test('goal manifest has a separate default-closed activation gate',async t=>{
 const fixture=await setup(t);
 delete process.env.VISEPANDA_NATIVE_LOCAL_GOAL_CONTEXT;
 assert.equal(getNativeGoalContextConfig(fixture.request()),null);
 assert.equal((await nativeAssistantContextHTTP(fixture.request())).status,503);
 process.env.VISEPANDA_NATIVE_LOCAL_GOAL_CONTEXT='true';
 assert.ok(getNativeGoalContextConfig(fixture.request()));
});

for(const [name,secondMemory,expected] of [
 ['stable',[memory],200],['withdrawn',[],403],['corrected',[{...memory,revision:2,summary:'Prefer a slower rail trip'}],409],
])test('goal manifest '+name+' source recheck',{timeout:4000},async t=>{
 const fixture=await setup(t),transport=globalThis.fetch;let reads=0;
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const path=pathOf(input);
  if(path.endsWith('/read_retrievable_memory_profiles')){
   const query=new URL(typeof input==='string'?input:input.url??String(input));
   assert.match(query.searchParams.get('id')??'',/in/,'only selected ids may be queried');
   assert.ok(!(query.searchParams.get('select')??'').includes('pace_request'),'management metadata is not requested');
  }
  if(path.endsWith('/native_session_v2'))return Response.json({version:2,subject,sessionId,mobileEpoch:1});
  if(path.endsWith('/read_assistant_conversation_v1'))return Response.json(conversation);
  if(path.endsWith('/read_retrievable_memory_profiles'))return Response.json(++reads===1?[memory]:secondMemory);
  return transport(input,init);
 });
 const result=await nativeAssistantContextHTTP(fixture.request());
 assert.equal(result.status,expected);
 if(expected===200){const body=await result.json();assert.equal(body.readyForProvider,false);assert.equal(JSON.stringify(body).includes(memory.summary),false);}
 assert.equal(reads,2,'the selected Memory is re-read before the manifest leaves the server');
});

test('replaced session and a cancelled late Memory reply cannot produce a manifest',{timeout:4000},async t=>{
 const fixture=await setup(t),transport=globalThis.fetch;let reads=0,sessions=0;
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const path=pathOf(input);
  if(path.endsWith('/native_session_v2'))return ++sessions===1?Response.json({version:2,subject,sessionId,mobileEpoch:1})
    :Response.json({message:'SESSION_REPLACED'},{status:400});
  if(path.endsWith('/read_assistant_conversation_v1'))return Response.json(conversation);
  if(path.endsWith('/read_retrievable_memory_profiles')){reads++;return Response.json([memory]);}
  return transport(input,init);
 });
 assert.equal((await nativeAssistantContextHTTP(fixture.request())).status,401);
 assert.equal(reads,2);
});

test('abort while second Memory read is held prevents a late manifest',{timeout:4000},async t=>{
 const fixture=await setup(t),transport=globalThis.fetch,controller=new AbortController();
 let arrived,release,reads=0,sessions=0;
 const seen=new Promise(resolve=>arrived=resolve),held=new Promise(resolve=>release=resolve);
 t.after(()=>{controller.abort();release();});
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const path=pathOf(input);
  if(path.endsWith('/native_session_v2')){sessions++;return Response.json({version:2,subject,sessionId,mobileEpoch:1});}
  if(path.endsWith('/read_assistant_conversation_v1'))return Response.json(conversation);
  if(path.endsWith('/read_retrievable_memory_profiles')){
   if(++reads===2){arrived();await held;}
   return Response.json([memory]);
  }
  return transport(input,init);
 });
 const pending=nativeAssistantContextHTTP(fixture.request(controller.signal));
 await seen;controller.abort();
 const result=await pending;assert.equal(result.status,503);
 release();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(sessions,1,'late data cannot cause final session acceptance or a response');
});
