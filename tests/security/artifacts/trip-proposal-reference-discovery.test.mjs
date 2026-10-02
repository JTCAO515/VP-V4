import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeTripChangeProposalReferenceHTTP} from '../../../lib/server/artifacts/native-proposal-reference-discovery-http.ts';
import {nativeFixture,subject,sessionId} from '../../contract/identity/native-fixture.ts';
const trip='11111111-1111-4111-8111-111111111111',artifact='22222222-2222-4222-8222-222222222222';
let port=63480;
async function setup(t){
 const fixture=await nativeFixture(t,'http://127.0.0.1:'+port++),env={NEXT_PUBLIC_SUPABASE_URL:fixture.config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:fixture.config.publishableKey,VISEPANDA_NATIVE_LOCAL_SESSION:'true'};
 const prior=new Map(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 t.after(()=>{for(const[key,value]of prior)value===undefined?delete process.env[key]:process.env[key]=value;});
 const transport=globalThis.fetch,seen=[];let session={version:2,subject,sessionId,mobileEpoch:1},error=null;
 let data={kind:'result_reference',tripId:trip,artifactId:artifact,revision:1};
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const req=new Request(input,init),path=new URL(req.url).pathname;
  if(path.endsWith('/native_session_v2'))return error?Response.json({message:error},{status:400}):Response.json(session);
  if(path.endsWith('/read_trip_change_proposal_reference_v1')){seen.push(await req.json());return Response.json(data);}
  return transport(input,init);
 });
 return {seen,setData:value=>data=value,setSession:value=>session=value,setError:value=>error=value,
  request:(query='?tripId='+trip,headers={},method='GET')=>new Request('http://127.0.0.1/api/results/native/v1/change-proposal-reference/trip'+query,{method,headers:{Authorization:'Bearer '+fixture.token,...headers}})};
}
test('Trip discovery returns only closed inert pointer/empty/unavailable, never action or comparison fallback',async t=>{
 const e=await setup(t),r=await nativeTripChangeProposalReferenceHTTP(e.request());
 assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.deepEqual(await r.json(),{version:1,data:{kind:'result_reference',tripId:trip,artifactId:artifact,revision:1}});
 assert.deepEqual(e.seen,[{p_trip_id:trip}]);
 for(const kind of ['empty','unavailable']){e.setData({kind});const value=await nativeTripChangeProposalReferenceHTTP(e.request());assert.equal(value.status,200);assert.deepEqual(await value.json(),{version:1,data:{kind}});}
 for(const bad of [null,[],{kind:'comparison'}, {kind:'empty',artifactId:artifact},
  {kind:'result_reference',tripId:artifact,artifactId:artifact,revision:1},
  {kind:'result_reference',tripId:trip,artifactId:'invalid',revision:1},
  {kind:'result_reference',tripId:trip,artifactId:artifact,revision:'1'},
  {kind:'result_reference',tripId:trip,artifactId:artifact,revision:1001},
  {kind:'result_reference',tripId:trip,artifactId:artifact,revision:1,patch:{}},
  {kind:'result_reference',tripId:trip,artifactId:artifact,revision:1,confirm:{}}]){
  e.setData(bad);const response=await nativeTripChangeProposalReferenceHTTP(e.request());assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'private, no-store');
 }
});
test('discovery input and malformed session fail before any private discovery RPC; valid authority loss is401',async t=>{
 const e=await setup(t);
 for(const query of ['', '?tripId=invalid','?tripId='+trip+'&tripId='+trip,'?tripId='+trip+'&revision=1'])assert.equal((await nativeTripChangeProposalReferenceHTTP(e.request(query))).status,400);
 for(const headers of [{Cookie:'synthetic=only'},{Origin:'http://127.0.0.1'}])assert.equal((await nativeTripChangeProposalReferenceHTTP(e.request(undefined,headers))).status,400);
 assert.equal((await nativeTripChangeProposalReferenceHTTP(e.request(undefined,{},'POST'))).status,400);
 for(const bad of [null,{},[],{subject},{sessionId},{subject:'invalid',sessionId},{subject,sessionId:[]}] ){
  e.setSession(bad);const r=await nativeTripChangeProposalReferenceHTTP(e.request());assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:{code:'RESULT_UNAVAILABLE'}});
 }
 for(const mismatch of [{subject:trip,sessionId},{subject,sessionId:trip}]){e.setSession(mismatch);assert.equal((await nativeTripChangeProposalReferenceHTTP(e.request())).status,401);}
 for(const [message,status]of [['Transient failure',503],['UNAUTHENTICATED',401],['SESSION_REPLACED',401]]){e.setError(message);assert.equal((await nativeTripChangeProposalReferenceHTTP(e.request())).status,status);}
 assert.deepEqual(e.seen,[]);
});
