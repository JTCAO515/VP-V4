import {isUuid} from "../identity/request-guards.ts";
import {timestamp} from "../readiness/contract.ts";
export const RESERVATION_EVIDENCE_TIERS=["user_reported","artifact_confirmed","provider_verified"] as const;
export type ReservationEvidenceTier=typeof RESERVATION_EVIDENCE_TIERS[number];
export type ReservationFields={
 kind:"lodging"|"transport"|"activity"|"other";supplier:"booking"|"trip"|"official"|"other";externalReference:string|null;
 title:string;startsAt:string|null;endsAt:string|null;timeZone:string|null;address:string|null;terms:string|null;
 status:"reserved"|"amended"|"cancelled"|"unknown";
};
export type ReservationSource=
 |{kind:"user_reported";localMaterialId:string|null;localContentHash:string|null;locator:string|null}
 |{kind:"artifact_reference";artifactId:string;artifactRevision:number;sourceReceiptId:string;sourceDigest:string;locator:string};
export type ReservationCommand={
 operationId:string;referenceId:string;expectedTripVersion:number;expectedRevision:number;
 fields:ReservationFields;source:ReservationSource;explicitlyConfirmed:true;
};
export type ReservationCurrent={
 kind:"reservation_reference/1";referenceId:string;tripId:string;tripVersion:number;revision:number;
 fields:ReservationFields;evidenceTier:ReservationEvidenceTier;source:ReservationSource;sourceQualification:"current"|"untrusted"|"unavailable";
 confirmedBy:"explicit_user";confirmedAt:string;contentDigest:string;sourceVersion:number|null;planningUse:"confirmed_reference_only";tripMutation:"none";
};
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
export const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export const hash=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f]{64}$/.test(v);
const uuid=(v:unknown):v is string=>typeof v==="string"&&isUuid(v);
const integer=(v:unknown,min=0,max=9007199254740990):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const nullableText=(v:unknown,max:number)=>v===null||typeof v==="string"&&v.trim().length>0&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(v);
export function parseReservationFields(v:unknown):ReservationFields|null{
 if(!object(v)||!exact(v,["kind","supplier","externalReference","title","startsAt","endsAt","timeZone","address","terms","status"])
  ||!["lodging","transport","activity","other"].includes(v.kind as string)||!["booking","trip","official","other"].includes(v.supplier as string)
  ||!nullableText(v.externalReference,120)||typeof v.title!=="string"||!nullableText(v.title,160)
  ||![v.startsAt,v.endsAt].every(t=>t===null||timestamp(t)!==null)||!nullableText(v.timeZone,80)||!nullableText(v.address,500)||!nullableText(v.terms,2000)
  ||!["reserved","amended","cancelled","unknown"].includes(v.status as string))return null;
 if(v.timeZone!==null){try{new Intl.DateTimeFormat("en",{timeZone:v.timeZone as string});}catch{return null;}}
 if(v.startsAt!==null&&v.endsAt!==null&&timestamp(v.endsAt)!<=timestamp(v.startsAt)!)return null;
 return v as ReservationFields;
}
export function parseReservationSource(v:unknown):ReservationSource|null{
 if(!object(v))return null;
 if(v.kind==="user_reported"&&exact(v,["kind","localMaterialId","localContentHash","locator"])
  &&(v.localMaterialId===null||uuid(v.localMaterialId))&&(v.localContentHash===null||hash(v.localContentHash))&&nullableText(v.locator,500))return v as ReservationSource;
 if(v.kind==="artifact_reference"&&exact(v,["kind","artifactId","artifactRevision","sourceReceiptId","sourceDigest","locator"])
  &&uuid(v.artifactId)&&integer(v.artifactRevision,1,1000)&&uuid(v.sourceReceiptId)&&hash(v.sourceDigest)&&typeof v.locator==="string"&&nullableText(v.locator,500))return v as ReservationSource;
 return null;
}
export function parseReservationCommand(v:unknown):ReservationCommand|null{
 if(!object(v)||!exact(v,["operationId","referenceId","expectedTripVersion","expectedRevision","fields","source","explicitlyConfirmed"])
  ||!uuid(v.operationId)||!uuid(v.referenceId)||!integer(v.expectedTripVersion,0,999999999)||!integer(v.expectedRevision)
  ||v.explicitlyConfirmed!==true||!parseReservationFields(v.fields)||!parseReservationSource(v.source))return null;
 return v as ReservationCommand;
}

export function parseReservationCurrent(v:unknown):ReservationCurrent|null{
 if(!object(v)||!exact(v,["kind","referenceId","tripId","tripVersion","revision","fields","evidenceTier","source","sourceQualification","confirmedBy","confirmedAt","contentDigest","sourceVersion","planningUse","tripMutation"])
  ||v.kind!=="reservation_reference/1"||!uuid(v.referenceId)||!uuid(v.tripId)||!integer(v.tripVersion,0,999999999)||!integer(v.revision,1)
  ||!parseReservationFields(v.fields)||!parseReservationSource(v.source)||!(RESERVATION_EVIDENCE_TIERS as readonly string[]).includes(v.evidenceTier as string)
  ||!["current","untrusted","unavailable"].includes(v.sourceQualification as string)||v.confirmedBy!=="explicit_user"||timestamp(v.confirmedAt)===null
  ||!hash(v.contentDigest)||!(v.sourceVersion===null||integer(v.sourceVersion,1))||v.planningUse!=="confirmed_reference_only"||v.tripMutation!=="none")return null;
 if(v.evidenceTier!=="user_reported"&&(v.sourceQualification!=="current"||v.sourceVersion===null||(v.source as ReservationSource).kind!=="artifact_reference"))return null;
 return v as ReservationCurrent;
}
