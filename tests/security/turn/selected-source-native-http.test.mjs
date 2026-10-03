import test from 'node:test';import assert from 'node:assert/strict';import {NextRequest} from 'next/server.js';
import {nativeAssistantHTTP,validSelectedSources} from '../../../lib/server/turn/native-assistant-http.ts';
import {nativeAssistantSelectedSourceContextHTTP} from '../../../lib/server/turn/native-assistant-context-http.ts';
import {nativeFixture,subject,sessionId} from '../../contract/identity/native-fixture.ts';
const id='11111111-1111-4111-8111-111111111111',goal='22222222-2222-4222-8222-222222222222',message='33333333-3333-4333-8333-333333333333',artifact='44444444-4444-4444-8444-444444444444';
const refs={artifact:null,trip:null,evidence:[]},body={schemaVersion:'assistant-message-sources/2',conversationId:id,messageId:message,idempotencyKey:id,policyId:id,locale:'en',text:'Ordinary follow up',relationship:'follow_up',goalId:goal,expectedGoalVersion:1,taskId:null,parentMessageId:artifact,turnId:null,selectedSources:refs};
const receipt={kind:'accepted',conversationId:id,messageId:message,sequence:3,goalId:goal,scopeVersion:1,turnId:null,reused:false,selectedSources:refs,readyForProvider:false};
const read={kind:'selected_source_context',conversationId:id,goal:{id:goal,scopeVersion:2,text:'Updated goal'},message:{id:message,sequence:3,goalId:goal,scopeVersion:2,text:'Use the earlier result',taskId:null},capturedSources:{...refs,artifact:{artifactId:artifact,revision:1,purpose:'previous_result_reference'}},artifact:{kind:'result_artifact',artifactId:artifact,revision:1,historicalReadable:true,current:false,content:{schemaVersion:'comparison/1',title:'Earlier result',summary:'Old comparison',options:[],actions:[]},source:{goalVersion:1}},trip:null,evidence:[],tasks:[],history:[],readyForProvider:false,recipient:'first_party'};
let port=59200;
async function setup(t,options={}){
 const f=await nativeFixture(t,'http://127.0.0.1:'+port++),patch={NEXT_PUBLIC_SUPABASE_URL:f.config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey,VISEPANDA_NATIVE_LOCAL_TEXT:'true',VISEPANDA_NATIVE_LOCAL_TEXT_POLICY:id,VISEPANDA_NATIVE_LOCAL_ASSISTANT_CONVERSATION:options.producer??'true',VISEPANDA_NATIVE_LOCAL_GOAL_CONTEXT:'true'};const old=new Map(Object.keys(patch).map(k=>[k,process.env[k]]));Object.assign(process.env,patch);t.after(()=>{for(const[k,v]of old)v===undefined?delete process.env[k]:process.env[k]=v;});
 let sessions=0,reads=0;const calls=[],prev=globalThis.fetch;t.mock.method(globalThis,'fetch',async(input,init)=>{const r=new Request(input,init),name=new URL(r.url).pathname.split('/').at(-1);
  if(name==='native_session_v2'){sessions++;return Response.json(sessions===1?{subject,sessionId}:options.lastSession??{subject,sessionId});}
  if(name==='submit_assistant_message_sources_v2'){calls.push(await r.json());return Response.json(options.receipt??receipt);}
  if(name==='read_assistant_message_sources_v2'){reads++;return Response.json(options.changed&&reads===2?{...read,history:[{messageId:artifact,sequence:4,scopeVersion:2,relationship:'follow_up',text:'Concurrent correction'}]}:read);}
  return prev(input,init);
 });
 return {f,calls,sessions:()=>sessions,request:(path,b)=>new NextRequest('http://127.0.0.1/api/chat/native/v6/'+path,{method:'POST',headers:{Authorization:'Bearer '+f.token,'Content-Type':'application/json'},body:JSON.stringify(b)})};
}
test('closed references reject missing/extra/current/forged content and duplicate evidence',()=>{
 assert.equal(validSelectedSources(refs),true);for(const bad of [{...refs,extra:true},{artifact:null,trip:null},{...refs,artifact:{artifactId:artifact,revision:1,current:true}},{...refs,trip:{tripId:goal,headVersion:-1}},{...refs,evidence:[{factId:id,assertionId:goal,assertionRevision:1,city:'shanghai',scene:'rail'},{factId:id,assertionId:goal,assertionRevision:1,city:'shanghai',scene:'rail'}]}])assert.equal(validSelectedSources(bad),false);
});
test('v6 producer exact fields map once to additive RPC and no extra task field is forwarded',async t=>{
 const e=await setup(t),r=await nativeAssistantHTTP(e.request('conversation',body),'conversation',true);assert.equal(r.status,201);assert.equal((await r.json()).version,6);assert.equal(e.calls.length,1);assert.deepEqual(e.calls[0].p_selected_sources,refs);assert.equal(e.calls[0].p_task_id,null);assert.equal(e.sessions(),2);
});
for(const[name,options,status]of [['replaced',{lastSession:{subject:goal,sessionId}},401],['malformed',{lastSession:{}},503],['badreceipt',{receipt:{...receipt,providerEnabled:true}},503]])test('v6 committed response final qualification '+name,async t=>{const e=await setup(t,options),r=await nativeAssistantHTTP(e.request('conversation',body),'conversation',true);assert.equal(r.status,status);assert.equal(e.calls.length,1);});
test('v6 context historical artifact is explicit previous result first-party, never current proposal or dispatch',async t=>{
 const e=await setup(t),r=await nativeAssistantSelectedSourceContextHTTP(e.request('context',{conversationId:id,goalId:goal,messageId:message,expectedGoalVersion:2,memoryIds:[]}));assert.equal(r.status,200);const b=await r.json(),ref=b.context.sourceRefs.find(x=>x.id==='artifact:'+artifact);assert.ok(ref);assert.equal(ref.purpose,'previous_result_reference');assert.equal(ref.kind,'thread');assert.equal(ref.current,false);assert.equal(ref.originGoalVersion,1);assert.equal(b.readyForProvider,false);assert.equal(ref.recipient,'first_party');
});
test('source change between actual transport reads does not return a mixed context',async t=>{const e=await setup(t,{changed:true}),r=await nativeAssistantSelectedSourceContextHTTP(e.request('context',{conversationId:id,goalId:goal,messageId:message,expectedGoalVersion:2,memoryIds:[]}));assert.equal(r.status,409);});
test('rollback disables producer but retains current owner selected context read',async t=>{const e=await setup(t,{producer:'false'}),r=await nativeAssistantSelectedSourceContextHTTP(e.request('context',{conversationId:id,goalId:goal,messageId:message,expectedGoalVersion:2,memoryIds:[]}));assert.equal(r.status,200);});
