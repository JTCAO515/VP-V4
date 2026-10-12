import type { NextRequest } from "next/server";
import { nativeRequestScope } from "../identity/native-request.ts";
import { verifyNativeCredentials } from "../identity/native-credentials.ts";
import { isLocalNativeTarget } from "../identity/native-config.ts";
import { isUuid } from "../identity/request-guards.ts";
import { getNativeAssistantConfig } from "./native-assistant-http.ts";
import { validExplicitTravelIntake } from "./native-travel-intake-http.ts";

const record=(v:unknown):v is Record<string,unknown>=>typeof v==="object"&&v!==null&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:readonly string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const uuid=(v:unknown):v is string=>typeof v==="string"&&isUuid(v);
const int=(v:unknown,min:number,max:number)=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
const digest=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{"Cache-Control":"private, no-store"}});
const fail=(code:string,status:number)=>reply({error:{code}},status);
const keys=["conversationId","goalId","expectedGoalVersion","parentMessageId","messageId","messageKey","threadId","turnId","taskId","taskKey","planningPolicyId","locale","text","memoryBasis","expectedIntakeMessageId","expectedSourceSequence","expectedIntakeRevision","expectedIntakeDigest","intake"] as const;

/** Local disposable test process gate. It is not a deployed feature or execution capability. */
function testConfig(request:NextRequest){
 if(process.env.VP_NATIVE_INTAKE_PLANNING_HTTP_TEST!=="1"||process.env.VISEPANDA_NATIVE_LOCAL_PLANNING!=="true"
  ||process.env.VERCEL_ENV!==undefined||process.env.VISEPANDA_NATIVE_STAGING==="true"||process.env.VISEPANDA_NATIVE_PRODUCTION==="true")return null;
 const base=getNativeAssistantConfig(request),expectedDB=process.env.VP_IDENTITY_SUPABASE_API_URL,expectedAPI=process.env.VP_NATIVE_INTAKE_PLANNING_HTTP_API;
 if(!base||base.environment!==undefined||!expectedDB||!expectedAPI||!/^vp-native-ask-[a-f0-9]{8}$/.test(process.env.VP_NATIVE_INTAKE_PLANNING_HTTP_PROJECT??""))return null;
 try{
  const db=new URL(base.url),wantedDB=new URL(expectedDB),api=new URL(expectedAPI),incoming=new URL(request.url);
  if(!isLocalNativeTarget(base.url)||!isLocalNativeTarget(expectedDB)||!isLocalNativeTarget(expectedAPI)||!isLocalNativeTarget(incoming.origin)
   ||incoming.username||incoming.password||incoming.hash||!db.port||!api.port||db.origin!==wantedDB.origin||incoming.protocol!==api.protocol||incoming.port!==api.port||incoming.pathname!=="/api/chat/native/v5/planning/intake-tasks")return null;
  return base;
 }catch{return null;}
}
export function planningIntakeParams(body:unknown,textPolicyId:string):Record<string,unknown>|null{
 if(!record(body)||!exact(body,keys)||![body.conversationId,body.goalId,body.parentMessageId,body.messageId,body.messageKey,body.threadId,body.turnId,body.taskId,body.taskKey,body.planningPolicyId,body.expectedIntakeMessageId].every(uuid)
  ||body.parentMessageId!==body.expectedIntakeMessageId||body.taskId===body.turnId||body.messageId===body.expectedIntakeMessageId
  ||!int(body.expectedGoalVersion,1,10000)||!int(body.expectedSourceSequence,1,999999)||!int(body.expectedIntakeRevision,1,999)||!digest(body.expectedIntakeDigest)
  ||typeof body.locale!=="string"||!["zh","en"].includes(body.locale)||typeof body.text!=="string"||!body.text.trim()||body.text.length>4000
  ||canonicalMemoryRefs(body.memoryBasis)===null||!validExplicitTravelIntake(body.intake)||!uuid(textPolicyId))return null;
 return {p_conversation_id:body.conversationId,p_goal_id:body.goalId,p_expected_goal_version:body.expectedGoalVersion,p_parent_message_id:body.parentMessageId,
  p_message_id:body.messageId,p_message_key:body.messageKey,p_thread_id:body.threadId,p_turn_id:body.turnId,p_task_id:body.taskId,p_task_key:body.taskKey,
  p_text_policy_id:textPolicyId,p_planning_policy_id:body.planningPolicyId,p_locale:body.locale,p_text:body.text,p_memory_basis:body.memoryBasis,
  p_expected_intake_message_id:body.expectedIntakeMessageId,p_expected_source_sequence:body.expectedSourceSequence,p_expected_intake_revision:body.expectedIntakeRevision,
  p_expected_intake_digest:body.expectedIntakeDigest,p_intake:body.intake};
}
const receiptKeys=["kind","reused","taskId","turnId","artifactId","conversationId","goalId","goalVersion","messageId","messageSequence","intakeRevision","current","readyForProvider","executionAvailable"];
export function validPlanningIntakeReceipt(data:unknown,params:Record<string,unknown>):data is Record<string,unknown>{
 if(!record(data)||typeof data.current!=="boolean"||!exact(data,data.current?[...receiptKeys,"intakeContextDigest","planningContextDigest"]:receiptKeys)
  ||data.kind!=="accepted"||typeof data.reused!=="boolean"||data.readyForProvider!==false||data.executionAvailable!==false
  ||![data.taskId,data.turnId,data.artifactId,data.conversationId,data.goalId,data.messageId].every(uuid)
  ||data.taskId!==params.p_task_id||data.turnId!==params.p_turn_id||data.conversationId!==params.p_conversation_id||data.goalId!==params.p_goal_id||data.messageId!==params.p_message_id
  ||data.goalVersion!==params.p_expected_goal_version||!int(data.messageSequence,Number(params.p_expected_source_sequence)+1,1000000)
  ||data.intakeRevision!==Number(params.p_expected_intake_revision)+1)return false;
 return !data.current||(digest(data.intakeContextDigest)&&digest(data.planningContextDigest)&&data.intakeContextDigest!==data.planningContextDigest&&data.intakeContextDigest!==params.p_expected_intake_digest);
}
/** SQL v2 Memory basis is a UUID/revision set; only this array is order-insensitive. */
function canonicalMemoryRefs(v:unknown):string|null{
 if(!Array.isArray(v)||v.length>3)return null;
 const refs:{id:string;revision:number}[]=[],seen=new Set<string>();
 for(const x of v){
  if(!record(x)||!exact(x,["id","revision"])||!uuid(x.id)||!int(x.revision,1,999999999999999))return null;
  const id=x.id.toLowerCase();if(seen.has(id))return null;seen.add(id);refs.push({id,revision:Number(x.revision)});
 }
 return JSON.stringify(refs.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0));
}
function canonical(v:unknown):string{return JSON.stringify(v,(_key,value)=>record(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);}
function qualifiedCurrentIntake(v:unknown):v is Record<string,unknown>{
 const keys=["kind","schemaVersion","conversationId","goalId","goalVersion","messageId","messageSequence","intakeRevision","sourceKind","intake","memoryBasis","contextDigest","readiness","readyForProvider"];
 if(!record(v)||!exact(v,keys)||v.kind!=="travel_intake"||v.schemaVersion!=="assistant-travel-current-basis/1"||![v.conversationId,v.goalId,v.messageId].every(uuid)
  ||!int(v.goalVersion,1,10000)||!int(v.messageSequence,1,1000000)||!int(v.intakeRevision,1,1000)||v.sourceKind!=="explicit_current_input"||v.readyForProvider!==false
  ||!digest(v.contextDigest)||!validExplicitTravelIntake(v.intake)||canonicalMemoryRefs(v.memoryBasis)===null||!record(v.readiness))return false;
 const intake=v.intake;
 return v.readiness.kind==="ready"?exact(v.readiness,["kind","scope","unknown"])&&v.readiness.scope==="transport_screening"&&Array.isArray(v.readiness.unknown)
  &&intake.city==="shanghai"&&intake.comparisonTarget==="area_transport"&&v.readiness.unknown.length===Object.values(intake).filter(x=>x===null).length&&new Set(v.readiness.unknown).size===v.readiness.unknown.length&&v.readiness.unknown.every(x=>intake[x as string]===null&&typeof x==="string"&&["city","comparisonTarget","durationDays","partySize","interests","pace","lodgingBudget","dates","mobilityConstraints"].includes(x))
 :v.readiness.kind==="waiting_user"?exact(v.readiness,["kind","questions"])&&Array.isArray(v.readiness.questions)&&v.readiness.questions.length>0&&new Set(v.readiness.questions).size===v.readiness.questions.length&&v.readiness.questions.every(x=>typeof x==="string"&&["city","comparison_target","lodging_budget"].includes(x))
 :v.readiness.kind==="unavailable"&&exact(v.readiness,["kind","reason"])&&["city_not_covered","budget_filter_not_integrated"].includes(String(v.readiness.reason));
}
function unavailable(v:unknown):"blocked"|"intake_unrecorded"|"stale_basis"|null{return record(v)&&exact(v,["kind","reason"])&&v.kind==="unavailable"&&typeof v.reason==="string"&&["blocked","intake_unrecorded","stale_basis"].includes(v.reason)?v.reason as "blocked"|"intake_unrecorded"|"stale_basis":null;}

function mappedError(message:string):[string,number]{
 return /UNAUTHENTICATED|SESSION_REPLACED/.test(message)?["UNAUTHENTICATED",401]:/DATA_POLICY_BLOCKED|FORBIDDEN|CONSENT_REQUIRED/.test(message)?["DATA_POLICY_BLOCKED",403]
 :message.includes("IDEMPOTENCY_KEY_REUSE")?["IDEMPOTENCY_KEY_REUSE",409]:message.includes("MEMORY_CONFLICT")?["MEMORY_CONFLICT",409]:/SERVICE_TASK_CONFLICT|STALE_BASIS/.test(message)?["SERVICE_TASK_CONFLICT",409]
 :message.includes("INVALID_INPUT")?["INVALID_INPUT",400]:["PROVIDER_UNAVAILABLE",503];
}
export async function nativePlanningIntakeHTTP(request:NextRequest){
 const base=testConfig(request);if(!base)return fail("PROVIDER_UNAVAILABLE",503);
 if(request.method!=="POST"||request.headers.has("cookie")||request.headers.has("origin")||[...request.nextUrl.searchParams].length)return fail("INVALID_INPUT",400);
 const scope=nativeRequestScope(request.signal,15000);
 try{
  const actor=await scope.run(()=>verifyNativeCredentials(request,base,scope.fetch,scope.unavailable));if(!actor)return fail("UNAUTHENTICATED",401);
  const rpc=(name:string,p:Record<string,unknown>)=>scope.run(()=>actor.client.rpc(name,p).abortSignal(scope.signal));
  const session=async()=>{const r=await rpc("native_session_v2",{p_action:"session"});if(r.error)throw Error(r.error.message);
   if(!record(r.data)||!uuid(r.data.subject)||!uuid(r.data.sessionId))throw Error("PROVIDER_UNAVAILABLE");
   if(r.data.subject!==actor.subject||r.data.sessionId!==actor.sessionId)throw Error("UNAUTHENTICATED");};
  await session();const failed=async(code:string,status:number)=>{await session();return fail(code,status);};
  let body:unknown;try{const raw=await scope.run(()=>scope.body(request,16000));body=raw?JSON.parse(raw):null;}catch{return await failed("INVALID_INPUT",400);}
  const params=planningIntakeParams(body,base.policyId);if(!params)return await failed("INVALID_INPUT",400);
  const policyError=async():Promise<[string,number]|null>=>{
   const policy=await rpc("read_planning_policy_v1",{p_text_policy_id:base.policyId});
   if(policy.error)return mappedError(policy.error.message);
   if(record(policy.data)&&exact(policy.data,["kind"])&&policy.data.kind==="unavailable")return ["DATA_POLICY_BLOCKED",403];
   if(!record(policy.data)||!exact(policy.data,["kind","policyId","environment","modelRecipient","modelProvider","placeProvider","noticeVersion","noticeHash","noticeZh","noticeEn","consentState"])
    ||![policy.data.modelRecipient,policy.data.noticeVersion,policy.data.noticeZh,policy.data.noticeEn].every(x=>typeof x==="string"&&x.length>0)
    ||policy.data.modelProvider!=="qwen"||policy.data.placeProvider!=="amap"||!digest(policy.data.noticeHash)||policy.data.kind!=="planning_policy"||!uuid(policy.data.policyId)||typeof policy.data.consentState!=="string"||!["not_accepted","accepted","withdrawn"].includes(policy.data.consentState)
    ||policy.data.environment!=="local_synthetic")return ["PROVIDER_UNAVAILABLE",503];
   return policy.data.policyId!==params.p_planning_policy_id||policy.data.consentState!=="accepted"?["DATA_POLICY_BLOCKED",403]:null;
  };
  const initialPolicy=await policyError();if(initialPolicy)return await failed(...initialPolicy);
  const result=await rpc("submit_planning_comparison_v2",params);
  if(result.error)return await failed(...mappedError(result.error.message));
  if(!validPlanningIntakeReceipt(result.data,params))return await failed("PROVIDER_UNAVAILABLE",503);
  const finalPolicy=await policyError();if(finalPolicy)return await failed(...finalPolicy);
  const intakeRead=await rpc("read_assistant_travel_intake_v1",{p_policy_id:base.policyId,p_conversation_id:params.p_conversation_id,p_goal_id:params.p_goal_id});
  if(intakeRead.error)return await failed(...mappedError(intakeRead.error.message));
  const missing=unavailable(intakeRead.data);if(missing==="blocked")return await failed("DATA_POLICY_BLOCKED",403);
  if(missing===null&&!qualifiedCurrentIntake(intakeRead.data))return await failed("PROVIDER_UNAVAILABLE",503);
  const current=result.data.current&&qualifiedCurrentIntake(intakeRead.data)&&intakeRead.data.conversationId===result.data.conversationId&&intakeRead.data.goalId===result.data.goalId
   &&intakeRead.data.goalVersion===result.data.goalVersion&&intakeRead.data.messageId===result.data.messageId&&intakeRead.data.messageSequence===result.data.messageSequence&&intakeRead.data.intakeRevision===result.data.intakeRevision
   &&intakeRead.data.contextDigest===result.data.intakeContextDigest&&canonical(intakeRead.data.intake)===canonical(params.p_intake)&&canonicalMemoryRefs(intakeRead.data.memoryBasis)===canonicalMemoryRefs(params.p_memory_basis);
  await session();
  const minimal=Object.fromEntries(receiptKeys.map(key=>[key,key==="current"?Boolean(current):result.data[key]]));
  return reply({version:2,...minimal,...(current?{intakeContextDigest:result.data.intakeContextDigest,planningContextDigest:result.data.planningContextDigest}:{})},result.data.reused?200:201);
 }catch(error){return fail(...mappedError(error instanceof Error?error.message:"PROVIDER_UNAVAILABLE"));}finally{scope.dispose();}
}
