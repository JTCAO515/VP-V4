import assert from 'node:assert/strict';
import test from 'node:test';
import {NextRequest} from 'next/server.js';
import {canonicalPlaceAskHTTP} from '../../../lib/server/knowledge/place-ask/http.ts';
import {taskRequest,ids} from './fixtures.mjs';
const make=(method='POST',extra={})=>new NextRequest('http://127.0.0.1/api/chat/native/v7/place-ask'+(extra.query??''),{method,headers:{'content-type':'application/json',...(extra.headers??{})},...(method==='POST'?{body:extra.body??JSON.stringify(taskRequest)}:{})});
for(const [name,request]of [['cookie',()=>make('POST',{headers:{cookie:'forbidden'}})],['origin',()=>make('POST',{headers:{origin:'http://127.0.0.1'}})],['query',()=>make('POST',{query:'?subject=forged'})],['nonJSON',()=>make('POST',{headers:{'content-type':'text/plain'}})],['unsupported method',()=>make('PUT')]])test(`real HTTP rejects ${name}`,async()=>{
 const result=await canonicalPlaceAskHTTP(request());assert.equal(result.status,400);assert.equal(result.headers.get('cache-control'),'private, no-store');
});
for(const [name,body]of [['invalid UTF8',new Uint8Array([0xff,0xfe])],['oversized','x'.repeat(24001)],['unknown authority',JSON.stringify({...taskRequest,subjectId:'forged'})]])test(`real HTTP rejects ${name} before auth/admission`,async()=>{
 const old=process.env.VISEPANDA_PLACE_ACTIONS_ENABLED;process.env.VISEPANDA_PLACE_ACTIONS_ENABLED='true';
 try{const result=await canonicalPlaceAskHTTP(make('POST',{body}));assert.equal(result.status,400);}finally{if(old===undefined)delete process.env.VISEPANDA_PLACE_ACTIONS_ENABLED;else process.env.VISEPANDA_PLACE_ACTIONS_ENABLED=old;}
});
test('GET recovery accepts null-Turn shape but rejects missing conversation message identity',async()=>{
 const result=await canonicalPlaceAskHTTP(make('GET',{query:`?operationId=${ids.op}&scopeKind=conversation&scopeId=${ids.conversation}`}));assert.equal(result.status,400);
});
test('POST rollback flag never activates a new producer',async()=>{
 const old=process.env.VISEPANDA_PLACE_ACTIONS_ENABLED;delete process.env.VISEPANDA_PLACE_ACTIONS_ENABLED;
 try{assert.equal((await canonicalPlaceAskHTTP(make())).status,503);}finally{if(old!==undefined)process.env.VISEPANDA_PLACE_ACTIONS_ENABLED=old;}
});
test('A current-input original Task uses the configured plain policy instead of requiring task-history retyping',async()=>{
 const env={VISEPANDA_PLACE_ACTIONS_ENABLED:'true',VISEPANDA_NATIVE_LOCAL_TEXT:'true',VISEPANDA_NATIVE_LOCAL_TEXT_POLICY:ids.policy,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:6543',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'controlled-fixture-key'};
 const unset=['VERCEL_ENV','VISEPANDA_NATIVE_STAGING','VISEPANDA_NATIVE_PRODUCTION','VISEPANDA_NATIVE_LOCAL_TASK_POLICY'];const saved=new Map([...Object.keys(env),...unset].map(k=>[k,process.env[k]]));
 try{for(const [k,v]of Object.entries(env))process.env[k]=v;for(const k of unset)delete process.env[k];const result=await canonicalPlaceAskHTTP(make());assert.equal(result.status,401,'reaches original identity gate without requiring or inventing another policy');}
 finally{for(const [k,v]of saved)if(v===undefined)delete process.env[k];else process.env[k]=v;}
});

// Actual handler + SDK credential verifier; synthetic transport only, no live Auth/DB.
import {nativeFixture,subject,sessionId} from '../identity/native-fixture.ts';
import {taskOperation,receipt} from './fixtures.mjs';
for(const policyMode of ['task-only','plain-only','mixed'])test(`same-op recovery survives lost ACK and generation rollback: ${policyMode}`,async t=>{
 const f=await nativeFixture(t,'http://127.0.0.1:59879');
 const env={VISEPANDA_PLACE_ACTIONS_ENABLED:'true',VISEPANDA_NATIVE_LOCAL_TEXT:'true',VISEPANDA_NATIVE_LOCAL_TEXT_POLICY:policyMode==='task-only'?undefined:ids.policy,VISEPANDA_NATIVE_LOCAL_TASK_POLICY:policyMode==='plain-only'?undefined:ids.policy,NEXT_PUBLIC_SUPABASE_URL:f.config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey,VERCEL_ENV:undefined,VISEPANDA_NATIVE_STAGING:undefined,VISEPANDA_NATIVE_PRODUCTION:undefined,VISEPANDA_NATIVE_LOCAL_TRIP:undefined};
 const saved=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));for(const[k,v]of Object.entries(env))v===undefined?delete process.env[k]:process.env[k]=v;
 t.after(()=>{for(const[k,v]of Object.entries(saved))v===undefined?delete process.env[k]:process.env[k]=v;});
 const fallback=globalThis.fetch;const actions=[];
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url);assert.equal(url.origin,f.config.url);assert.equal(request.redirect,'error');
  if(url.pathname.endsWith('/native_session_v2'))return Response.json({subject,sessionId});
  if(url.pathname.endsWith('/grounded_ai_assist_work_v1')){
   const {p_input}=await request.json();actions.push(p_input.action);
   if(p_input.action==='selected_submit')return Response.json(null); // committed admission, missing ACK
   assert.deepEqual(p_input,{action:'selected_read',operation:taskOperation});
   return Response.json({schemaVersion:'canonical-place-ask/1',kind:'recovered',operation:taskOperation,receipt:receipt(),current:{kind:'pending'},readyForProvider:false});
  }return fallback(input,init);
 });
 const headers={authorization:'Bearer '+f.token};
 const post=await canonicalPlaceAskHTTP(make('POST',{headers}));assert.equal(post.status,200);assert.equal((await post.json()).kind,'unknown');
 const query=`?operationId=${ids.op}&scopeKind=thread&scopeId=${ids.thread}&turnId=${ids.turn}`;
 const read=()=>canonicalPlaceAskHTTP(make('GET',{headers,query}));
 assert.equal((await (await read()).json()).kind,'recovered');
 delete process.env.VISEPANDA_NATIVE_LOCAL_TEXT;delete process.env.VISEPANDA_NATIVE_LOCAL_TEXT_POLICY;delete process.env.VISEPANDA_NATIVE_LOCAL_TASK_POLICY;delete process.env.VISEPANDA_PLACE_ACTIONS_ENABLED;
 assert.equal((await (await read()).json()).kind,'recovered','generation policy removal does not revoke receipt read');
 assert.equal((await canonicalPlaceAskHTTP(make('POST',{headers}))).status,503,'rollback still blocks admission');
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://unapproved.invalid';assert.equal((await read()).status,503);
 process.env.NEXT_PUBLIC_SUPABASE_URL=f.config.url;process.env.VERCEL_ENV='preview';assert.equal((await read()).status,503);
 assert.deepEqual(actions,['selected_submit','selected_read','selected_read']);
});
