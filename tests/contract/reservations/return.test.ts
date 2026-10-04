import test from "node:test";import assert from "node:assert/strict";
import {parseReservationCommand,type ReservationCommand,type ReservationCurrent} from "../../../lib/server/reservations/contract.ts";
import {qualifyReservationEvidence,reservationFieldDigest} from "../../../lib/server/reservations/evidence.ts";
import {previewReservationReference} from "../../../lib/server/reservations/preview.ts";
import {confirmReservationReference,reservationPlanningConstraint} from "../../../lib/server/reservations/service.ts";
const trip="314b8576-e9e7-49aa-aa66-94eac6ba6544",reference="414b8576-e9e7-49aa-aa66-94eac6ba6544";
const input:ReservationCommand={operationId:trip,referenceId:reference,expectedTripVersion:1,expectedRevision:0,explicitlyConfirmed:true,
 fields:{kind:"lodging",supplier:"booking",externalReference:"user-ref",title:"User-checked stay",startsAt:"2026-10-10T07:00:00Z",endsAt:"2026-10-12T03:00:00Z",timeZone:"Asia/Shanghai",address:"User-checked address",terms:null,status:"reserved"},
 source:{kind:"user_reported",localMaterialId:trip,localContentHash:"a".repeat(64),locator:"Local image line3"}};
const row:ReservationCurrent={kind:"reservation_reference/1",referenceId:reference,tripId:trip,tripVersion:1,revision:1,fields:input.fields,
 evidenceTier:"user_reported",source:input.source,sourceQualification:"untrusted",confirmedBy:"explicit_user",confirmedAt:"2026-10-04T00:00:00Z",contentDigest:"b".repeat(64),sourceVersion:null,planningUse:"confirmed_reference_only",tripMutation:"none"};
test("closed corrected fields reject caller evidence upgrade, invalid dates and tier flags",()=>{
 assert.ok(parseReservationCommand(input));assert.equal(parseReservationCommand({...input,evidenceTier:"provider_verified"}),null);
 assert.equal(parseReservationCommand({...input,fields:{...input.fields,startsAt:"2026-02-30T00:00:00Z"}}),null);
 assert.equal(parseReservationCommand({...input,explicitlyConfirmed:false}),null);
 assert.equal(qualifyReservationEvidence(trip,trip,input.fields,input.source,null).tier,"user_reported");
});
test("same material hash never qualifies artifact/provider; unavailable artifact confirmation dispatches no write",async()=>{
 const source={kind:"artifact_reference" as const,artifactId:trip,artifactRevision:1,sourceReceiptId:reference,sourceDigest:"a".repeat(64),locator:"Page1 line3"};
 assert.equal(qualifyReservationEvidence(trip,trip,input.fields,source,null).qualification,"unavailable");
 let writes=0;await assert.rejects(confirmReservationReference(trip,{...input,source},async()=>{writes++;return {data:row,error:null};}),/RESERVATION_SOURCE_UNAVAILABLE/);assert.equal(writes,0);
});
test("new, duplicate, correction and stale reference previews stay scope-bound and preserve locators",()=>{
 assert.equal(previewReservationReference(trip,1,input,[]).relation,"new");
 const duplicate={...input,expectedRevision:1};assert.equal(previewReservationReference(trip,1,duplicate,[row]).relation,"duplicate");
 const corrected={...duplicate,fields:{...input.fields,status:"amended" as const,address:"Corrected address"}};
 const preview=previewReservationReference(trip,1,corrected,[row]);assert.equal(preview.relation,"change");assert.equal(preview.originalLocator,"Local image line3");assert.equal(preview.tripMutation,"none");
 assert.equal(previewReservationReference(trip,1,{...duplicate,expectedRevision:2},[row]).relation,"conflict");
 assert.throws(()=>previewReservationReference(trip,2,input,[row]),/STALE_TRIP_VERSION/);
 const ordered=Object.fromEntries(Object.entries(input.fields).reverse()) as typeof input.fields;assert.equal(reservationFieldDigest(ordered),reservationFieldDigest(input.fields));
});
test("uncertain write never manufactures a receipt; cancelled and unknown reports do not become supplier fulfillment",async()=>{
 await assert.rejects(confirmReservationReference(trip,input,async()=>({data:null,error:{message:"lost ACK"}})),/RESERVATION_RECEIPT_UNKNOWN/);
 await assert.rejects(confirmReservationReference(trip,input,async()=>({data:{...row,referenceId:trip},error:null})),/RESERVATION_RECEIPT_UNKNOWN/);
 for(const status of ["cancelled","unknown"] as const){const constraint=reservationPlanningConstraint({...row,fields:{...row.fields,status}});assert.equal(constraint.applies,false);assert.equal(constraint.supplierVerified,false);assert.equal(constraint.tripMutation,"none");}
});
