import test from 'node:test';import assert from 'node:assert/strict';
import {assemblePlanFeasibility} from '../../../lib/server/trip/feasibility/assembly.ts';
import {feasibilityRequest} from '../../../lib/server/trip/feasibility/native-http.ts';
const basis={tripId:'314b8576-e9e7-49aa-aa66-94eac6ba6544',proposalId:'414b8576-e9e7-49aa-aa66-94eac6ba6544',proposalRevision:1,baseVersion:0,proposalDigest:'a'.repeat(64),after:{title:'Current proposal',version:1,days:[{id:'day',date:'2026-10-03',timeZone:'Asia/Shanghai',items:[{id:'first',dayId:'day',title:'Explicit item',startsAt:'2026-10-03T01:00:00Z',endsAt:'2026-10-03T02:00:00Z'}]}]}};
const needs={partySize:2,currency:'CNY',maxBudgetMinor:null,minTransferMinutes:15,baggageBufferMinutes:30,appointmentBufferMinutes:20,maxWalkingMinutes:null};
test('production engine call preserves proposal reference and absent place/reservation evidence stays pending',()=>{
 const result=assemblePlanFeasibility(basis,needs,[],[]);assert.equal(result.status,'pending');assert.equal(result.basis.proposalDigest,basis.proposalDigest);assert.equal(result.proposalMutation,'none');assert.ok(result.lines.some(l=>l.reason==='RESERVATION_EVIDENCE_REQUIRED'));assert.ok(result.lines.some(l=>l.reason==='EXACT_PLACE_EVIDENCE_MISSING'));
});
test('qualified opening violation is explicit without shifting appointments or discarding user choice',()=>{
 const before=JSON.stringify(basis);const r=assemblePlanFeasibility(basis,needs,[{itemId:'first',current:true,entityBound:true,opening:'closed',reservation:'unknown',reservationCurrent:false}],[]);assert.equal(r.status,'infeasible');assert.ok(r.lines.some(l=>l.reason==='STOP_CLOSED'));assert.equal(JSON.stringify(basis),before);
});
test('local calendar mismatch and caller evidence/owner assertions cannot grant feasibility',()=>{
 const altered=structuredClone(basis);altered.after.days[0].date='2026-10-04';assert.equal(assemblePlanFeasibility(altered,needs,[],[]).lines[0].status,'pending');
 const request={proposalId:basis.proposalId,expectedProposalRevision:1,expectedBaseVersion:0,needs,placeChoices:[]};assert.ok(feasibilityRequest(request));assert.equal(feasibilityRequest({...request,evidenceCurrent:true}),null);assert.equal(feasibilityRequest({...request,ownerId:basis.tripId}),null);
});

test('opaque Trip IDs and overlapping fixed appointments produce a result without moving either item',()=>{
 const b=structuredClone(basis);b.after.days[0].items[0].id='Item_UPPER-1';
 b.after.days[0].items.push({...b.after.days[0].items[0],id:'2nd_Item',startsAt:'2026-10-03T01:30:00Z'});
 const r=assemblePlanFeasibility(b,needs,[],[]);
 assert.equal(r.status,'infeasible');assert.ok(r.lines.some(l=>l.reason==='FIXED_WINDOWS_OVERLAP'));
 assert.equal(r.userDecisions[0].itemId,'Item_UPPER-1');assert.equal(r.userDecisions[1].startsAt,'2026-10-03T01:30:00Z');
});

