import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server.js';
import {nativeAssistantHTTP} from '../../../lib/server/turn/native-assistant-http.ts';
import {nativeFixture,subject,sessionId} from '../../contract/identity/native-fixture.ts';

const policy='11111111-1111-4111-8111-111111111111',conversation='22222222-2222-4222-8222-222222222222';
let port=58390;
async function setup(t){
 const fixture=await nativeFixture(t,'http://127.0.0.1:'+port++);
 const patch={NEXT_PUBLIC_SUPABASE_URL:fixture.config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:fixture.config.publishableKey,
  VISEPANDA_NATIVE_LOCAL_TEXT:'true',VISEPANDA_NATIVE_LOCAL_TEXT_POLICY:policy,VISEPANDA_NATIVE_LOCAL_ASSISTANT_CONVERSATION:'false'};
 const prior=new Map(Object.keys(patch).map(k=>[k,process.env[k]]));Object.assign(process.env,patch);
 t.after(()=>{for(const [k,v] of prior)v===undefined?delete process.env[k]:process.env[k]=v;});
 const transport=globalThis.fetch,seen=[];let selected=conversation;
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const request=new Request(input,init),path=new URL(request.url).pathname;
  if(path.endsWith('/native_session_v2'))return Response.json({subject,sessionId});
  if(path.endsWith('/read_assistant_conversation_v1')){
   seen.push({name:'read',body:await request.json()});
   return Response.json({kind:'conversation',conversationId:selected,nextSequence:1,messages:[],goals:[]});
  }
  if(path.endsWith('/list_assistant_conversations_v1')){
   seen.push({name:'list',body:await request.json()});return Response.json({kind:'conversations',conversations:[],limit:20});
  }
  return transport(input,init);
 });
 return {seen,setSelected:id=>{selected=id;},request:(query='',method='GET',headers={})=>new NextRequest('http://127.0.0.1/api/chat/native/v5/conversation'+query,
  {method,headers:{Authorization:'Bearer '+fixture.token,...headers}})};
}

test('selected read passes exact ID and policy to owner RPC while producer is off',async t=>{
 const e=await setup(t);
 assert.equal((await nativeAssistantHTTP(e.request('?conversationId='+conversation))).status,200);
 assert.deepEqual(e.seen,[{name:'read',body:{p_policy_id:policy,p_conversation_id:conversation}}]);
 e.seen.length=0;
 assert.equal((await nativeAssistantHTTP(e.request())).status,200);
 assert.equal(e.seen[0].body.p_conversation_id,null,'default remains latest');
 e.setSelected(null);
 assert.equal((await nativeAssistantHTTP(e.request('?conversationId='+conversation))).status,403,'no silent empty/new conversation fallback');
});

test('list has fixed bounded RPC and no intake gate or query expansion',async t=>{
 const e=await setup(t),response=await nativeAssistantHTTP(e.request(),'list');
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.deepEqual(e.seen,[{name:'list',body:{p_policy_id:policy}}]);
 for(const query of ['?limit=100','?conversationId='+conversation,'?policyId='+policy])assert.equal((await nativeAssistantHTTP(e.request(query),'list')).status,400);
 assert.equal((await nativeAssistantHTTP(e.request('','POST'),'list')).status,503);
});

test('selection rejects duplicate, malformed, unknown and browser credential inputs before RPC',async t=>{
 const e=await setup(t);
 for(const query of ['?conversationId=invalid','?conversationId=','?conversationId='+conversation+'&conversationId='+conversation,'?actorId='+conversation]){
  assert.equal((await nativeAssistantHTTP(e.request(query))).status,400);
 }
 for(const headers of [{Cookie:'synthetic=only'},{Origin:'http://127.0.0.1'}])assert.equal((await nativeAssistantHTTP(e.request('?conversationId='+conversation,'GET',headers))).status,400);
 assert.deepEqual(e.seen,[]);
});
