import test from 'node:test';
import assert from 'node:assert/strict';
import { tripDeletionHTTP } from '../../../lib/server/privacy/trip-deletion-http.ts';
import { nativeFixture } from '../identity/native-fixture.ts';
const tripId='314b8576-e9e7-49aa-aa66-94eac6ba6544', requestId='fb2c981e-7e5f-4b07-9f79-af7b907e4f4a';
const input={tripId,requestId,expectedVersion:0,confirmed:true};
test('Trip deletion HTTP preserves queued vs complete, owner bearer, closed input and safe errors (fixture)',async t=>{
 const database='https://dzqdzetcctkhbrhlxxgn.supabase.co',host='vp-v4-privacy-jtcao515s-projects.vercel.app';
 const f=await nativeFixture(t,database);
 const env={VERCEL_ENV:'preview',VERCEL_URL:host,VISEPANDA_NATIVE_STAGING:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true',NEXT_PUBLIC_SUPABASE_URL:database,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey};
 const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));
 t.after(()=>{for(const[k,v]of Object.entries(old))v===undefined?delete process.env[k]:process.env[k]=v;});Object.assign(process.env,env);
 const previous=globalThis.fetch;let code=null,state='queued',calls=0;
 t.mock.method(globalThis,'fetch',async(i,init)=>{
  const r=new Request(i,init),path=new URL(r.url).pathname;
  if(path.endsWith('/request_trip_deletion_v1')||path.endsWith('/read_trip_deletion_v1')){
   calls++;assert.equal(r.headers.get('authorization'),'Bearer '+f.token);
   assert.deepEqual(await r.json(),path.endsWith('/read_trip_deletion_v1')?{p_request_id:requestId}:{p_request_id:requestId,p_trip_id:tripId,p_expected_version:0,p_confirmed:true});
   if(code)return Response.json({message:code},{status:400});
   return Response.json({requestId,tripId,state,scope:'trip-core-v1',allUserDataCompleted:false});
  }return previous(i,init);
 });
 const req=(body=input,headers={})=>new Request(`https://${host}/api/privacy/native/v1/trips`,{method:'POST',headers:{Authorization:'Bearer '+f.token,...headers},body:typeof body==='string'?body:JSON.stringify(body)});
 let r=await tripDeletionHTTP(req());assert.equal(r.status,202);assert.equal((await r.json()).state,'queued');assert.match(r.headers.get('cache-control'),/no-store/);
 for(const body of [null,{},[],{...input,confirmed:false},{...input,expectedVersion:-1},{...input,expectedVersion:1.5},{...input,ownerId:tripId},'{bad'])assert.equal((await tripDeletionHTTP(req(body))).status,400);
 for(const headers of [{cookie:''},{origin:'https://evil.invalid'}])assert.equal((await tripDeletionHTTP(req(input,headers))).status,400);
 assert.equal(calls,1);
 for(const [failure,status]of [['REAUTHENTICATION_REQUIRED',401],['FORBIDDEN',403],['TRIP_HAS_CHAT_REFERENCES',409],['IDEMPOTENCY_KEY_REUSE',409],['unknown internal payload',503]]){
  code=failure;r=await tripDeletionHTTP(req());assert.equal(r.status,status);assert.equal((await r.json()).error.code,status===503?'UNAVAILABLE':failure);
 }
 code=null;state='completed';assert.equal((await tripDeletionHTTP(req())).status,200);
 r=await tripDeletionHTTP(new Request(`https://${host}/api/privacy/native/v1/trips?requestId=${requestId}`,{headers:{Authorization:'Bearer '+f.token}}));
 assert.equal(r.status,200);assert.equal((await r.json()).allUserDataCompleted,false);
});
