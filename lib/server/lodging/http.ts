import {NextResponse,type NextRequest} from "next/server.js";
import {createNativeTripDataAdapter,createUserDataAdapter} from "../identity/user-data-adapter.ts";
import {getNativeRuntimeConfig} from "../identity/native-config.ts";
import {nativeRequestScope} from "../identity/native-request.ts";
import {verifyNativeCredentials} from "../identity/native-credentials.ts";
import {createOfflineNativeAuthority} from "../today/offline-native-authority.ts";
import {opsRuntimeConfig} from "../knowledge/review/local-workspace.ts";
import {isUuid,hasSameOrigin} from "../identity/request-guards.ts";
import {parseResultArtifactReadV2} from "../artifacts/result-v2-contract.ts";
import type {TaskTravelPace} from "../memory/travel-pace.ts";
import {parseLodgingContextInput} from "./contract.ts";
import {buildLodgingContext,type LodgingComparison} from "./context.ts";
import {readLodgingClassifications} from "./classification-read.ts";
import {readLodgingIdentities} from "./identity-read.ts";
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
function pace(value:unknown,tripId:string):TaskTravelPace|null{
 if(!object(value)||Object.keys(value).sort().join()!=="purpose,schemaVersion,source,sourceOperationId,sourceRevision,travelPace,tripId"
  ||value.schemaVersion!=="task-travel-pace/1"||value.tripId!==tripId||value.purpose!=="local_trip_planning")return null;
 if(value.source==="profile"&&(!(typeof value.sourceRevision==="number"&&Number.isSafeInteger(value.sourceRevision)&&value.sourceRevision>0)
  ||typeof value.sourceOperationId!=="string"||!isUuid(value.sourceOperationId)))return null;
 if(!["profile","current_input","none"].includes(value.source as string)||!(value.travelPace===null||["relaxed","balanced","packed"].includes(value.travelPace as string)))return null;
 if(value.source==="profile"&&value.travelPace===null)return null;
 if(value.source!=="profile"&&(value.sourceRevision!==null||value.sourceOperationId!==null))return null;
 if(value.source==="none"&&value.travelPace!==null||value.source==="current_input"&&value.travelPace===null)return null;
 return value as TaskTravelPace;
}
export async function lodgingContextHTTP(request:NextRequest,tripId:string,native:boolean){
 const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store","Vary":native?"Authorization":"Cookie"}});
 const failure=(code:string,status=503)=>reply({error:{code}},status);
 if(request.method!=="POST"||!isUuid(tripId)||request.nextUrl.searchParams.size
  ||(native?request.headers.has("cookie")||request.headers.has("origin"):request.headers.has("authorization")||!hasSameOrigin(request.headers.get("origin"),request.nextUrl)))return failure("INVALID_INPUT",400);
 const config=native?getNativeRuntimeConfig(request,"trip","trip"):opsRuntimeConfig(request,{...process.env,OPS_LOCAL_REVIEW:process.env.KNOWLEDGE_LOCAL_READ,OPS_STAGING_REVIEW:process.env.KNOWLEDGE_STAGING_READ});
 if(!config)return failure("LODGING_CONTEXT_UNAVAILABLE");
 const scope=nativeRequestScope(request.signal);
 try{return await scope.run(async()=>{
  const raw=await scope.body(request,16384);let parsed:unknown;try{parsed=JSON.parse(raw??"null");}catch{return failure("INVALID_INPUT",400);}
  tripId=tripId.toLowerCase();
  const input=parseLodgingContextInput(parsed);if(!input)return failure("INVALID_INPUT",400);
  const web=native?null:createUserDataAdapter(request,config,scope.fetch),adapter=native?await createNativeTripDataAdapter(request,config,scope.fetch,scope.unavailable):web;
  if(!adapter)return failure("UNAUTHENTICATED",401);
  const actor=await adapter.authenticated();if("error"in actor)return failure(actor.error,401);
  const credentials=native?await verifyNativeCredentials(request,config,scope.fetch,scope.unavailable):null;
  const authority=native?await createOfflineNativeAuthority(request,config,scope.fetch,scope.unavailable):null,initial=authority?await authority.read():null;
  if(native&&(!credentials||!initial))return failure("UNAUTHENTICATED",401);
  if(initial&&"error"in initial)return failure(initial.error,initial.error==="UNAUTHENTICATED"?401:503);
  const rpc=async(name:string,params:Record<string,unknown>)=>{
   if(credentials){const result=await credentials.client.rpc(name,params).abortSignal(scope.signal);scope.check();return {data:result.data as unknown,error:result.error};}
   if(!web)throw Error("UNAUTHENTICATED");const result=await web.runGroundedAiAssist(call=>call(name,params));scope.check();
   if("error"in result)throw Error(result.error);return result.data;
  };
  const current=await adapter.getTrip(tripId);scope.check();
  if("error"in current)return failure(current.error,current.error==="FORBIDDEN"?403:503);
  if(current.data.trip.headVersion!==input.expectedTripVersion)return failure("STALE_TRIP_VERSION",409);
  const trip={version:current.data.trip.headVersion,title:current.data.trip.title,days:current.data.content.days};
  const readPace=async()=>{
   const p=input.profileChoice;
   if(p.currentPace!==null)return {schemaVersion:"task-travel-pace/1",tripId,travelPace:p.currentPace,source:"current_input",sourceRevision:null,sourceOperationId:null,purpose:"local_trip_planning"} as TaskTravelPace;
   if(!p.useSaved)return {schemaVersion:"task-travel-pace/1",tripId,travelPace:null,source:"none",sourceRevision:null,sourceOperationId:null,purpose:"local_trip_planning"} as TaskTravelPace;
   const result=await rpc("native_task_travel_pace_v1",{p_input:{tripId,currentPace:p.currentPace,useSaved:p.useSaved,...(p.expectedSourceRevision===null?{}:{expectedSourceRevision:p.expectedSourceRevision})}});
   if(result.error)return null;return pace(result.data,tripId);
  };
  const readComparison=async():Promise<LodgingComparison>=>{
   const ref=input.comparisonReference;if(!ref)return null;
   const result=await rpc("read_result_artifact_v2",{p_artifact_id:ref.artifactId,p_revision:ref.revision});
   const artifact=result.error?null:parseResultArtifactReadV2(result.data);
   if(!artifact||artifact.artifactId!==ref.artifactId.toLowerCase()||artifact.revision!==ref.revision||!artifact.current||artifact.source.tripId!==tripId||artifact.source.tripVersion!==input.expectedTripVersion
    ||artifact.content.schemaVersion!=="comparison/1")return null;
   return {artifactId:artifact.artifactId,revision:artifact.revision,taskId:artifact.source.taskId,goalId:artifact.source.goalId,goalVersion:artifact.source.goalVersion,content:artifact.content};
  };
  const readProposal=async()=>{
   const ref=input.proposalReference;if(!ref)return null;
   const selected=await adapter.getPendingProposal(tripId,ref.proposalId);scope.check();if("error"in selected)return null;
   const p=selected.data.proposal;return p.stale||p.revision!==ref.revision||p.digest!==ref.digest||p.baseTripVersion!==input.expectedTripVersion?null:ref;
  };
  const profile=await readPace(),identities=await readLodgingIdentities(input.candidates),comparison=await readComparison(),proposal=await readProposal(),classifications=await readLodgingClassifications(tripId,input,rpc);scope.check();
  const data=buildLodgingContext(tripId,trip,current.data.confirmationState,input,identities,profile,comparison,proposal,new Date(),classifications);
  const latest=await adapter.getTrip(tripId);scope.check();
  if("error"in latest||latest.data.trip.headVersion!==trip.version||JSON.stringify(latest.data.content.days)!==JSON.stringify(trip.days))return failure("STALE_TRIP_VERSION",409);
  if(JSON.stringify(await readPace())!==JSON.stringify(profile)||JSON.stringify(await readLodgingIdentities(input.candidates))!==JSON.stringify(identities)
   ||JSON.stringify(await readComparison())!==JSON.stringify(comparison)||JSON.stringify(await readProposal())!==JSON.stringify(proposal)||JSON.stringify(await readLodgingClassifications(tripId,input,rpc))!==JSON.stringify(classifications))return failure("STALE_LODGING_EVIDENCE",409);
  const finalActor=await adapter.authenticated();scope.check();if("error"in finalActor||finalActor.data!==actor.data)return failure("UNAUTHENTICATED",401);
  if(authority&&initial&&!("error"in initial)){
   const final=await authority.read();scope.check();
   if("error"in final||final.data.subject!==initial.data.subject||final.data.sessionId!==initial.data.sessionId||final.data.sessionEpoch!==initial.data.sessionEpoch)return failure("UNAUTHENTICATED",401);
  }
  const response=reply({data});return web?web.applyCookies(response):response;
 });}catch(error){return error instanceof Error&&error.message==="STALE_TRIP_VERSION"?failure("STALE_TRIP_VERSION",409):failure("LODGING_CONTEXT_UNAVAILABLE");}finally{scope.dispose();}
}
