import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { NextRequest } from 'next/server.js';
import { issueOfflineRead, offlineCanonical, offlineDigest } from '../../../lib/server/today/offline-read.ts';
import { nativeFixture, subject as nativeSubject, sessionId } from './native-fixture.ts';
import { createOfflineNativeAuthority } from '../../../lib/server/today/offline-native-authority.ts';
import { nativeOfflineReadHTTP } from '../../../lib/server/today/offline-native-http.ts';

const tripId='314b8576-e9e7-49aa-aa66-94eac6ba6544';
const subject='214b8576-e9e7-49aa-aa66-94eac6ba6544';
const nonce='614b8576-e9e7-49aa-aa66-94eac6ba6544';
const dayId='414b8576-e9e7-49aa-aa66-94eac6ba6544';
const itemId='514b8576-e9e7-49aa-aa66-94eac6ba6544';
const now=Date.parse('2026-10-03T00:00:00.000Z');
function fixture() {
  let time=now, reads=0, policyCalls=0, signs=0;
  let basis={subject,sessionEpoch:7,tripId,headVersion:2,confirmed:true,active:true,
    payload:{days:[{id:dayId,date:'2026-10-04',items:[{id:itemId,title:'我的安排 / 😀\n'}]}]}};
  let policy={policyId:'local-test-policy',policyRevision:1,issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+60000).toISOString(),maxLeaseMs:60000,userAuthoredDayIds:[dayId],userAuthoredItemIds:[itemId]};
  // Ephemeral test-only keys never leave this test and are not runtime configuration.
  const keys=generateKeyPairSync('ed25519');
  const ports={now:()=>time,readCurrent:async()=>{reads++;return structuredClone(basis);},
    policy:async()=>{policyCalls++;return structuredClone(policy);},
    sign:async bytes=>{signs++;return {algorithm:'Ed25519',keyId:'local-test-key',signature:sign(null,bytes,keys.privateKey).toString('base64url')};}};
  return {ports,keys,get basis(){return basis;},set basis(b){basis=b;},get policy(){return policy;},set policy(p){policy=p;},set time(t){time=t;},get reads(){return reads;},get signs(){return signs;},get policyCalls(){return policyCalls;}};
}
test('closed production authority and stale basis never invoke signer',async()=>{
  const f=fixture();
  assert.deepEqual(await issueOfflineRead(tripId,2,nonce,{readCurrent:f.ports.readCurrent}),{kind:'unavailable',reason:'POLICY_UNCONFIGURED'});
  assert.deepEqual(await issueOfflineRead(tripId,3,nonce,f.ports),{kind:'unavailable',reason:'STALE_BASIS'});
  assert.equal(f.signs,0);
});
test('qualified read signs exact canonical UTF-8 scope, no raw locations or OCR',async()=>{
  const f=fixture(),result=await issueOfflineRead(tripId,2,nonce,f.ports);
  assert.equal(result.kind,'offline_trip_read/1');
  const {proof,...unsigned}=result;
  assert.equal(verify(null,Buffer.from(offlineCanonical(unsigned)),f.keys.publicKey,Buffer.from(proof.signature,'base64url')),true);
  assert.equal(result.snapshotDigest,offlineDigest(result.payload));
  assert.equal(result.requestNonce,nonce);
  assert.equal(result.serverTime,new Date(now).toISOString());
  assert.equal(verify(null,Buffer.from(offlineCanonical({...unsigned,requestNonce:tripId})),f.keys.publicKey,Buffer.from(proof.signature,'base64url')),false);
  assert.equal(verify(null,Buffer.from(offlineCanonical({...unsigned,serverTime:new Date(now-1).toISOString()})),f.keys.publicKey,Buffer.from(proof.signature,'base64url')),false);
  assert.equal(offlineCanonical({z:'我的 / 😀\n',a:2}),' {"a":2,"z":"我的 / 😀\\n"}'.slice(1));
  assert.equal(f.reads,3);
  assert.equal(f.policyCalls,2);
});
for(const [label,mutate]of Object.entries({
  owner:f=>f.basis.subject=tripId,epoch:f=>f.basis.sessionEpoch++,head:f=>f.basis.headVersion++,
  delete:f=>f.basis=null,archive:f=>f.basis.active=false,
  content:f=>f.basis.payload.days[0].items[0].title='changed',
  expiry:f=>f.time=now+60000,revoked:f=>f.policy=null,policyRevision:f=>f.policy.policyRevision++,
}))test(`issuance rejects ${label} change while signer is awaited`,async()=>{
  const f=fixture(),original=f.ports.sign;
  f.ports.sign=async bytes=>{const proof=await original(bytes);mutate(f);return proof;};
  assert.deepEqual(await issueOfflineRead(tripId,2,nonce,f.ports),{kind:'unavailable',reason:'STALE_BASIS'});
});
test('session revocation during final policy lookup is rechecked',async()=>{
  const f=fixture(),original=f.ports.policy;
  f.ports.policy=async b=>{const p=await original(b);if(f.policyCalls===2)f.basis.sessionEpoch++;return p;};
  assert.equal((await issueOfflineRead(tripId,2,nonce,f.ports)).kind,'unavailable');
});
for(const [label,mutate]of Object.entries({
  unknownProvenance:f=>f.policy.userAuthoredItemIds=[],unprovenDate:f=>f.policy.userAuthoredDayIds=[],
  unconfirmed:f=>f.basis.confirmed=false,missingEpoch:f=>f.basis.sessionEpoch=null,
  thirdPartyField:f=>f.basis.payload.days[0].items[0].address='restricted',
  leaseOverBound:f=>f.policy.expiresAt=new Date(now+60001).toISOString(),futureIssued:f=>f.policy.issuedAt=new Date(now+1).toISOString(),
  nullDate:f=>f.basis.payload.days[0].date=null,invalidDate:f=>f.basis.payload.days[0].date='2026-02-30',
  loneSurrogate:f=>f.basis.payload.days[0].items[0].title='\ud800',
  oversize:f=>f.basis.payload.days[0].items[0].title='x'.repeat(2001),
}))test(`does not sign ${label}`,async()=>{
  const f=fixture();mutate(f);
  assert.equal((await issueOfflineRead(tripId,2,nonce,f.ports)).kind,'unavailable');
  assert.equal(f.signs,0);
});
test('unknown signer algorithm and malformed proof do not become a permit',async()=>{
  for(const proof of [{algorithm:'sha256',keyId:'hash',signature:'a'.repeat(86)},{algorithm:'Ed25519',keyId:'key',signature:'short'}]){
    const f=fixture();f.ports.sign=async()=>proof;
    assert.equal((await issueOfflineRead(tripId,2,nonce,f.ports)).reason,'POLICY_UNCONFIGURED');
  }
});
test('strict Native query rejects caller owner/ttl, ambiguity and browser credentials before transport',async()=>{
  for(const [query,headers]of [['expectedHeadVersion=2&owner='+subject,{}],['expectedHeadVersion=2&ttl=1',{}],['expectedHeadVersion=2&expectedHeadVersion=2',{}],['expectedHeadVersion=0',{}],['expectedHeadVersion=02',{}],['expectedHeadVersion=2',{cookie:'session=synthetic'}],['expectedHeadVersion=2',{origin:'https://example.com'}]]){
    const r=await nativeOfflineReadHTTP(new NextRequest('https://example.com/offline?'+query+'&requestNonce='+nonce,{headers}),tripId);
    assert.equal(r.status,400);
  }
});

