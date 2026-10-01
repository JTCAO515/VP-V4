import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server.js';
import {nativeAssistantTaskActivityHTTP} from '../../../lib/server/turn/native-assistant-task-activity-http.ts';
import {nativeFixture,subject,sessionId} from '../../contract/identity/native-fixture.ts';
const policy='11111111-1111-4111-8111-111111111111',conversation='22222222-2222-4222-8222-222222222222',message='33333333-3333-4333-8333-333333333333';
let port=58700;
async function setup(t){
 const fixture=await nativeFixture(t,'http://127.0.0.1:'+port++);
 const patch={NEXT_PUBLIC_SUPABASE_URL:fixture.config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:fixture.config.publishableKey,
  VISEPANDA_NATIVE_LOCAL_TEXT:'true',VISEPANDA_NATIVE_LOCAL_TEXT_POLICY:policy,VISEPANDA_NATIVE_LOCAL_ASSISTANT_CONVERSATION:'false'};
 const prior=new Map(Object.keys(patch).map(k=>[k,process.env[k]]));Object.assign(process.env,patch);
 t.after(()=>{for(const[k,v]of prior)v===undefined?delete process.env[k]:process.env[k]=v;});
 const transport=globalThis.fetch,seen=[];let sessionError=null,kind='task_activity',actions=[{tool:'place.read',state:'unknown'}];
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const request=new Request(input,init),path=new URL(request.url).pathname;
  if(path.endsWith('/native_session_v2'))return sessionError?Response.json({message:sessionError},{status:400}):Response.json({subject,sessionId});
  if(path.endsWith('/read_assistant_task_activity_v1')){seen.push(await request.json());return Response.json({kind,conversationId:conversation,taskId:message,turnId:message,turnStatus:'cancelled',limit:4,recording:'recorded',actions,privateDigest:'must-not-leak'});}
  return transport(input,init);
 });
 return {seen,actions:value=>{actions=value;},error:value=>{sessionError=value;},kind:value=>{kind=value;},request:(query='',headers={},method='GET')=>new NextRequest('http://127.0.0.1/api/chat/native/v5/conversations/'+conversation+'/tasks/'+message+'/activity'+query,{method,headers:{Authorization:'Bearer '+fixture.token,...headers}})};
}
test('activity read retains unknown/terminal state with producer off and allowlists private fields',async t=>{
 const e=await setup(t),response=await nativeAssistantTaskActivityHTTP(e.request(),conversation,message);
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.deepEqual(e.seen,[{p_policy_id:policy,p_conversation_id:conversation,p_task_id:message}]);
 const data=await response.json();assert.equal(data.turnStatus,'cancelled');assert.equal(data.actions[0].state,'unknown');
 assert.equal(Object.hasOwn(data,'privateDigest'),false);
 e.kind('unavailable');assert.equal((await nativeAssistantTaskActivityHTTP(e.request(),conversation,message)).status,403);
});
test('closed task read rejects arbitrary IDs, duplicate cursor and browser credentials before RPC',async t=>{
 const e=await setup(t);
 for(const query of ['?taskId='+message,'?limit=100','?cursor=bad&cursor=bad','?cursor=%','?cursor='+Buffer.from('{}').toString('base64url')])assert.equal((await nativeAssistantTaskActivityHTTP(e.request(query),conversation,message)).status,400);
 for(const headers of [{Cookie:'synthetic=only'},{Origin:'http://127.0.0.1'}])assert.equal((await nativeAssistantTaskActivityHTTP(e.request('',headers),conversation,message)).status,400);
 assert.equal((await nativeAssistantTaskActivityHTTP(e.request(), 'invalid',message)).status,400);assert.deepEqual(e.seen,[]);
});
test('transient session RPC failure is unavailable while actual replacement is unauthenticated',async t=>{
 const e=await setup(t);e.error('Temporary storage failure');assert.equal((await nativeAssistantTaskActivityHTTP(e.request(),conversation,message)).status,503);
 e.error('SESSION_REPLACED');assert.equal((await nativeAssistantTaskActivityHTTP(e.request(),conversation,message)).status,401);
 assert.deepEqual(e.seen,[]);
});

test('activity response rejects invented tools, states, overflow and private action fields',async t=>{
 const e=await setup(t);
 for(const actions of [[{tool:['place.read'],state:'completed'}],[{tool:'web.browser',state:'completed'}],[{tool:'place.read',state:'done'}],
  Array.from({length:5},()=>({tool:'place.read',state:'completed'})),[{tool:'place.read',state:'unknown',lease:'private'}]]){
  e.actions(actions);assert.equal((await nativeAssistantTaskActivityHTTP(e.request(),conversation,message)).status,500);
 }
});
