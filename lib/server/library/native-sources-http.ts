import {getNativeRuntimeConfig} from '../identity/native-config.ts';
import {verifyNativeCredentials} from '../identity/native-credentials.ts';
import {nativeRequestScope} from '../identity/native-request.ts';
import {isUuid} from '../identity/request-guards.ts';
import {nativeResultSearchV2HTTP,nativeResultV2HTTP} from '../artifacts/native-result-v2-http.ts';
import {translationHistoryHTTP} from '../media-translation/text/history-http.ts';
import {missingSource,projectLibraryMetadata,librarySourceCursor,parseLibrarySourceCursor,type LibrarySource} from './source-contract.ts';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const error=(code:string,status:number)=>reply({error:{code}},status);
const sources:readonly string[]=['materials','orders','translations','results'];
/** Existing domain reads only: no Storage/material/provider writer or raw upload transfer. */
export async function libraryNativeSourceHTTP(request:Request,exact=false):Promise<Response>{
 const url=new URL(request.url),source=url.searchParams.get('source'),id=url.searchParams.get('id'),revision=url.searchParams.get('revision'),query=url.searchParams.get('query'),cursor=url.searchParams.get('cursor');
 const allowed=exact?['source','id','revision']:['source','query','cursor'];
 if(request.method!=='GET'||request.headers.has('cookie')||request.headers.has('origin')||!source||!sources.includes(source)||[...url.searchParams.keys()].some(k=>!allowed.includes(k)||url.searchParams.getAll(k).length!==1)||query!==null&&query.length>120||cursor!==null&&cursor.length>4000||exact&&(!id||!isUuid(id)||source==='results'&&(!revision||!/^[1-9][0-9]{0,3}$/.test(revision)||Number(revision)>1000)||source==='translations'&&revision!==null))return error('INVALID_INPUT',400);
 const domainCursor=cursor===null?null:source==='results'||source==='translations'?parseLibrarySourceCursor(cursor,source,query):null;
 if(cursor!==null&&domainCursor===null)return error('INVALID_INPUT',400);
 const config=getNativeRuntimeConfig(request,'session');if(!config)return error('LIBRARY_UNAVAILABLE',503);const scope=nativeRequestScope(request.signal);
 try{
  const actor=await scope.run(()=>verifyNativeCredentials(request,config,scope.fetch,scope.unavailable));if(!actor)return error('UNAUTHENTICATED',401);
  const session=await scope.run(()=>actor.client.rpc('native_session_v2',{p_action:'session'}).abortSignal(scope.signal));
  if(session.error||!session.data||session.data.subject!==actor.subject||session.data.sessionId!==actor.sessionId)return error('UNAUTHENTICATED',401);
  if(source==='materials'||source==='orders')return reply(missingSource(source as LibrarySource));
  const target=new URL(request.url);target.search='';
  if(exact&&source==='results'){target.searchParams.set('artifactId',id!);target.searchParams.set('revision',revision!);}else if(!exact){if(query!==null)target.searchParams.set('query',query);if(domainCursor!==null)target.searchParams.set('cursor',domainCursor);}
  const forwarded=new Request(target,{method:'GET',headers:request.headers,signal:scope.signal});
  const domain=source==='results'?exact?await nativeResultV2HTTP(forwarded):await nativeResultSearchV2HTTP(forwarded):await translationHistoryHTTP(forwarded,exact?id!.toLowerCase():undefined);
  if(!domain.ok)return domain;
  const value:unknown=await domain.json();
  const current=await scope.run(()=>actor.client.rpc('native_session_v2',{p_action:'session'}).abortSignal(scope.signal));if(current.error||current.data?.subject!==actor.subject||current.data?.sessionId!==actor.sessionId)return error('UNAUTHENTICATED',401);
  if(exact){
   if(!value||typeof value!=='object'||Array.isArray(value))return error('LIBRARY_UNAVAILABLE',503);
   const v=value as Record<string,unknown>;
   if(source==='results'){const data=v.data;if(!data||typeof data!=='object'||Array.isArray(data)||(data as Record<string,unknown>).kind!=='result_artifact')return reply({version:1,kind:'unavailable'});}
   else if(v.kind!=='translation')return reply({version:1,kind:'unavailable'});
   return reply({version:1,kind:'library_item',source,id:id!.toLowerCase(),revision:source==='results'?Number(revision):null,projection:value});
  }
  const page=projectLibraryMetadata(source as 'translations'|'results',value);return page?reply({...page,nextCursor:page.nextCursor===null?null:librarySourceCursor(source as 'translations'|'results',query,page.nextCursor)}):error('LIBRARY_UNAVAILABLE',503);
 }catch{return error('LIBRARY_UNAVAILABLE',503);}finally{scope.dispose();}
}
