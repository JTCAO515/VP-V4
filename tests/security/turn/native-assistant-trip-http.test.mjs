import assert from 'node:assert/strict';
import test from 'node:test';
import {NextRequest} from 'next/server.js';
import {nativeAssistantTripHTTP,nativeAssistantTripPrivacyHTTP} from '../../../lib/server/turn/native-assistant-trip-http.ts';
import {nativeFixture,subject,sessionId} from '../../contract/identity/native-fixture.ts';

const policyId='11111111-1111-4111-8111-111111111111';
const goalId='22222222-2222-4222-8222-222222222222';
const body={operationId:'33333333-3333-4333-8333-333333333333',conversationId:'44444444-4444-4444-8444-444444444444',
 sourceMessageId:null,expectedGoalScopeVersion:2,expectedLinkVersion:1,action:'link',
 tripId:'55555555-5555-4555-8555-555555555555',expectedTripVersion:0,confirmed:true};
let port=58350;
async function setup(t){
 const fixture=await nativeFixture(t,'http://127.0.0.1:'+port++);
 const patch={NEXT_PUBLIC_SUPABASE_URL:fixture.config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:fixture.config.publishableKey,
  VISEPANDA_NATIVE_LOCAL_TEXT:'true',VISEPANDA_NATIVE_LOCAL_TEXT_POLICY:policyId,
  VISEPANDA_NATIVE_LOCAL_TRIP:'true',VISEPANDA_NATIVE_LOCAL_ASSISTANT_CONVERSATION:'true'};
 const prior=new Map(Object.keys(patch).map(key=>[key,process.env[key]]));
 Object.assign(process.env,patch);t.after(()=>{for(const [key,value] of prior)value===undefined?delete process.env[key]:process.env[key]=value;});
 return {...fixture,request:(init={})=>new NextRequest('http://127.0.0.1/api/chat/native/v5/goals/'+goalId+'/trip',{
  ...init,headers:{Authorization:'Bearer '+fixture.token,...init.headers}})};
}
const pathOf=input=>new URL(typeof input==='string'?input:input.url??String(input)).pathname;

test('goal Trip API is closed without v5 flag and rejects unconfirmed or forged fields before I/O',async t=>{
 const fixture=await setup(t);
 delete process.env.VISEPANDA_NATIVE_LOCAL_ASSISTANT_CONVERSATION;
 assert.equal((await nativeAssistantTripHTTP(fixture.request({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),goalId)).status,503,
  'disabled assistant cannot create a new Trip link');
 process.env.VISEPANDA_NATIVE_LOCAL_ASSISTANT_CONVERSATION='true';
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('unexpected network');});
 for(const payload of [{...body,confirmed:false},{...body,ownerId:subject},{...body,expectedLinkVersion:-1},
  {...body,action:'unlink',tripId:body.tripId},{...body,tripId:'not-uuid'}]){
  const result=await nativeAssistantTripHTTP(fixture.request({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}),goalId);
  assert.equal(result.status,400);
 }
 assert.equal((await nativeAssistantTripHTTP(fixture.request({headers:{Cookie:'synthetic'}}),goalId)).status,400);
 assert.equal((await nativeAssistantTripHTTP(new NextRequest('http://127.0.0.1/api/chat/native/v5/goals/'+goalId+'/trip?owner=other',{headers:{Authorization:'Bearer '+fixture.token}}),goalId)).status,400);
 assert.equal(calls,0);
});

test('feature-off Trip authority keeps owner privacy list/read/unlink but never enables link',async t=>{
 const fixture=await setup(t),transport=globalThis.fetch;
 delete process.env.VISEPANDA_NATIVE_LOCAL_ASSISTANT_CONVERSATION;
 const paths=[];
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const path=pathOf(input);paths.push(path);
  if(path.endsWith('/native_session_v2'))return Response.json({version:2,subject,sessionId,mobileEpoch:1});
  if(path.endsWith('/read_assistant_goal_trip_link_v1'))return Response.json({kind:'goal_trip_link',goalId,conversationId:body.conversationId,
   goalScopeVersion:2,linkVersion:1,tripId:body.tripId,tripHeadVersion:0,current:false});
  if(path.endsWith('/list_assistant_goal_trip_links_v1'))return Response.json({kind:'goal_trip_links',links:[{goalId,tripId:body.tripId}]});
  if(path.endsWith('/set_assistant_goal_trip_link_v1'))return Response.json({kind:'goal_trip_link',operationId:body.operationId,
   goalScopeVersion:3,linkVersion:2,tripId:null,tripHeadVersion:null,reused:false});
  return transport(input,init);
 });
 assert.equal((await nativeAssistantTripHTTP(fixture.request(),goalId)).status,200);
 assert.equal((await nativeAssistantTripPrivacyHTTP(fixture.request())).status,200);
 const unlink={...body,sourceMessageId:null,action:'unlink',tripId:null,expectedTripVersion:null};
 assert.equal((await nativeAssistantTripHTTP(fixture.request({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(unlink)}),goalId)).status,201);
 assert.equal((await nativeAssistantTripHTTP(fixture.request({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),goalId)).status,503);
 assert.equal(paths.filter(path=>path.endsWith('/set_assistant_goal_trip_link_v1')).length,1,'only privacy unlink reaches the mutation RPC');
});

test('replaced mobile session denies a goal Trip read before its private RPC',async t=>{
 const fixture=await setup(t),transport=globalThis.fetch;let reads=0;
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const path=pathOf(input);
  if(path.endsWith('/native_session_v2'))return Response.json({message:'SESSION_REPLACED'},{status:400});
  if(path.endsWith('/read_assistant_goal_trip_link_v1'))reads++;
  return transport(input,init);
 });
 assert.equal((await nativeAssistantTripHTTP(fixture.request(),goalId)).status,401);
 assert.equal(reads,0);
});

test('aborted private read cannot return a late link to another session',{timeout:4000},async t=>{
 const fixture=await setup(t),transport=globalThis.fetch,controller=new AbortController();
 let arrived,release,reads=0;const seen=new Promise(resolve=>arrived=resolve),held=new Promise(resolve=>release=resolve);
 t.after(()=>{controller.abort();release();});
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const path=pathOf(input);
  if(path.endsWith('/native_session_v2'))return Response.json({version:2,subject,sessionId,mobileEpoch:1});
  if(path.endsWith('/read_assistant_goal_trip_link_v1')){
   reads++;arrived();await held;
   return Response.json({kind:'goal_trip_link',goalId,conversationId:body.conversationId,goalScopeVersion:2,linkVersion:1,tripId:body.tripId,tripHeadVersion:0,current:true});
  }
  return transport(input,init);
 });
 const pending=nativeAssistantTripHTTP(fixture.request({signal:controller.signal}),goalId);
 await seen;controller.abort();assert.equal((await pending).status,503);
 release();await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,1);
});
