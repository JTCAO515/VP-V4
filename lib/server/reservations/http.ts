import {NextResponse,type NextRequest} from "next/server.js";
import {createNativeTripDataAdapter,createUserDataAdapter} from "../identity/user-data-adapter.ts";
import {getNativeRuntimeConfig} from "../identity/native-config.ts";
import {nativeRequestScope} from "../identity/native-request.ts";
import {verifyNativeCredentials} from "../identity/native-credentials.ts";
import {createOfflineNativeAuthority} from "../today/offline-native-authority.ts";
import {opsRuntimeConfig} from "../knowledge/review/local-workspace.ts";
import {isUuid,hasSameOrigin} from "../identity/request-guards.ts";
import {parseReservationHTTPInput} from "./http-input.ts";
import {confirmReservationReference,readReservationOperation,readReservationReferences,reservationPlanningConstraint,type ReservationRPC} from "./service.ts";
import {previewReservationReference} from "./preview.ts";
export async function reservationReturnHTTP(request:NextRequest,tripId:string,native:boolean){
 const response=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store","Vary":native?"Authorization":"Cookie"}});
 const fail=(code:string,status=503)=>response({error:{code}},status);
 if(request.method!=="POST"||!isUuid(tripId)||request.nextUrl.searchParams.size
  ||(native?request.headers.has("cookie")||request.headers.has("origin"):request.headers.has("authorization")||!hasSameOrigin(request.headers.get("origin"),request.nextUrl)))return fail("INVALID_INPUT",400);
 const config=native?getNativeRuntimeConfig(request,"trip","trip"):opsRuntimeConfig(request,{...process.env,OPS_LOCAL_REVIEW:process.env.KNOWLEDGE_LOCAL_READ,OPS_STAGING_REVIEW:process.env.KNOWLEDGE_STAGING_READ});
 if(!config)return fail("RESERVATION_UNAVAILABLE");
 const scope=nativeRequestScope(request.signal);
 try{return await scope.run(async()=>{
  const raw=await scope.body(request,16384);let value:unknown;try{value=JSON.parse(raw??"null");}catch{return fail("INVALID_INPUT",400);}
  const input=parseReservationHTTPInput(value);if(!input)return fail("INVALID_INPUT",400);tripId=tripId.toLowerCase();
  const web=native?null:createUserDataAdapter(request,config,scope.fetch),adapter=native?await createNativeTripDataAdapter(request,config,scope.fetch,scope.unavailable):web;
  if(!adapter)return fail("UNAUTHENTICATED",401);
  const actor=await adapter.authenticated();if("error"in actor)return fail("UNAUTHENTICATED",401);
  const credentials=native?await verifyNativeCredentials(request,config,scope.fetch,scope.unavailable):null;
  const authority=native?await createOfflineNativeAuthority(request,config,scope.fetch,scope.unavailable):null,initial=authority?await authority.read():null;
  if(native&&(!credentials||!initial))return fail("UNAUTHENTICATED",401);
  if(initial&&"error"in initial)return fail(initial.error,initial.error==="UNAUTHENTICATED"?401:503);
  const rpc:ReservationRPC=async(name,params)=>{
   if(credentials){const r=await credentials.client.rpc(name,params).abortSignal(scope.signal);scope.check();return {data:r.data as unknown,error:r.error};}
   if(!web)throw Error("UNAUTHENTICATED");const r=await web.runGroundedAiAssist(call=>call(name,params));scope.check();
   if("error"in r)throw Error(r.error);return r.data;
  };
  const before=await adapter.getTrip(tripId);scope.check();if("error"in before)return fail(before.error,before.error==="FORBIDDEN"?403:503);
  const version=before.data.trip.headVersion;
  let data:unknown;
  if(input.operation==="read"){
   if(input.expectedTripVersion!==version)return fail("STALE_TRIP_VERSION",409);
   const page=await readReservationReferences(tripId,version,input.afterReferenceId,input.limit,rpc);
   data={...page,planningConstraints:page.items.map(reservationPlanningConstraint)};
  }else if(input.operation==="receipt"){
   const receipt=await readReservationOperation(tripId,input.operationId,rpc);
   if(receipt.current.tripVersion!==version)return fail("RESERVATION_RECEIPT_UNKNOWN");
   data=receipt;
  }
  else{
   if(input.input.expectedTripVersion!==version)return fail("STALE_TRIP_VERSION",409);
   if(input.operation==="confirm")data=await confirmReservationReference(tripId,input.input,rpc);
   else{
    const refs=[];let after:string|null=null,complete=false;
    for(let page=0;page<5;page++){
     const batch=await readReservationReferences(tripId,version,after,20,rpc);refs.push(...batch.items);
     if(!batch.hasMore){complete=true;break;}after=batch.nextCursor;
    }
    if(!complete)return fail("RESERVATION_SCOPE_INCOMPLETE");
    data=previewReservationReference(tripId,version,input.input,refs);
   }
  }
  const latest=await adapter.getTrip(tripId);scope.check();
  if("error"in latest||latest.data.trip.headVersion!==version)return fail(input.operation==="confirm"?"RESERVATION_RECEIPT_UNKNOWN":"STALE_TRIP_VERSION",input.operation==="confirm"?503:409);
  const active=await adapter.authenticated();scope.check();if("error"in active||active.data!==actor.data)return fail("UNAUTHENTICATED",401);
  if(authority&&initial&&!("error"in initial)){
   const final=await authority.read();scope.check();
   if("error"in final||final.data.subject!==initial.data.subject||final.data.sessionId!==initial.data.sessionId||final.data.sessionEpoch!==initial.data.sessionEpoch)return fail("UNAUTHENTICATED",401);
  }
  const reply=response({data});return web?web.applyCookies(reply):reply;
 });}catch(error){
  const code=error instanceof Error?error.message:"";
  return code==="INVALID_INPUT"?fail(code,400):["RESERVATION_CONFLICT","STALE_TRIP_VERSION"].includes(code)?fail(code,409)
   :["UNAUTHENTICATED","SESSION_REPLACED"].includes(code)?fail("UNAUTHENTICATED",401):code==="RESERVATION_SOURCE_UNAVAILABLE"?fail(code,422)
    :fail(["RESERVATION_RECEIPT_UNKNOWN","RESERVATION_UNAVAILABLE"].includes(code)?code:"RESERVATION_UNAVAILABLE");
 }finally{scope.dispose();}
}
