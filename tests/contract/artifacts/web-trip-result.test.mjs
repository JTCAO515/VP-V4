import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server.js';
import {readWebTripComparison,webTripResultHTTP} from '../../../lib/server/artifacts/web-trip-result-http.ts';
const trip='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
function result(){return {kind:'result_artifact',artifactId:id,revision:2,currentRevision:2,current:true,historicalReadable:true,lifecycle:'active',
 source:{taskId:id,taskTurnId:id,goalId:id,goalVersion:2,inputMessageId:id,inputSequence:2,tripId:trip,tripVersion:1},
 basis:{memories:[],evidence:[]},content:{schemaVersion:'comparison/1',title:'Saved comparison',summary:'Literal <script> text',
 options:[{id:'a',title:'A',tradeoff:'Unknown'},{id:'b',title:'B',tradeoff:'Unknown'}],actions:[]},createdAt:'2026-10-02T00:00:00Z'};}
const reference={kind:'result_reference',tripId:trip,artifactId:id,revision:2};
test('Web resolves exact Trip reference and rejects changed/malformed/unknown content or actor',async()=>{
 const calls=[];let current=result(),actor='owner';
 const rpc={authenticate:async()=>actor,call:async(name,input)=>{calls.push([name,input]);return {data:name==='read_trip_result_reference_v1'?reference:current,error:null};}};
 const read=await readWebTripComparison(trip,rpc);assert.equal(read.status,200);assert.deepEqual(read.body.data,current);
 assert.deepEqual(calls,[['read_trip_result_reference_v1',{p_trip_id:trip}],['read_result_artifacts_v1',{p_artifact_id:id,p_revision:2}]]);
 for(const bad of [{...result(),revision:1},{...result(),current:false},{...result(),source:{...result().source,tripId:id}},
  {...result(),content:{...result().content,schemaVersion:'comparison/9'}},{...result(),content:{...result().content,actions:[{url:'https://example.test'}]}}]){
  current=bad;assert.equal((await readWebTripComparison(trip,rpc)).status,503);
 }
 current=result();let authCalls=0;rpc.authenticate=async()=>++authCalls===1?'owner':'another';
 assert.equal((await readWebTripComparison(trip,rpc)).status,401);
 rpc.authenticate=async()=>false;calls.length=0;assert.equal((await readWebTripComparison(trip,rpc)).status,401);assert.equal(calls.length,0);
});
test('Web HTTP keeps cookie/bearer separation and same-origin closed read input',async()=>{
 const url='http://127.0.0.1:3013/api/trips/'+trip+'/comparison-result';
 for(const [req,status]of [[new NextRequest(url,{headers:{Authorization:'Bearer denied'}}),401],
  [new NextRequest(url,{headers:{Origin:'https://foreign.invalid'}}),400],
  [new NextRequest(url,{headers:{'Sec-Fetch-Site':'cross-site'}}),400],
  [new NextRequest(url+'?artifactId='+id),400],[new NextRequest(url,{method:'POST'}),400]]){
  const response=await webTripResultHTTP(req,trip);assert.equal(response.status,status);assert.match(response.headers.get('cache-control'),/no-store/);
  assert.equal(response.headers.get('access-control-allow-origin'),null);
 }
});
