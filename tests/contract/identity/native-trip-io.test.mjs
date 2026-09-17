import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server.js';
import { nativeTripHTTP } from '../../../lib/server/trip/native-http.ts';
import { nativeRequestScope } from '../../../lib/server/identity/native-request.ts';
import { nativeFixture, subject, sessionId } from './native-fixture.ts';

const database='https://dzqdzetcctkhbrhlxxgn.supabase.co';
const host='vp-v4-synthetictrip-jtcao515s-projects.vercel.app';
const api=`https://${host}/api/trips/native/v2`;
async function setup(t) {
  const f=await nativeFixture(t,database);
  const env={VERCEL_ENV:'preview',VERCEL_URL:host,VISEPANDA_NATIVE_STAGING:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true',
    NEXT_PUBLIC_SUPABASE_URL:database,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey};
  const old=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));
  t.after(()=>{for(const[key,value]of Object.entries(old))value===undefined?delete process.env[key]:process.env[key]=value;});
  Object.assign(process.env,env);
  const intercepted=globalThis.fetch;
  const seen=[];
  t.mock.method(globalThis,'fetch',async(input,init)=>{
    const request=new Request(input,init),path=new URL(request.url).pathname;
    seen.push({path,redirect:request.redirect,authorization:request.headers.get('authorization')});
    if(path==='/rest/v1/rpc/native_session_v2')return Response.json({subject,sessionId,mobileEpoch:1});
    return intercepted(input,init);
  });
  return {...f,seen,request:signal=>new NextRequest(api,{headers:{Authorization:'Bearer '+f.token},signal})};
}
test('Preview Trip uses ordinary JWT with epoch authority and redirect denial',async t=>{
  const f=await setup(t);
  const response=await nativeTripHTTP(f.request(),'list');
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{version:2,trips:[],currentTripId:null});
  assert.ok(f.seen.some(r=>r.path.endsWith('/native_session_v2')));
  assert.ok(f.seen.some(r=>r.path==='/rest/v1/trips'));
  for(const call of f.seen){
    assert.equal(call.redirect,'error');
    if(call.path.startsWith('/rest/v1/'))assert.equal(call.authorization,'Bearer '+f.token);
  }
});
test('native Trip read distinguishes disabled locks from an unconnected external-order capability',async t=>{
  const f=await setup(t),next=globalThis.fetch;
  const trip={id:'314b8576-e9e7-49aa-aa66-94eac6ba6544',title:'Saved',head_version:0,updated_at:'2026-09-17T00:00:00Z'};
  t.mock.method(globalThis,'fetch',async(input,init)=>{
    const request=new Request(input,init),path=new URL(request.url).pathname;
    if(path==='/rest/v1/rpc/native_session_v2') return Response.json({subject,sessionId,mobileEpoch:1});
    if(path==='/rest/v1/trips') return Response.json([trip]);
    if(path==='/rest/v1/trip_audit_events'||path==='/rest/v1/trip_events'||path==='/rest/v1/memory_consumer_receipts'||path==='/rest/v1/trip_idempotency'||path==='/rest/v1/trip_proposals') return Response.json([]);
    if(path==='/rest/v1/trip_version_snapshots') return Response.json([{version:0,title:'Saved',content:{title:'Saved',days:[]},created_at:trip.updated_at}]);
    return next(input,init);
  });
  const response=await nativeTripHTTP(f.request(),'read',trip.id);
  assert.equal(response.status,200);
  const data=await response.json();
  assert.deepEqual({hardLocks:data.hardLocks,externalOrderStatus:data.externalOrderStatus},{hardLocks:'not_enabled',externalOrderStatus:'not_connected'});
  assert.notEqual(data.externalOrderStatus,'no_order');
});
for(const stage of ['claims','epoch','read'])test(`Trip ${stage} outage is503, not a credential-clearing401`,async t=>{
  const f=await setup(t),next=globalThis.fetch;
  t.mock.method(globalThis,'fetch',async(input,init)=>{
    const path=new URL(typeof input==='string'?input:input.url??String(input)).pathname;
    if(stage==='claims'&&path.includes('/auth/v1/')||stage==='epoch'&&path.endsWith('/native_session_v2')||stage==='read'&&path==='/rest/v1/trips')return Response.json({message:'synthetic outage'},{status:503});
    return next(input,init);
  });
  const response=await nativeTripHTTP(f.request(),'list');
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{error:{code:'PROVIDER_UNAVAILABLE'}});
});
test('Trip cancellation releases held transport and never creates another operation',async t=>{
  const f=await setup(t),next=globalThis.fetch,controller=new AbortController();
  let arrived,release,count=0;
  const seen=new Promise(resolve=>{arrived=resolve;});
  const held=new Promise(resolve=>{release=resolve;});
  t.after(()=>{controller.abort();release();});
  t.mock.method(globalThis,'fetch',async(input,init)=>{
    count++;
    const result=await next(input,init);
    const path=new URL(typeof input==='string'?input:input.url??String(input)).pathname;
    if(path.endsWith('/native_session_v2')){arrived();await held;}
    return result;
  });
  const pending=nativeTripHTTP(f.request(controller.signal),'list');
  await Promise.race([seen,pending.then(()=>{throw Error('Returned before controlled operation');})]);
  controller.abort();
  assert.equal((await pending).status,503);
  const before=count;release();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(count,before);
});
test('Trip body byte ceiling preserves64k UTF16 input budget and cancels oversized streams',async()=>{
  const scope=nativeRequestScope(new AbortController().signal);
  try {
    const text='中'.repeat(64000);
    assert.equal(await scope.body(new Request('http://localhost',{method:'POST',body:text}),192000),text);
    assert.equal(await scope.body(new Request('http://localhost',{method:'POST',body:text+'中'}),192000),null);
    await assert.rejects(scope.body(new Request('http://localhost'),192001),/Native request unavailable/);
  } finally {scope.dispose();}
});
