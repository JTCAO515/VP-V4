import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readWebDirectionsForTrip, mutateWebDirectionsForTrip } from '../../../../lib/server/planning/directions/web-http.ts';
import { directions } from '../../../../lib/server/planning/directions/domain.ts';
const trip=randomUUID(),artifact=randomUUID(),actor=randomUUID();
const intake={schemaVersion:'travel-directions-intake/1',destinations:['Shanghai'],durationDays:null,interests:[],currentPace:null,budget:null,dates:null,intent:'explore'};
const content={schemaVersion:'travel-directions/1',title:'Ideas',summary:'Dates unknown',intake,directions:directions({destinations:['Shanghai'],durationDays:null,interests:[],currentPace:null,budgetMinorUnits:null,intent:'explore',locale:'en'}),selectedDirectionId:null,draft:null,actions:[]};
const result=(fields={})=>({kind:'result_artifact',artifactId:artifact,revision:1,currentRevision:1,current:true,historicalReadable:true,lifecycle:'active',source:{taskId:randomUUID(),taskTurnId:randomUUID(),goalId:randomUUID(),goalVersion:1,inputMessageId:randomUUID(),inputSequence:3,tripId:trip,tripVersion:0},basis:{memories:[],evidence:[]},content,createdAt:'2026-10-10T08:00:00Z',...fields});
test('Web sameTrip original reader accepts qualified ref only and denies replaced actor/crossTrip',async()=>{
 const run=async(exact,auth)=>readWebDirectionsForTrip(trip,{authenticate:auth??(async()=>actor),call:async name=>({error:null,data:name==='read_trip_directions_reference_v1'?{kind:'result_reference',artifactId:artifact,revision:1,tripId:trip}:exact})});
 assert.equal((await run(result())).status,200);assert.equal((await run(result({source:{...result().source,tripId:randomUUID()}}))).status,503);
 let n=0;assert.equal((await run(result(),async()=>n++?randomUUID():actor)).status,401);
});
test('Web mutation retains exact bytes and can replay old revision only through canonical gateway and fresh original read',async()=>{
 const raw=` { "operationId":"${randomUUID()}", "expectedRevision":1, "artifactId":"${artifact}", "directionId":"depth" } `;let got;let reads=0;
 const rpc={authenticate:async()=>actor,call:async(name,p)=>{
  if(name==='native_travel_directions_v1'){got=p.p_input_bytes;return {error:null,data:{kind:'selected',artifactId:artifact,revision:2,reused:true}};}
  reads++;return {error:null,data:reads===1?result({current:false,currentRevision:2}):result({revision:2,currentRevision:2,content:{...content,selectedDirectionId:'depth'}})};
 }};
 assert.equal((await mutateWebDirectionsForTrip(trip,'choose',raw,randomUUID(),rpc)).status,200);assert.equal(got,raw);assert.equal(reads,2);
});
test('Web mutated receipt cannot expose wrong actor source and foreign Trip never reaches gateway',async()=>{
 let effects=0;const rpc={authenticate:async()=>actor,call:async(name)=>{if(name==='native_travel_directions_v1')effects++;return {error:null,data:result({source:{...result().source,tripId:randomUUID()}})};}};
 const raw=JSON.stringify({artifactId:artifact,expectedRevision:1,operationId:randomUUID()});assert.equal((await mutateWebDirectionsForTrip(trip,'save',raw,randomUUID(),rpc)).status,409);assert.equal(effects,0);
});
