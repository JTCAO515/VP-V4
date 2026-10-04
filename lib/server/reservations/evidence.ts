import {createHash} from "node:crypto";
import type {ReservationFields,ReservationSource,ReservationEvidenceTier} from "./contract.ts";
export type TrustedReservationSource={
 kind:"trusted_reservation_source/1";artifactId:string;artifactRevision:number;ownerId:string;tripId:string;sourceReceiptId:string;sourceDigest:string;
 fieldDigest:string;sourceVersion:number;tier:"artifact_confirmed"|"provider_verified";expiresAt:string;revoked:boolean;
};
/** User confirmation/local content hashes are metadata, never artifact/provider
 * authority. Only an existing source reader's current qualified fields may upgrade. */
export function reservationFieldDigest(fields:ReservationFields){return createHash("sha256").update(JSON.stringify(Object.fromEntries(Object.entries(fields).sort(([a],[b])=>a.localeCompare(b))))).digest("hex");}
export function qualifyReservationEvidence(ownerId:string,tripId:string,fields:ReservationFields,source:ReservationSource,
 trusted:TrustedReservationSource|null,now=Date.now()):{tier:ReservationEvidenceTier;qualification:"current"|"untrusted"|"unavailable";sourceVersion:number|null}{
 if(source.kind!=="artifact_reference")return {tier:"user_reported",qualification:"untrusted",sourceVersion:null};
 if(!trusted||trusted.kind!=="trusted_reservation_source/1"||!["artifact_confirmed","provider_verified"].includes(trusted.tier)||trusted.artifactId!==source.artifactId||trusted.artifactRevision!==source.artifactRevision||trusted.revoked||trusted.ownerId!==ownerId||trusted.tripId!==tripId||trusted.sourceReceiptId!==source.sourceReceiptId
  ||trusted.sourceDigest!==source.sourceDigest||trusted.fieldDigest!==reservationFieldDigest(fields)||!Number.isSafeInteger(trusted.sourceVersion)
  ||trusted.sourceVersion<1||Date.parse(trusted.expiresAt)<=now||!Number.isFinite(Date.parse(trusted.expiresAt)))return {tier:"user_reported",qualification:"unavailable",sourceVersion:null};
 return {tier:trusted.tier,qualification:"current",sourceVersion:trusted.sourceVersion};
}
