import { getNativeRuntimeConfig } from "@/lib/server/identity/native-config";
import { nativeReadEnabled } from "@/lib/server/knowledge/native-read-flag";
import { verifyNativeCredentials } from "@/lib/server/identity/native-credentials";
import { nativeRequestScope } from "@/lib/server/identity/native-request";
import { knowledgeQuestionScope } from "@/lib/server/knowledge/claim/question";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
 const failure=(code:string,status:number)=>reply({error:{code}},status);
 const config=getNativeRuntimeConfig(request,"session");
 const allowed=nativeReadEnabled(config?.environment,process.env);
 if(!config||!allowed)return failure('KNOWLEDGE_DISABLED',503);
 if(request.headers.has('cookie')||request.headers.has('origin'))return failure('INVALID_INPUT',400);
 const input=knowledgeQuestionScope(new URL(request.url));if(!input)return failure('INVALID_INPUT',400);
 const scope=nativeRequestScope(request.signal);
 try{return await scope.run(async()=>{
  const credentials=await verifyNativeCredentials(request,config,scope.fetch,scope.unavailable);scope.check();
  if(!credentials)return failure('UNAUTHENTICATED',401);
  const session=await credentials.client.rpc('native_session_v2',{p_action:'session'}).abortSignal(scope.signal);scope.check();
  if(session.error){const code=session.error.message;return failure(code==='SESSION_REPLACED'||code==='UNAUTHENTICATED'?code:'KNOWLEDGE_UNAVAILABLE',code==='SESSION_REPLACED'||code==='UNAUTHENTICATED'?401:503);}
  if(session.data?.subject!==credentials.subject||session.data?.sessionId!==credentials.sessionId)return failure('UNAUTHENTICATED',401);
  const {data,error}=await credentials.client.rpc('knowledge_answer_v1',{p_input:input}).abortSignal(scope.signal);scope.check();
  if(error){const code=error.message;return failure(['UNAUTHENTICATED','SESSION_REPLACED','INVALID_INPUT','KNOWLEDGE_DISABLED'].includes(code)?code:'KNOWLEDGE_UNAVAILABLE',code==='UNAUTHENTICATED'||code==='SESSION_REPLACED'?401:code==='INVALID_INPUT'?400:503);}
  return reply({data});
 });}catch{return failure('KNOWLEDGE_UNAVAILABLE',503);}finally{scope.dispose();}
}
