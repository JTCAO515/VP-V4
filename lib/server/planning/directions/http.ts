import { directionsInputBytes } from './input-bytes.ts';
import type { NextRequest } from 'next/server';
import { nativeRequestScope } from '../../identity/native-request.ts';
import { verifyNativeCredentials } from '../../identity/native-credentials.ts';
import { getNativeAssistantConfig } from '../../turn/native-assistant-http.ts';
import { getNativeTextConfig } from '../../turn/native-http.ts';
import { directionsParams, directionsReceipt, object, unavailable, type DirectionsAction } from './protocol.ts';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const fail=(code:string,status:number)=>reply({error:{code}},status);
function error(message:string):[string,number]{
 return /UNAUTHENTICATED|SESSION_REPLACED/.test(message)?['UNAUTHENTICATED',401]:/DATA_POLICY_BLOCKED|FORBIDDEN|CONSENT_REQUIRED/.test(message)?['DATA_POLICY_BLOCKED',403]:message.includes('IDEMPOTENCY_KEY_REUSE')?['IDEMPOTENCY_KEY_REUSE',409]:message.includes('REVISION_CONFLICT')?['REVISION_CONFLICT',409]:/SERVICE_TASK_CONFLICT|STALE_BASIS|MEMORY_CONFLICT|PACE_CONFLICT|TRIP_DAY_CONFLICT/.test(message)?['SERVICE_TASK_CONFLICT',409]:message.includes('INVALID_INPUT')?['INVALID_INPUT',400]:['PROVIDER_UNAVAILABLE',503];
}
const canonical=(v:unknown):string=>JSON.stringify(v,(_k,x)=>object(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
/** New routes remain denied by existing config/RPC gates; no provider dispatch. */
export async function nativeDirectionsHTTP(request:NextRequest,action:DirectionsAction):Promise<Response>{
 const read=action==='basis'||action==='intake';
 if(request.method!==(read?'GET':'POST')||request.headers.has('cookie')||request.headers.has('origin')||!read&&request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return fail('INVALID_INPUT',400);
 const query=[...request.nextUrl.searchParams];
 if(read?query.length!==2||!query.every(([k])=>['conversationId','goalId'].includes(k))||new Set(query.map(([k])=>k)).size!==2:query.length!==0)return fail('INVALID_INPUT',400);
 const planningEnabled=process.env.VISEPANDA_NATIVE_STAGING==='true'?process.env.VISEPANDA_NATIVE_STAGING_PLANNING:process.env.VISEPANDA_NATIVE_PRODUCTION==='true'?process.env.VISEPANDA_NATIVE_PRODUCTION_PLANNING:process.env.VISEPANDA_NATIVE_LOCAL_PLANNING;
 const config=read?getNativeTextConfig(request):planningEnabled==='true'?getNativeAssistantConfig(request):null;if(!config)return fail('PROVIDER_UNAVAILABLE',503);
 const scope=nativeRequestScope(request.signal);
 try{
  const actor=await scope.run(()=>verifyNativeCredentials(request,config,scope.fetch,scope.unavailable));if(!actor)return fail('UNAUTHENTICATED',401);
  const rpc=(name:string,p:Record<string,unknown>)=>scope.run(()=>actor.client.rpc(name,p).abortSignal(scope.signal));
  const session=async()=>{const r=await rpc('native_session_v2',{p_action:'session'});if(r.error)throw Error(r.error.message);
   if(!object(r.data)||r.data.subject!==actor.subject||r.data.sessionId!==actor.sessionId)throw Error('UNAUTHENTICATED');};
  await session();
  const finish=async(data:unknown,status=200)=>{await session();return reply({version:1,...(object(data)?data:{data})},status);};
  const denied=async(code:string,status:number)=>{await session();return fail(code,status);};
  let input:unknown;let inputBytes:string;
  if(read){input=Object.fromEntries(query);inputBytes=canonical(input);}else{try{const raw=await directionsInputBytes(request,scope.run);if(raw===null)return await denied('INVALID_INPUT',400);inputBytes=raw;input=JSON.parse(raw);}catch{return await denied('INVALID_INPUT',400);}}
  const params=directionsParams(action,input);if(!params)return await denied('INVALID_INPUT',400);
  // Existing local-only saved Profile notice cannot grant server consumption.
  if(action==='submit'&&params.useSavedPace===true)return await denied('DATA_POLICY_BLOCKED',403);
  const call=()=>rpc('native_travel_directions_v1',{p_action:action,p_policy_id:config.policyId,p_input_bytes:inputBytes});
  const first=await call();if(first.error)return await denied(...error(first.error.message));
  if(read){
   if(unavailable(first.data))return first.data.reason==='blocked'?await denied('DATA_POLICY_BLOCKED',403):await finish({data:first.data});
   if(!directionsReceipt(action,first.data,params)||action==='basis'&&object(first.data)&&first.data.policyId!==config.policyId)return await denied('PROVIDER_UNAVAILABLE',503);
   const second=await call();if(second.error)return await denied(...error(second.error.message));
   if(unavailable(second.data))return second.data.reason==='blocked'?await denied('DATA_POLICY_BLOCKED',403):await finish({data:second.data});
   if(!directionsReceipt(action,second.data,params)||canonical(first.data)!==canonical(second.data))return await denied('SERVICE_TASK_CONFLICT',409);
   return await finish({data:second.data});
  }
  if(!directionsReceipt(action,first.data,params))return await denied('PROVIDER_UNAVAILABLE',503);
  // Canonical SQL validates result/source/session/policy around every effect;
  // receipt is identity only. Clients must separately reopen original result.
  if(!object(first.data))return await denied('PROVIDER_UNAVAILABLE',503);
  return await finish(first.data,action==='submit'&&!first.data.reused?201:200);
 }catch(e){return fail(...error(e instanceof Error?e.message:''));}finally{scope.dispose();}
}
