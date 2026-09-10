import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeIdentityHTTP } from '../../../lib/server/identity/native-http.ts';
const config={url:'http://127.0.0.1:59721',publishableKey:'synthetic-unused'};

test('native request cancellation stops an unfinished body without clearing the session',async()=>{
 let source;
 const body=new ReadableStream({start(controller){source=controller;}});
 const controller=new AbortController();
 const request=new Request('http://127.0.0.1/api/auth/native/v2/login',{method:'POST',body,duplex:'half',signal:controller.signal});
 const pending=nativeIdentityHTTP(request,'login',config);
 controller.abort();
 let timer;
 const observed=await Promise.race([pending.then(response=>response.status),new Promise(resolve=>{timer=setTimeout(()=>resolve('still-pending'),100);})]);
 clearTimeout(timer);
 try { source.enqueue(new TextEncoder().encode('{"attemptId":"00000000-0000-4000-8000-000000000001"}'));source.close(); }catch{/* Fixed handler may already have cancelled the source. */}
 await pending;
 assert.equal(observed,503,'cancellation is unavailable/unknown, not an auth denial or an unbounded wait');
});

const { nativeRequestScope } = await import('../../../lib/server/identity/native-request.ts');
const { nativeFixture, subject, sessionId } = await import('./native-fixture.ts');
const { randomUUID } = await import('node:crypto');
const nextTask=()=>new Promise(resolve=>setImmediate(resolve));
let fixturePort=59800;

test('shared native deadline bounds hostile body/cancel and prevents late work',async()=>{
 const scope=nativeRequestScope(new AbortController().signal,20);let cancelled=0,sends=0;
 try {
  const body={getReader:()=>({read:()=>new Promise(()=>{}),cancel:()=>{cancelled++;return new Promise(()=>{});},releaseLock:()=>{}})};
  await assert.rejects(scope.body({body}),/Native request unavailable/);
  assert.equal(cancelled,1);
  await assert.rejects(scope.run(async()=>{sends++;return 'late';}),/Native request unavailable/);
  assert.equal(sends,0);
 }finally{scope.dispose();}
});

test('byte cap rejects before unbounded buffering while old UTF16 validation remains',async()=>{
 for(const [text,status] of [[' '.repeat(60001),400],[' '.repeat(20001),400]]){
  const result=await nativeIdentityHTTP(new Request('http://127.0.0.1/native',{method:'POST',body:text}),'login',config);
  assert.equal(result.status,status);
 }
 let touched=0;
 const guarded={method:'POST',headers:new Headers(),get signal(){return new AbortController().signal;},get body(){touched++;throw Error('must not read');}};
 assert.equal((await nativeIdentityHTTP(guarded,'login',null)).status,503);
 guarded.headers=new Headers({Origin:'http://127.0.0.1'});
 assert.equal((await nativeIdentityHTTP(guarded,'login',config)).status,400);
 assert.equal(touched,0);
});

for(const stage of ['token','jwks','prepare'])test('late '+stage+' result after cancellation cannot continue native authentication', {timeout:5000},async t=>{
 const f=await nativeFixture(t,'http://127.0.0.1:'+fixturePort++);f.allowRefresh();
 const baseFetch=globalThis.fetch;
 let arrived,release;
 const seen=new Promise(resolve=>{arrived=resolve;});
 const held=new Promise(resolve=>{release=resolve;});
 const paths=[];let prepared=0;
 const controller=new AbortController();t.after(()=>{controller.abort();release();});
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const path=new URL(typeof input==='string'?input:input.url??String(input)).pathname;paths.push(path);
  const result=await baseFetch(input,init);
  if(path.endsWith('/native_prepare_v2'))prepared++;
  if((stage==='token'&&path==='/auth/v1/token')||(stage==='jwks'&&path.endsWith('/jwks.json'))||(stage==='prepare'&&path.endsWith('/native_prepare_v2'))){arrived();await held;}
  return result;
 });
 const request=new Request('http://127.0.0.1/native',{method:'POST',body:JSON.stringify({email:'synthetic@example.test',password:'synthetic-password',attemptId:randomUUID()}),signal:controller.signal});
 const pending=nativeIdentityHTTP(request,'credentials',{...f.config,serviceRoleKey:'synthetic-service'});
 await Promise.race([seen,pending.then(()=>{throw Error('native request returned before the controlled stage');})]);
 controller.abort();const result=await pending;assert.equal(result.status,503);assert.deepEqual(await result.json(),{error:{code:'UNAVAILABLE'}});
 const before=paths.length;release();await nextTask();await nextTask();assert.equal(paths.length,before,'no late network hop');
 assert.equal(prepared,stage==='prepare'?1:0,'already dispatched proof is not assumed rolled back');
});

test('unknown login acknowledgement retains the original session and attempt for exact retry', {timeout:5000},async t=>{
 const f=await nativeFixture(t,'http://127.0.0.1:'+fixturePort++);
 const baseFetch=globalThis.fetch;const attempts=[];let arrived,release,first=true;
 const seen=new Promise(resolve=>{arrived=resolve;});const held=new Promise(resolve=>{release=resolve;});
 const controller=new AbortController();t.after(()=>{controller.abort();release();});
 const expected={version:2,subject,sessionId,mobileEpoch:7};
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const path=new URL(typeof input==='string'?input:input.url??String(input)).pathname;
  if(path.endsWith('/native_session_v2')){
   attempts.push(JSON.parse(init.body));
   if(first){first=false;arrived();await held;}
   return Response.json(expected);
  }
  return baseFetch(input,init);
 });
 const attemptId=randomUUID();
 const request=signal=>new Request('http://127.0.0.1/native',{method:'POST',headers:{Authorization:'Bearer '+f.token},body:JSON.stringify({attemptId}),signal});
 const pending=nativeIdentityHTTP(request(controller.signal),'login',f.config);
 await Promise.race([seen,pending.then(()=>{throw Error('login returned before controlled dispatch');})]);
 controller.abort();assert.equal((await pending).status,503);release();await nextTask();
 const retried=await nativeIdentityHTTP(request(new AbortController().signal),'login',f.config);
 assert.equal(retried.status,200);assert.deepEqual(await retried.json(),expected);
 assert.deepEqual(attempts,[{p_action:'login',p_attempt:attemptId},{p_action:'login',p_attempt:attemptId}]);
});

test('actual Auth denial remains401 while a rejected transport is503 with no retry',async t=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({error_code:'invalid_credentials',msg:'Synthetic credential denial'},{status:400});});
 const request=()=>new Request('http://127.0.0.1/native',{method:'POST',body:JSON.stringify({email:'synthetic@example.test',password:'synthetic-password',attemptId:randomUUID()})});
 const bound={...config,serviceRoleKey:'synthetic-service'};
 const denied=await nativeIdentityHTTP(request(),'credentials',bound);assert.equal(denied.status,401);assert.equal(calls,1);
 t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('SECRET_CANARY_TRANSPORT');});
 const failed=await nativeIdentityHTTP(request(),'credentials',bound);assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{error:{code:'UNAVAILABLE'}});assert.equal(calls,2);
 await nextTask();assert.equal(calls,2);
});
