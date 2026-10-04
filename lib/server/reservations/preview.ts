import type {ReservationCommand,ReservationCurrent,ReservationFields} from "./contract.ts";
import {reservationFieldDigest} from "./evidence.ts";
const keys:readonly (keyof ReservationFields)[]=["kind","supplier","externalReference","title","startsAt","endsAt","timeZone","address","terms","status"];
/** Caller material metadata provides original-text locators only. Current owner
 * records and corrected field comparisons decide new/duplicate/conflict display. */
export function previewReservationReference(tripId:string,tripVersion:number,input:ReservationCommand,current:readonly ReservationCurrent[]){
 if(input.expectedTripVersion!==tripVersion)throw Error("STALE_TRIP_VERSION");
 const scoped=current.filter(row=>row.tripId===tripId);
 const target=scoped.find(row=>row.referenceId===input.referenceId);
 const sameFields=scoped.filter(row=>reservationFieldDigest(row.fields)===reservationFieldDigest(input.fields));
 const namedSupplier=["booking","trip"].includes(input.fields.supplier);
 const sameIdentity=namedSupplier&&input.fields.externalReference!==null?scoped.filter(row=>row.fields.supplier===input.fields.supplier
  &&row.fields.externalReference?.trim()===input.fields.externalReference!.trim()):[];
 const stale=input.expectedRevision>0?target?.revision!==input.expectedRevision:target!==undefined;
 const matches=target?[target]:sameIdentity.length?sameIdentity:sameFields;
 const relation=stale||matches.length>1?"conflict":matches.length===0?"new":sameFields.some(row=>row.referenceId===matches[0].referenceId)?"duplicate":"change";
 const before=matches.length===1?matches[0]:null;
 return {kind:"reservation_preview/1",tripId,tripVersion,referenceId:input.referenceId,relation,
  matches:matches.map(row=>({referenceId:row.referenceId,revision:row.revision})),fields:keys.map(field=>({field,before:before?.fields[field]??null,
   after:input.fields[field],state:before===null?"added":before.fields[field]===input.fields[field]?"duplicate":"conflict"})),
  originalLocator:input.source.locator,sourceClaim:input.source.kind,evidenceTier:"user_reported",
  sourceAvailability:input.source.kind==="artifact_reference"?"unavailable":"user_reported_only",requiresExplicitConfirmation:true,tripMutation:"none"};
}
