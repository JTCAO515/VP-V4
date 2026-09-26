import type { NextRequest } from "next/server";
import { nativeRequestScope } from "../identity/native-request.ts";
import { verifyNativeCredentials } from "../identity/native-credentials.ts";
import { isUuid } from "../identity/request-guards.ts";
import { getNativeAssistantConfig } from "./native-assistant-http.ts";
import { getNativeRuntimeConfig } from "../identity/native-config.ts";

const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
const fail=(code:string,status:number)=>reply({error:{code}},status);
const record=(v:unknown):v is Record<string,unknown>=>typeof v==="object"&&v!==null&&!Array.isArray(v);
const uuid=(v:unknown):v is string=>typeof v==="string"&&isUuid(v);
const exact=(v:Record<string,unknown>,keys:readonly string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));

function config(request:NextRequest){
  const base=getNativeAssistantConfig(request);
  const enabled=process.env.VISEPANDA_NATIVE_STAGING==="true"?process.env.VISEPANDA_NATIVE_STAGING_PLANNING
    :process.env.VISEPANDA_NATIVE_PRODUCTION==="true"?process.env.VISEPANDA_NATIVE_PRODUCTION_PLANNING
      :process.env.VISEPANDA_NATIVE_LOCAL_PLANNING;
  return enabled==="true"?base:null;
}

/** Strict mobile actor and current session; user cannot provide a worker scope,
 * provider endpoint, policy recipient, budget amount, or Trip write. */
async function handle(request:NextRequest,kind:"policy"|"task"){
  const planningConfig=config(request);
  // Withdrawal remains reachable after the planning producer flag is off.
  const base=kind==="policy"&&request.method==="DELETE"?getNativeRuntimeConfig(request,"session"):planningConfig;
  if(!base)return fail("PROVIDER_UNAVAILABLE",503);
  if(request.headers.has("cookie")||request.headers.has("origin")||[...request.nextUrl.searchParams].length)return fail("INVALID_INPUT",400);
  const scope=nativeRequestScope(request.signal,15000);
  try{
    const actor=await scope.run(()=>verifyNativeCredentials(request,base,scope.fetch,scope.unavailable));
    if(!actor)return fail("UNAUTHENTICATED",401);
    const session=await scope.run(()=>actor.client.rpc("native_session_v2",{p_action:"session"}).abortSignal(scope.signal));
    if(session.error||session.data?.subject!==actor.subject||session.data?.sessionId!==actor.sessionId)return fail("UNAUTHENTICATED",401);
    const rpc=async(name:string,params:Record<string,unknown>)=>scope.run(()=>actor.client.rpc(name,params).abortSignal(scope.signal));
    const expectedEnvironment=base.environment??"local_synthetic";
    const policy=async()=>{
      const result=await rpc("read_planning_policy_v1",{p_text_policy_id:planningConfig!.policyId});
      return !result.error&&record(result.data)&&result.data.kind==="planning_policy"
        &&result.data.environment===expectedEnvironment?result.data:null;
    };
    if(kind==="policy"&&request.method==="GET"){
      const current=await policy();
      return reply({version:1,data:current??{kind:"unavailable"}});
    }
    const raw=await scope.run(()=>scope.body(request,8192));let body:unknown;
    try{body=raw?JSON.parse(raw):null;}catch{return fail("INVALID_INPUT",400);}
    if(!record(body))return fail("INVALID_INPUT",400);
    let result;
    if(kind==="policy"&&request.method==="POST"){
      if(!exact(body,["policyId","noticeHash"])||!uuid(body.policyId)||typeof body.noticeHash!=="string"||!/^[a-f0-9]{64}$/.test(body.noticeHash))return fail("INVALID_INPUT",400);
      if((await policy())?.policyId!==body.policyId)return fail("DATA_POLICY_BLOCKED",403);
      result=await rpc("accept_planning_policy_v1",{p_policy_id:body.policyId,p_notice_hash:body.noticeHash});
    }else if(kind==="policy"&&request.method==="DELETE"){
      if(!exact(body,["policyId"])||!uuid(body.policyId))return fail("INVALID_INPUT",400);
      result=await rpc("withdraw_planning_policy_v1",{p_policy_id:body.policyId});
    }else if(kind==="task"&&request.method==="POST"){
      const keys=["conversationId","goalId","expectedGoalVersion","parentMessageId","messageId","messageKey","threadId","turnId","taskId","taskKey","planningPolicyId","locale","text","memoryBasis"];
      if(!exact(body,keys)||![body.conversationId,body.goalId,body.parentMessageId,body.messageId,body.messageKey,body.threadId,body.turnId,body.taskId,body.taskKey,body.planningPolicyId].every(uuid)
        ||!Number.isSafeInteger(body.expectedGoalVersion)||Number(body.expectedGoalVersion)<1
        ||!["zh","en"].includes(String(body.locale))||typeof body.text!=="string"||!body.text.trim()||body.text.length>4000
        ||!Array.isArray(body.memoryBasis)||body.memoryBasis.length>3||!body.memoryBasis.every(item=>record(item)&&exact(item,["id","revision"])&&uuid(item.id)&&Number.isSafeInteger(item.revision)&&Number(item.revision)>0))return fail("INVALID_INPUT",400);
      if((await policy())?.policyId!==body.planningPolicyId)return fail("DATA_POLICY_BLOCKED",403);
      result=await rpc("submit_planning_comparison_v1",{
        p_conversation_id:body.conversationId,p_goal_id:body.goalId,p_expected_goal_version:body.expectedGoalVersion,
        p_parent_message_id:body.parentMessageId,p_message_id:body.messageId,p_message_key:body.messageKey,
        p_thread_id:body.threadId,p_turn_id:body.turnId,p_task_id:body.taskId,p_task_key:body.taskKey,
        p_text_policy_id:planningConfig!.policyId,p_planning_policy_id:body.planningPolicyId,p_locale:body.locale,p_text:body.text,
        p_memory_basis:body.memoryBasis,
      });
    }else return fail("INVALID_INPUT",400);
    if(result.error){const message=String(result.error.message);
      return /UNAUTHENTICATED|SESSION_REPLACED/.test(message)?fail("UNAUTHENTICATED",401)
        :/DATA_POLICY_BLOCKED/.test(message)?fail("DATA_POLICY_BLOCKED",403)
          :/SERVICE_TASK_CONFLICT|STALE_BASIS|IDEMPOTENCY_KEY_REUSE/.test(message)?fail("SERVICE_TASK_CONFLICT",409)
            :fail("PROVIDER_UNAVAILABLE",503);}
    if(!record(result.data)||!["accepted","withdrawn"].includes(String(result.data.kind)))return fail("PROVIDER_UNAVAILABLE",503);
    return reply({version:1,...result.data},request.method==="POST"&&result.data.reused!==true?201:200);
  }catch{return fail("PROVIDER_UNAVAILABLE",503);}finally{scope.dispose();}
}
export const nativePlanningPolicyHTTP=(request:NextRequest)=>handle(request,"policy");
export const nativePlanningTaskHTTP=(request:NextRequest)=>handle(request,"task");
