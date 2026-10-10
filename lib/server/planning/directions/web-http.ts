import { directionsProposalMatches } from './source-match.ts';
import { NextResponse, type NextRequest } from 'next/server.js';
import { createWebRpc } from '../../identity/web-rpc.ts';
import { getSupabasePublicConfig } from '../../identity/user-data-adapter.ts';
import { isSameOriginMutation, isUuid } from '../../identity/request-guards.ts';
import { requestLifetime } from '../../knowledge/review/request-lifetime.ts';
import { getNativeTextConfig } from '../../turn/native-http.ts';
import { parseResultArtifactReadV2 } from '../../artifacts/result-v2-contract.ts';
import { validResultReference } from '../../trip/lifecycle/result-reference.ts';
import { directionsParams, directionsReceipt, exact, object, type DirectionsAction } from './protocol.ts';
import { directionsInputBytes } from './input-bytes.ts';
type Rpc=Pick<ReturnType<typeof createWebRpc>,'authenticate'|'call'>;
export type WebDirectionsAction='read'|'choose'|'save'|'edit'|'bind';
const failure=(code:string,status:number)=>({status,body:{error:{code}}});
const rpcFailure=(message:string)=>/UNAUTHENTICATED|SESSION_REPLACED/.test(message)?failure('UNAUTHENTICATED',401):/DATA_POLICY_BLOCKED|FORBIDDEN|CONSENT_REQUIRED/.test(message)?failure('DATA_POLICY_BLOCKED',403):/IDEMPOTENCY_KEY_REUSE/.test(message)?failure('IDEMPOTENCY_KEY_REUSE',409):/REVISION_CONFLICT/.test(message)?failure('REVISION_CONFLICT',409):/SERVICE_TASK_CONFLICT|STALE_BASIS|TRIP_DAY_CONFLICT/.test(message)?failure('SERVICE_TASK_CONFLICT',409):/INVALID_INPUT/.test(message)?failure('INVALID_INPUT',400):failure('PROVIDER_UNAVAILABLE',503);
export async function readWebDirectionsForTrip(tripId:string,rpc:Rpc){
 const actor=await rpc.authenticate();if(!actor)return failure('UNAUTHENTICATED',401);
 // Qualified identity-only helper candidate; canonical absence fails closed.
 const ref=await rpc.call('read_trip_directions_reference_v1',{p_trip_id:tripId});if(ref.error)return rpcFailure(ref.error.message);
 if(object(ref.data)&&exact(ref.data,['kind'])&&['empty','unavailable'].includes(String(ref.data.kind))){if(await rpc.authenticate()!==actor)return failure('UNAUTHENTICATED',401);return {status:200,body:{version:2,data:ref.data}};}
 if(!validResultReference(ref.data,'tripId',tripId)||ref.data.archiveHistorical===true)return failure('PROVIDER_UNAVAILABLE',503);
 const raw=await rpc.call('read_result_artifact_v2',{p_artifact_id:ref.data.artifactId,p_revision:ref.data.revision});if(raw.error)return rpcFailure(raw.error.message);
 const result=parseResultArtifactReadV2(raw.data);
 if(!result||result.content.schemaVersion!=='travel-directions/1'||!result.current||result.lifecycle!=='active'||result.source.tripId!==tripId||result.artifactId!==ref.data.artifactId||result.revision!==ref.data.revision)return failure('PROVIDER_UNAVAILABLE',503);
 if(await rpc.authenticate()!==actor)return failure('UNAUTHENTICATED',401);
 return {status:200,body:{version:2,data:result}};
}
export async function mutateWebDirectionsForTrip(tripId:string,action:Exclude<WebDirectionsAction,'read'>,inputBytes:string,policyId:string,rpc:Rpc){
 let input:unknown;try{if(new TextEncoder().encode(inputBytes).byteLength>16384)return failure('INVALID_INPUT',400);input=JSON.parse(inputBytes);}catch{return failure('INVALID_INPUT',400);}
 const params=directionsParams(action,input);if(!params||action==='bind'&&params.tripId!==tripId)return failure('INVALID_INPUT',400);
 const actor=await rpc.authenticate();if(!actor)return failure('UNAUTHENTICATED',401);
 const before=await rpc.call('read_result_artifact_v2',{p_artifact_id:params.artifactId,p_revision:params.expectedRevision});if(before.error)return rpcFailure(before.error.message);
 const current=parseResultArtifactReadV2(before.data);
 if(!current||current.historicalReadable!==true||current.lifecycle!=='active'||current.source.tripId!==tripId||current.content.schemaVersion!=='travel-directions/1')return failure('SERVICE_TASK_CONFLICT',409);
 const effect=await rpc.call('native_travel_directions_v1',{p_action:action satisfies DirectionsAction,p_policy_id:policyId,p_input_bytes:inputBytes});if(effect.error)return rpcFailure(effect.error.message);
 if(!directionsReceipt(action,effect.data,params)||!object(effect.data))return failure('PROVIDER_UNAVAILABLE',503);
 const after=await rpc.call('read_result_artifact_v2',{p_artifact_id:effect.data.artifactId,p_revision:effect.data.revision});if(after.error)return rpcFailure(after.error.message);
 const fresh=parseResultArtifactReadV2(after.data);
 if(!fresh||!fresh.current||fresh.lifecycle!=='active'||fresh.source.tripId!==tripId||fresh.content.schemaVersion!=='travel-directions/1'||fresh.artifactId!==params.artifactId||fresh.revision!==effect.data.revision)return failure('SERVICE_TASK_CONFLICT',409);
 if(action==='bind'){
  const proposal=await rpc.call('read_result_artifact_v2',{p_artifact_id:effect.data.proposalArtifactId,p_revision:effect.data.proposalArtifactRevision});if(proposal.error)return rpcFailure(proposal.error.message);
  if(!directionsProposalMatches(effect.data,after.data,proposal.data))return failure('SERVICE_TASK_CONFLICT',409);
 }
 if(await rpc.authenticate()!==actor)return failure('UNAUTHENTICATED',401);
 return {status:200,body:{version:1,...effect.data}};
}
/** Existing cookie actor/CSRF/8s lifetime. No Native bearer route is opened to Web. */
export async function webDirectionsHTTP(request:NextRequest,tripId:string,action:WebDirectionsAction){
 const response=(body:unknown,status:number)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}});
 if(request.headers.has('authorization'))return response({error:{code:'UNAUTHENTICATED'}},401);
 const read=action==='read';
 if(!isUuid(tripId)||request.method!==(read?'GET':'POST')||request.nextUrl.searchParams.size||['cross-site','same-site'].includes(request.headers.get('sec-fetch-site')??'')
  ||!read&&(!isSameOriginMutation(request)||request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')||read&&request.headers.has('origin')&&!isSameOriginMutation(request))return response({error:{code:'INVALID_INPUT'}},400);
 const config=getSupabasePublicConfig();if(!config)return response({error:{code:'PROVIDER_UNAVAILABLE'}},503);
 const lifetime=requestLifetime(request.signal);const rpc=createWebRpc(request,config,lifetime);
 try{
  if(read){const r=await readWebDirectionsForTrip(tripId,rpc);lifetime.check();return rpc.applyCookies(response(r.body,r.status));}
  const enabled=process.env.VISEPANDA_NATIVE_STAGING==='true'?process.env.VISEPANDA_NATIVE_STAGING_PLANNING:process.env.VISEPANDA_NATIVE_PRODUCTION==='true'?process.env.VISEPANDA_NATIVE_PRODUCTION_PLANNING:process.env.VISEPANDA_NATIVE_LOCAL_PLANNING;
  const policy=getNativeTextConfig(request);if(!policy||policy.url!==config.url||enabled!=='true')return response({error:{code:'PROVIDER_UNAVAILABLE'}},503);
  const raw=await directionsInputBytes(request,lifetime.run);if(raw===null)return response({error:{code:'INVALID_INPUT'}},400);
  const r=await mutateWebDirectionsForTrip(tripId,action,raw,policy.policyId,rpc);lifetime.check();return rpc.applyCookies(response(r.body,r.status));
 }catch{return response({error:{code:'PROVIDER_UNAVAILABLE'}},503);}finally{lifetime.dispose();}
}
