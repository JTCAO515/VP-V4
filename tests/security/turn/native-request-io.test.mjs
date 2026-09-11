import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server.js';
import {nativeTextHTTP} from '../../../lib/server/turn/native-http.ts';
import {nativeFixture, subject, sessionId} from '../../contract/identity/native-fixture.ts';
const policyId='11111111-1111-4111-8111-111111111111';
let port=58100;
async function setup(t){
 const f=await nativeFixture(t,'http://127.0.0.1:'+port++);
 const patch={NEXT_PUBLIC_SUPABASE_URL:f.config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey,VISEPANDA_NATIVE_LOCAL_TEXT:'true',VISEPANDA_NATIVE_LOCAL_TEXT_POLICY:policyId};
 const prior=new Map(Object.keys(patch).map(key=>[key,process.env[key]]));
 Object.assign(process.env,patch);t.after(()=>{for(const[key,value]of prior)value===undefined?delete process.env[key]:process.env[key]=value;});
 return {...f,request:(init={})=>new NextRequest('http://127.0.0.1/api/chat/native/v1/policy',{...init,headers:{Authorization:'Bearer '+f.token,...init.headers}})};
}
test('Ask session transport outage is unavailable, not a credential rejection',async t=>{
 const f=await setup(t), transport=globalThis.fetch;let calls=0;
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const path=new URL(typeof input==='string'?input:input.url??String(input)).pathname;
  if(path.endsWith('/native_session_v2')){calls++;return Response.json({message:'synthetic outage'},{status:503});}
  return transport(input,init);
 });
 const result=await nativeTextHTTP(f.request(),'history');
 assert.equal(result.status,503);assert.deepEqual(await result.json(),{error:{code:'PROVIDER_UNAVAILABLE'}});assert.equal(calls,1);
});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const pathOf=input=>new URL(typeof input==='string'?input:input.url??String(input)).pathname;
const session={version:2,subject,sessionId,mobileEpoch:1};
const prompt={threadId:'22222222-2222-4222-8222-222222222222',turnId:'33333333-3333-4333-8333-333333333333',idempotencyKey:'44444444-4444-4444-8444-444444444444',policyId,locale:'en',text:'Synthetic prompt'};
for(const stage of ['claims','session','submit'])test('Ask cancellation at '+stage+' prevents late continuation',{timeout:3000},async t=>{
 const f=await setup(t),transport=globalThis.fetch;let arrived,release;const paths=[];
 const seen=new Promise(resolve=>{arrived=resolve;}),held=new Promise(resolve=>{release=resolve;});
 const controller=new AbortController();t.after(()=>{controller.abort();release();});
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const path=pathOf(input);paths.push(path);
  const isSession=path.endsWith('/native_session_v2'),isSubmit=path.endsWith('/submit_text_turn');
  const result=isSession?Response.json(session):isSubmit?Response.json({kind:'accepted',reused:false}):await transport(input,init);
  if((stage==='claims'&&path.endsWith('/jwks.json'))||(stage==='session'&&isSession)||(stage==='submit'&&isSubmit)){arrived();await held;}
  return result;
 });
 const pending=nativeTextHTTP(f.request({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(prompt),signal:controller.signal}),'submit');
 await Promise.race([seen,pending.then(()=>{throw Error('returned before controlled stage');})]);
 controller.abort();const result=await pending;assert.equal(result.status,503);
 const count=paths.length;release();await tick();await tick();assert.equal(paths.length,count,'late replies cannot send another hop');
 assert.equal(paths.filter(p=>p.endsWith('/submit_text_turn')).length,stage==='submit'?1:0);
});
test('unknown Ask submit acknowledgement preserves exact retry payload without automatic retry',async t=>{
 const f=await setup(t),transport=globalThis.fetch;let arrived,release,first=true;const bodies=[];
 const seen=new Promise(resolve=>{arrived=resolve;}),held=new Promise(resolve=>{release=resolve;});
 const controller=new AbortController();t.after(()=>{controller.abort();release();});
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const path=pathOf(input);
  if(path.endsWith('/native_session_v2'))return Response.json(session);
  if(path.endsWith('/submit_text_turn')){
   assert.equal(new Headers(init.headers).get('authorization'),'Bearer '+f.token);
   bodies.push(JSON.parse(init.body));
   if(first){first=false;arrived();await held;return Response.json({kind:'accepted',reused:false});}
   return Response.json({kind:'accepted',reused:true});
  }
  return transport(input,init);
 });
 const req=signal=>f.request({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(prompt),signal});
 const pending=nativeTextHTTP(req(controller.signal),'submit');await seen;controller.abort();assert.equal((await pending).status,503);
 release();await tick();assert.equal(bodies.length,1);
 const retry=await nativeTextHTTP(req(new AbortController().signal),'submit');assert.equal(retry.status,200);
 assert.equal((await retry.json()).reused,true);assert.deepEqual(bodies[0],bodies[1]);assert.equal(bodies.length,2);
});
test('Ask body cancellation does not hang on hostile reader cancellation',{timeout:3000},async t=>{
 const f=await setup(t),transport=globalThis.fetch;let arrived;let cancelled=0,submits=0;
 const seen=new Promise(resolve=>{arrived=resolve;}),controller=new AbortController();
 t.after(()=>controller.abort());
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const path=pathOf(input);if(path.endsWith('/native_session_v2'))return Response.json(session);
  if(path.endsWith('/submit_text_turn'))submits++;
  return transport(input,init);
 });
 const request=f.request({method:'POST',headers:{'content-type':'application/json'},signal:controller.signal});
 Object.defineProperty(request,'body',{value:{getReader:()=>({read:()=>{arrived();return new Promise(()=>{});},cancel:()=>{cancelled++;return new Promise(()=>{});},releaseLock:()=>{}})}});
 const pending=nativeTextHTTP(request,'submit');await seen;controller.abort();assert.equal((await pending).status,503);assert.equal(cancelled,1);assert.equal(submits,0);
});
test('Ask preserves credential denial, policy denial and strict body boundaries',async t=>{
 const f=await setup(t),transport=globalThis.fetch;let reply=session,submits=0;
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const path=pathOf(input);if(path.endsWith('/native_session_v2'))return Response.json(reply.body??reply,{status:reply.status??200});
  if(path.endsWith('/submit_text_turn')){submits++;return Response.json({kind:'blocked'});}
  return transport(input,init);
 });
 assert.equal((await nativeTextHTTP(new NextRequest('http://127.0.0.1/api/chat/native/v1/policy',{headers:{Authorization:'Bearer abc.def.ghi'}}),'policy')).status,401);
 for(const body of [{message:'UNAUTHENTICATED',code:'P0001'},{message:'SESSION_REPLACED',code:'P0001'}]){
  reply={status:400,body};assert.equal((await nativeTextHTTP(f.request(),'history')).status,401);
 }
 reply={};assert.equal((await nativeTextHTTP(f.request(),'history')).status,503);
 reply=session;
 for(const body of [' '.repeat(32769),new Uint8Array([0xff]),JSON.stringify({...prompt,text:'x'.repeat(4001)}),JSON.stringify({...prompt,owner:subject})]){
  assert.equal((await nativeTextHTTP(f.request({method:'POST',headers:{'content-type':'application/json'},body}),'submit')).status,400);
 }
 assert.equal(submits,0);
 assert.equal((await nativeTextHTTP(f.request({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(prompt)}),'submit')).status,403);
});
test('Ask claims outage is503 and pre-aborted requests never dispatch',async t=>{
 const f=await setup(t);let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({},{status:503});});
 assert.equal((await nativeTextHTTP(f.request(),'history')).status,503);assert.equal(calls,1);
 const controller=new AbortController();controller.abort();
 assert.equal((await nativeTextHTTP(f.request({signal:controller.signal}),'history')).status,503);assert.equal(calls,1);
});

