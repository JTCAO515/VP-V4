import assert from 'node:assert/strict';
import test from 'node:test';
import {NextRequest} from 'next/server.js';
import {qaAgentHTTP} from '../../../lib/server/qa-agent/http.ts';
import {nativeFixture} from '../../contract/identity/native-fixture.ts';
const sid='11111111-1111-4111-8111-111111111111',rid='22222222-2222-4222-8222-222222222222',pid='33333333-3333-4333-8333-333333333333',task='44444444-4444-4444-8444-444444444444';
test('cookie HTTP reads expose protected reconciliation status without any admission or budget calls',async t=>{
 const fixture=await nativeFixture(t,'http://127.0.0.1:58262'),fallback=globalThis.fetch,calls=[];
 const patch={VISEPANDA_QA_AGENT:'true',VISEPANDA_QA_AGENT_ORIGIN:'http://localhost:3000',VISEPANDA_QA_AGENT_POLICY_ID:pid,VISEPANDA_QA_AGENT_CONTEXT_MODE:'qa_session_history_v1',NEXT_PUBLIC_SUPABASE_URL:fixture.config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:fixture.config.publishableKey};
 const prior=Object.fromEntries([...Object.keys(patch),'VERCEL_ENV'].map(k=>[k,process.env[k]]));delete process.env.VERCEL_ENV;Object.assign(process.env,patch);
 t.after(()=>{for(const [key,value]of Object.entries(prior))value===undefined?delete process.env[key]:process.env[key]=value;});
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  const u=new URL(String(url));if(!u.pathname.startsWith('/rest/v1/'))return fallback(url,init);
  assert.equal(u.origin,fixture.config.url);assert.equal(new Headers(init.headers).get('Authorization'),'Bearer '+fixture.token);const name=u.pathname.split('/').at(-1);calls.push(name);
  if(name==='qa_read_policy_v1')return Response.json({kind:'policy',policy:{id:pid,contextMode:'qa_session_history_v1',maxTurns:8,noticeHash:'a'.repeat(64),noticeZh:'合成同意',noticeEn:'Synthetic consent',provider:'qwen',recipient:'Synthetic',consentState:'accepted'}});
  if(name==='chat_threads')return Response.json({id:sid,trip_id:null,status:'active',created_at:'2026-10-13',updated_at:'2026-10-13'});
  if(name==='turns')return Response.json([{id:rid,status:'accepted',created_at:'2026-10-13',updated_at:'2026-10-13'}]);
  if(name==='qa_read_session_v1')return Response.json({kind:'session',schemaVersion:'qa-session/1',threadId:sid,policyId:pid,serviceTaskId:task,lastTurnId:rid,messages:[{kind:'text',schemaVersion:'text-turn-v1',turnId:rid,locale:'en',input:'Saved original input',output:null,outcome:null,reconciliationRequired:true}]});
  return Response.json([]);
 });
 const request=()=>new NextRequest('http://localhost:3000/api/qa-agent',{headers:{Cookie:fixture.cookie()}});
 const read=await qaAgentHTTP(request(),'message',sid,rid);assert.equal(read.status,200);const body=await read.json();assert.equal(body.version,'qa-agent/1');assert.equal(body.message.status,'reconciliation_required');assert.equal(body.message.text,null);assert.equal(body.message.requestId,rid);
 const history=await qaAgentHTTP(request(),'detail',sid);assert.equal(history.status,200);assert.equal((await history.json()).messages[0].status,'reconciliation_required');
 assert.equal(calls.some(name=>/submit|reserve|dispatch|claim|finish|worker/.test(name)),false);
 const inject=new NextRequest('http://localhost:3000/api/qa-agent',{method:'POST',headers:{Cookie:fixture.cookie(),Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({requestId:rid,text:'Input',reconciliationRequired:true})});
 assert.equal((await qaAgentHTTP(inject,'submit',sid)).status,400);assert.equal(calls.some(name=>name.includes('submit')),false);
});
