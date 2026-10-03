import type { NextRequest } from "next/server";
import { getNativeRuntimeConfig } from "../../identity/native-config.ts";
import { nativeRequestScope } from "../../identity/native-request.ts";
import { createNativeTripDataAdapter } from "../../identity/user-data-adapter.ts";
import {createOfflineNativeAuthority} from "../../today/offline-native-authority.ts";
import {verifyNativeCredentials} from "../../identity/native-credentials.ts";
import {KNOWLEDGE_CITIES,KNOWLEDGE_SCENES} from "../../knowledge/publication/statement.ts";
import {readPlanPlaceEvidence,type ExplicitPlaceChoice} from "./evidence.ts";
import {planPreferenceContext} from "./preferences.ts";
import {readPlanRouteEvidence,type ExplicitRouteRequest} from "./routes.ts";
import {consumePlaceQuota} from "../../maps/place-quota.ts";
import { assemblePlanFeasibility, type ExplicitPlanNeeds } from "./assembly.ts";
const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const integer=(v:unknown,min:number,max:number)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{"Cache-Control":"private, no-store"}});
const failure=(code:string,status=503)=>reply({error:{code}},status);
export function feasibilityRequest(value:unknown):{proposalId:string;expectedProposalRevision:number;expectedBaseVersion:number;needs:ExplicitPlanNeeds;placeChoices:ExplicitPlaceChoice[];routeRequests?:ExplicitRouteRequest[]}|null {
 if(!record(value)||!exact(value,["proposalId","expectedProposalRevision","expectedBaseVersion","needs","placeChoices",...(Object.hasOwn(value,"routeRequests")?["routeRequests"]:[])])||!uuid(value.proposalId)||!integer(value.expectedProposalRevision,1,999999999)||!integer(value.expectedBaseVersion,0,999999999)||!record(value.needs)
  ||!exact(value.needs,["partySize","currency","maxBudgetMinor","minTransferMinutes","baggageBufferMinutes","appointmentBufferMinutes","maxWalkingMinutes"]))return null;
 if(!Array.isArray(value.placeChoices)||value.placeChoices.length>40||!value.placeChoices.every(c=>record(c)&&exact(c,["dayId","itemId","placeReferenceId","mappingId","expectedMappingVersion","city","scene","locale"])
  &&typeof c.dayId==="string"&&/^[A-Za-z0-9_-]{1,64}$/.test(c.dayId)&&typeof c.itemId==="string"&&/^[A-Za-z0-9_-]{1,64}$/.test(c.itemId)&&uuid(c.placeReferenceId)&&uuid(c.mappingId)&&integer(c.expectedMappingVersion,1,Number.MAX_SAFE_INTEGER)
  &&(KNOWLEDGE_CITIES as readonly unknown[]).includes(c.city)&&(KNOWLEDGE_SCENES as readonly unknown[]).includes(c.scene)&&["zh","en"].includes(String(c.locale)))||new Set(value.placeChoices.map(c=>c.itemId)).size!==value.placeChoices.length)return null;
 if(Object.hasOwn(value,"routeRequests")&&(!Array.isArray(value.routeRequests)||value.routeRequests.length>1||!value.routeRequests.every(r=>record(r)
  &&exact(r,["fromItemId","toItemId","mode","departure","mapConsent"])
  &&[r.fromItemId,r.toItemId].every(id=>typeof id==="string"&&/^[A-Za-z0-9_-]{1,64}$/.test(id))&&r.fromItemId!==r.toItemId
  &&["walking","transit","driving"].includes(String(r.mode))&&r.departure==="now"&&r.mapConsent===true)))return null;
 const n=value.needs;
 if(!integer(n.partySize,1,20)||typeof n.currency!=="string"||!/^[A-Z]{3}$/.test(n.currency)||!(n.maxBudgetMinor===null||integer(n.maxBudgetMinor,0,100000000))
  ||![n.minTransferMinutes,n.baggageBufferMinutes,n.appointmentBufferMinutes].every(v=>integer(v,0,1440))||!(n.maxWalkingMinutes===null||integer(n.maxWalkingMinutes,0,1440)))return null;
 return structuredClone(value) as {proposalId:string;expectedProposalRevision:number;expectedBaseVersion:number;needs:ExplicitPlanNeeds;placeChoices:ExplicitPlaceChoice[];routeRequests?:ExplicitRouteRequest[]};
}
export async function nativePlanFeasibilityHTTP(request:NextRequest,tripId:string):Promise<Response>{
 if(request.method!=="POST"||!uuid(tripId)||request.headers.has("cookie")||request.headers.has("origin")||[...request.nextUrl.searchParams].length)return failure("INVALID_INPUT",400);
 const config=getNativeRuntimeConfig(request,"trip","trip");if(!config)return failure("PROVIDER_UNAVAILABLE");
 const scope=nativeRequestScope(request.signal);
 try{return await scope.run(async()=>{
  const raw=await scope.body(request,24000);let value:unknown;try{value=JSON.parse(raw??"null");}catch{return failure("INVALID_INPUT",400);}
  const input=feasibilityRequest(value);if(!input)return failure("INVALID_INPUT",400);
  const adapter=await createNativeTripDataAdapter(request,config,scope.fetch,scope.unavailable);scope.check();if(!adapter)return failure("UNAUTHENTICATED",401);
  const authority=await createOfflineNativeAuthority(request,config,scope.fetch,scope.unavailable),credentials=await verifyNativeCredentials(request,config,scope.fetch,scope.unavailable);scope.check();
  if(!authority||!credentials)return failure("UNAUTHENTICATED",401);
  const initial=await authority.read();if("error"in initial)return failure(initial.error,initial.error==="UNAUTHENTICATED"?401:503);
  const actor=await adapter.authenticated();if("error"in actor)return failure(actor.error,actor.error==="UNAUTHENTICATED"?401:503);
  const selected=await adapter.getPendingProposal(tripId,input.proposalId);if("error"in selected)return failure(selected.error,selected.error==="FORBIDDEN"?403:503);
  const p=selected.data.proposal;
  if(p.id!==input.proposalId||p.revision!==input.expectedProposalRevision||p.baseTripVersion!==input.expectedBaseVersion||p.stale||!p.after||!p.digest)return reply({kind:"unavailable",reason:"STALE_BASIS"});
  const basis={tripId,proposalId:p.id,proposalRevision:p.revision,baseVersion:p.baseTripVersion,proposalDigest:p.digest,after:p.after};
  const rpc=async(name:string,params:Record<string,unknown>)=>{const r=await credentials.client.rpc(name,params).abortSignal(scope.signal);scope.check();return {data:r.data as unknown,error:r.error};};
  const preferenceContext=planPreferenceContext(await adapter.getUserProfile(),input.needs);scope.check();
  const evidence=await readPlanPlaceEvidence(basis,input.placeChoices,rpc);
  let quotaAllowed=false;
  const routeEvidence=await readPlanRouteEvidence(basis,evidence.items,input.routeRequests??[],{
    env:process.env,signal:scope.signal,fetcher:scope.fetch,
    beforeRequest:async()=>{
      const fresh=await authority.read();scope.check();
      if("error"in fresh || fresh.data.sessionEpoch!==initial.data.sessionEpoch || fresh.data.subject!==initial.data.subject || fresh.data.sessionId!==initial.data.sessionId)return false;
      if(!quotaAllowed){const quota=await consumePlaceQuota(credentials.client,"places",scope.signal);scope.check();if(quota.kind!=="allowed")return false;quotaAllowed=true;}
      return true;
    },
  });
  const result={...assemblePlanFeasibility(basis,input.needs,evidence.items,routeEvidence.routes,[...evidence.bindings,...routeEvidence.bindings]),preferenceContext};
  // Current route observations with different departure times are references only.
  // Reservation and last-service timetable have no qualified installed reader.
  const requalified=await readPlanPlaceEvidence(basis,input.placeChoices,rpc);
  if(JSON.stringify(evidence.bindings)!==JSON.stringify(requalified.bindings))return reply({kind:"unavailable",reason:"STALE_EVIDENCE"});
  const currentPreferences=planPreferenceContext(await adapter.getUserProfile(),input.needs);scope.check();
  if(JSON.stringify(currentPreferences)!==JSON.stringify(preferenceContext))return reply({kind:"unavailable",reason:"STALE_EVIDENCE"});
  const final=await authority.read();if("error"in final)return failure(final.error,final.error==="UNAUTHENTICATED"?401:503);
  if(final.data.sessionEpoch!==initial.data.sessionEpoch||final.data.subject!==initial.data.subject||final.data.sessionId!==initial.data.sessionId)return failure("UNAUTHENTICATED",401);
  const current=await adapter.getPendingProposal(tripId,input.proposalId),still=await adapter.authenticated();scope.check();
  if("error"in still)return failure(still.error,still.error==="UNAUTHENTICATED"?401:503);
  if("error"in current||current.data.proposal.digest!==p.digest||current.data.proposal.revision!==p.revision||current.data.proposal.stale||still.data!==actor.data)return reply({kind:"unavailable",reason:"STALE_BASIS"});
  if(routeEvidence.bindings.some(b=>record(b)&&typeof b.expiresAt==="string"&&Date.parse(b.expiresAt)<=Date.now()))return reply({kind:"unavailable",reason:"STALE_EVIDENCE"});
  return reply(result);
 });}catch{return failure("PROVIDER_UNAVAILABLE");}finally{scope.dispose();}
}
