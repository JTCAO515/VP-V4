import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server.js';
import {nativeAssistantEventsHTTP} from '../../../../lib/server/turn/assistant-events/http.ts';
import {nativeFixture,subject,sessionId} from '../../../contract/identity/native-fixture.ts';
const policy='11111111-1111-4111-8111-111111111111',conversation='22222222-2222-4222-8222-222222222222',task='33333333-3333-4333-8333-333333333333';
let port=58740;
async function setup(t){
 const fixture=await nativeFixture(t,'http://127.0.0.1:'+port++);
 const patch={VISEPANDA_NATIVE_ASSISTANT_EVENTS:'true',NEXT_PUBLIC_SUPABASE_URL:fixture.config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:fixture.config.publishableKey,
 VISEPANDA_NATIVE_LOCAL_TEXT:'true',VISEPANDA_NATIVE_LOCAL_TEXT_POLICY:policy,VISEPANDA_NATIVE_LOCAL_ASSISTANT_CONVERSATION:'false'};
 const prior=new Map(Object.keys(patch).map(k=>[k,process.env[k]]));Object.assign(process.env,patch);
 t.after(()=>{for(const[k,v]of prior)v===undefined?delete process.env[k]:process.env[k]=v;});
 const transport=globalThis.fetch,seen=[];let sessionData={subject,sessionId},error=null;
 let value={kind:'assistant_events',schemaVersion:'assistant-events/1',conversationId:conversation,afterSequence:0,lastSequence:1,hasMore:false,
 events:[{eventId:conversation+':1',sequence:1,type:'artifact_invalidated',taskId:task,turnId:task,artifactId:task,revision:1,availability:'unavailable'}]};
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const request=new Request(input,init),path=new URL(request.url).pathname;
  if(path.endsWith('/native_session_v2'))return Response.json(sessionData);
  if(path.endsWith('/read_assistant_events_v1')){seen.push(await request.json());return error?Response.json({message:error},{status:400}):Response.json(value);}
  return transport(input,init);
 });
 return {seen,session:v=>{sessionData=v;},value:v=>{value=v;},error:v=>{error=v;},request:(headers={},query='',method='GET')=>new NextRequest('http://127.0.0.1/api/chat/native/v5/assistant-events/'+conversation+query,{method,headers:{Authorization:'Bearer '+fixture.token,...headers}})};
}
test('signed ordinary Auth reaches only the fixed owned replay reader, with producer off',async t=>{
 const e=await setup(t),r=await nativeAssistantEventsHTTP(e.request(),conversation);
 assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.match(r.headers.get('content-type'),/text\/event-stream/);
 assert.deepEqual(e.seen,[{p_policy_id:policy,p_conversation_id:conversation,p_after_sequence:0,p_limit:50}]);
 assert.match(await r.text(),/artifact_invalidated/);
});
test('browser, alternate cursor and malformed scope fail before private RPC',async t=>{
 const e=await setup(t);
 for(const h of [{Cookie:'fixture=true'},{Origin:'http://127.0.0.1'},{'Last-Event-ID':'01'},{Authorization:'Bearer invalid'}])assert.ok([400,401].includes((await nativeAssistantEventsHTTP(e.request(h),conversation)).status));
 for(const q of ['?afterSequence=1','?limit=100'])assert.equal((await nativeAssistantEventsHTTP(e.request({},q),conversation)).status,400);
 assert.equal((await nativeAssistantEventsHTTP(e.request(),'invalid')).status,400);
 assert.deepEqual(e.seen,[]);
});
test('replaced actor/session and malformed session never reach replay',async t=>{
 const e=await setup(t);
 for(const v of [null,{}, {subject,sessionId:'bad'}]){e.session(v);assert.equal((await nativeAssistantEventsHTTP(e.request(),conversation)).status,503);}
 for(const v of [{subject:conversation,sessionId},{subject,sessionId:conversation}]){e.session(v);assert.equal((await nativeAssistantEventsHTTP(e.request(),conversation)).status,401);}
 assert.deepEqual(e.seen,[]);
});
test('denied, malformed, missing SQL reader and future cursor never emit SSE ids',async t=>{
 const e=await setup(t);
 for(const [value,status] of [[{kind:'unavailable'},403],[null,500],[{kind:'assistant_events',prompt:'must-not-leak'},500]]){
  e.value(value);const r=await nativeAssistantEventsHTTP(e.request(),conversation);assert.equal(r.status,status);assert.doesNotMatch(await r.text(),/id:|must-not-leak/);
 }
 for(const [error,status] of [['function does not exist',503],['INVALID_INPUT',400],['SESSION_REPLACED',401]]){
  e.error(error);const r=await nativeAssistantEventsHTTP(e.request({'Last-Event-ID':'99'}),conversation);assert.equal(r.status,status);assert.doesNotMatch(await r.text(),/id:/);
 }
});

test('additive reader defaults deny without touching original producer flags',async t=>{
 const e=await setup(t);delete process.env.VISEPANDA_NATIVE_ASSISTANT_EVENTS;
 assert.equal((await nativeAssistantEventsHTTP(e.request(),conversation)).status,503);assert.deepEqual(e.seen,[]);
});
