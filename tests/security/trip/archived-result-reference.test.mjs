import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeTripResultReferenceHTTP, nativeTaskResultReferenceHTTP } from '../../../lib/server/artifacts/native-result-http.ts';
import { nativeResultReferenceV2HTTP } from '../../../lib/server/artifacts/native-result-v2-http.ts';
import { readWebTripComparison } from '../../../lib/server/artifacts/web-trip-result-http.ts';
import { nativeFixture, subject, sessionId } from '../../contract/identity/native-fixture.ts';
const trip='11111111-1111-4111-8111-111111111111',artifact='22222222-2222-4222-8222-222222222222';
const reference={kind:'result_reference',artifactId:artifact,revision:2,tripId:trip};
const historical={kind:'result_artifact',artifactId:artifact,revision:2,currentRevision:2,current:false,historicalReadable:true,lifecycle:'active',source:{taskId:artifact,taskTurnId:artifact,goalId:artifact,goalVersion:2,inputMessageId:artifact,inputSequence:2,tripId:trip,tripVersion:1},basis:{memories:[],evidence:[]},content:{schemaVersion:'comparison/1',title:'Saved',summary:'Historical result only',options:[{id:'a',title:'A',tradeoff:'Time unknown'},{id:'b',title:'B',tradeoff:'Availability unknown'}],actions:[]},createdAt:'2026-10-05T00:00:00Z'};
test('Native v1/v2 Trip proof is an exact optional true field; Task rejects archive proof',async t=>{
 const f=await nativeFixture(t,'http://127.0.0.1:63880'),patch={NEXT_PUBLIC_SUPABASE_URL:f.config.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey,VISEPANDA_NATIVE_LOCAL_SESSION:'true'},old=Object.fromEntries(Object.keys(patch).map(k=>[k,process.env[k]]));Object.assign(process.env,patch);
 t.after(()=>{for(const[k,v]of Object.entries(old))v===undefined?delete process.env[k]:process.env[k]=v;});
 const transport=globalThis.fetch;let data=reference;
 t.mock.method(globalThis,'fetch',async(input,init)=>{const r=new Request(input,init),path=new URL(r.url).pathname;if(path.endsWith('/native_session_v2'))return Response.json({subject,sessionId});if(/\/read_(trip|task)_result_reference_v[12]$/.test(path))return Response.json(data);return transport(input,init);});
 const request=field=>new Request('http://127.0.0.1/api/results/native/v2/'+field+'?'+field+'Id='+trip,{headers:{Authorization:'Bearer '+f.token}});
 for(const run of [()=>nativeTripResultReferenceHTTP(request('trip')),()=>nativeResultReferenceV2HTTP(request('trip'),'trip')]){
  for(const row of [reference,{...reference,archiveHistorical:true}]){data=row;const r=await run();assert.equal(r.status,200);assert.deepEqual((await r.json()).data,row);}
  for(const patch of [{archiveHistorical:false},{archiveHistorical:null},{archiveHistorical:'true'},{archiveHistorical:1},{archiveHistorical:true,extra:'private'}]){data={...reference,...patch};assert.equal((await run()).status,503);}
 }
 data={kind:'result_reference',artifactId:artifact,revision:2,taskId:trip,archiveHistorical:true};
 assert.equal((await nativeTaskResultReferenceHTTP(request('task'))).status,503);assert.equal((await nativeResultReferenceV2HTTP(request('task'),'task')).status,503);
});
test('Web historical read requires server archive proof and a second exact authorized immutable identity',async()=>{
 let ref=reference,result=historical,error=null,actor='owner';const calls=[];
 const rpc={authenticate:async()=>actor,call:async(name,input)=>{calls.push([name,input]);return {data:name==='read_trip_result_reference_v1'?ref:result,error};}};
 assert.equal((await readWebTripComparison(trip,rpc)).status,503,'ordinary stale result remains rejected');
 ref={...reference,archiveHistorical:true};assert.equal((await readWebTripComparison(trip,rpc)).status,200);
 assert.deepEqual(calls.at(-1),['read_result_artifacts_v1',{p_artifact_id:artifact,p_revision:2}]);
 for(const patch of [{current:true},{revision:1},{artifactId:trip},{historicalReadable:false},{lifecycle:'withdrawn'},{source:{...historical.source,tripId:artifact}}]){result={...historical,...patch};assert.equal((await readWebTripComparison(trip,rpc)).status,503);}
 result=historical;error={message:'FORBIDDEN'};assert.equal((await readWebTripComparison(trip,rpc)).status,503,'revoked second reader never bypassed');error=null;
 for(const bad of [false,null,'true']){ref={...reference,archiveHistorical:bad};assert.equal((await readWebTripComparison(trip,rpc)).status,503);}
 ref={...reference,archiveHistorical:true};let reads=0;rpc.authenticate=async()=>++reads===1?'owner':'another';assert.equal((await readWebTripComparison(trip,rpc)).status,401);
});
