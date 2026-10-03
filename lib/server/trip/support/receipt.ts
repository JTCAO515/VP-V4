import {assertGroundedClaim,type GroundedClaim} from '../../contracts/index.ts';
export type SupportScope='address_reference'|'opening_window_reference';
export type PreparedSupport=Readonly<{kind:'prepared';receiptId:string;version:number;tripId:string;proposalId:string;proposalRevision:number;baseVersion:number;dayId:string;itemId:string;scope:SupportScope;applicability:'unverified'|'matched';claim:GroundedClaim;sourceDigest:string;expiresAt:string}>;
const row=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const item=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(v);
const positive=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>0;
/** SQL issuer remains authority; typed validation never grants source eligibility. */
export function decodePreparedSupport(v:unknown):PreparedSupport|null{
 if(!row(v)||Object.keys(v).length!==14||!['kind','receiptId','version','tripId','proposalId','proposalRevision','baseVersion','dayId','itemId','scope','applicability','claim','sourceDigest','expiresAt'].every(k=>Object.hasOwn(v,k))||v.kind!=='prepared'||![v.receiptId,v.tripId,v.proposalId].every(uuid)||!positive(v.version)||!positive(v.proposalRevision)||!Number.isSafeInteger(v.baseVersion)||Number(v.baseVersion)<0||!item(v.dayId)||!item(v.itemId)||!['address_reference','opening_window_reference'].includes(String(v.scope))||!['unverified','matched'].includes(String(v.applicability))||typeof v.sourceDigest!=='string'||!/^[a-f0-9]{64}$/.test(v.sourceDigest)||typeof v.expiresAt!=='string'||!Number.isFinite(Date.parse(v.expiresAt)))return null;
 if(!row(v.claim)||v.scope==='address_reference'&&v.claim.claimType!=='address'||v.scope==='opening_window_reference'&&v.claim.claimType!=='time_window')return null;
 try{assertGroundedClaim(v.claim as GroundedClaim);}catch{return null;}return v as PreparedSupport;
}
export type SupportSqlPort=(name:'prepare_trip_item_support_v1'|'revoke_trip_item_support_preparation_v1'|'confirm_and_apply_supported_trip_proposal_v1'|'read_trip_item_support_v1',p:Readonly<Record<string,unknown>>,signal:AbortSignal)=>Promise<unknown>;
/** Explicit backend adapter only; no env/credentials/API route/implicit confirm. */
export function createTripSupportService(options:Readonly<{enabled?:boolean;rpc:SupportSqlPort}>){
 return {
  async prepare(input:Readonly<Record<string,unknown>>,signal:AbortSignal){if(options.enabled!==true||signal.aborted)return null;return decodePreparedSupport(await options.rpc('prepare_trip_item_support_v1',{p_input:input},signal));},
  async confirm(proposalId:string,idempotencyKey:string,digest:string,receipts:readonly PreparedSupport[],signal:AbortSignal){
   if(options.enabled!==true||signal.aborted||!uuid(proposalId)||receipts.length<1||receipts.length>8||new Set(receipts.map(r=>r.receiptId)).size!==receipts.length||receipts.some(r=>r.proposalId!==proposalId))return {kind:'blocked'};
   return options.rpc('confirm_and_apply_supported_trip_proposal_v1',{p_proposal_id:proposalId,p_idempotency_key:idempotencyKey,p_digest:digest,p_support_selection:receipts.map(r=>({receiptId:r.receiptId,version:r.version,sourceDigest:r.sourceDigest}))},signal);
  },
  async read(tripId:string,version:number,dayId:string,itemId:string,signal:AbortSignal){if(options.enabled!==true||signal.aborted||!uuid(tripId)||!positive(version)||!item(dayId)||!item(itemId))return {kind:'blocked'};return options.rpc('read_trip_item_support_v1',{p_trip:tripId,p_expected_trip_version:version,p_day:dayId,p_item:itemId},signal);},
 };
}
