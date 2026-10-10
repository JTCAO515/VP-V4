import type { NextRequest } from 'next/server';
import { getNativeTextConfig } from '../../turn/native-http.ts';
import { verifyNativeCredentials } from '../../identity/native-credentials.ts';
import { nativeRequestScope } from '../../identity/native-request.ts';
import { isUuid } from '../../identity/request-guards.ts';
import { validResultReference } from '../../trip/lifecycle/result-reference.ts';
import { exact, object } from './protocol.ts';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const fail=(code:string,status:number)=>reply({error:{code}},status);
/** Identity-only. Caller must separately reopen the original exact result. */
export function validDirectionsTripReference(value:unknown,tripId:string):boolean{
 return object(value)&&exact(value,['kind'])&&['empty','unavailable'].includes(String(value.kind))
  ||validResultReference(value,'tripId',tripId)&&!Object.hasOwn(value,'archiveHistorical');
}
export async function nativeDirectionsTripReferenceHTTP(request:NextRequest):Promise<Response>{
 const entries=[...request.nextUrl.searchParams],trip=request.nextUrl.searchParams.get('tripId'),length=request.headers.get('content-length');
 if(request.method!=='GET'||request.body!==null||request.headers.has('transfer-encoding')||length!==null&&length!=='0'||request.headers.has('cookie')||request.headers.has('origin')||entries.length!==1||entries[0][0]!=='tripId'||!trip||!isUuid(trip))return fail('INVALID_INPUT',400);
 const id=trip.toLowerCase(),config=getNativeTextConfig(request);if(!config)return fail('RESULT_UNAVAILABLE',503);
 const scope=nativeRequestScope(request.signal);
 try{
  const actor=await scope.run(()=>verifyNativeCredentials(request,config,scope.fetch,scope.unavailable));if(!actor)return fail('UNAUTHENTICATED',401);
  const rpc=(name:string,p:Record<string,unknown>)=>scope.run(()=>actor.client.rpc(name,p).abortSignal(scope.signal));
  const session=async()=>{const r=await rpc('native_session_v2',{p_action:'session'});if(r.error)throw Error(r.error.message);if(!object(r.data)||r.data.subject!==actor.subject||r.data.sessionId!==actor.sessionId)throw Error('UNAUTHENTICATED');};
  await session();const r=await rpc('read_trip_directions_reference_v1',{p_trip_id:id});
  if(r.error)throw Error(r.error.message);if(!validDirectionsTripReference(r.data,id)){await session();return fail('RESULT_UNAVAILABLE',503);}
  await session();return reply({version:2,data:r.data});
 }catch(e){return /UNAUTHENTICATED|SESSION_REPLACED/.test(e instanceof Error?e.message:'')?fail('UNAUTHENTICATED',401):fail('RESULT_UNAVAILABLE',503);}finally{scope.dispose();}
}
