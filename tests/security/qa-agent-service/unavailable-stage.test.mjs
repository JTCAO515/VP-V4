import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server.js';
import {qaAgentHTTP} from '../../../lib/server/qa-agent/http.ts';
import {nativeFixture} from '../../contract/identity/native-fixture.ts';

const ref='dzqdzetcctkhbrhlxxgn',origin='https://qatesting.go2china.space';
const unavailable={version:'qa-agent/1',error:{code:'PROVIDER_UNAVAILABLE',ack:'not_submitted'}};
const policyId='33333333-3333-4333-8333-333333333333';
async function setup(t){
  const f=await nativeFixture(t,`https://${ref}.supabase.co`);
  const env={VISEPANDA_QA_AGENT:'true',VISEPANDA_QA_AGENT_ORIGIN:origin,
    VISEPANDA_QA_AGENT_POLICY_ID:policyId,VISEPANDA_QA_AGENT_CONTEXT_MODE:'qa_session_history_v1',
    VISEPANDA_QA_SUPABASE_PROJECT_REF:ref,NEXT_PUBLIC_SUPABASE_URL:f.config.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey,VERCEL_ENV:'preview'};
  const prior=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));
  Object.assign(process.env,env);
  t.after(()=>{for(const [k,v]of Object.entries(prior))v===undefined?delete process.env[k]:process.env[k]=v;});
  const request=(action,cookie)=>new NextRequest(`${origin}/api/qa-agent/${action==='list'?'sessions':'policy'}`,
    {headers:cookie?{Cookie:cookie}:{}});
  return {...f,env,request};
}

test('each deployment config gate yields the observed 503 before any SDK or database traffic',async t=>{
  const f=await setup(t),traffic=[];
  t.mock.method(globalThis,'fetch',async()=>{traffic.push('unexpected');throw Error('No network expected');});
  const patches=[
    {VISEPANDA_QA_AGENT:undefined}, {VISEPANDA_QA_AGENT_POLICY_ID:undefined},
    {VISEPANDA_QA_AGENT_ORIGIN:'https://evil.invalid'},
    {VISEPANDA_QA_SUPABASE_PROJECT_REF:undefined},
    {NEXT_PUBLIC_SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co'},
    {NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:undefined}, {VERCEL_ENV:'production'},
    {VISEPANDA_QA_AGENT_CONTEXT_MODE:'unsupported'},
  ];
  for(const patch of patches){
    Object.assign(process.env,f.env);
    for(const [k,v]of Object.entries(patch))v===undefined?delete process.env[k]:process.env[k]=v;
    for(const action of ['list','policy']){
      const response=await qaAgentHTTP(f.request(action),action);
      assert.equal(response.status,503,JSON.stringify({patch,action}));
      assert.deepEqual(await response.json(),unavailable);
    }
  }
  assert.deepEqual(traffic,[]);
});

test('ready config without cookie reaches identity and gives 401, rather than a database or worker diagnosis',async t=>{
  const f=await setup(t);
  for(const action of ['list','policy']){
    const response=await qaAgentHTTP(f.request(action),action);
    assert.equal(response.status,401);
    assert.deepEqual(await response.json(),{version:'qa-agent/1',error:{code:'UNAUTHENTICATED',ack:'not_submitted'}});
  }
  assert.deepEqual(f.seen,[]);
});

test('authenticated missing QA RPC produces the same public 503 only after the protected database call',async t=>{
  const f=await setup(t),authFetch=globalThis.fetch,calls=[];
  t.mock.method(globalThis,'fetch',async(url,init)=>{
    const req=new Request(url,init),u=new URL(req.url);
    assert.equal(u.origin,f.config.url);
    if(!u.pathname.startsWith('/rest/v1/'))return authFetch(url,init);
    assert.equal(req.headers.get('Authorization'),'Bearer '+f.token);
    calls.push(u.pathname);
    if(u.pathname==='/rest/v1/chat_threads')return Response.json([]);
    assert.ok(['/rest/v1/rpc/qa_list_sessions_v1','/rest/v1/rpc/qa_read_policy_v1'].includes(u.pathname));
    return Response.json({code:'PGRST202',message:'Could not find the function in the schema cache',details:null,hint:null},{status:404});
  });
  for(const action of ['list','policy']){
    const response=await qaAgentHTTP(f.request(action,f.cookie()),action);
    assert.equal(response.status,503);
    assert.deepEqual(await response.json(),unavailable);
  }
  assert.deepEqual(calls,['/rest/v1/chat_threads','/rest/v1/rpc/qa_list_sessions_v1','/rest/v1/rpc/qa_read_policy_v1']);
});