const database='https://dzqdzetcctkhbrhlxxgn.supabase.co';
const host='vp-v4-offlinesynthetic-jtcao515s-projects.vercel.app';
async function httpFixture(t, mutate=()=>{}) {
  const f=await nativeFixture(t,database);
  const env={VERCEL_ENV:'preview',VERCEL_URL:host,VISEPANDA_NATIVE_STAGING:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true',NEXT_PUBLIC_SUPABASE_URL:database,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey};
  const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));
  t.after(()=>{for(const[k,v]of Object.entries(old))v===undefined?delete process.env[k]:process.env[k]=v;});
  Object.assign(process.env,env);
  const intercepted=globalThis.fetch, seen=[];
  let tripReads=0;
  t.mock.method(globalThis,'fetch',async(input,init)=>{
    const r=new Request(input,init),path=new URL(r.url).pathname;
    const action=path.endsWith('/native_session_v2')?JSON.parse(await r.clone().text()).p_action:null;
    seen.push({path,method:r.method,action});
    const state={path,tripReads}; mutate(state);
    if(state.response)return state.response;
    if(path.endsWith('/native_session_v2'))return Response.json({version:2,subject:nativeSubject,sessionId,mobileEpoch:7});
    if(path==='/rest/v1/trips'){
      tripReads++;
      return Response.json([{id:tripId,title:'Saved',head_version:2,updated_at:'2026-10-03T00:00:00Z'}]);
    }
    if(path==='/rest/v1/trip_archives')return Response.json([]);
    if(path==='/rest/v1/trip_events')return Response.json([{id:dayId,resulting_version:2,proposal_id:itemId,event_type:'proposal_applied',created_at:'2026-10-03T00:00:00Z'}]);
    if(path==='/rest/v1/trip_idempotency')return Response.json([{proposal_id:itemId,resulting_version:2}]);
    if(path==='/rest/v1/trip_proposals')return Response.json([{id:itemId,trip_id:tripId,base_trip_version:1,status:'applied'}]);
    if(path==='/rest/v1/trip_version_snapshots')return Response.json([{version:2,title:'Saved',content:{title:'Saved',days:[{id:dayId,date:'2026-10-04',items:[{id:itemId,dayId,title:'User schedule'}]}]},created_at:'2026-10-03T00:00:00Z'}]);
    if(path==='/rest/v1/trip_audit_events'||path==='/rest/v1/memory_consumer_receipts')return Response.json([]);
    return intercepted(input,init);
  });
  return {seen,request:new NextRequest(`https://${host}/api/trips/native/v2/${tripId}/offline-read?expectedHeadVersion=2&requestNonce=${nonce}`,{headers:{authorization:'Bearer '+f.token}})};
}
test('actual production HTTP uses active session/RLS read then rechecks, no cache permit or writes',async t=>{
  const f=await httpFixture(t);
  const r=await nativeOfflineReadHTTP(f.request,tripId);
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{kind:'unavailable',reason:'POLICY_UNCONFIGURED'});
  assert.equal(r.headers.get('cache-control'),'private, no-store');
  assert.ok(f.seen.filter(c=>c.path==='/rest/v1/trip_version_snapshots').length>=2);
  assert.ok(f.seen.some(c=>c.path==='/rest/v1/trip_archives'));
  assert.ok(f.seen.every(c=>c.method==='GET'||c.path.endsWith('/native_session_v2')));
});
test('production rejects archived Trip',async t=>{
  const f=await httpFixture(t,s=>{if(s.path==='/rest/v1/trip_archives')s.response=Response.json([{trip_id:tripId,archived_version:2,archived_at:'2026-10-03T00:00:00Z'}]);});
  const r=await nativeOfflineReadHTTP(f.request,tripId);
  assert.equal((await r.json()).kind,'unavailable');
});
test('final session revocation returns credential failure, not any offline response',async t=>{
  const f=await httpFixture(t,s=>{if(s.path.endsWith('/native_session_v2')&&s.tripReads>=3)s.response=Response.json({version:2,subject:nativeSubject,sessionId:tripId,mobileEpoch:8});});
  const r=await nativeOfflineReadHTTP(f.request,tripId);
  assert.equal(r.status,401);
});

