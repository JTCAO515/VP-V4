import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createHash, sign, verify } from 'node:crypto';
import { NextRequest } from 'next/server.js';
import { issueOfflineRead, offlineCanonical, offlineDigest, projectOfflinePayload } from '../../../lib/server/today/offline-read.ts';
import { nativeFixture, subject as nativeSubject, sessionId } from './native-fixture.ts';
import { offlineFieldDigest, parseOfflineProvenance, createOfflineTextRepository } from '../../../lib/server/today/offline-text-repository.ts';
import { nativeOfflineTextHTTP } from '../../../lib/server/today/offline-text-native-http.ts';
import { productionOfflinePorts, readOfflinePolicy, readOfflineSigner } from '../../../lib/server/today/offline-production.ts';
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
  let policy={policyId:'local-test-policy',policyRevision:1,issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+60000).toISOString(),maxLeaseMs:60000,qualifiedDayIds:[dayId],qualifiedItemIds:[itemId]};
  // Ephemeral test-only keys never leave this test and are not runtime configuration.
  const keys=generateKeyPairSync('ed25519');
  const ports={now:()=>time,readCurrent:async()=>{reads++;return structuredClone(basis);},
    policy:async()=>{policyCalls++;if(!policy)return null;const qualifiedPayload=projectOfflinePayload(basis.payload,policy.qualifiedDayIds,policy.qualifiedItemIds);return {...structuredClone(policy),qualifiedPayload,coverage:offlineCanonical(qualifiedPayload)===offlineCanonical(basis.payload)?'full':'partial',sourceSemantics:'controlled_user_text_submission',generation:0,provenanceBinding:'a'.repeat(64)};},
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
  unknownProvenance:f=>{f.policy.qualifiedItemIds=[];f.policy.qualifiedDayIds=[];},unprovenDate:f=>f.policy.qualifiedDayIds=[],
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
    if(path.endsWith('/read_offline_trip_text_provenance_v1'))return Response.json({kind:'unavailable',reason:'NO_PROVENANCE'});
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
  assert.ok(f.seen.every(c=>c.method==='GET'||c.path.endsWith('/native_session_v2')||c.path.endsWith('/read_offline_trip_text_provenance_v1')));
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
  f.policy.qualifiedDayIds=[day.id];
  f.policy.qualifiedItemIds=[day.items[0].id];
  const result=await issueOfflineRead(tripId,2,nonce,f.ports);
  assert.equal(result.kind,'offline_trip_read/1');
  assert.equal(result.payload.days[0].id,'Day_1-A');
  assert.equal(result.payload.days[0].items[0].id,itemId.toUpperCase());
  f.policy.qualifiedDayIds=['day_1-a'];
  assert.equal((await issueOfflineRead(tripId,2,nonce,f.ports)).kind,'unavailable');
});
test('opaque ID boundary rejects illegal and duplicate IDs before signing',async()=>{
  for(const id of ['', 'x'.repeat(65), 'contains space', '含中文', 'slash/id']){
    for(const field of ['day','item']){
      const f=fixture(),day=f.basis.payload.days[0];
      if(field==='day'){day.id=id;f.policy.qualifiedDayIds=[id];}
      else{day.items[0].id=id;f.policy.qualifiedItemIds=[id];}
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

function productionFixture() {
  const f=fixture(),publicDer=f.keys.publicKey.export({format:'der',type:'spki'});
  const policy={version:'offline_read_policy/1',environment:'local',enabled:true,revoked:false,policyId:'test-policy',policyRevision:1,fieldAllowlist:['days.date','days.items.title'],issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+60000).toISOString(),maxLeaseMs:60000};
  const signer={version:'offline_read_signer/1',environment:'local',algorithm:'Ed25519',keyId:'ed25519:'+createHash('sha256').update(publicDer).digest('hex'),publicKeySpki:publicDer.toString('base64url'),privateKeyPkcs8Pem:f.keys.privateKey.export({format:'pem',type:'pkcs8'})};
  let privateReads=0;
  const configuration={readPolicy:()=>JSON.stringify(policy),readSigner:()=>{privateReads++;return JSON.stringify(signer);}};
  const provenance=async b=>makeReceipt(b,projectOfflinePayload(b.payload,[dayId],[itemId]));
  return {f,policy,signer,configuration,provenance,get privateReads(){return privateReads;}};
}
test('production composition actually reads strict policy and Ed25519 provider and verifies signature',async()=>{
  const p=productionFixture();
  const result=await issueOfflineRead(tripId,2,nonce,productionOfflinePorts(p.f.ports.readCurrent,'local',p.configuration,p.provenance,()=>now));
  assert.equal(result.kind,'offline_trip_read/1');
  assert.equal(result.proof.keyId,p.signer.keyId);
  const {proof,...unsigned}=result;
  assert.equal(verify(null,Buffer.from(offlineCanonical(unsigned)),p.f.keys.publicKey,Buffer.from(proof.signature,'base64url')),true);
});
test('missing or mismatched provenance rejects before private provider is read',async()=>{
  const p=productionFixture();
  for(const provenance of [undefined,async()=>null,async b=>({...await p.provenance(b),subject:tripId}),async b=>({...await p.provenance(b),qualifiedPayloadDigest:'a'.repeat(64)})]){
    assert.deepEqual(await issueOfflineRead(tripId,2,nonce,productionOfflinePorts(p.f.ports.readCurrent,'local',p.configuration,provenance,()=>now)),{kind:'unavailable',reason:'POLICY_UNCONFIGURED'});
  }
  assert.equal(p.privateReads,0);
});
test('policy missing, disabled, revoked, malformed or target mismatched does not read private keys',async()=>{
  const p=productionFixture();
  for(const raw of [undefined,'{',JSON.stringify({...p.policy,enabled:false}),JSON.stringify({...p.policy,enabled:'true'}),JSON.stringify({...p.policy,revoked:true}),JSON.stringify({...p.policy,revoked:'false'}),JSON.stringify({...p.policy,environment:'production'}),JSON.stringify({...p.policy,policyRevision:0}),JSON.stringify({...p.policy,issuedAt:'2026-10-03T00:00:00Z'}),JSON.stringify({...p.policy,issuedAt:new Date(now+1).toISOString()}),JSON.stringify({...p.policy,expiresAt:new Date(now).toISOString()}),JSON.stringify({...p.policy,maxLeaseMs:1}),JSON.stringify({...p.policy,fieldAllowlist:['photos']}),JSON.stringify({...p.policy,owner:subject}),' '.repeat(8193)]){
    const config={readPolicy:()=>raw,readSigner:p.configuration.readSigner};
    assert.equal((await issueOfflineRead(tripId,2,nonce,productionOfflinePorts(p.f.ports.readCurrent,'local',config,p.provenance,()=>now))).kind,'unavailable');
  }
  assert.equal(p.privateReads,0);
  assert.equal(readOfflinePolicy(JSON.stringify(p.policy),'unknown',now),null);
});
test('revocation while provenance is awaited rejects before reading private keys',async()=>{
  const p=productionFixture();
  const provenance=async b=>{const r=await p.provenance(b);p.policy.revoked=true;return r;};
  assert.equal((await issueOfflineRead(tripId,2,nonce,productionOfflinePorts(p.f.ports.readCurrent,'local',p.configuration,provenance,()=>now))).kind,'unavailable');
  assert.equal(p.privateReads,0);
});
test('signer enforces Ed25519, key fingerprint, derived public match, environment and size',()=>{
  const p=productionFixture(),other=generateKeyPairSync('ed25519'),rsa=generateKeyPairSync('rsa',{modulusLength:1024});
  for(const raw of [undefined,'{',JSON.stringify({...p.signer,keyId:'ed25519:'+'0'.repeat(64)}),JSON.stringify({...p.signer,publicKeySpki:other.publicKey.export({format:'der',type:'spki'}).toString('base64url')}),JSON.stringify({...p.signer,algorithm:'RS256'}),JSON.stringify({...p.signer,privateKeyPkcs8Pem:rsa.privateKey.export({format:'pem',type:'pkcs8'})}),JSON.stringify({...p.signer,privateKeyPkcs8Pem:'secret-invalid-key'}),JSON.stringify({...p.signer,environment:'production'}),JSON.stringify({...p.signer,publicKeySpki:p.signer.publicKeySpki+'='}),JSON.stringify({...p.signer,privateKeyPkcs8Pem:'x'.repeat(4097)}),JSON.stringify({...p.signer,secretExtra:'forbidden'}),' '.repeat(12289)])assert.equal(readOfflineSigner(raw,'local'),null);
  assert.ok(readOfflineSigner(JSON.stringify(p.signer),'local'));
  assert.equal(readOfflineSigner(JSON.stringify(p.signer),'unknown'),null);
});
test('final policy or provenance revocation prevents publishing signed production package',async()=>{
  for(const changed of ['policy','provenance','signer']){
    const p=productionFixture();let reads=0;
    const read=async()=>{const b=await p.f.ports.readCurrent();if(++reads===2){if(changed==='policy')p.policy.revoked=true;if(changed==='signer')p.signer.keyId='ed25519:'+'0'.repeat(64);}return b;};
    const provenance=async b=>changed==='provenance'&&reads>=2?null:p.provenance(b);
    assert.deepEqual(await issueOfflineRead(tripId,2,nonce,productionOfflinePorts(read,'local',p.configuration,provenance,()=>now)),{kind:'unavailable',reason:'STALE_BASIS'});
  }
});
test('actual HTTP composition cannot grant authorship from configured policy alone',async t=>{
  const f=await httpFixture(t),p=productionFixture(),old=process.env.VISEPANDA_OFFLINE_READ_POLICY;
  t.after(()=>{old===undefined?delete process.env.VISEPANDA_OFFLINE_READ_POLICY:process.env.VISEPANDA_OFFLINE_READ_POLICY=old;});
  process.env.VISEPANDA_OFFLINE_READ_POLICY=JSON.stringify({...p.policy,environment:'staging',issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+50000).toISOString()});
  const r=await nativeOfflineReadHTTP(f.request,tripId);
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{kind:'unavailable',reason:'POLICY_UNCONFIGURED'});
});

test('partial licensed projection omits old days/items, signs subset digest and accurate coverage',async()=>{
  const p=productionFixture(),saved=p.f.basis.payload;
  saved.days[0].items.push({id:'Old_title',title:'Old online-only content'});
  saved.days.unshift({id:'Old_day',date:'2026-10-03',items:[{id:'Older_title',title:'Older online-only content'}]});
  const result=await issueOfflineRead(tripId,2,nonce,productionOfflinePorts(p.f.ports.readCurrent,'local',p.configuration,p.provenance,()=>now));
  assert.equal(result.kind,'offline_trip_read/1');
  assert.equal(result.coverage,'partial');
  assert.deepEqual(result.payload,{days:[{id:dayId,date:'2026-10-04',items:[{id:itemId,title:'我的安排 / 😀\n'}]}]});
  assert.equal(result.snapshotDigest,offlineDigest(result.payload));
  assert.notEqual(result.snapshotDigest,offlineDigest(saved));
  const {proof,...unsigned}=result;
  assert.equal(verify(null,Buffer.from(offlineCanonical({...unsigned,coverage:'full'})),p.f.keys.publicKey,Buffer.from(proof.signature,'base64url')),false);
  assert.equal(saved.days.length,2);
});
test('date-only receipt includes date without exposing any unqualified item title',async()=>{
  const f=fixture();f.policy.qualifiedItemIds=[];
  const result=await issueOfflineRead(tripId,2,nonce,f.ports);
  assert.equal(result.coverage,'partial');
  assert.deepEqual(result.payload.days[0].items,[]);
});
test('full coverage is reserved for complete qualified date/title projection',async()=>{
  const p=productionFixture();
  assert.equal((await issueOfflineRead(tripId,2,nonce,productionOfflinePorts(p.f.ports.readCurrent,'local',p.configuration,p.provenance,()=>now))).coverage,'full');
});
test('changes in omitted online fields still invalidate the current full Trip basis',async()=>{
  const f=fixture();f.basis.payload.days[0].items.push({id:'Old_item',title:'Old online-only title'});
  const original=f.ports.sign;
  f.ports.sign=async bytes=>{const proof=await original(bytes);f.basis.payload.days[0].items[1].title='Changed old online title';return proof;};
  assert.deepEqual(await issueOfflineRead(tripId,2,nonce,f.ports),{kind:'unavailable',reason:'STALE_BASIS'});
});
test('large online-only history does not consume signed subset package capacity',async()=>{
  const f=fixture();
  for(let i=0;i<60;i++)f.basis.payload.days.push({id:'old_'+i,date:new Date(Date.UTC(2026,10,1+i)).toISOString().slice(0,10),items:[]});
  const result=await issueOfflineRead(tripId,2,nonce,f.ports);
  assert.equal(result.kind,'offline_trip_read/1');
  assert.equal(result.coverage,'partial');
  assert.equal(result.payload.days.length,1);
});

function makeReceipt(basis,qualifiedPayload=basis.payload){
  const fields=[];let n=1;
  for(const day of qualifiedPayload.days){
    fields.push({field:'days.date',dayId:day.id,itemId:null,sourceReceiptId:'70000000-0000-0000-0000-'+String(n++).padStart(12,'0'),valueDigest:offlineFieldDigest('days.date',day.id,null,day.date)});
    for(const item of day.items)fields.push({field:'days.items.title',dayId:day.id,itemId:item.id,sourceReceiptId:'70000000-0000-0000-0000-'+String(n++).padStart(12,'0'),valueDigest:offlineFieldDigest('days.items.title',day.id,item.id,item.title)});
  }
  const excludedDays=basis.payload.days.length-qualifiedPayload.days.length;
  const excludedItems=basis.payload.days.reduce((n,d)=>n+d.items.length,0)-qualifiedPayload.days.reduce((n,d)=>n+d.items.length,0);
  return {kind:'offline_text_provenance/1',sourceSemantics:'controlled_user_text_submission',subject:basis.subject,sessionEpoch:basis.sessionEpoch,tripId:basis.tripId,headVersion:basis.headVersion,purpose:'offline_cache',generation:0,qualifiedPayload:structuredClone(qualifiedPayload),qualifiedPayloadDigest:offlineDigest(qualifiedPayload),fields,coverage:{kind:excludedDays||excludedItems?'partial':'full',excludedDays,excludedItems}};
}
test('source reader validates exact field/value tuple hash, generation, coverage and current values',()=>{
  const f=fixture(),receipt=makeReceipt(f.basis);
  assert.deepEqual(parseOfflineProvenance(receipt,f.basis),receipt);
  for(const mutate of [r=>r.fields[0].valueDigest='a'.repeat(64),r=>r.fields[0].dayId='wrong',r=>r.fields.pop(),r=>r.fields[1].sourceReceiptId=r.fields[0].sourceReceiptId,r=>r.generation=-1,r=>r.coverage.excludedDays=1,r=>r.coverage.kind='partial',r=>r.qualifiedPayload.days[0].items[0].title='fake',r=>r.owner=subject,r=>r.sourceSemantics='copyright_verified']){
    const bad=structuredClone(receipt);mutate(bad);assert.equal(parseOfflineProvenance(bad,f.basis),null);
  }
});
test('candidate submit/revoke use exact fixed SQL args, no source claims or direct Trip writer',async t=>{
  const f=await httpFixture(t),prior=globalThis.fetch,seen=[];
  const operationId=nonce,suffix=nonce.replaceAll('-','');
  t.mock.method(globalThis,'fetch',async(input,init)=>{
    const r=new Request(input,init),path=new URL(r.url).pathname;
    if(path.endsWith('/submit_offline_trip_text_proposal_v1')){
      seen.push(await r.json());return Response.json({kind:'offline_text_proposal/1',operationId,proposalId:dayId,proposalRevision:1,baseTripVersion:2,sessionEpoch:7,dayId:'ofd_'+suffix,itemId:'ofi_'+suffix,provenanceState:'candidate',reused:false});
    }
    if(path.endsWith('/revoke_offline_trip_text_provenance_v1')){
      seen.push(await r.json());return Response.json({kind:'offline_text_revoked/1',tripId,sessionEpoch:7,generation:1,operationId,reused:false});
    }
    return prior(input,init);
  });
  const command={operationId,expectedHeadVersion:2,date:'2026-10-05',title:'  New input  ',saveOffline:true};
  const request=body=>new NextRequest(`https://${host}/api/trips/native/v2/${tripId}/offline-text/proposal`,{method:'POST',headers:{authorization:f.request.headers.get('authorization')},body:JSON.stringify(body)});
  const submitted=await nativeOfflineTextHTTP(request(command),tripId,'submit');
  assert.equal(submitted.status,201);
  assert.deepEqual(await submitted.json(),{version:2,proposalId:dayId,revision:1,baseTripVersion:2,reused:false});
  const revoked=await nativeOfflineTextHTTP(request({operationId}),tripId,'revoke');assert.equal(revoked.status,200);
  assert.deepEqual(seen,[{p_trip_id:tripId,p_operation_id:nonce,p_expected_head_version:2,p_date:'2026-10-05',p_title:'New input',p_save_offline:true},{p_trip_id:tripId,p_expected_epoch:7,p_operation_id:nonce}]);
});
test('SQL missing permission is503; same-date conflict remains409 with explicit code',async t=>{
  const f=await httpFixture(t),prior=globalThis.fetch;
  let message='permission denied for function submit_offline_trip_text_proposal_v1';
  t.mock.method(globalThis,'fetch',async(input,init)=>{const r=new Request(input,init);return new URL(r.url).pathname.endsWith('/submit_offline_trip_text_proposal_v1')?Response.json({message,code:'42501'},{status:403}):prior(input,init);});
  const request=()=>new NextRequest(`https://${host}/offline`,{method:'POST',headers:{authorization:f.request.headers.get('authorization')},body:JSON.stringify({operationId:nonce,expectedHeadVersion:2,date:'2026-10-05',title:'new',saveOffline:true})});
  assert.equal((await nativeOfflineTextHTTP(request(),tripId,'submit')).status,503);
  message='OFFLINE_DATE_EXISTS';const r=await nativeOfflineTextHTTP(request(),tripId,'submit');
  assert.equal(r.status,409);assert.deepEqual(await r.json(),{error:{code:'OFFLINE_DATE_EXISTS'}});
});

test('actual readonly repository passes exact current head and epoch and checks qualified receipt',async t=>{
  const f=await httpFixture(t),basis=fixture().basis;basis.subject=nativeSubject;
  const receipt=makeReceipt(basis),prior=globalThis.fetch,seen=[];
  t.mock.method(globalThis,'fetch',async(input,init)=>{const r=new Request(input,init);if(new URL(r.url).pathname.endsWith('/read_offline_trip_text_provenance_v1')){seen.push(await r.json());return Response.json(receipt);}return prior(input,init);});
  const repository=await createOfflineTextRepository(f.request,{url:database,publishableKey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY});
  assert.deepEqual(await repository.read(basis),{data:receipt});
  assert.deepEqual(seen,[{p_trip_id:tripId,p_expected_head_version:2,p_expected_epoch:7}]);
});
test('generation change during signing invalidates unchanged qualified payload',async()=>{
  const p=productionFixture();let generation=0,reads=0;
  const provenance=async b=>({...await p.provenance(b),generation});
  const readCurrent=async()=>{const b=await p.f.ports.readCurrent();if(++reads===2)generation++;return b;};
  assert.deepEqual(await issueOfflineRead(tripId,2,nonce,productionOfflinePorts(readCurrent,'local',p.configuration,provenance,()=>now)),{kind:'unavailable',reason:'STALE_BASIS'});
});
