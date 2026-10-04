import {NextResponse,type NextRequest} from "next/server.js";
import {createUserDataAdapter,createNativeTripDataAdapter} from "../identity/user-data-adapter.ts";
import {getNativeRuntimeConfig} from "../identity/native-config.ts";
import {nativeRequestScope} from "../identity/native-request.ts";
import {createOfflineNativeAuthority} from "../today/offline-native-authority.ts";
import {verifyNativeCredentials} from "../identity/native-credentials.ts";
import {opsRuntimeConfig} from "../knowledge/review/local-workspace.ts";
import {nativeReadEnabled} from "../knowledge/native-read-flag.ts";
import {isUuid,hasSameOrigin} from "../identity/request-guards.ts";
import {parseResultArtifactReadV2} from "../artifacts/result-v2-contract.ts";
import {record} from "./contract.ts";
import {parseReadinessActionsInput} from "./actions-input.ts";
import {readinessActionsService,type ReadinessRPC} from "./actions-service.ts";
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function readinessActionsHTTP(request:NextRequest,tripId:string,native:boolean){
 const failure=(code:string,status=503)=>reply({error:{code}},status);
 if(request.method!=="POST"||!isUuid(tripId)||request.nextUrl.searchParams.size
  ||(native?request.headers.has("cookie")||request.headers.has("origin"):request.headers.has("authorization")||!hasSameOrigin(request.headers.get("origin"),request.nextUrl)))return failure("INVALID_INPUT",400);
 const nativeConfig=native?getNativeRuntimeConfig(request,"trip","trip"):null;
 const config=native?nativeConfig:opsRuntimeConfig(request,{...process.env,OPS_LOCAL_REVIEW:process.env.KNOWLEDGE_LOCAL_READ,OPS_STAGING_REVIEW:process.env.KNOWLEDGE_STAGING_READ});
 if(!config||(native&&!nativeReadEnabled(nativeConfig?.environment,process.env)))return failure("READINESS_DISABLED");
 const scope=nativeRequestScope(request.signal);
 try{return await scope.run(async()=>{
  const raw=await scope.body(request,8192);let parsed:unknown;try{parsed=JSON.parse(raw??"null");}catch{return failure("INVALID_INPUT",400);}
  const input=parseReadinessActionsInput(parsed);if(!input)return failure("INVALID_INPUT",400);
  const web=native?null:createUserDataAdapter(request,config,scope.fetch),adapter=native?await createNativeTripDataAdapter(request,config,scope.fetch,scope.unavailable):web;
  if(!adapter)return failure("UNAUTHENTICATED",401);
  const actor=await adapter.authenticated();if("error"in actor)return failure(actor.error,401);
  const credentials=native?await verifyNativeCredentials(request,config,scope.fetch,scope.unavailable):null;
  const authority=native?await createOfflineNativeAuthority(request,config,scope.fetch,scope.unavailable):null;
  const initial=authority?await authority.read():null;
  if(native&&(!credentials||!initial))return failure("UNAUTHENTICATED",401);
  if(initial&&"error"in initial)return failure(initial.error,initial.error==="UNAUTHENTICATED"?401:503);
  const rpc:ReadinessRPC=async(name,params)=>{
   if(credentials){const r=await credentials.client.rpc(name,params).abortSignal(scope.signal);scope.check();return {data:r.data as unknown,error:r.error};}
   if(!web)throw Error("UNAUTHENTICATED");
   const r=await web.runGroundedAiAssist(call=>call(name,params));scope.check();
   if("error"in r)throw Error(r.error);return r.data;
  };
  const data=await readinessActionsService(input,tripId.toLowerCase(),rpc,async()=>{
   const reference=await rpc("read_task_result_reference_v2",{p_task_id:input.taskId});
   if(reference.error||!record(reference.data)||reference.data.kind!=="result_reference"
    ||reference.data.taskId!==input.taskId||typeof reference.data.artifactId!=="string"||!Number.isSafeInteger(reference.data.revision))return undefined;
   const read=await rpc("read_result_artifact_v2",{p_artifact_id:reference.data.artifactId,p_revision:reference.data.revision});
   const artifact=read.error?null:parseResultArtifactReadV2(read.data);
   if(!artifact||!artifact.current||artifact.source.taskId!==input.taskId||artifact.source.tripId!==tripId||artifact.source.tripVersion!==input.expectedTripVersion
    ||artifact.content.schemaVersion!=="change-proposal-reference/1")return undefined;
   const current=await adapter.getPendingProposal(tripId,artifact.content.proposalId);scope.check();
   if("error"in current)return undefined;
   const p=current.data.proposal;return p.stale||!p.digest||p.revision!==artifact.content.proposalRevision?undefined:{proposalId:p.id,proposalRevision:p.revision,proposalDigest:p.digest};
  });
  const active=await adapter.authenticated();scope.check();
  if("error"in active||active.data!==actor.data)return failure("UNAUTHENTICATED",401);
  if(authority&&initial&&!("error"in initial)){
   const final=await authority.read();scope.check();
   if("error"in final||final.data.subject!==initial.data.subject||final.data.sessionId!==initial.data.sessionId||final.data.sessionEpoch!==initial.data.sessionEpoch)return failure("UNAUTHENTICATED",401);
  }
  if(new TextEncoder().encode(JSON.stringify(data)).byteLength>256000)return failure("READINESS_UNAVAILABLE");
  const response=reply({data});
  return web?web.applyCookies(response):response;
 });}catch(error){
  const code=error instanceof Error?error.message:"";
  return ["STALE_TRIP_VERSION","STALE_READINESS_BASIS"].includes(code)?failure(code,409):code==="FORBIDDEN"?failure(code,403)
   :["UNAUTHENTICATED","SESSION_REPLACED"].includes(code)?failure("UNAUTHENTICATED",401):failure("READINESS_UNAVAILABLE");
 }finally{scope.dispose();}
}
