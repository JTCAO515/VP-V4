import {NextResponse,type NextRequest} from "next/server.js";
import {createUserDataAdapter,createNativeTripDataAdapter} from "../identity/user-data-adapter.ts";
import {opsRuntimeConfig} from "../knowledge/review/local-workspace.ts";
import {getNativeRuntimeConfig} from "../identity/native-config.ts";
import {verifyNativeCredentials} from "../identity/native-credentials.ts";
import {createOfflineNativeAuthority} from "../today/offline-native-authority.ts";
import {getNativeTextConfig} from "../turn/native-http.ts";
import {isUuid,hasSameOrigin} from "../identity/request-guards.ts";
import {nativeRequestScope} from "../identity/native-request.ts";
import {selectReadinessTasks} from "./task-selection.ts";
import type {ReadinessRPC} from "./actions-service.ts";
export async function readinessTaskReferenceHTTP(request:NextRequest,tripId:string,native=false){
 const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store","Vary":native?"Authorization":"Cookie"}});
 if(request.method!=="GET"||!isUuid(tripId)||request.nextUrl.searchParams.size
  ||(native?request.headers.has("cookie")||request.headers.has("origin"):request.headers.has("authorization")
   ||!(request.headers.get("sec-fetch-site")==="same-origin"||hasSameOrigin(request.headers.get("origin"),request.nextUrl))))return reply({error:{code:"INVALID_INPUT"}},400);
 const config=native?getNativeRuntimeConfig(request,"trip","trip"):opsRuntimeConfig(request,{...process.env,OPS_LOCAL_REVIEW:process.env.KNOWLEDGE_LOCAL_READ,OPS_STAGING_REVIEW:process.env.KNOWLEDGE_STAGING_READ});
 if(!config)return reply({error:{code:"READINESS_DISABLED"}},503);
 const scope=nativeRequestScope(request.signal);
 try{return await scope.run(async()=>{
  const web=native?null:createUserDataAdapter(request,config,scope.fetch),adapter=native?await createNativeTripDataAdapter(request,config,scope.fetch,scope.unavailable):web;
  if(!adapter)return reply({error:{code:"UNAUTHENTICATED"}},401);
  const actor=await adapter.authenticated();if("error"in actor)return reply({error:{code:"UNAUTHENTICATED"}},401);
  const credentials=native?await verifyNativeCredentials(request,config,scope.fetch,scope.unavailable):null;
  const authority=native?await createOfflineNativeAuthority(request,config,scope.fetch,scope.unavailable):null,initial=authority?await authority.read():null;
  if(native&&(!credentials||!initial))return reply({error:{code:"UNAUTHENTICATED"}},401);
  if(initial&&"error"in initial)return reply({error:{code:initial.error}},initial.error==="UNAUTHENTICATED"?401:503);
  const rpc:ReadinessRPC=async(name,params)=>{
   if(credentials){const result=await credentials.client.rpc(name,params).abortSignal(scope.signal);scope.check();return {data:result.data as unknown,error:result.error};}
   if(!web)throw Error("UNAUTHENTICATED");
   const result=await web.runGroundedAiAssist(call=>call(name,params));scope.check();if("error"in result)throw Error(result.error);return result.data;
  };
  const data=await selectReadinessTasks(tripId,getNativeTextConfig(request)?.policyId??null,rpc);
  const final=await adapter.authenticated();scope.check();
  if("error"in final||final.data!==actor.data)return reply({error:{code:"UNAUTHENTICATED"}},401);
  if(authority&&initial&&!("error"in initial)){
   const active=await authority.read();scope.check();
   if("error"in active||active.data.sessionEpoch!==initial.data.sessionEpoch||active.data.sessionId!==initial.data.sessionId||active.data.subject!==initial.data.subject)return reply({error:{code:"UNAUTHENTICATED"}},401);
  }
  const response=reply({data});return web?web.applyCookies(response):response;
 });}catch{return reply({error:{code:"READINESS_UNAVAILABLE"}},503);}finally{scope.dispose();}
}
