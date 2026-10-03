import {getNativeRuntimeConfig} from '../identity/native-config.ts';
import {verifyNativeCredentials} from '../identity/native-credentials.ts';
import {nativeRequestScope} from '../identity/native-request.ts';
import {isUuid} from '../identity/request-guards.ts';
import {createNativeTripDataAdapter} from '../identity/user-data-adapter.ts';
import {lookupPlace} from '../maps/place-lookup.ts';
import {createMapsServiceRoleClient} from '../maps/service-role-client.ts';
import {loadCanonicalMappingLookup} from '../maps/canonical-mapping-repository.ts';
import {enforcePlaceQuota} from '../maps/place-quota.ts';
import {libraryPlaceCapabilities} from './place-capabilities.ts';
const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
const failure=(code:string,status:number)=>reply({error:{code}},status);
/** Button-requested existing place reader only; no save/add/Proposal/Trip/media writer. */
export async function libraryNativePlaceHTTP(request:Request):Promise<Response>{
 const url=new URL(request.url),provider=url.searchParams.get('provider'),id=url.searchParams.get('providerPoiId'),tripId=url.searchParams.get('tripId');
 if(request.method!=='GET'||request.headers.has('cookie')||request.headers.has('origin')||(provider!=='amap'&&provider!=='tencent')||!id||id.trim().length===0||id.length>128||tripId!==null&&!isUuid(tripId)||[...url.searchParams.keys()].some(k=>!['provider','providerPoiId','tripId'].includes(k)||url.searchParams.getAll(k).length!==1))return failure('INVALID_INPUT',400);
 const config=getNativeRuntimeConfig(request,'session');if(!config)return failure('LIBRARY_UNAVAILABLE',503);const scope=nativeRequestScope(request.signal);
 try{
  const actor=await scope.run(()=>verifyNativeCredentials(request,config,scope.fetch,scope.unavailable));if(!actor)return failure('UNAUTHENTICATED',401);
  const session=await scope.run(()=>actor.client.rpc('native_session_v2',{p_action:'session'}).abortSignal(scope.signal));if(session.error||session.data?.subject!==actor.subject||session.data?.sessionId!==actor.sessionId)return failure('UNAUTHENTICATED',401);
  const quota=await enforcePlaceQuota(actor.client,'places',scope.signal);if(quota)return quota;
  const service=createMapsServiceRoleClient(),lookup=await scope.run(()=>lookupPlace(new URLSearchParams({provider,action:'detail',id}),{env:process.env,serviceClient:service,fetcher:scope.fetch}));
  if(lookup.status!==200)return reply({version:1,kind:'library_place',status:'unavailable',reason:'DOMAIN_UNAVAILABLE',entity:null,capabilities:libraryPlaceCapabilities(null,null)});
  const body=lookup.body;if(!('status' in body)||body.status!=='observed'||!('detail' in body)||!body.detail)return reply({version:1,kind:'library_place',status:'unavailable',reason:'DOMAIN_UNAVAILABLE',entity:null,capabilities:libraryPlaceCapabilities(null,null)});
  const detail=body.detail;if(detail.provider!==provider||detail.providerPoiId!==id)return failure('LIBRARY_UNAVAILABLE',503);
  let canonical:string|null=null,ownedTrip:string|null=null;
  if(service){const mapping=await scope.run(()=>loadCanonicalMappingLookup(service,provider,[id]));if(!mapping.dbError)canonical=mapping.lookupMapping(provider,id);}
  if(tripId&&canonical){const tripConfig=getNativeRuntimeConfig(request,'trip','trip');if(tripConfig){const adapter=await scope.run(()=>createNativeTripDataAdapter(request,tripConfig,scope.fetch,scope.unavailable));if(adapter){const who=await adapter.authenticated();if(!('error' in who)&&who.data===actor.subject){const archive=await adapter.readArchive(tripId.toLowerCase()),trip=await adapter.getTrip(tripId.toLowerCase());if(!('error' in archive)&&archive.data===null&&!('error' in trip)&&trip.data.trip.id===tripId.toLowerCase())ownedTrip=tripId.toLowerCase();}}}}
  const current=await scope.run(()=>actor.client.rpc('native_session_v2',{p_action:'session'}).abortSignal(scope.signal));if(current.error||current.data?.subject!==actor.subject||current.data?.sessionId!==actor.sessionId)return failure('UNAUTHENTICATED',401);
  return reply({version:1,kind:'library_place',status:'available',reason:null,entity:{provider,providerPoiId:id,canonicalPoiId:canonical,name:detail.rawName,address:detail.address,location:detail.location,observedAt:'observedAt' in body?body.observedAt:null},capabilities:libraryPlaceCapabilities(canonical,ownedTrip)});
 }catch{return failure('LIBRARY_UNAVAILABLE',503);}finally{scope.dispose();}
}
