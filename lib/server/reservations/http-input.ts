import {isUuid} from "../identity/request-guards.ts";
import {exact,parseReservationCommand,type ReservationCommand} from "./contract.ts";
type Read={operation:"read";expectedTripVersion:number;afterReferenceId:string|null;limit:number};
type Preview={operation:"preview";input:ReservationCommand};
type Confirm={operation:"confirm";input:ReservationCommand};
type Receipt={operation:"receipt";operationId:string};
export type ReservationHTTPInput=Read|Preview|Confirm|Receipt;
export function parseReservationHTTPInput(v:unknown):ReservationHTTPInput|null{
 if(!v||typeof v!=="object"||Array.isArray(v))return null;const row=v as Record<string,unknown>;
 if(row.operation==="read"&&exact(row,["operation","expectedTripVersion","afterReferenceId","limit"])
  &&typeof row.expectedTripVersion==="number"&&Number.isSafeInteger(row.expectedTripVersion)&&row.expectedTripVersion>=0
  &&(row.afterReferenceId===null||typeof row.afterReferenceId==="string"&&isUuid(row.afterReferenceId))
  &&typeof row.limit==="number"&&Number.isSafeInteger(row.limit)&&row.limit>=1&&row.limit<=20)return row as Read;
 if((row.operation==="preview"||row.operation==="confirm")&&exact(row,["operation","input"])&&parseReservationCommand(row.input))return row as Preview|Confirm;
 if(row.operation==="receipt"&&exact(row,["operation","operationId"])&&typeof row.operationId==="string"&&isUuid(row.operationId))return row as Receipt;
 return null;
}