test('old policy issue time does not restart lease at signing or response receipt',async()=>{
  const f=fixture();
  f.policy.issuedAt=new Date(now-50000).toISOString();
  f.policy.expiresAt=new Date(now+10000).toISOString();
  const original=f.ports.sign;
  f.ports.sign=async bytes=>{f.time=now+5000;return original(bytes);};
  const result=await issueOfflineRead(tripId,2,nonce,f.ports);
  assert.equal(result.kind,'offline_trip_read/1');
  assert.equal(result.serverTime,new Date(now).toISOString());
  assert.equal(Date.parse(result.expiresAt)-Date.parse(result.serverTime),10000);
  assert.equal(result.issuedAt,new Date(now-50000).toISOString());
});
test('server clock rollback during signing fails closed',async()=>{
  const f=fixture();f.policy.issuedAt=new Date(now-1000).toISOString();
  f.policy.maxLeaseMs=61000;
  const original=f.ports.sign;
  f.ports.sign=async bytes=>{f.time=now-1;return original(bytes);};
  assert.deepEqual(await issueOfflineRead(tripId,2,nonce,f.ports),{kind:'unavailable',reason:'STALE_BASIS'});
});
test('expiry during final authority read cannot publish previously signed permit',async()=>{
  const f=fixture(),original=f.ports.readCurrent;
  f.ports.readCurrent=async()=>{const b=await original();if(f.reads===3)f.time=now+60000;return b;};
  assert.deepEqual(await issueOfflineRead(tripId,2,nonce,f.ports),{kind:'unavailable',reason:'STALE_BASIS'});
});
test('nonce is required, UUID validated, unique in query and carries no cache rights',async()=>{
  const f=fixture();
  for(const value of ['', 'not-a-uuid'])assert.equal((await issueOfflineRead(tripId,2,value,f.ports)).kind,'unavailable');
  assert.equal(f.reads,0);
  for(const query of ['expectedHeadVersion=2','expectedHeadVersion=2&requestNonce=bad',`expectedHeadVersion=2&requestNonce=${nonce}&requestNonce=${nonce}`]){
    const r=await nativeOfflineReadHTTP(new NextRequest('https://example.com/offline?'+query),tripId);
    assert.equal(r.status,400);
  }
});

