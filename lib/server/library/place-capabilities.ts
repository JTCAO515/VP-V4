import {prepareExploreHandoff} from '../explore/exact-id-handoff.ts';
import type {PlaceActionContext} from '../explore/place-action-context.ts';
/** The legacy place-detail DTO stays compatible. Current actions require an
 * ordinary owner context, never just a provider match or display card. */
export function libraryPlaceCapabilities(canonicalPoiId:string|null,ownedTripId:string|null,context?:PlaceActionContext,enabled=false){
 const handoff=canonicalPoiId&&ownedTripId?prepareExploreHandoff({poiId:canonicalPoiId,tripId:ownedTripId,readiness:'recheck_required'}):null;
 if(context && context.selection.canonicalPoiId===canonicalPoiId && context.tripId===ownedTripId && handoff?.kind==='ask_ready' && Date.parse(context.expiresAt)>Date.now()){
  const reference={tripId:context.tripId,canonicalPoiId:context.selection.canonicalPoiId,tripVersion:context.tripVersion,mappingDigest:context.mappingDigest};
  return {ask:{status:'available' as const,reference,handoff},save:enabled?{status:'available' as const,reference,meaning:'identity_reference_only' as const}:{status:'unavailable' as const,reason:'PLACE_ACTIONS_DISABLED' as const},
   add:enabled?{status:'available' as const,reference,meaning:'pending_proposal_original_confirm' as const,feasibility:'pending' as const}:{status:'unavailable' as const,reason:'PLACE_ACTIONS_DISABLED' as const},
   visual:{status:'unavailable' as const,reason:'NO_LICENSED_VISUAL' as const}};
 }
 return {ask:handoff?.kind==='ask_ready'?{status:'available' as const,reference:{tripId:ownedTripId,canonicalPoiId},handoff}:{status:'unavailable' as const,reason:'CANONICAL_OR_TRIP_AUTHORITY_MISSING' as const},save:{status:'unavailable' as const,reason:'DOMAIN_WRITER_MISSING' as const},add:{status:'unavailable' as const,reason:'NO_ELIGIBLE_EVIDENCE' as const},visual:{status:'unavailable' as const,reason:'NO_LICENSED_VISUAL' as const}};
}
