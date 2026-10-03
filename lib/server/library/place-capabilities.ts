import {prepareExploreHandoff} from '../explore/exact-id-handoff.ts';
export function libraryPlaceCapabilities(canonicalPoiId:string|null,ownedTripId:string|null){
 const handoff=canonicalPoiId&&ownedTripId?prepareExploreHandoff({poiId:canonicalPoiId,tripId:ownedTripId,readiness:'recheck_required'}):null;
 return {ask:handoff?.kind==='ask_ready'?{status:'available' as const,reference:{tripId:ownedTripId,canonicalPoiId},handoff}:{status:'unavailable' as const,reason:'CANONICAL_OR_TRIP_AUTHORITY_MISSING' as const},save:{status:'unavailable' as const,reason:'DOMAIN_WRITER_MISSING' as const},add:{status:'unavailable' as const,reason:'NO_ELIGIBLE_EVIDENCE' as const},visual:{status:'unavailable' as const,reason:'NO_LICENSED_VISUAL' as const}};
}