test('real readonly authority obtains verified actor and epoch with session action only',async t=>{
  const f=await httpFixture(t);
  const authority=await createOfflineNativeAuthority(f.request,{url:database,publishableKey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY});
  assert.ok(authority);
  assert.deepEqual(await authority.read(),{data:{subject:nativeSubject,sessionId,sessionEpoch:7}});
  assert.ok(f.seen.every(r=>r.method==='GET'||(r.path.endsWith('/native_session_v2')&&r.action==='session')));
});
for(const [label,row]of Object.entries({
  missingEpoch:{version:2,subject:nativeSubject,sessionId},zeroEpoch:{version:2,subject:nativeSubject,sessionId,mobileEpoch:0},
  unsafeEpoch:{version:2,subject:nativeSubject,sessionId,mobileEpoch:9007199254740992},wrongVersion:{version:1,subject:nativeSubject,sessionId,mobileEpoch:7},
}))test(`malformed authority ${label} is503 and never generates epoch or offline permit`,async t=>{
  const f=await httpFixture(t,s=>{if(s.path.endsWith('/native_session_v2'))s.response=Response.json(row);});
  const r=await nativeOfflineReadHTTP(f.request,tripId);
  assert.equal(r.status,503);
  assert.deepEqual(await r.json(),{error:{code:'PROVIDER_UNAVAILABLE'}});
});
test('epoch changes with same actor/session during snapshot read fail closed',async t=>{
  const f=await httpFixture(t,s=>{if(s.path.endsWith('/native_session_v2'))s.response=Response.json({version:2,subject:nativeSubject,sessionId,mobileEpoch:s.tripReads>=2?8:7});});
  assert.equal((await nativeOfflineReadHTTP(f.request,tripId)).status,401);
});
test('authority upstream error retains503 instead of clearing credentials',async t=>{
  const f=await httpFixture(t,s=>{if(s.path.endsWith('/native_session_v2'))s.response=Response.json({message:'synthetic authority outage'},{status:503});});
  assert.equal((await nativeOfflineReadHTTP(f.request,tripId)).status,503);
});

test('real Trip opaque IDs and uppercase UUIDs remain exact in signed payload and provenance',async()=>{
  const f=fixture(),day=f.basis.payload.days[0];
  day.id='Day_1-A';
  day.items[0].id=itemId.toUpperCase();
  f.policy.userAuthoredDayIds=[day.id];
  f.policy.userAuthoredItemIds=[day.items[0].id];
  const result=await issueOfflineRead(tripId,2,nonce,f.ports);
  assert.equal(result.kind,'offline_trip_read/1');
  assert.equal(result.payload.days[0].id,'Day_1-A');
  assert.equal(result.payload.days[0].items[0].id,itemId.toUpperCase());
  f.policy.userAuthoredDayIds=['day_1-a'];
  assert.equal((await issueOfflineRead(tripId,2,nonce,f.ports)).kind,'unavailable');
});
test('opaque ID boundary rejects illegal and duplicate IDs before signing',async()=>{
  for(const id of ['', 'x'.repeat(65), 'contains space', '含中文', 'slash/id']){
    for(const field of ['day','item']){
      const f=fixture(),day=f.basis.payload.days[0];
      if(field==='day'){day.id=id;f.policy.userAuthoredDayIds=[id];}
      else{day.items[0].id=id;f.policy.userAuthoredItemIds=[id];}
      assert.equal((await issueOfflineRead(tripId,2,nonce,f.ports)).kind,'unavailable');
      assert.equal(f.signs,0);
    }
  }
  for(const field of ['day','item']){
    const f=fixture(),day=f.basis.payload.days[0];
    if(field==='day')f.basis.payload.days.push(structuredClone(day));
    else day.items.push(structuredClone(day.items[0]));
    assert.equal((await issueOfflineRead(tripId,2,nonce,f.ports)).kind,'unavailable');
    assert.equal(f.signs,0);
  }
});
