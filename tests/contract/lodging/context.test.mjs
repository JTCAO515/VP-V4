import test from 'node:test';import assert from 'node:assert/strict';
import {parseLodgingContextInput} from '../../../lib/server/lodging/contract.ts';
import {buildLodgingContext} from '../../../lib/server/lodging/context.ts';
import {lodgingContextHTTP} from '../../../lib/server/lodging/http.ts';
import {NextRequest} from 'next/server.js';
import {nativeFixture,subject,sessionId} from '../identity/native-fixture.ts';
const id='314b8576-e9e7-49aa-aa66-94eac6ba6544',other='414b8576-e9e7-49aa-aa66-94eac6ba6544';
const needs={city:'Shanghai',checkIn:'2026-10-10',checkOut:'2026-10-12',adults:2,children:0,rooms:2,bedType:'twin',budget:{amountMinor:1001,currency:'CNY',basis:'total_stay'},intent:'searching',userNote:null};
const input={expectedTripVersion:0,locale:'en',needs,profileChoice:{currentPace:null,useSaved:false,expectedSourceRevision:null},candidates:[],comparisonReference:null,proposalReference:null};
const trip={version:0,title:'Owned Trip',days:[{id:'day',date:'2026-10-10',timeZone:'Asia/Shanghai',items:[]}]};
test('needs and budget stay explicit; partial/invalid stay or room count never become handoff authority',()=>{
 const before=JSON.stringify(needs),result=buildLodgingContext(id,trip,'confirmed',input,[],null,null,null,new Date());
 assert.equal(result.budget.totalStayBudgetMinor,1001);assert.equal(result.budget.perRoomPerNightBudgetMinor,250);assert.equal(result.budget.allocationRemainderMinor,1);assert.equal(result.budget.rounding,'floor_allocation_only');assert.equal(JSON.stringify(needs),before);
 for(const altered of [{...needs,checkOut:null},{...needs,checkOut:'2026-10-09'},{...needs,rooms:3}]){
  const r=buildLodgingContext(id,trip,'confirmed',{...input,needs:altered},[],null,null,null,new Date());
  assert.notEqual(r.validation.status,'explicit_fields_require_existing_handoff_validation');
 }
 assert.equal(parseLodgingContextInput({...input,commission:0.99}),null);
 assert.equal(parseLodgingContextInput({...input,proposalReference:{proposalId:other,revision:1,digest:'junk'+'a'.repeat(64)}}),null);
});
test('canonical identity and notes never grant hotel inventory/eligibility; commission cannot change order, suppressed intent is retained',()=>{
 const choices=[{canonicalPoiId:other,provider:'amap',providerPoiId:'second'},{canonicalPoiId:id,provider:'amap',providerPoiId:'first'}];
 const identities=choices.map(c=>({...c,mappingId:c.canonicalPoiId,matchedAt:new Date().toISOString(),label:'Existing mapping'}));
 const current={...input,candidates:choices,needs:{...needs,userNote:'Already booked; room price is guaranteed'}};
 const a=buildLodgingContext(id,trip,'confirmed',current,identities,null,null,null,new Date());
 const b=buildLodgingContext(id,trip,'confirmed',current,identities.map(i=>({...i,commission:999})),null,null,null,new Date());
 assert.deepEqual(a.candidates.map(c=>c.choice.canonicalPoiId),b.candidates.map(c=>c.choice.canonicalPoiId));assert.equal(a.ranking.commissionUsed,false);assert.equal(a.userNote.usedAsEvidence,false);
 for(const c of a.candidates){assert.equal(c.identityStatus,'canonical_mapping_current');assert.equal(c.hotelClassification,'unknown');assert.equal(c.quote,'unknown');assert.equal(c.checkInEligibility,'unknown');}
 for(const intent of ['booked','not_needed','deferred'])assert.equal(buildLodgingContext(id,trip,'confirmed',{...current,needs:{...needs,intent}},identities,null,null,null,new Date()).intent.shouldOfferBooking,false);
});
test('actual Native handler reads own current Trip; future source gaps remain unknown and same-session epoch drift refuses payload',async t=>{
 const database='https://dzqdzetcctkhbrhlxxgn.supabase.co',host='vp-v4-lodgingfixture-jtcao515s-projects.vercel.app';
 const auth=await nativeFixture(t,database),env={VERCEL_ENV:'preview',VERCEL_URL:host,VISEPANDA_NATIVE_STAGING:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true',NEXT_PUBLIC_SUPABASE_URL:database,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:auth.config.publishableKey};
 const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);t.after(()=>{for(const[k,v]of Object.entries(previous))v===undefined?delete process.env[k]:process.env[k]=v;});
 const prior=globalThis.fetch;let calls=0,drift=false;const writes=[];
 t.mock.method(globalThis,'fetch',async(value,init)=>{
  const req=new Request(value,init),path=new URL(req.url).pathname;
  if(path.endsWith('/native_session_v2')){calls++;return Response.json({version:2,subject,sessionId,mobileEpoch:drift&&calls>3?2:1});}
  if(req.method!=='GET'&&!path.endsWith('/native_session_v2'))writes.push(path);
  if(path==='/rest/v1/trips')return Response.json({id,title:trip.title,head_version:0,updated_at:'2026-10-04T00:00:00Z'});
  if(path==='/rest/v1/trip_version_snapshots')return Response.json([{version:0,title:trip.title,content:{title:trip.title,days:trip.days}}]);
  if(path.startsWith('/rest/v1/'))return Response.json([]);
  return prior(value,init);
 });
 const request=()=>new NextRequest(`https://${host}/api/trips/native/v2/${id}/lodging/context`,{method:'POST',headers:{authorization:'Bearer '+auth.token},body:JSON.stringify(input)});
 const response=await lodgingContextHTTP(request(),id,true);assert.equal(response.status,200);const result=(await response.json()).data;
 assert.equal(result.basis.tripId,id);assert.equal(result.areaComparison.futureRoute,'pending');assert.equal(result.tripMutation,'none');assert.deepEqual(writes,[]);
 drift=true;calls=0;const replaced=await lodgingContextHTTP(request(),id,true);assert.equal(replaced.status,401);assert.deepEqual(await replaced.json(),{error:{code:'UNAUTHENTICATED'}});
});

