import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { nativeRequestScope } from "../identity/native-request.ts";
import { verifyNativeCredentials } from "../identity/native-credentials.ts";
import { isUuid } from "../identity/request-guards.ts";
import { FAILURE_TAXONOMY, type FailureCode } from "../contracts/errors/index.ts";
import { assembleGoalContext, ContextAssemblyError, type GoalContextGoal, type GoalContextMessage } from "../context/index.ts";
import { assembleSelectedSourceGoalContext, type SelectedGoalContextSource } from "../context/goal-context.ts";
import type { GoalMemoryProfile } from "../context/goal-context.ts";
import { getNativeTextConfig } from "./native-http.ts";
import { getNativeAssistantConfig } from "./native-assistant-http.ts";

type Row = Record<string, unknown>;
const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (code: FailureCode) => response({ error: { code } }, FAILURE_TAXONOMY[code].httpStatus);
const record = (value: unknown): value is Row => value !== null && typeof value === "object" && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === "string" && isUuid(value);

/** A read-only, non-dispatchable goal context manifest from current owner sources. */
export async function nativeAssistantContextHTTP(request: NextRequest) {
  const config = getNativeGoalContextConfig(request);
  if (!config) return failure("PROVIDER_UNAVAILABLE");
  if (request.method !== "POST" || request.headers.get("content-type")?.split(";")[0].trim() !== "application/json"
    || request.headers.has("cookie") || request.headers.has("origin")
    || [...request.nextUrl.searchParams].length) return failure("INVALID_INPUT");
  const scope = nativeRequestScope(request.signal, 15_000);
  try {
    const raw = await scope.run(() => scope.body(request, 4096));
    let input: unknown;
    try { input = raw ? JSON.parse(raw) : null; } catch { return failure("INVALID_INPUT"); }
    if (!record(input) || Object.keys(input).length !== 5
      || !["conversationId","goalId","messageId","expectedGoalVersion","memoryIds"].every(key => Object.hasOwn(input,key))
      || ![input.conversationId,input.goalId,input.messageId].every(uuid)
      || !Number.isSafeInteger(input.expectedGoalVersion) || Number(input.expectedGoalVersion) < 1
      || !Array.isArray(input.memoryIds) || input.memoryIds.length > 3
      || !input.memoryIds.every(uuid) || new Set(input.memoryIds).size !== input.memoryIds.length) return failure("INVALID_INPUT");
    const ids = input.memoryIds as string[];
    const actor = await scope.run(() => verifyNativeCredentials(request, config, scope.fetch, scope.unavailable));
    if (!actor) return failure("UNAUTHENTICATED");
    const rpc = async (name: string, params: Record<string,string|null>) => scope.run(() => actor.client.rpc(name, params).abortSignal(scope.signal));
    const session = async () => {
      const result = await rpc("native_session_v2", { p_action:"session" });
      return !result.error && record(result.data) && result.data.subject === actor.subject && result.data.sessionId === actor.sessionId;
    };
    if (!await session()) return failure("UNAUTHENTICATED");
    const conversation = async () => {
      const read = await rpc("read_assistant_conversation_v1", { p_policy_id:config.policyId, p_conversation_id:input.conversationId as string });
      if (read.error) throw new ContextReadError(mapError(read.error.message));
      if (!record(read.data) || read.data.kind !== "conversation" || read.data.conversationId !== input.conversationId
        || !Array.isArray(read.data.goals) || !Array.isArray(read.data.messages)) throw new ContextReadError("DATA_POLICY_BLOCKED");
      const goal = read.data.goals.find((item: unknown) => record(item) && item.goalId === input.goalId);
      const message = read.data.messages.find((item: unknown) => record(item) && item.messageId === input.messageId);
      if (!record(goal) || !record(message) || goal.scopeVersion !== input.expectedGoalVersion
        || message.goalId !== input.goalId || message.scopeVersion !== input.expectedGoalVersion
        || message.taskId !== null || !uuid(goal.goalId) || !uuid(message.messageId)
        || !Number.isSafeInteger(message.sequence) || typeof goal.text !== "string" || typeof message.text !== "string")
        throw new ContextReadError("SERVICE_TASK_CONFLICT");
      return { goal: { id:goal.goalId, scopeVersion:goal.scopeVersion as number, text:goal.text } as GoalContextGoal,
        message: { id:message.messageId, sequence:message.sequence as number, goalId:message.goalId as string,
          scopeVersion:message.scopeVersion as number, text:message.text, taskId:null } as GoalContextMessage };
    };
    const readMemories = async (): Promise<readonly GoalMemoryProfile[]> => {
      if (ids.length === 0) return [];
      const result = await scope.run(() => actor.client.rpc("read_retrievable_memory_profiles")
        .select("id,owner_id,source_receipt_id,consent_id,state,constraint_kind,summary,updated_at,revision")
        .in("id",ids).limit(4).abortSignal(scope.signal));
      if (result.error || !Array.isArray(result.data) || result.data.length !== ids.length)
        throw new ContextReadError("DATA_POLICY_BLOCKED");
      return result.data.map((value: unknown) => {
        if (!record(value) || !uuid(value.id) || value.owner_id !== actor.subject || !uuid(value.source_receipt_id)
          || !uuid(value.consent_id) || !["explicit","confirmed"].includes(String(value.state))
          || !["preference","hard_constraint"].includes(String(value.constraint_kind))
          || typeof value.summary !== "string" || value.summary.length < 1 || value.summary.length > 500
          || typeof value.updated_at !== "string" || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1)
          throw new ContextReadError("DATA_POLICY_BLOCKED");
        return { id:value.id, ownerId:actor.subject, sourceReceiptId:value.source_receipt_id,
          consentStatus:"granted" as const, state:value.state as "explicit" | "confirmed",
          constraintKind:value.constraint_kind as "preference" | "hard_constraint", summary:value.summary,
          updatedAt:value.updated_at, revision:value.revision as number, consentId:value.consent_id };
      });
    };
    const first = await conversation(), memories = await readMemories();
    const manifest = assembleGoalContext({ actorId:actor.subject, conversationId:input.conversationId as string,
      goal:first.goal, message:first.message, selectedMemoryIds:ids, memories });
    // No durable summary or provider dispatch is written here. Recheck the exact
    // source versions and mobile session before returning even a content-free manifest.
    const second = await conversation(), currentMemories = await readMemories();
    if (JSON.stringify(first) !== JSON.stringify(second) || fingerprint(memories) !== fingerprint(currentMemories))
      return failure("MEMORY_CONFLICT");
    if (!await session()) return failure("UNAUTHENTICATED");
    return response({version:5,kind:"context_manifest",...manifest});
  } catch (error) {
    if (error instanceof ContextReadError) return failure(error.code);
    if (error instanceof ContextAssemblyError) return failure("DATA_POLICY_BLOCKED");
    return failure("PROVIDER_UNAVAILABLE");
  } finally { scope.dispose(); }
}

