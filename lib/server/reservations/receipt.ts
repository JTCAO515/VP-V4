import {isUuid} from "../identity/request-guards.ts";
import {exact,hash,parseReservationCommand,parseReservationCurrent,type ReservationCommand,type ReservationCurrent} from "./contract.ts";
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const sameUUID=(a:unknown,b:unknown)=>typeof a==="string"&&typeof b==="string"&&a.toLowerCase()===b.toLowerCase();
const positive=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>0&&v<=9007199254740990;
export function reservationEqual(a:unknown,b:unknown):boolean{
 if(a===b)return true;
 if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((value,i)=>reservationEqual(value,b[i]));
 if(object(a)&&object(b))return Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(key=>Object.hasOwn(b,key)&&reservationEqual(a[key],b[key]));
 return false;
}
function reported(v:unknown):ReservationCurrent|null{
 const value=parseReservationCurrent(v);return value?.evidenceTier==="user_reported"&&value.sourceQualification==="untrusted"&&value.sourceVersion===null&&value.source.kind==="user_reported"?value:null;
}
export type ReservationConfirmation={kind:"reservation_confirmation/1";operationId:string;tripId:string;referenceId:string;resultRevision:number;commandDigest:string;command:ReservationCommand;receipt:ReservationCurrent};
export function parseReservationConfirmation(v:unknown,tripId:string,input:ReservationCommand):ReservationConfirmation|null{
 if(!object(v)||!exact(v,["kind","operationId","tripId","referenceId","resultRevision","commandDigest","command","receipt"])
  ||v.kind!=="reservation_confirmation/1"||!sameUUID(v.operationId,input.operationId)||v.tripId!==tripId||!sameUUID(v.referenceId,input.referenceId)
  ||v.resultRevision!==input.expectedRevision+1||!hash(v.commandDigest)||!parseReservationCommand(v.command)||!reservationEqual(v.command,input))return null;
 const current=reported(v.receipt);
 if(!current||current.tripId!==tripId||!sameUUID(current.referenceId,input.referenceId)||current.revision!==v.resultRevision
  ||current.tripVersion!==input.expectedTripVersion||!reservationEqual(current.fields,input.fields)||!reservationEqual(current.source,input.source))return null;
 return v as ReservationConfirmation;
}
export type ReservationOperation={kind:"reservation_operation/1";operationId:string;tripId:string;referenceId:string;appliedRevision:number;currentRevision:number;commandDigest:string;command:ReservationCommand|null;result:"applied"|"superseded";receipt:ReservationCurrent|null;current:ReservationCurrent;tripMutation:"none"};
export function parseReservationOperation(v:unknown,tripId:string,operationId:string,input?:ReservationCommand):ReservationOperation|null{
 if(!object(v)||!exact(v,["kind","operationId","tripId","referenceId","appliedRevision","currentRevision","commandDigest","command","result","receipt","current","tripMutation"])
  ||v.kind!=="reservation_operation/1"||!sameUUID(v.operationId,operationId)||v.tripId!==tripId||typeof v.referenceId!=="string"||!isUuid(v.referenceId)
  ||!positive(v.appliedRevision)||!positive(v.currentRevision)||v.currentRevision<v.appliedRevision||!hash(v.commandDigest)||v.tripMutation!=="none")return null;
 const current=reported(v.current);
 if(!current||current.tripId!==tripId||current.referenceId!==v.referenceId||current.revision!==v.currentRevision)return null;
 if(v.result==="superseded"){
  if(v.command!==null||v.receipt!==null||v.currentRevision<=v.appliedRevision)return null;
 }else if(v.result==="applied"){
  const command=parseReservationCommand(v.command),receipt=reported(v.receipt);
  if(!command||!receipt||!sameUUID(command.operationId,operationId)||!sameUUID(command.referenceId,v.referenceId)||command.expectedRevision+1!==v.appliedRevision
   ||receipt.revision!==v.appliedRevision||receipt.referenceId!==v.referenceId||receipt.tripId!==tripId||receipt.tripVersion!==command.expectedTripVersion
   ||v.currentRevision!==v.appliedRevision||!reservationEqual(receipt.fields,command.fields)||!reservationEqual(receipt.source,command.source)
   ||!reservationEqual(current.fields,receipt.fields)||!reservationEqual(current.source,receipt.source)
   ||input&&!reservationEqual(command,input))return null;
 }else return null;
 if(input&&!sameUUID(v.referenceId,input.referenceId))return null;
 return v as ReservationOperation;
}
export type ReservationPage={kind:"reservation_references/1";tripId:string;tripVersion:number;items:ReservationCurrent[];hasMore:boolean;nextCursor:string|null};
export function parseReservationPage(v:unknown,tripId:string,tripVersion:number,after:string|null,limit:number):ReservationPage|null{
 if(!object(v)||!exact(v,["kind","tripId","tripVersion","items","hasMore","nextCursor"])||v.kind!=="reservation_references/1"||v.tripId!==tripId||v.tripVersion!==tripVersion
  ||!Array.isArray(v.items)||v.items.length>limit||typeof v.hasMore!=="boolean")return null;
 let previous=after;
 for(const item of v.items){const current=reported(item);if(!current||current.tripId!==tripId||current.tripVersion!==tripVersion
  ||previous!==null&&current.referenceId<=previous)return null;previous=current.referenceId;}
 if(v.hasMore? v.items.length!==limit||v.nextCursor!==previous||previous===null : v.nextCursor!==null)return null;
 return v as ReservationPage;
}
