import type {ReservationCurrent} from "./contract.ts";
import {readReservationReferences,type ReservationRPC} from "./service.ts";
import type {FeasibilityLine} from "../trip/feasibility/assembly.ts";
export type ReservationPlanningRead={complete:boolean;references:ReservationCurrent[]};
export async function readConfirmedReservationConstraints(tripId:string,tripVersion:number,rpc:ReservationRPC):Promise<ReservationPlanningRead>{
 const references:ReservationCurrent[]=[];let after:string|null=null;
 try{
  for(let page=0;page<5;page++){
   const read=await readReservationReferences(tripId,tripVersion,after,20,rpc);references.push(...read.items);
   if(!read.hasMore)return {complete:true,references};
   after=read.nextCursor;
  }
 }catch{return {complete:false,references:[]};}
 // A partial scan cannot assert no constraints or a complete feasible plan.
 return {complete:false,references:[]};
}
export function reservationConstraintLines(read:ReservationPlanningRead):FeasibilityLine[]{
 if(!read.complete)return [{itemId:null,constraint:"reservation_reference_read",status:"pending",reason:"CURRENT_OWNER_RESERVATION_SCOPE_UNAVAILABLE_OR_INCOMPLETE"}];
 return read.references.filter(ref=>["reserved","amended"].includes(ref.fields.status)).map(ref=>({
  itemId:null,constraint:"user_reported_reservation",status:"pending" as const,
  reason:"USER_CONFIRMED_REPORT_NOT_SUPPLIER_VERIFIED:"+ref.referenceId+":r"+ref.revision+":"+ref.fields.kind
   +":"+ref.fields.startsAt+":"+ref.fields.endsAt,
 }));
}
export function reservationPlanningBasis(read:ReservationPlanningRead){
 return {complete:read.complete,references:read.references.map(ref=>({referenceId:ref.referenceId,revision:ref.revision,
  contentDigest:ref.contentDigest,status:ref.fields.status,evidenceTier:ref.evidenceTier,sourceQualification:ref.sourceQualification,
  fields:ref.fields,source:ref.source})).sort((a,b)=>a.referenceId.localeCompare(b.referenceId))};
}