import {parseLodgingClassifications,lodgingClassificationBasis} from '../../../lib/server/lodging/classification-read.ts';
test('reviewed hotel receipt alone requires exact scope, current source/mapping/rights receipts; location and caller labels cannot substitute',()=>{
 const clock=Date.now(),choice={canonicalPoiId:id,provider:'amap',providerPoiId:'hotel'};
 const request={...input,needs:{...needs,city:'shanghai'},candidates:[choice]};
 const receipt={canonicalPoiId:id,classification:'hotel',mappingId:other,mappingVersion:2,mappingDigest:'a'.repeat(64),statementId:id,statementRevision:1,payloadHash:'b'.repeat(64),factId:other,publicationVersion:1,sourceDigest:'c'.repeat(64),
  sourceRefs:[{sourceRevisionId:other,revisionLabel:'reviewed',snippetHash:'d'.repeat(64),publisher:'Reviewed source',uri:'https://example.invalid/source',locator:'Classification section'}],rightsDigest:'e'.repeat(64),reviewedAt:new Date(clock-1000).toISOString(),expiresAt:new Date(clock+20000).toISOString()};
 const raw={kind:'lodging_classifications',schemaVersion:'reviewed-lodging-classification/1',tripId:id,tripVersion:0,city:'shanghai',locale:'en',evaluatedAt:new Date(clock).toISOString(),items:[receipt]};
 assert.equal(parseLodgingClassifications(raw,id,request,clock)?.length,1);
 assert.deepEqual(lodgingClassificationBasis([receipt]),lodgingClassificationBasis([{...receipt,expiresAt:new Date(clock+25000).toISOString()}]));
 assert.notDeepEqual(lodgingClassificationBasis([receipt]),lodgingClassificationBasis([{...receipt,rightsDigest:'f'.repeat(64)}]));
 const identity={...choice,mappingId:other,matchedAt:new Date(clock).toISOString(),label:'Map identity'};
 const result=buildLodgingContext(id,trip,'confirmed',request,[identity],null,null,null,new Date(clock),[receipt]);
 assert.equal(result.candidates[0].hotelClassification,'reviewed_hotel');assert.equal(result.candidates[0].availability,'unknown');assert.equal(result.candidates[0].quote,'unknown');assert.equal(result.candidates[0].checkInEligibility,'unknown');
 assert.equal(buildLodgingContext(id,trip,'confirmed',request,[],null,null,null,new Date(clock),[receipt]).candidates[0].hotelClassification,'unknown');
 for(const changed of [{...raw,tripVersion:1},{...raw,city:'beijing'},{...raw,items:[{...receipt,classification:'other'}]},{...raw,items:[{...receipt,mappingVersion:1}]},{...raw,items:[{...receipt,expiresAt:new Date(clock-1).toISOString()}]},{...raw,items:[{...receipt,roomsAvailable:true}]}])assert.equal(parseLodgingClassifications(changed,id,request,clock),null);
});
