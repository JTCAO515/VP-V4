import { getNativeRuntimeConfig,nativeTargetAllowed,type NativeConfig } from '../../identity/native-config.ts';
import { verifyNativeCredentials } from '../../identity/native-credentials.ts';
import { nativeRequestScope } from '../../identity/native-request.ts';
import { isUuid } from '../../identity/request-guards.ts';
import { linkedTripCommand,linkedTripPlan,linkedTripReceipt } from './contract.ts';
const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store'}});
class LinkedHTTPError extends Error {}
const fail=(code:string)=>reply({error:{code}},['UNAUTHENTICATED','SESSION_REPLACED','REAUTHENTICATION_REQUIRED'].includes(code)?401:code==='FORBIDDEN'?403:code==='INVALID_INPUT'?400:['STALE_TRIP_VERSION','PLAN_EXPIRED','SCOPE_CHANGED','SCOPE_CONFLICT','SCOPE_NOT_COMPLETE','IDEMPOTENCY_KEY_REUSE','DELETION_ALREADY_REQUESTED'].includes(code)?409:503);
const mapped=(v:string)=>['UNAUTHENTICATED','SESSION_REPLACED','REAUTHENTICATION_REQUIRED','FORBIDDEN','INVALID_INPUT','STALE_TRIP_VERSION','PLAN_EXPIRED','SCOPE_CHANGED','SCOPE_CONFLICT','SCOPE_NOT_COMPLETE','IDEMPOTENCY_KEY_REUSE','DELETION_ALREADY_REQUESTED'].includes(v)?v:'UNAVAILABLE';
export async function linkedTripDeletionHTTP(request:Request,config:NativeConfig|null=getNativeRuntimeConfig(request,'trip','trip')) {
 if(!config||!nativeTargetAllowed(config,request))return fail('UNAVAILABLE');
 if(request.headers.has('cookie')||request.headers.has('origin')||!['GET','POST'].includes(request.method))return fail('INVALID_INPUT');
 const scope=nativeRequestScope(request.signal);
 try{
  const actor=await scope.run(()=>verifyNativeCredentials(request,config,scope.fetch,scope.unavailable));scope.check();if(!actor)return fail('UNAUTHENTICATED');
  const rpc=(name:string,input:Record<string,unknown>)=>scope.run(()=>actor.client.rpc(name,input).abortSignal(scope.signal));
  const session=async()=>{const r=await rpc('native_session_v2',{p_action:'session'});if(r.error)throw new LinkedHTTPError(mapped(r.error.message));const v=r.data;if(!v||typeof v!=='object'||typeof v.subject!=='string'||!isUuid(v.subject)||typeof v.sessionId!=='string'||!isUuid(v.sessionId)||!Number.isSafeInteger(v.mobileEpoch)||v.mobileEpoch<1)throw new LinkedHTTPError('UNAVAILABLE');if(v.subject!==actor.subject||v.sessionId!==actor.sessionId)throw new LinkedHTTPError('UNAUTHENTICATED');return v.mobileEpoch as number;};
  const epoch=await session(),params=new URL(request.url).searchParams;let action:string,input:Record<string,unknown>;
  if(request.method==='GET'){const id=params.get('requestId');if([...params].length!==1||!id||!isUuid(id)||id!==id.toLowerCase())return fail('INVALID_INPUT');action='read';input={requestId:id};}
  else{if([...params].length||request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return fail('INVALID_INPUT');let v:unknown;try{v=JSON.parse(await scope.body(request,192000)??'');}catch{return fail('INVALID_INPUT');}if(!linkedTripCommand(v))return fail('INVALID_INPUT');action=v.action as string;input=Object.fromEntries(Object.entries(v).filter(([k])=>k!=='action'));}
  const result=await rpc('privacy_linked_trip_delete_v1',{p_action:action,p_input:input});if(await session()!==epoch)throw new LinkedHTTPError('UNAUTHENTICATED');if(result.error)return fail(mapped(result.error.message));
  if(action==='preview'?!linkedTripPlan(result.data):!linkedTripReceipt(result.data))return fail('UNAVAILABLE');
  if(action==='preview'&&(result.data.tripId!==input.tripId||result.data.expectedVersion!==input.expectedVersion)||action!=='preview'&&result.data.requestId!==input.requestId)return fail('UNAVAILABLE');
  return reply(result.data,action==='confirm'&&result.data.state==='queued'?202:200);
 }catch(e){return fail(e instanceof LinkedHTTPError?e.message:'UNAVAILABLE');}finally{scope.dispose();}
}
