import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeTripLifecycleHTTP } from '../../../lib/server/trip/lifecycle/native-http.ts';
import { lifecycleDigest } from '../../../lib/server/trip/lifecycle/operations.ts';
import { nativeFixture, subject, sessionId } from '../../contract/identity/native-fixture.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const command={action:'archive',operationId:id(1),expectedRevision:7,expectedActiveTripId:id(2),expectedSessionId:sessionId,confirmed:true,tripId:id(2),expectedHeadVersion:3,preference:{action:'skip'}};
const capacity={draftCount:0,draftLimit:3,activeTripId:null,activeLimit:1,legacyCount:0};
const snapshot={version:'trip-lifecycle/1',ownerId:subject,sessionId,revision:8,capacity,trips:[],nextTripId:null,serviceStatus:'unavailable'};
const receipt=bytes=>({status:'applied',version:'trip-lifecycle/1',ownerId:subject,sessionId,operationId:id(1),requestDigest:lifecycleDigest(bytes),action:'archive',revision:8,tripId:id(2),state:'archived',capacity,archivedVersion:3,archivedAt:'2026-10-05T06:00:00.000Z',preference:'skipped',memoryRefs:[]});
async function setup(t){
 const fixture=await nativeFixture(t,'http://127.0.0.1:63870');const transport=globalThis.fetch;
 const calls=[];let data=snapshot,error=null,sessionData={subject,sessionId},sessionReads=0,replace=false;
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const req=new Request(input,init),path=new URL(req.url).pathname;
  if(path.endsWith('/native_session_v2')){sessionReads++;return Response.json(replace&&sessionReads>1?{subject,sessionId:id(9)}:sessionData);}
  if(path.endsWith('/trip_lifecycle_v1')){calls.push(await req.json());return error?Response.json({message:error},{status:400}):Response.json(data);}
  return transport(input,init);
 });
 const request=(body=null,headers={},query='')=>new Request('http://127.0.0.1/api/trips/native/v2/lifecycle'+query,{method:body===null?'GET':'POST',headers:{authorization:'Bearer '+fixture.token,...(body===null?{}:{'content-type':'application/json'}),...headers},...(body===null?{}:{body})});
 return {fixture,calls,request,data:v=>data=v,error:v=>error=v,session:v=>sessionData=v,replace:()=>replace=true};
}
test('synthetic ordinary Native HTTP forwards raw UTF8 archive bytes and exact terminal receipts',async t=>{
 const e=await setup(t),raw='\n'+JSON.stringify(command,null,2)+' ';
 e.data(receipt(raw));const r=await nativeTripLifecycleHTTP(e.request(raw),'execute',undefined,e.fixture.config);
 assert.equal(r.status,200);assert.deepEqual(await r.json(),receipt(raw));assert.equal(r.headers.get('cache-control'),'private, no-store');assert.deepEqual(e.calls,[{p_action:'execute',p_input:command,p_request_bytes:raw}]);
 e.data({...receipt(raw),requestDigest:lifecycleDigest(JSON.stringify(command))});assert.equal((await nativeTripLifecycleHTTP(e.request(raw),'execute',undefined,e.fixture.config)).status,503);
 const d={version:'trip-lifecycle/1',ownerId:subject,sessionId,operationId:id(1),requestDigest:lifecycleDigest(raw),action:'archive',tripId:id(2),status:'declined',reason:'TRIP_CAPACITY',revision:7};e.data(d);
 const denied=await nativeTripLifecycleHTTP(e.request(raw),'execute',undefined,e.fixture.config);assert.equal(denied.status,200);assert.deepEqual(await denied.json(),d);
});
test('no cookie/origin, weak CAS, implicit preference or unmatched abandon reaches lifecycle RPC',async t=>{
 const e=await setup(t),raw=JSON.stringify(command);
 for(const headers of [{cookie:'synthetic'},{origin:'http://127.0.0.1'},{'content-type':'text/plain'}])assert.equal((await nativeTripLifecycleHTTP(e.request(raw,headers),'execute',undefined,e.fixture.config)).status,400);
 for(const body of [{...command,expectedSessionId:null},{...command,confirmed:false},{...command,privatePreferences:'inferred'},{...command,preference:{action:'skip',remember:true}}])assert.equal((await nativeTripLifecycleHTTP(e.request(JSON.stringify(body)),'execute',undefined,e.fixture.config)).status,400);
 assert.equal((await nativeTripLifecycleHTTP(e.request(raw),'abandon',id(8),e.fixture.config)).status,400);
 assert.equal((await nativeTripLifecycleHTTP(e.request(null,{},'?expectedRevision=7'),'read',undefined,e.fixture.config)).status,400);
 assert.deepEqual(e.calls,[]);
});
test('recovery is nullable but never creates a fake empty state; abandon goes through SQL fence',async t=>{
 const e=await setup(t),raw=JSON.stringify(command),envelope={version:'trip-lifecycle/1',ownerId:subject,sessionId,operationId:id(1),receipt:null};e.data(envelope);
 const recovered=await nativeTripLifecycleHTTP(e.request(),'recover',id(1),e.fixture.config);assert.equal(recovered.status,200);assert.deepEqual(await recovered.json(),envelope);
 e.data({...envelope,ownerId:id(11)});assert.equal((await nativeTripLifecycleHTTP(e.request(),'recover',id(1),e.fixture.config)).status,503);
 e.data({...envelope,receipt:receipt(raw)});assert.equal((await nativeTripLifecycleHTTP(e.request(),'recover',id(1),e.fixture.config)).status,200);
 e.data(receipt(raw));assert.equal((await nativeTripLifecycleHTTP(e.request(raw),'abandon',id(1),e.fixture.config)).status,200);assert.equal(e.calls.at(-1).p_action,'abandon');
 e.error('LIFECYCLE_OPERATION_REUSE');const conflict=await nativeTripLifecycleHTTP(e.request(raw),'execute',undefined,e.fixture.config);assert.equal(conflict.status,409);assert.deepEqual(await conflict.json(),{error:{code:'LIFECYCLE_OPERATION_REUSE'}});
});
test('replaced sessions and malformed upstream are distinct from transport failure',async t=>{
 const e=await setup(t);e.session({});const malformed=await nativeTripLifecycleHTTP(e.request(),'read',undefined,e.fixture.config);assert.equal(malformed.status,503);assert.deepEqual(await malformed.json(),{error:{code:'UNAVAILABLE'}});
 e.session({subject,sessionId});e.error('Secret provider error');assert.equal((await nativeTripLifecycleHTTP(e.request(),'read',undefined,e.fixture.config)).status,503);
 e.error('SESSION_REPLACED');assert.equal((await nativeTripLifecycleHTTP(e.request(),'read',undefined,e.fixture.config)).status,401);
});
test('a valid result arriving after phone replacement is discarded',async t=>{
 const e=await setup(t);e.replace();e.data(receipt(JSON.stringify(command)));
 const r=await nativeTripLifecycleHTTP(e.request(JSON.stringify(command)),'execute',undefined,e.fixture.config);assert.equal(r.status,401);assert.deepEqual(await r.json(),{error:{code:'SESSION_REPLACED'}});
});
