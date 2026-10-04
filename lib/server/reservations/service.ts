import {parseReservationCommand,type ReservationCommand,type ReservationCurrent} from "./contract.ts";
import {parseReservationConfirmation,parseReservationOperation,parseReservationPage} from "./receipt.ts";
export type ReservationRPC=(name:string,params:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
function denial(value:unknown){
 if(value&&typeof value==="object"&&!Array.isArray(value)){const v=value as Record<string,unknown>;
  if(Object.keys(v).length===1&&v.kind==="conflict")throw Error("RESERVATION_CONFLICT");
  if(Object.keys(v).length===1&&v.kind==="unavailable")throw Error("RESERVATION_UNAVAILABLE");}
}
/** SQL owns persistence. ACK matches exact frozen command, operation, reference
 * and resulting revision; uncertain output cannot manufacture confirmed success. */
export async function confirmReservationReference(tripId:string,input:ReservationCommand,rpc:ReservationRPC){
 if(!parseReservationCommand(input))throw Error("INVALID_INPUT");
 if(input.source.kind==="artifact_reference")throw Error("RESERVATION_SOURCE_UNAVAILABLE");
 const result=await rpc("confirm_reservation_reference_v1",{p_trip_id:tripId,p_input:input});
 if(result.error)throw Error("RESERVATION_RECEIPT_UNKNOWN");
 denial(result.data);
 const ack=parseReservationConfirmation(result.data,tripId,input);
 if(!ack)throw Error("RESERVATION_RECEIPT_UNKNOWN");return ack;
}
export async function readReservationOperation(tripId:string,operationId:string,rpc:ReservationRPC,input?:ReservationCommand){
 const result=await rpc("read_reservation_operation_v1",{p_trip_id:tripId,p_operation_id:operationId});
 if(result.error)throw Error("RESERVATION_RECEIPT_UNKNOWN");
 denial(result.data);
 const value=parseReservationOperation(result.data,tripId,operationId,input);
 if(!value)throw Error("RESERVATION_RECEIPT_UNKNOWN");return value;
}
export async function readReservationReferences(tripId:string,version:number,after:string|null,limit:number,rpc:ReservationRPC){
 const result=await rpc("read_reservation_references_v1",{p_trip_id:tripId,p_expected_trip_version:version,p_reference_id:null,p_after_reference_id:after,p_limit:limit});
 if(result.error)throw Error("RESERVATION_UNAVAILABLE");denial(result.data);
 const page=parseReservationPage(result.data,tripId,version,after,limit);
 if(!page)throw Error("RESERVATION_UNAVAILABLE");return page;
}
export function reservationPlanningConstraint(reference:ReservationCurrent){
 return {referenceId:reference.referenceId,revision:reference.revision,status:reference.fields.status,evidenceTier:reference.evidenceTier,
  applies:["reserved","amended"].includes(reference.fields.status),startsAt:reference.fields.startsAt,endsAt:reference.fields.endsAt,timeZone:reference.fields.timeZone,
  address:reference.fields.address,terms:reference.fields.terms,sourceQualification:reference.sourceQualification,
  supplierVerified:reference.evidenceTier==="provider_verified",tripMutation:"none"};
}
