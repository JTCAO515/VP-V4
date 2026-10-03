import { assertGroundedClaim, type GroundedClaim } from "../../contracts/index.ts";
import { decodeNativeSupportResult } from "../support/native-http.ts";
import type { PlanEvidence, FeasibilityBasis } from "./assembly.ts";
export type ExplicitPlaceChoice={dayId:string;itemId:string;placeReferenceId:string;mappingId:string;expectedMappingVersion:number;city:string;scene:string;locale:"zh"|"en"};
export type FeasibilitySourceRPC=(name:string,params:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const id=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
/** Consume current typed SQL authority; only explicitly selected own references, never inferred title binding. */
export async function readPlanPlaceEvidence(basis:FeasibilityBasis,choices:readonly ExplicitPlaceChoice[],rpc:FeasibilitySourceRPC):Promise<{items:PlanEvidence[];bindings:unknown[]}>{
 const items:PlanEvidence[]=[],bindings:unknown[]=[];
 for(const choice of choices){
  const day=basis.after.days.find(d=>d.id===choice.dayId),item=day?.items?.find(i=>i.id===choice.itemId);if(!day||!item)continue;
  const ctx=await rpc("read_trip_item_support_context_v1",{p_trip:basis.tripId,p_expected_trip_version:basis.baseVersion,p_proposal:basis.proposalId,p_expected_proposal_revision:basis.proposalRevision,p_day:choice.dayId,p_item:choice.itemId});
  const context=ctx.data;
  if(ctx.error||!record(context)||context.kind!=="support_context"||context.tripId!==basis.tripId||context.proposalId!==basis.proposalId||context.tripVersion!==basis.baseVersion||context.proposalRevision!==basis.proposalRevision||context.baseVersion!==basis.baseVersion||context.proposalDigest!==basis.proposalDigest
   ||context.dayId!==choice.dayId||context.itemId!==choice.itemId||!Array.isArray(context.canonicalPlaceReferences)||!context.canonicalPlaceReferences.some(r=>record(r)&&r.referenceId===choice.placeReferenceId&&id(r.canonicalPoiId)))continue;
  const reference = context.canonicalPlaceReferences.find(r=>record(r)&&r.referenceId===choice.placeReferenceId) as Record<string,unknown>;
  let selected: Record<string,unknown> | undefined;
  let result: Record<string,unknown> | undefined;
  let cursor: unknown = null;
  // Bound candidate traversal and retain the SQL context cursor across pages.
  for (let page=0;page<10;page++) {
    const read=await rpc("read_trip_item_support_candidates_v1",{p_trip:basis.tripId,p_expected_trip_version:basis.baseVersion,p_place_reference:choice.placeReferenceId,p_city:choice.city,p_scene:choice.scene,p_locale:choice.locale,p_cursor:cursor,p_limit:50});
    const decoded=decodeNativeSupportResult("candidates",read.data,basis.tripId,{expectedTripVersion:basis.baseVersion,placeReferenceId:choice.placeReferenceId,limit:50});
    if(read.error||!record(decoded)||decoded.kind!=="candidates"||!Array.isArray(decoded.entries))break;
    if (record(cursor) && decoded.contextDigest!==cursor.contextDigest) break;
    result=decoded;
    selected=decoded.entries.find(r=>record(r)&&r.mappingId===choice.mappingId&&r.mappingVersion===choice.expectedMappingVersion);
    if(selected || decoded.nextCursor===null) break;
    cursor=decoded.nextCursor;
  }
  if(!result||!record(selected)||!record(selected.claim)||!id(selected.mappingId))continue;
  try{assertGroundedClaim(selected.claim as GroundedClaim, Date.now());}catch{continue;}
  let opening:"open"|"closed"|"unknown"="unknown";
  if(selected.scope==="opening_window_reference"&&selected.claim.claimType==="time_window"&&record(selected.claim.value)&&item.startsAt&&item.endsAt&&day.timeZone===selected.claim.value.timeZone
   &&typeof selected.claim.value.startsAt==="string"&&typeof selected.claim.value.endsAt==="string")opening=Date.parse(item.startsAt)>=Date.parse(selected.claim.value.startsAt)&&Date.parse(item.endsAt)<=Date.parse(selected.claim.value.endsAt)?"open":"unknown";
  items.push({itemId:item.id,canonicalPoiId:reference.canonicalPoiId as string,current:true,entityBound:true,opening,reservation:"unknown",reservationCurrent:false});
  bindings.push({itemId:item.id,placeReferenceId:choice.placeReferenceId,mappingId:selected.mappingId,mappingVersion:selected.mappingVersion,sourceDigest:selected.sourceDigest,contextDigest:result.contextDigest,claimType:selected.claim.claimType,facts:(selected.claim as GroundedClaim).evidence.filter(e=>e.kind==="fact").map(e=>e.kind==="fact"?{factId:e.factId,version:e.version,expiresAt:e.expiresAt}:null)});
 }
 return {items,bindings};
}