export function getNativeGoalContextConfig(request: NextRequest) {
  const config = getNativeAssistantConfig(request);
  if (!config) return null;
  const enabled = process.env.VISEPANDA_NATIVE_STAGING === "true" ? process.env.VISEPANDA_NATIVE_STAGING_GOAL_CONTEXT
    : process.env.VISEPANDA_NATIVE_PRODUCTION === "true" ? process.env.VISEPANDA_NATIVE_PRODUCTION_GOAL_CONTEXT
    : process.env.VISEPANDA_NATIVE_LOCAL_GOAL_CONTEXT;
  return enabled === "true" ? config : null;
}

class ContextReadError extends Error {
  readonly code: FailureCode;
  constructor(code: FailureCode) { super(code); this.code = code; }
}
function fingerprint(rows: readonly GoalMemoryProfile[]): string {
  return JSON.stringify(rows.map(row => [row.id,row.revision,row.state,row.summary,row.sourceReceiptId,row.consentId]).sort((a,b) => String(a[0]).localeCompare(String(b[0]))));
}
function mapError(message: string): FailureCode {
  if (/UNAUTHENTICATED|SESSION_REPLACED/.test(message)) return "UNAUTHENTICATED";
  if (message.includes("DATA_POLICY_BLOCKED")) return "DATA_POLICY_BLOCKED";
  if (message.includes("SERVICE_TASK_CONFLICT")) return "SERVICE_TASK_CONFLICT";
  return "PROVIDER_UNAVAILABLE";
}

