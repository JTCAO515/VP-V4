import {getNativeRuntimeConfig} from '../identity/native-config.ts';
import {verifyNativeCredentials} from '../identity/native-credentials.ts';
import {nativeRequestScope} from '../identity/native-request.ts';
import {isUuid} from '../identity/request-guards.ts';
import {parseResultArtifactReadV2,parseResultSearchPageV2} from './result-v2-contract.ts';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const failure=(code:string,status:number)=>reply({error:{code}},status);
const obj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:readonly string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
type Actor=NonNullable<Awaited<ReturnType<typeof verifyNativeCredentials>>>;
type Scope=ReturnType<typeof nativeRequestScope>;
async function authorized(request:Request,read:(actor:Actor,scope:Scope)=>Promise<Response>):Promise<Response>{
 if(request.headers.has('cookie')||request.headers.has('origin'))return failure('INVALID_INPUT',400);
 const config=getNativeRuntimeConfig(request,'session');if(!config)return failure('RESULT_UNAVAILABLE',503);
 const scope=nativeRequestScope(request.signal);
 try{
  const actor=await scope.run(()=>verifyNativeCredentials(request,config,scope.fetch,scope.unavailable));if(!actor)return failure('UNAUTHENTICATED',401);
  const session=await scope.run(()=>actor.client.rpc('native_session_v2',{p_action:'session'}).abortSignal(scope.signal));
  if(session.error)return failure(/UNAUTHENTICATED|SESSION_REPLACED/.test(session.error.message)?'UNAUTHENTICATED':'RESULT_UNAVAILABLE',/UNAUTHENTICATED|SESSION_REPLACED/.test(session.error.message)?401:503);
  if(!obj(session.data)||typeof session.data.subject!=='string'||!isUuid(session.data.subject)||typeof session.data.sessionId!=='string'||!isUuid(session.data.sessionId))return failure('RESULT_UNAVAILABLE',503);
  if(session.data.subject!==actor.subject||session.data.sessionId!==actor.sessionId)return failure('UNAUTHENTICATED',401);
  return await read(actor,scope);
 }catch{return failure('RESULT_UNAVAILABLE',503);}finally{scope.dispose();}
}
function queries(url:URL,allowed:readonly string[]){return [...url.searchParams.keys()].every(k=>allowed.includes(k)&&url.searchParams.getAll(k).length===1);}
export async function nativeResultV2HTTP(request:Request):Promise<Response>{
 const url=new URL(request.url),id=url.searchParams.get('artifactId'),r=url.searchParams.get('revision');
 if(request.method!=='GET'||!queries(url,['artifactId','revision'])||!id||!isUuid(id)||!r||!/^[1-9][0-9]{0,3}$/.test(r)||Number(r)>1000)return failure('INVALID_INPUT',400);
 return authorized(request,async(actor,scope)=>{const result=await scope.run(()=>actor.client.rpc('read_result_artifact_v2',{p_artifact_id:id.toLowerCase(),p_revision:Number(r)}).abortSignal(scope.signal));if(result.error)return failure('RESULT_UNAVAILABLE',503);
  if(obj(result.data)&&exact(result.data,['kind'])&&(result.data.kind==='empty'||result.data.kind==='unavailable'))return reply({version:2,data:result.data});
  const parsed=parseResultArtifactReadV2(result.data);if(!parsed||parsed.artifactId!==id.toLowerCase()||parsed.revision!==Number(r))return failure('RESULT_UNAVAILABLE',503);return reply({version:2,data:parsed});
 });
}
export async function nativeResultSearchV2HTTP(request:Request):Promise<Response>{
 const url=new URL(request.url),query=url.searchParams.get('query')??'',cursor=url.searchParams.get('cursor');
 if(request.method!=='GET'||!queries(url,['query','cursor'])||query.length>120||cursor!==null&&!isUuid(cursor))return failure('INVALID_INPUT',400);
 return authorized(request,async(actor,scope)=>{const result=await scope.run(()=>actor.client.rpc('search_result_artifacts_v2',{p_query:query,p_cursor:cursor?.toLowerCase()??null}).abortSignal(scope.signal));if(result.error)return failure('RESULT_UNAVAILABLE',503);
  if(obj(result.data)&&exact(result.data,['kind'])&&result.data.kind==='unavailable')return reply({version:2,data:result.data});const page=parseResultSearchPageV2(result.data);return page?reply({version:2,data:page}):failure('RESULT_UNAVAILABLE',503);
 });
}
export async function nativeResultReferenceV2HTTP(request:Request,kind:'task'|'trip'):Promise<Response>{
 const field=kind==='task'?'taskId':'tripId',url=new URL(request.url),id=url.searchParams.get(field);
 if(request.method!=='GET'||!queries(url,[field])||!id||!isUuid(id))return failure('INVALID_INPUT',400);
 return authorized(request,async(actor,scope)=>{const result=await scope.run(()=>actor.client.rpc(kind==='task'?'read_task_result_reference_v2':'read_trip_result_reference_v2',{[kind==='task'?'p_task_id':'p_trip_id']:id.toLowerCase()}).abortSignal(scope.signal));if(result.error)return failure('RESULT_UNAVAILABLE',503);
  if(obj(result.data)&&exact(result.data,['kind'])&&(result.data.kind==='empty'||result.data.kind==='unavailable'))return reply({version:2,data:result.data});const d=result.data;
  if(!obj(d)||!exact(d,['kind','artifactId','revision',field])||d.kind!=='result_reference'||d[field]!==id.toLowerCase()||typeof d.artifactId!=='string'||!isUuid(d.artifactId)||!Number.isSafeInteger(d.revision)||Number(d.revision)<1||Number(d.revision)>1000)return failure('RESULT_UNAVAILABLE',503);
  return reply({version:2,data:d});
 });
}
export async function nativeChooseDecisionV2HTTP(request:Request):Promise<Response>{
 if(request.method!=='POST'||request.headers.get('content-type')?.split(';')[0].trim()!=='application/json'||[...new URL(request.url).searchParams].length)return failure('INVALID_INPUT',400);
 return authorized(request,async(actor,scope)=>{
  let input:unknown;try{const body=await scope.body(request,2048);input=body===null?null:JSON.parse(body);}catch{return failure('INVALID_INPUT',400);}
  if(!obj(input)||!exact(input,['artifactId','expectedRevision','operationId','optionId'])||typeof input.artifactId!=='string'||!isUuid(input.artifactId)||typeof input.operationId!=='string'||!isUuid(input.operationId)||!Number.isSafeInteger(input.expectedRevision)||Number(input.expectedRevision)<1||Number(input.expectedRevision)>999||typeof input.optionId!=='string'||!/^[a-z0-9_-]{1,40}$/.test(input.optionId))return failure('INVALID_INPUT',400);
  const id=input.artifactId.toLowerCase(),op=input.operationId.toLowerCase(),rev=Number(input.expectedRevision),option=input.optionId;
  const result=await scope.run(()=>actor.client.rpc('choose_result_decision_v2',{p_artifact_id:id,p_expected_revision:rev,p_operation_id:op,p_option_id:option}).abortSignal(scope.signal));
  if(result.error)return failure(/REVISION_CONFLICT|IDEMPOTENCY_KEY_REUSE/.test(result.error.message)?'REVISION_CONFLICT':/INVALID_OPTION|INVALID_INPUT/.test(result.error.message)?'INVALID_INPUT':'RESULT_UNAVAILABLE',/REVISION_CONFLICT|IDEMPOTENCY_KEY_REUSE/.test(result.error.message)?409:/INVALID_OPTION|INVALID_INPUT/.test(result.error.message)?400:503);
  const d=result.data;if(obj(d)&&exact(d,['kind'])&&d.kind==='unavailable')return reply({version:2,data:d});
  if(!obj(d)||!exact(d,['kind','artifactId','revision','reused'])||d.kind!=='selected'||d.artifactId!==id||d.revision!==rev+1||typeof d.reused!=='boolean')return failure('RESULT_UNAVAILABLE',503);return reply({version:2,data:d});
 });
}
