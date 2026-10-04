import {NextResponse,type NextRequest} from "next/server.js";
import {createUserDataAdapter} from "../identity/user-data-adapter.ts";
import {opsRuntimeConfig} from "../knowledge/review/local-workspace.ts";
import {isUuid,hasSameOrigin} from "../identity/request-guards.ts";
import {nativeRequestScope} from "../identity/native-request.ts";
import {parseResultArtifactReadV2} from "../artifacts/result-v2-contract.ts";
import {parseReadinessDeclarationRead} from "./declarations-contract.ts";
import {record} from "./contract.ts";
export async function readinessTaskReferenceHTTP(request:NextRequest,tripId:string){
 const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store","Vary":"Cookie"}});
 if(request.method!=="GET"||!isUuid(tripId)||request.nextUrl.searchParams.size||request.headers.has("authorization")
  ||!(request.headers.get("sec-fetch-site")==="same-origin"||hasSameOrigin(request.headers.get("origin"),request.nextUrl)))return reply({error:{code:"INVALID_INPUT"}},400);
 const config=opsRuntimeConfig(request,{...process.env,OPS_LOCAL_REVIEW:process.env.KNOWLEDGE_LOCAL_READ,OPS_STAGING_REVIEW:process.env.KNOWLEDGE_STAGING_READ});
 if(!config)return reply({error:{code:"READINESS_DISABLED"}},503);
 const scope=nativeRequestScope(request.signal);
 try{return await scope.run(async()=>{
  const adapter=createUserDataAdapter(request,config,scope.fetch);if(!adapter)return reply({error:{code:"UNAUTHENTICATED"}},401);
  const actor=await adapter.authenticated();
  if("error"in actor)return reply({error:{code:"UNAUTHENTICATED"}},401);
  const rpc=async(name:string,params:Record<string,unknown>)=>{
   const result=await adapter.runGroundedAiAssist(call=>call(name,params));scope.check();
   if("error"in result||result.data.error)throw Error("READINESS_UNAVAILABLE");return result.data.data;
  };
  const reference=await rpc("read_trip_result_reference_v2",{p_trip_id:tripId});
  if(!record(reference)||reference.kind!=="result_reference"||reference.tripId!==tripId||typeof reference.artifactId!=="string"||!isUuid(reference.artifactId)
   ||!Number.isSafeInteger(reference.revision))return reply({data:{kind:"unavailable"}});
  const artifact=parseResultArtifactReadV2(await rpc("read_result_artifact_v2",{p_artifact_id:reference.artifactId,p_revision:reference.revision}));
  // A visible historical artifact is a discovery pointer only; never eligibility.
  if(!artifact||artifact.source.tripId!==tripId||artifact.lifecycle!=="active")return reply({data:{kind:"unavailable"}});
  const current=parseReadinessDeclarationRead(await rpc("read_readiness_declarations_v1",{p_trip_id:tripId,p_task_id:artifact.source.taskId}));
  if(!current||current.basis.tripId!==tripId||current.basis.taskId!==artifact.source.taskId)return reply({data:{kind:"unavailable"}});
  const final=await adapter.authenticated();scope.check();
  if("error"in final||final.data!==actor.data)return reply({error:{code:"UNAUTHENTICATED"}},401);
  return adapter.applyCookies(reply({data:{kind:"readiness_task_reference/1",taskId:current.basis.taskId,tripId,tripVersion:current.basis.tripVersion,
   artifactId:artifact.artifactId,artifactRevision:artifact.revision}}));
 });}catch{return reply({error:{code:"READINESS_UNAVAILABLE"}},503);}finally{scope.dispose();}
}
