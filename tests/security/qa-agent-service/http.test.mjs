import assert from 'node:assert/strict';
import test from 'node:test';
import {NextRequest} from 'next/server.js';
import {qaConfig} from '../../../lib/server/qa-agent/config.ts';
import {qaAgentHTTP} from '../../../lib/server/qa-agent/http.ts';
import {nativeFixture} from '../../contract/identity/native-fixture.ts';
const sid='11111111-1111-4111-8111-111111111111',rid='22222222-2222-4222-8222-222222222222',pid='33333333-3333-4333-8333-333333333333';
async function setup(t,qaCapacity=false){
 const fixture=await nativeFixture(t,'http://127.0.0.1:58259'),fallback=globalThis.fetch,calls=[];
 const env={VISEPANDA_QA_AGENT:'true',VISEPANDA_QA_AGENT_ORIGIN:'http://localhost:3000',VISEPANDA_QA_AGENT_POLICY_ID:pid,VISEPANDA_QA_AGENT_CONTEXT_MODE:qaCapacity?'qa_session_history_v1':'current_input_v1',NEXT_PUBLIC_SUPABASE_URL:fixture.config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:fixture.config.publishableKey};
 const prior=Object.fromEntries([...Object.keys(env),'VERCEL_ENV'].map(k=>[k,process.env[k]]));delete process.env.VERCEL_ENV;Object.assign(process.env,env);
 t.after(()=>{for(const [key,value]of Object.entries(prior))value===undefined?delete process.env[key]:process.env[key]=value;});
 let input=null,answer=null,count=0;
 t.mock.method(globalThis,'fetch',async(url,init)=>{
 const request=new Request(url,init),u=new URL(request.url);if(!u.pathname.startsWith('/rest/v1/'))return fallback(url,init);
 assert.equal(u.origin,fixture.config.url);assert.equal(request.headers.get('Authorization'),'Bearer '+fixture.token);
 const path=u.pathname.split('/').at(-1);calls.push(path);
 if(path==='read_text_policy'||path==='qa_read_policy_v1')return Response.json({kind:'policy',policy:{id:pid,contextMode:qaCapacity?'qa_session_history_v1':'current_input_v1',maxTurns:qaCapacity?8:null,noticeHash:'a'.repeat(64),noticeZh:'合成测试',noticeEn:'Synthetic testing',provider:'qwen',recipient:'Synthetic recipient',consentState:'accepted'}});
 if(path==='qa_read_session_v1')return Response.json({kind:'session',schemaVersion:'qa-session/1',threadId:sid,policyId:null,serviceTaskId:null,lastTurnId:null,messages:[]});
 if(path==='qa_submit_message_v1')return Response.json({code:'P0001',message:'QA_CONTEXT_LIMIT',details:null,hint:null},{status:400});
 if(path==='submit_text_turn'){
 const data=await request.json();assert.equal(data.p_thread_id,sid);assert.equal(data.p_idempotency_key,rid);assert.equal(data.p_turn_id,rid);
 if(!input){input=data.p_text;count++;return Response.json({kind:'accepted',turnId:rid,reused:false});}
 return Response.json({kind:'accepted',turnId:rid,reused:true});
 }
 if(path==='read_text_turn')return Response.json({kind:'text',turnId:rid,input,outcome:answer?'answered':null,output:answer});
 if(path==='chat_threads')return Response.json({id:sid,trip_id:null,status:'active',created_at:'2026-10-13',updated_at:'2026-10-13'});
 if(path==='turns')return Response.json(input?[{id:rid,status:answer?'completed':'accepted',created_at:'2026-10-13',updated_at:'2026-10-13'}]:[]);
 return Response.json([]);
 });
 return {...fixture,calls,get count(){return count;},finish:()=>answer='Persisted synthetic answer',request:(method='GET',body,extra={})=>new NextRequest('http://localhost:3000/api/qa-agent',{method,headers:{Cookie:fixture.cookie(),...(method==='POST'?{Origin:env.VISEPANDA_QA_AGENT_ORIGIN,'Content-Type':'application/json'}:{}),...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})})};
}
test('actual SSR cookie SDK, protected submit and saved readback; duplicate remains original',async t=>{
 const f=await setup(t);assert.ok(qaConfig(f.request().url,process.env),'config is ready');const body={requestId:rid,text:'Synthetic actual SDK input'};
 const policy=await qaAgentHTTP(f.request(),'policy');assert.equal(policy.status,200,JSON.stringify({body:await policy.clone().json(),calls:f.calls,seen:f.seen}));assert.equal((await policy.json()).policy.consentState,'accepted');
 const submit=await qaAgentHTTP(f.request('POST',body),'submit',sid);assert.equal(submit.status,202);assert.equal((await submit.json()).status,'pending');
 f.finish();const read=await qaAgentHTTP(f.request(),'message',sid,rid);assert.equal(read.status,200);assert.equal((await read.json()).message.text,'Persisted synthetic answer');
 const replay=await qaAgentHTTP(f.request('POST',body),'submit',sid);assert.equal((await replay.json()).reused,true);assert.equal(f.count,1);
 assert.match(read.headers.get('cache-control'),/no-store/);assert.equal(f.calls.includes('native_session_v2'),false);
});
test('missing identity, CSRF, invalid and oversized input fail before admission',async t=>{
 const f=await setup(t);
 assert.equal((await qaAgentHTTP(new NextRequest('http://localhost:3000/api/qa-agent'),'policy')).status,401);
 assert.equal((await qaAgentHTTP(f.request('POST',{requestId:rid,text:'x'},{Origin:'https://evil.invalid'}),'submit',sid)).status,403);
 assert.equal((await qaAgentHTTP(f.request('POST',{requestId:rid,text:'x'.repeat(40000)}),'submit',sid)).status,400);
 assert.equal((await qaAgentHTTP(f.request('POST',{requestId:rid,text:'x',provider:'glm'}),'submit',sid)).status,400);
 assert.equal(f.count,0);
});
test('aborted request lifetime stops SDK and cannot create another admission',async t=>{
 const f=await setup(t),controller=new AbortController();controller.abort();
 const request=new NextRequest('http://localhost:3000/api/qa-agent',{method:'POST',headers:{Cookie:f.cookie(),Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({requestId:rid,text:'Synthetic cancel'}),signal:controller.signal});
 const response=await qaAgentHTTP(request,'submit',sid);assert.equal(response.status,503);assert.equal(f.count,0);
});

test('capacity error keeps versioned HTTP409/not_submitted distinct from policy refusal',async t=>{
 const f=await setup(t,true);
 const result=await qaAgentHTTP(f.request('POST',{requestId:rid,text:'Synthetic ninth turn'}),'submit',sid);
 assert.equal(result.status,409);assert.deepEqual(await result.json(),{version:'qa-agent/1',error:{code:'QA_CONTEXT_LIMIT',ack:'not_submitted'}});
 const policy=await qaAgentHTTP(f.request(),'policy');assert.equal(policy.status,200);const p=(await policy.json()).policy;assert.equal(p.maxTurns,8);assert.equal(p.consentState,'accepted');
 const history=await qaAgentHTTP(f.request(),'detail',sid);assert.equal(history.status,200);assert.equal(f.count,0);assert.equal(f.calls.some(x=>x.includes('budget')),false);
});
