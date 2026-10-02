import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server.js';
import {nativeAssistantTasksHTTP} from '../../../lib/server/turn/native-assistant-tasks-http.ts';
import {nativeFixture,subject,sessionId} from '../../contract/identity/native-fixture.ts';
const policy='11111111-1111-4111-8111-111111111111',conversation='22222222-2222-4222-8222-222222222222',message='33333333-3333-4333-8333-333333333333';
let port=58700;
async function setup(t){
 const fixture=await nativeFixture(t,'http://127.0.0.1:'+port++);
 const patch={NEXT_PUBLIC_SUPABASE_URL:fixture.config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:fixture.config.publishableKey,
  VISEPANDA_NATIVE_LOCAL_TEXT:'true',VISEPANDA_NATIVE_LOCAL_TEXT_POLICY:policy,VISEPANDA_NATIVE_LOCAL_ASSISTANT_CONVERSATION:'false'};
 const prior=new Map(Object.keys(patch).map(k=>[k,process.env[k]]));Object.assign(process.env,patch);
 t.after(()=>{for(const[k,v]of prior)v===undefined?delete process.env[k]:process.env[k]=v;});
 const transport=globalThis.fetch,seen=[];let sessionData={subject,sessionId},sessionError=null,kind='conversation_tasks';
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const request=new Request(input,init),path=new URL(request.url).pathname;
  if(path.endsWith('/native_session_v2'))return sessionError?Response.json({message:sessionError},{status:400}):Response.json(sessionData);
  if(path.endsWith('/list_assistant_conversation_tasks_v1')){seen.push(await request.json());return Response.json({kind,conversationId:conversation,conversationSequence:3,limit:20,messages:[],turns:[],nextCursor:null});}
  return transport(input,init);
 });
 return {seen,session:value=>{sessionData=value;},error:value=>{sessionError=value;},kind:value=>{kind=value;},request:(query='',headers={},method='GET')=>new NextRequest('http://127.0.0.1/api/chat/native/v5/conversations/'+conversation+'/tasks'+query,{method,headers:{Authorization:'Bearer '+fixture.token,...headers}})};
}
test('conversation task read derives authority from membership and preserves producer-off reads',async t=>{
 const e=await setup(t),response=await nativeAssistantTasksHTTP(e.request(),conversation);
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.deepEqual(e.seen,[{p_policy_id:policy,p_conversation_id:conversation,p_cursor:null}]);
 const cursor={version:1,conversationId:conversation,conversationSequence:3,messageId:message};
 assert.equal((await nativeAssistantTasksHTTP(e.request('?cursor='+Buffer.from(JSON.stringify(cursor)).toString('base64url')),conversation)).status,200);
 assert.deepEqual(e.seen.at(-1).p_cursor,cursor);
 e.kind('unavailable');assert.equal((await nativeAssistantTasksHTTP(e.request(),conversation)).status,403);
});
test('closed task read rejects arbitrary IDs, duplicate cursor and browser credentials before RPC',async t=>{
 const e=await setup(t);
 for(const query of ['?taskId='+message,'?limit=100','?cursor=bad&cursor=bad','?cursor=%','?cursor='+Buffer.from('{}').toString('base64url')])assert.equal((await nativeAssistantTasksHTTP(e.request(query),conversation)).status,400);
 for(const headers of [{Cookie:'synthetic=only'},{Origin:'http://127.0.0.1'}])assert.equal((await nativeAssistantTasksHTTP(e.request('',headers),conversation)).status,400);
 assert.equal((await nativeAssistantTasksHTTP(e.request(), 'invalid')).status,400);assert.deepEqual(e.seen,[]);
});
test('transient session RPC failure is unavailable while actual replacement is unauthenticated',async t=>{
 const e=await setup(t);e.error('Temporary storage failure');assert.equal((await nativeAssistantTasksHTTP(e.request(),conversation)).status,503);
 e.error('UNAUTHENTICATED');assert.equal((await nativeAssistantTasksHTTP(e.request(),conversation)).status,401);
 e.error('SESSION_REPLACED');assert.equal((await nativeAssistantTasksHTTP(e.request(),conversation)).status,401);
 assert.deepEqual(e.seen,[]);
});

for(const [name,data,status] of [
 ['null',null,503],['empty',{},503],['missing-subject',{sessionId},503],['missing-session',{subject},503],
 ['invalid-subject',{subject:'invalid',sessionId},503],['invalid-session',{subject,sessionId:'invalid'},503],
 ['valid-subject-mismatch',{subject:conversation,sessionId},401],['valid-session-mismatch',{subject,sessionId:conversation},401],
])test('session reply classification: '+name,async t=>{
 const e=await setup(t);e.session(data);const response=await nativeAssistantTasksHTTP(e.request(),conversation);
 assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.deepEqual(await response.json(),{error:{code:status===503?'PROVIDER_UNAVAILABLE':'UNAUTHENTICATED'}});
 assert.deepEqual(e.seen,[],'no private read after invalid session response');
});