test('staging Ask uses ordinary JWT for policy and submit, and preserves registry denial',async t=>{
 const f=await nativeFixture(t,'https://dzqdzetcctkhbrhlxxgn.supabase.co'),transport=globalThis.fetch;
 const host='vp-v4-abc123-jtcao515s-projects.vercel.app';
 const patch={NEXT_PUBLIC_SUPABASE_URL:f.config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey,VERCEL_ENV:'preview',VERCEL_URL:host,VISEPANDA_NATIVE_STAGING:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true',VISEPANDA_NATIVE_STAGING_TEXT:'true',VISEPANDA_NATIVE_STAGING_TEXT_POLICY:policyId,VISEPANDA_NATIVE_STAGING_PROOF_KEY:'synthetic-proof-must-never-be-used'};
 const prior=new Map(Object.keys(patch).map(key=>[key,process.env[key]]));
 Object.assign(process.env,patch);t.after(()=>{for(const[key,value]of prior)value===undefined?delete process.env[key]:process.env[key]=value;});
 const calls=[];let denied=false;
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const req=new Request(input,init),url=new URL(req.url);
  assert.equal(url.origin,f.config.url,'every network hop stays in the intercepted fixture');
  assert.equal(req.headers.get('apikey'),f.config.publishableKey);
  if(!url.pathname.startsWith('/rest/v1/rpc/'))return transport(input,init);
  assert.equal(req.headers.get('authorization'),'Bearer '+f.token);
  const body=await req.json();calls.push({path:url.pathname,body});
  if(url.pathname.endsWith('/native_session_v2'))return Response.json(session);
  assert.equal(body.p_policy_id,policyId);
  if(denied)return Response.json({kind:'blocked'});
  if(url.pathname.endsWith('/read_text_policy'))return Response.json({kind:'policy',policyId});
  if(url.pathname.endsWith('/submit_text_turn'))return Response.json({kind:'accepted',reused:false});
  throw Error('unexpected RPC');
 });
 const req=(init={})=>new NextRequest('https://'+host+'/api/chat/native/v1/policy',{...init,headers:{Authorization:'Bearer '+f.token,...init.headers}});
 assert.equal((await nativeTextHTTP(req(),'policy')).status,200);
 const submit=()=>nativeTextHTTP(req({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(prompt)}),'submit');
 assert.equal((await submit()).status,201);
 denied=true;
 for(const result of [await nativeTextHTTP(req(),'policy'),await submit()]){assert.equal(result.status,403);assert.deepEqual(await result.json(),{error:{code:'DATA_POLICY_BLOCKED'}});}
 assert.equal(calls.filter(call=>call.path.endsWith('/native_session_v2')).length,4);
 assert.equal(calls.filter(call=>call.path.endsWith('/submit_text_turn')).length,2);
 assert.equal(JSON.stringify(calls).includes('synthetic-proof'),false);
});
