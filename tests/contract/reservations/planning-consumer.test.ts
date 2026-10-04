import test from "node:test";import assert from "node:assert/strict";
import {NextRequest} from "next/server.js";
import {nativeFixture,subject,sessionId} from "../identity/native-fixture.ts";
import {nativePlanFeasibilityHTTP} from "../../../lib/server/trip/feasibility/native-http.ts";
import {readConfirmedReservationConstraints,reservationConstraintLines} from "../../../lib/server/reservations/planning.ts";
const trip="314b8576-e9e7-49aa-aa66-94eac6ba6544",proposal="414b8576-e9e7-49aa-aa66-94eac6ba6544",ref="514b8576-e9e7-49aa-aa66-94eac6ba6544",hash="a".repeat(64);
test("actual proposal feasibility caller reads current reported constraint; cancel/unknown inactive and changed current revision refuses result",async t=>{
 const database="https://dzqdzetcctkhbrhlxxgn.supabase.co",host="vp-v4-reservationplanfixture-jtcao515s-projects.vercel.app";
 const f=await nativeFixture(t,database),env={VERCEL_ENV:"preview",VERCEL_URL:host,VISEPANDA_NATIVE_STAGING:"true",VISEPANDA_TRIP_PROTOCOL_V2:"true",NEXT_PUBLIC_SUPABASE_URL:database,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey};
 const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);t.after(()=>{for(const[k,v]of Object.entries(old))v===undefined?delete process.env[k]:process.env[k]=v;});
 const before=globalThis.fetch;let reservationReads=0,status="reserved",change=false;const seen:unknown[]=[];
 t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{
  const request=new Request(input,init),path=new URL(request.url).pathname;
  if(path.endsWith("/native_session_v2"))return Response.json({version:2,subject,sessionId,mobileEpoch:1});
  if(path==="/rest/v1/trips")return Response.json({id:trip,title:"Current Trip",head_version:0,updated_at:"2026-10-04T00:00:00Z"});
  if(path.endsWith("/read_trip_proposal_v2"))return Response.json([{digest:hash,proposal:{id:proposal,trip_id:trip,revision:1,base_trip_version:0,status:"pending",patch:{expectedVersion:0,operations:[{kind:"set_title",title:"Proposed"}]},created_at:"2026-10-04T00:00:00Z",expires_at:"2099-01-01T00:00:00Z",rollback_snapshot_version:null}}]);
  if(path==="/rest/v1/trip_version_snapshots")return Response.json({version:0,title:"Current Trip",content:{title:"Current Trip",days:[{id:"day",date:"2026-10-10",timeZone:"Asia/Shanghai",items:[{id:"item",dayId:"day",title:"User plan",startsAt:"2026-10-10T01:00:00Z",endsAt:"2026-10-10T02:00:00Z"}]}]}});
  if(path.endsWith("/read_reservation_references_v1")){
   seen.push(await request.json());reservationReads++;
   const row={kind:"reservation_reference/1",referenceId:ref,tripId:trip,tripVersion:0,revision:change&&reservationReads>1?2:1,
    fields:{kind:"activity",supplier:"official",externalReference:null,title:"User-confirmed appointment",startsAt:"2026-10-10T03:00:00Z",endsAt:"2026-10-10T04:00:00Z",timeZone:"Asia/Shanghai",address:"User-confirmed address",terms:null,status},
    evidenceTier:"user_reported",source:{kind:"user_reported",localMaterialId:null,localContentHash:null,locator:null},sourceQualification:"untrusted",confirmedBy:"explicit_user",confirmedAt:"2026-10-04T00:00:00Z",contentDigest:hash,sourceVersion:null,planningUse:"confirmed_reference_only",tripMutation:"none"};
   return Response.json({kind:"reservation_references/1",tripId:trip,tripVersion:0,items:[row],hasMore:false,nextCursor:null});
  }
  return before(input,init);
 });
 const request=()=>new NextRequest(`https://${host}/api/trips/native/v2/${trip}/feasibility`,{method:"POST",headers:{authorization:"Bearer "+f.token},body:JSON.stringify({proposalId:proposal,expectedProposalRevision:1,expectedBaseVersion:0,needs:{partySize:1,currency:"CNY",maxBudgetMinor:null,minTransferMinutes:0,baggageBufferMinutes:0,appointmentBufferMinutes:0,maxWalkingMinutes:null},placeChoices:[]})});
 const first=await nativePlanFeasibilityHTTP(request(),trip);assert.equal(first.status,200);const active=await first.json();
 assert.ok(active.lines.some((line:{constraint:string;reason:string;status:string})=>line.constraint==="user_reported_reservation"&&line.reason.includes(ref)&&line.reason.includes(":r1:")&&line.status==="pending"));
 assert.equal(active.status,"pending");assert.equal(reservationReads,2);assert.deepEqual(seen[0],{p_trip_id:trip,p_expected_trip_version:0,p_reference_id:null,p_after_reference_id:null,p_limit:20});
 for(const inactive of ["cancelled","unknown"]){status=inactive;reservationReads=0;const current=await (await nativePlanFeasibilityHTTP(request(),trip)).json();assert.ok(!current.lines.some((line:{constraint:string})=>line.constraint==="user_reported_reservation"));}
 status="reserved";change=true;reservationReads=0;
 assert.deepEqual(await (await nativePlanFeasibilityHTTP(request(),trip)).json(),{kind:"unavailable",reason:"STALE_EVIDENCE"});
});
test("unavailable or incomplete reservation page never asserts a complete conflict-free scope",async()=>{
 const unavailable=await readConfirmedReservationConstraints(trip,0,async()=>({data:null,error:{message:"denied"}}));
 assert.equal(unavailable.complete,false);assert.equal(reservationConstraintLines(unavailable)[0].status,"pending");
});
