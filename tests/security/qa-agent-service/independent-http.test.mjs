import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server.js';
import {qaAgentHTTP} from '../../../lib/server/qa-agent/http.ts';
import {nativeFixture} from '../../contract/identity/native-fixture.ts';
const ref='dzqdzetcctkhbrhlxxgn',shared='abcdefghijklmnopqrst',sid='11111111-1111-4111-8111-111111111111',pid='22222222-2222-4222-8222-222222222222';
test('foreground SSR cookie auth stays on the explicitly approved shared target and never selects DB from cookie/origin',async t=>{
 const f=await nativeFixture(t,`https://${ref}.supabase.co`),fallback=globalThis.fetch,urls=[];
 const patch={VISEPANDA_QA_AGENT:'true',VISEPANDA_QA_AGENT_ORIGIN:'https://qatesting.go2china.space',VISEPANDA_QA_AGENT_POLICY_ID:pid,VISEPANDA_QA_AGENT_CONTEXT_MODE:'qa_session_history_v1',VISEPANDA_QA_SUPABASE_PROJECT_REF:ref,NEXT_PUBLIC_SUPABASE_URL:f.config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey,VERCEL_ENV:'preview'};
 const prior=Object.fromEntries(Object.keys(patch).map(k=>[k,process.env[k]]));Object.assign(process.env,patch);t.after(()=>{for(const [k,v]of Object.entries(prior))v===undefined?delete process.env[k]:process.env[k]=v;});
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  const u=new URL(String(url));urls.push(u.origin);assert.equal(u.origin,f.config.url);
  if(!u.pathname.startsWith('/rest/v1/'))return fallback(url,init);
  const name=u.pathname.split('/').at(-1);
  if(name==='qa_read_policy_v1')return Response.json({kind:'policy',policy:{id:pid,contextMode:'qa_session_history_v1',maxTurns:8,noticeHash:'a'.repeat(64),noticeZh:'合成许可',noticeEn:'Synthetic permission',provider:'qwen',recipient:'Synthetic',consentState:'accepted'}});
  if(name==='chat_threads')return Response.json({id:sid,trip_id:null,status:'active',created_at:'2026-10-13',updated_at:'2026-10-13'});
  if(name==='qa_read_session_v1')return Response.json({kind:'session',schemaVersion:'qa-session/1',threadId:sid,policyId:null,serviceTaskId:null,lastTurnId:null,messages:[]});
  return Response.json([]);
 });
 const request=(cookie,method='GET',origin)=>new NextRequest('https://qatesting.go2china.space/api/qa-agent',{method,headers:{Cookie:cookie,...(origin?{Origin:origin}:{}),...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:'{}'}:{})});
 assert.equal((await qaAgentHTTP(request(f.cookie()),'detail',sid)).status,200);
 assert.equal((await qaAgentHTTP(request(f.cookie().replace('sb-'+ref+'-auth-token','sb-'+shared+'-auth-token')),'policy')).status,401);
 assert.equal((await qaAgentHTTP(request(f.cookie(),'POST','https://evil.invalid'),'create')).status,403);
 delete process.env.VISEPANDA_QA_SUPABASE_PROJECT_REF;const before=urls.length;assert.equal((await qaAgentHTTP(request(f.cookie()),'policy')).status,503);assert.equal(urls.length,before,'missing target fails before identity/network');
 assert.equal(urls.includes(`https://${shared}.supabase.co`),false);
});