import {readPlanPlaceEvidence} from '../../../lib/server/trip/feasibility/evidence.ts';
const reference='514b8576-e9e7-49aa-aa66-94eac6ba6544',mapping='614b8576-e9e7-49aa-aa66-94eac6ba6544',hash='a'.repeat(64);
const choice={dayId:'day',itemId:'first',placeReferenceId:reference,mappingId:mapping,expectedMappingVersion:1,city:'shanghai',scene:'attraction',locale:'en'};
test('current opening receipt supports only its positive window; outside, expired and wrong exact context stay pending',async()=>{
 const claim={subjectId:'poi',asOf:'2026-10-03T00:00:00Z',claimType:'time_window',value:{startsAt:'2026-10-03T01:00:00Z',endsAt:'2026-10-03T03:00:00Z',timeZone:'Asia/Shanghai'},evidence:[{kind:'fact',factId:reference,version:1,reviewedAt:'2026-10-03T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'}]};
 const entry={mappingId:mapping,mappingVersion:1,mappingDigest:hash,statementId:reference,claimRevision:1,payloadHash:hash,sourceDigest:hash,scope:'opening_window_reference',claim};
 const ctx={kind:'support_context',tripId:basis.tripId,tripVersion:0,proposalId:basis.proposalId,proposalRevision:1,baseVersion:0,proposalDigest:hash,dayId:'day',itemId:'first',canonicalPlaceReferences:[{referenceId:reference,canonicalPoiId:mapping}]};
 const rpc=async name=>({error:null,data:name.includes('context')?ctx:{kind:'candidates',tripId:basis.tripId,tripVersion:0,placeReferenceId:reference,contextDigest:hash,entries:[entry],nextCursor:null}});
 assert.equal((await readPlanPlaceEvidence(basis,[choice],rpc)).items[0].opening,'open');
 claim.value.startsAt='2026-10-03T02:30:00Z';
 const outside=await readPlanPlaceEvidence(basis,[choice],rpc);assert.equal(outside.items[0].opening,'unknown');assert.equal(assemblePlanFeasibility(basis,needs,outside.items,[]).status,'pending');
 claim.evidence[0].expiresAt='2020-01-01T00:00:00Z';assert.deepEqual((await readPlanPlaceEvidence(basis,[choice],rpc)).items,[]);
 ctx.proposalDigest='b'.repeat(64);assert.deepEqual((await readPlanPlaceEvidence(basis,[choice],rpc)).items,[]);
});

import {NextRequest} from 'next/server.js';
import {nativeFixture,subject,sessionId} from '../identity/native-fixture.ts';
import {nativePlanFeasibilityHTTP} from '../../../lib/server/trip/feasibility/native-http.ts';
test('production HTTP uses owned exact proposal and JWT reads; changed same-session epoch returns no result',async t=>{
 const database='https://dzqdzetcctkhbrhlxxgn.supabase.co',host='vp-v4-feasibilityfixture-jtcao515s-projects.vercel.app';
 const f=await nativeFixture(t,database);
 const env={VERCEL_ENV:'preview',VERCEL_URL:host,VISEPANDA_NATIVE_STAGING:'true',VISEPANDA_TRIP_PROTOCOL_V2:'true',NEXT_PUBLIC_SUPABASE_URL:database,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey};
 const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 t.after(()=>{for(const[k,v]of Object.entries(old))v===undefined?delete process.env[k]:process.env[k]=v;});
 const prior=globalThis.fetch;let epochCalls=0,replace=false;const seen=[];
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const req=new Request(input,init),path=new URL(req.url).pathname;
  if(path.endsWith('/native_session_v2')){epochCalls++;return Response.json({version:2,subject,sessionId,mobileEpoch:replace&&epochCalls>1?2:1});}
  if(path==='/rest/v1/trips')return Response.json({id:basis.tripId,title:'Current proposal',head_version:0,updated_at:'2026-10-03T00:00:00Z'});
  if(path.endsWith('/read_trip_proposal_v2')){seen.push({params:await req.json(),authorization:req.headers.get('authorization')});return Response.json([{digest:hash,proposal:{id:basis.proposalId,trip_id:basis.tripId,revision:1,base_trip_version:0,status:'pending',patch:{expectedVersion:0,operations:[{kind:'set_title',title:'Proposed'}]},created_at:'2026-10-03T00:00:00Z',expires_at:'2099-01-01T00:00:00Z',rollback_snapshot_version:null}}]);}
  if(path==='/rest/v1/trip_version_snapshots')return Response.json({version:0,title:basis.after.title,content:{title:basis.after.title,days:basis.after.days}});
  return prior(input,init);
 });
 const request=()=>new NextRequest(`https://${host}/api/trips/native/v2/${basis.tripId}/feasibility`,{method:'POST',headers:{authorization:'Bearer '+f.token},body:JSON.stringify({proposalId:basis.proposalId,expectedProposalRevision:1,expectedBaseVersion:0,needs,placeChoices:[]})});
 const response=await nativePlanFeasibilityHTTP(request(),basis.tripId);const result=await response.json();
 assert.equal(response.status,200);assert.equal(result.kind,'plan_feasibility/1');assert.equal(result.status,'pending');assert.equal(result.basis.proposalDigest,hash);
 assert.deepEqual(seen[0].params,{p_proposal_id:basis.proposalId});assert.equal(seen[0].authorization,'Bearer '+f.token);
 replace=true;epochCalls=0;const revoked=await nativePlanFeasibilityHTTP(request(),basis.tripId);
 assert.equal(revoked.status,401);assert.deepEqual(await revoked.json(),{error:{code:'UNAUTHENTICATED'}});
});