/** Additive v6: immutable selected references, fresh domain eligibility, first-party preview only. */
export async function nativeAssistantSelectedSourceContextHTTP(request:NextRequest){
 const config=getSelectedSourceContextConfig(request);if(!config)return failure("PROVIDER_UNAVAILABLE");
 if(request.method!=="POST"||request.headers.has("cookie")||request.headers.has("origin")||[...request.nextUrl.searchParams].length)return failure("INVALID_INPUT");
 const scope=nativeRequestScope(request.signal,15000);
 try{
  let input:unknown;try{const raw=await scope.run(()=>scope.body(request,4096));input=raw?JSON.parse(raw):null;}catch{return failure("INVALID_INPUT");}
  if(!record(input)||Object.keys(input).length!==5||!["conversationId","goalId","messageId","expectedGoalVersion","memoryIds"].every(k=>Object.hasOwn(input,k))||![input.conversationId,input.goalId,input.messageId].every(uuid)||!Number.isSafeInteger(input.expectedGoalVersion)||Number(input.expectedGoalVersion)<1||!Array.isArray(input.memoryIds)||input.memoryIds.length>3||!input.memoryIds.every(uuid)||new Set(input.memoryIds).size!==input.memoryIds.length)return failure("INVALID_INPUT");
  const actor=await scope.run(()=>verifyNativeCredentials(request,config,scope.fetch,scope.unavailable));if(!actor)return failure("UNAUTHENTICATED");
  const rpc=(name:string,p:Record<string,unknown>)=>scope.run(()=>actor.client.rpc(name,p).abortSignal(scope.signal));
  const session=async()=>{const r=await rpc("native_session_v2",{p_action:"session"});if(r.error)throw new ContextReadError(mapError(r.error.message));if(!record(r.data)||!uuid(r.data.subject)||!uuid(r.data.sessionId))throw new ContextReadError("PROVIDER_UNAVAILABLE");if(r.data.subject!==actor.subject||r.data.sessionId!==actor.sessionId)throw new ContextReadError("UNAUTHENTICATED");};
  await session();const p={p_policy_id:config.policyId,p_conversation_id:input.conversationId,p_goal_id:input.goalId,p_message_id:input.messageId,p_expected_goal_version:input.expectedGoalVersion};
  const read=async()=>{const r=await rpc("read_assistant_message_sources_v2",p);if(r.error)throw new ContextReadError(mapError(r.error.message));if(!record(r.data)||r.data.kind!=="selected_source_context"||r.data.conversationId!==input.conversationId||r.data.readyForProvider!==false||r.data.recipient!=="first_party"||!record(r.data.goal)||!record(r.data.message)||r.data.goal.id!==input.goalId||r.data.message.id!==input.messageId||r.data.goal.scopeVersion!==input.expectedGoalVersion||r.data.message.scopeVersion!==input.expectedGoalVersion)throw new ContextReadError("PROVIDER_UNAVAILABLE");return r.data;};
  const ids=input.memoryIds as string[];
  const memories=async():Promise<readonly GoalMemoryProfile[]>=>{if(!ids.length)return [];const r=await scope.run(()=>actor.client.rpc("read_retrievable_memory_profiles").select("id,owner_id,source_receipt_id,consent_id,state,constraint_kind,summary,updated_at,revision").in("id",ids).limit(4).abortSignal(scope.signal));if(r.error||!Array.isArray(r.data)||r.data.length!==ids.length)throw new ContextReadError("DATA_POLICY_BLOCKED");return r.data.map(v=>{if(!record(v)||!uuid(v.id)||v.owner_id!==actor.subject||!uuid(v.source_receipt_id)||!uuid(v.consent_id)||!["explicit","confirmed"].includes(String(v.state))||!["preference","hard_constraint"].includes(String(v.constraint_kind))||typeof v.summary!=="string"||v.summary.length<1||v.summary.length>500||typeof v.state!=="string"||typeof v.constraint_kind!=="string"||typeof v.updated_at!=="string"||!Number.isSafeInteger(v.revision)||Number(v.revision)<1)throw new ContextReadError("DATA_POLICY_BLOCKED");return {id:v.id,ownerId:actor.subject,sourceReceiptId:v.source_receipt_id,consentId:v.consent_id,consentStatus:"granted",state:v.state as "explicit"|"confirmed",constraintKind:v.constraint_kind as "preference"|"hard_constraint",summary:v.summary,updatedAt:v.updated_at,revision:Number(v.revision)};});};
  const first=await read(),mem=await memories();const sources=selectedDomainCandidates(first,actor.subject);
  const g=first.goal as Row,m=first.message as Row;if(typeof g.text!=="string"||typeof m.text!=="string"||!Number.isSafeInteger(m.sequence)||m.goalId!==g.id)throw new ContextReadError("PROVIDER_UNAVAILABLE");
  const manifest=assembleSelectedSourceGoalContext({actorId:actor.subject,conversationId:String(input.conversationId),goal:{id:String(g.id),scopeVersion:Number(g.scopeVersion),text:g.text},message:{id:String(m.id),goalId:String(m.goalId),scopeVersion:Number(m.scopeVersion),sequence:Number(m.sequence),text:m.text,taskId:null},selectedMemoryIds:ids,memories:mem},sources);
  const second=await read(),currentMem=await memories();if(JSON.stringify(first)!==JSON.stringify(second)||fingerprint(mem)!==fingerprint(currentMem))throw new ContextReadError("SERVICE_TASK_CONFLICT");await session();
  return response({version:6,kind:"context_manifest",...manifest});
 }catch(error){if(error instanceof ContextReadError)return failure(error.code);if(error instanceof ContextAssemblyError)return failure("DATA_POLICY_BLOCKED");return failure("PROVIDER_UNAVAILABLE");}finally{scope.dispose();}
}
function selectedDomainCandidates(data:Row,actor:string):SelectedGoalContextSource[]{
 if(!record(data.capturedSources)||!Array.isArray(data.evidence)||!Array.isArray(data.tasks)||!Array.isArray(data.history))throw new ContextReadError("PROVIDER_UNAVAILABLE");const out:SelectedGoalContextSource[]=[];
 if(data.trip!==null){if(!record(data.trip)||!uuid(data.trip.tripId)||!Number.isSafeInteger(data.trip.headVersion)||typeof data.trip.title!=="string")throw new ContextReadError("PROVIDER_UNAVAILABLE");out.push({id:`trip:${data.trip.tripId}`,kind:"trip",ownerId:actor,sourceVersion:`head:${data.trip.headVersion}`,text:`Owned Trip reference, not a new confirmation: ${data.trip.title}; revision ${data.trip.headVersion}.`});}
 if(data.artifact!==null){const a=data.artifact,ref=data.capturedSources.artifact;if(!record(a)||a.kind!=="result_artifact"||!uuid(a.artifactId)||!Number.isSafeInteger(a.revision)||a.historicalReadable!==true||!record(a.content)||!record(ref)||ref.artifactId!==a.artifactId||ref.revision!==a.revision||!record(a.source))throw new ContextReadError("PROVIDER_UNAVAILABLE");const previous=ref.purpose==="previous_result_reference";if(!previous&&a.current!==true)throw new ContextReadError("SERVICE_TASK_CONFLICT");
  const c=a.content,text=selectedResultExcerptV2(c);
  out.push({id:`artifact:${a.artifactId}`,kind:previous?"thread":"proposal",ownerId:actor,sourceVersion:`revision:${a.revision}:originGoal:${a.source.goalVersion}:purpose:${ref.purpose}`,text:`${previous?"Previous; no actions":"Selected; no actions"}. ${text}`,purpose:previous?"previous_result_reference":"current_context",artifactId:a.artifactId,revision:Number(a.revision),originGoalVersion:Number(a.source.goalVersion),current:previous?false:a.current===true,recipient:"first_party"});
 }
 for(const item of data.evidence){if(!record(item)||!record(item.reference)||!record(item.version)||typeof item.text!=="string"||item.recipient!=="first_party")throw new ContextReadError("PROVIDER_UNAVAILABLE");out.push({id:`evidence:${item.reference.factId}`,kind:"evidence",ownerId:null,sourceVersion:`assertion:${item.reference.assertionId}:revision:${item.reference.assertionRevision}:digest:${createHash("sha256").update(JSON.stringify(item.version)).digest("hex")}`,text:[item.text,JSON.stringify(item.conditions),JSON.stringify(item.exclusions)].join("\n"),recipient:"first_party"});}
 for(const item of data.tasks.slice(0,3)){if(!record(item)||!uuid(item.taskId)||!uuid(item.lastTurnId)||typeof item.status!=="string")throw new ContextReadError("PROVIDER_UNAVAILABLE");out.push({id:`task:${item.taskId}`,kind:"tool",ownerId:actor,sourceVersion:`scope:${item.scopeVersion}:turn:${item.lastTurnId}:status:${item.status}`,text:`Task ${item.taskId}: ${item.status}; not a new task or execution grant.`});}
 if(data.history.length){out.push({id:`history:${data.conversationId}`,kind:"thread",ownerId:actor,sourceVersion:JSON.stringify(data.history.map(item=>record(item)?[item.messageId,item.sequence,item.scopeVersion]:null)),text:"Owned prior message summary (not Memory authority): "+data.history.map(item=>record(item)?`${item.relationship}: ${String(item.text).slice(0,80)}`:"").join("; ")});}
 return out;
}

