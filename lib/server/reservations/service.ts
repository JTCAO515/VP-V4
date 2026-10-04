import {parseReservationCommand,parseReservationCurrent,type ReservationCommand,type ReservationCurrent} from "./contract.ts";
export type ReservationRPC=(name:string,params:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
/** Persist/read receipts belong to the owner SQL authority. Never synthesizes
 * success from a draft, click, local hash, timeout or uncertain write response. */
export async function confirmReservationReference(tripId:string,input:ReservationCommand,rpc:ReservationRPC){
 if(!parseReservationCommand(input))throw Error("INVALID_INPUT");
 if(input.source.kind==="artifact_reference")throw Error("RESERVATION_SOURCE_UNAVAILABLE");
 const result=await rpc("confirm_reservation_reference_v1",{p_trip_id:tripId,p_input:input});
 if(result.error)throw Error("RESERVATION_RECEIPT_UNKNOWN");
 const current=parseReservationCurrent(result.data);
 if(!current||current.tripId!==tripId||current.referenceId!==input.referenceId)throw Error("RESERVATION_RECEIPT_UNKNOWN");
 return current;
}
export async function readReservationOperation(tripId:string,operationId:string,rpc:ReservationRPC){
 const result=await rpc("read_reservation_operation_v1",{p_trip_id:tripId,p_operation_id:operationId});
 if(result.error)throw Error("RESERVATION_RECEIPT_UNKNOWN");
 return result.data;
}
export function reservationPlanningConstraint(reference:ReservationCurrent){
 return {referenceId:reference.referenceId,revision:reference.revision,status:reference.fields.status,evidenceTier:reference.evidenceTier,
  applies:["reserved","amended"].includes(reference.fields.status),startsAt:reference.fields.startsAt,endsAt:reference.fields.endsAt,timeZone:reference.fields.timeZone,
  address:reference.fields.address,terms:reference.fields.terms,sourceQualification:reference.sourceQualification,
  supplierVerified:reference.evidenceTier==="provider_verified",tripMutation:"none"};
}