function getSelectedSourceContextConfig(request:NextRequest){
 const config=getNativeTextConfig(request);if(!config)return null;
 const enabled=process.env.VISEPANDA_NATIVE_STAGING==="true"?process.env.VISEPANDA_NATIVE_STAGING_GOAL_CONTEXT:process.env.VISEPANDA_NATIVE_PRODUCTION==="true"?process.env.VISEPANDA_NATIVE_PRODUCTION_GOAL_CONTEXT:process.env.VISEPANDA_NATIVE_LOCAL_GOAL_CONTEXT;
 return enabled==="true"?config:null;
}

/** Domain-qualified inert content only. Typed short excerpts are not action adapters. */
export function selectedResultExcerptV2(content:Record<string,unknown>):string{
 const short=(v:unknown,n=18)=>typeof v==="string"?Array.from(v).slice(0,n).join(""):"";
 switch(content.schemaVersion){
  case "comparison/1": return [short(content.title,12),short(content.summary,12)].join("; ");
  case "journey-draft/1": {
   if(!record(content.draft)||!Array.isArray(content.draft.days))throw new ContextReadError("PROVIDER_UNAVAILABLE");
   const first=content.draft.days.find(record);return `Draft ${short(content.title,12)}: ${content.draft.days.length} days; ${first?short(first.date,10):"undated"}. Not a saved Trip.`;
  }
  case "decision/1": {
   if(!record(content.comparisonRef)||!["pending","chosen"].includes(String(content.state)))throw new ContextReadError("PROVIDER_UNAVAILABLE");
   return `Decision ${short(content.title,10)}: ${content.state}${content.state==="chosen"?` ${short(content.chosenOptionId,12)}`:""}; comparison r${content.comparisonRef.revision}. No Trip confirmation.`;
  }
  case "practical/1": {
   if(content.kind!=="translation"||typeof content.translation!=="string"||typeof content.backTranslation!=="string")throw new ContextReadError("PROVIDER_UNAVAILABLE");
   return `Translation ${content.sourceLocale}→${content.targetLocale}: ${short(content.translation,16)}; back: ${short(content.backTranslation,12)}.`;
  }
  case "change-proposal-reference/1": return `Unconfirmed Trip proposal r${content.proposalRevision}; ${short(content.title,12)}. No confirm action.`;
  default: throw new ContextReadError("PROVIDER_UNAVAILABLE");
 }
}
