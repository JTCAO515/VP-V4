import type { NextRequest } from "next/server";
import { nativeRequestScope } from "../identity/native-request.ts";
import { verifyNativeCredentials } from "../identity/native-credentials.ts";
import { isUuid } from "../identity/request-guards.ts";
import { getNativeTextConfig } from "./native-http.ts";
import { getNativeAssistantConfig } from "./native-assistant-http.ts";
import { FAILURE_TAXONOMY, type FailureCode } from "../contracts/errors/index.ts";

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === "string" && isUuid(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k));
const integer = (v: unknown, min: number, max: number) => Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
const text = (v: unknown,max: number) => typeof v === "string" && v.length > 0 && v.length <= max && v === v.trim();
const digest = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const reply = (v: unknown,status=200) => Response.json(v,{status,headers:{"Cache-Control":"private, no-store"}});
const fail = (code: FailureCode) => reply({error:{code}},FAILURE_TAXONOMY[code].httpStatus);
const errorCode = (message: string): FailureCode => /UNAUTHENTICATED|SESSION_REPLACED/.test(message) ? "UNAUTHENTICATED"
 : message.includes("INVALID_INPUT") ? "INVALID_INPUT" : message.includes("IDEMPOTENCY_KEY_REUSE") ? "IDEMPOTENCY_KEY_REUSE"
 : message.includes("MEMORY_CONFLICT") ? "MEMORY_CONFLICT" : message.includes("SERVICE_TASK_CONFLICT") ? "SERVICE_TASK_CONFLICT"
 : /FORBIDDEN|DATA_POLICY_BLOCKED/.test(message) ? "DATA_POLICY_BLOCKED" : "PROVIDER_UNAVAILABLE";

export function validExplicitTravelIntake(v: unknown): v is Record<string, unknown> {
 if(!record(v)||!exact(v,["schemaVersion","city","comparisonTarget","durationDays","partySize","interests","pace","lodgingBudget","dates","mobilityConstraints"])||v.schemaVersion!=="stay-area-intake/1")return false;
 if(v.city!==null&&!text(v.city,80)||v.comparisonTarget!==null&&(typeof v.comparisonTarget!=="string"||!["area_transport","lodging_budget_filter"].includes(v.comparisonTarget))
  ||v.pace!==null&&(typeof v.pace!=="string"||!["relaxed","balanced","fast"].includes(v.pace))||v.durationDays!==null&&!integer(v.durationDays,1,30)||v.partySize!==null&&!integer(v.partySize,1,10))return false;
 for(const key of ["interests","mobilityConstraints"]){const list=v[key];if(list===null)continue;
  if(!Array.isArray(list)||list.length>(key==="interests"?8:6)||new Set(list).size!==list.length||list.some(x=>!text(x,key==="interests"?40:120)
   ||key==="interests"&&!["food","photography","culture","nature"].includes(x)))return false;}
 if(v.lodgingBudget!==null&&(!record(v.lodgingBudget)||!exact(v.lodgingBudget,["currency","perNightMinorUnits"])
  ||typeof v.lodgingBudget.currency!=="string"||!["CNY","USD","EUR","GBP"].includes(v.lodgingBudget.currency)||!integer(v.lodgingBudget.perNightMinorUnits,1,10000000)))return false;
 if(v.dates!==null){if(!record(v.dates)||!exact(v.dates,["startDate","endDate"]))return false;
  const dates=[v.dates.startDate,v.dates.endDate];if(dates.some(x=>typeof x!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(x)||!Number.isFinite(Date.parse(x))||new Date(String(x)).toISOString().slice(0,10)!==x))return false;
  const span=Date.parse(String(dates[1]))-Date.parse(String(dates[0]));if(span<0||span>30*86400000)return false;}
 return true;
}
function validMemories(v: unknown): v is {id:string;revision:number}[]{return Array.isArray(v)&&v.length<=3&&v.every(x=>record(x)&&exact(x,["id","revision"])&&uuid(x.id)&&integer(x.revision,1,999999999999999))&&new Set(v.map(x=>x.id)).size===v.length;}
function validWrite(v: unknown): v is Record<string,unknown>{return record(v)&&exact(v,["conversationId","goalId","messageId","parentMessageId","expectedGoalVersion","expectedIntakeRevision","idempotencyKey","policyId","locale","text","relationship","intake","memoryBasis"])
 &&[v.conversationId,v.goalId,v.messageId,v.idempotencyKey,v.policyId].every(uuid)&&["en","zh"].includes(String(v.locale))&&text(v.text,4000)
 &&integer(v.expectedIntakeRevision,0,999)&&["goal_start","follow_up","amendment"].includes(String(v.relationship))
 &&(v.relationship==="goal_start"?v.expectedGoalVersion===null&&v.parentMessageId===null&&v.expectedIntakeRevision===0:integer(v.expectedGoalVersion,1,9999)&&uuid(v.parentMessageId))
 &&validExplicitTravelIntake(v.intake)&&validMemories(v.memoryBasis);}
async function boundedBody(request: NextRequest){const reader=request.body?.getReader();if(!reader)throw Error("INVALID_INPUT");let bytes=0;const chunks:Uint8Array[]=[];
 try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>16000)throw Error("INVALID_INPUT");chunks.push(part.value);}return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;}
 finally{await reader.cancel().catch(()=>{});}}
function validRead(v: unknown): v is Record<string,unknown>{return record(v)&&exact(v,["kind","schemaVersion","conversationId","goalId","goalVersion","messageId","messageSequence","intakeRevision","sourceKind","intake","memoryBasis","contextDigest","readiness","readyForProvider"])
 &&v.kind==="travel_intake"&&v.schemaVersion==="assistant-travel-current-basis/1"&&[v.conversationId,v.goalId,v.messageId].every(uuid)
 &&integer(v.goalVersion,1,10000)&&integer(v.messageSequence,1,1000000)&&integer(v.intakeRevision,1,1000)&&v.sourceKind==="explicit_current_input"
 &&validExplicitTravelIntake(v.intake)&&validMemories(v.memoryBasis)&&digest(v.contextDigest)&&v.readyForProvider===false&&record(v.readiness)
 &&(v.readiness.kind==="ready"?exact(v.readiness,["kind","scope","unknown"])&&v.readiness.scope==="transport_screening"&&(v.intake as Record<string,unknown>).city==="shanghai"&&(v.intake as Record<string,unknown>).comparisonTarget==="area_transport"&&Array.isArray(v.readiness.unknown)&&new Set(v.readiness.unknown).size===v.readiness.unknown.length&&v.readiness.unknown.length===Object.values(v.intake as Record<string,unknown>).filter(x=>x===null).length&&v.readiness.unknown.every(x=>typeof x==="string"&&["city","comparisonTarget","durationDays","partySize","interests","pace","lodgingBudget","dates","mobilityConstraints"].includes(x)&&(v.intake as Record<string,unknown>)[x]===null)
  :v.readiness.kind==="waiting_user"?exact(v.readiness,["kind","questions"])&&Array.isArray(v.readiness.questions)&&v.readiness.questions.length>0&&new Set(v.readiness.questions).size===v.readiness.questions.length&&v.readiness.questions.every(x=>typeof x==="string"&&["city","comparison_target","lodging_budget"].includes(x))
  :v.readiness.kind==="unavailable"&&exact(v.readiness,["kind","reason"])&&["city_not_covered","budget_filter_not_integrated"].includes(String(v.readiness.reason)));}

function unavailableReason(v: unknown): "blocked" | "intake_unrecorded" | "stale_basis" | null {
 return record(v)&&exact(v,["kind","reason"])&&v.kind==="unavailable"&&["blocked","intake_unrecorded","stale_basis"].includes(String(v.reason))&&typeof v.reason==="string"
  ? v.reason as "blocked" | "intake_unrecorded" | "stale_basis" : null;
}

function validWriteBasis(v:unknown):v is Record<string,unknown>{return record(v)&&exact(v,["kind","conversationId","goalId","goalVersion","parentMessageId","messageSequence","intakeRevision","policyId","readyForProvider"])
 &&v.kind==="travel_intake_write_basis"&&[v.conversationId,v.goalId,v.parentMessageId,v.policyId].every(uuid)&&integer(v.goalVersion,1,9999)&&integer(v.messageSequence,1,1000000)&&integer(v.intakeRevision,0,1000)&&v.readyForProvider===false;}

export async function nativeTravelIntakeHTTP(request: NextRequest,writeBasis=false){
 if(writeBasis&&request.method!=="GET")return fail("INVALID_INPUT");
 const config=request.method==="GET"?getNativeTextConfig(request):getNativeAssistantConfig(request);if(!config)return fail("PROVIDER_UNAVAILABLE");
 const query=[...request.nextUrl.searchParams];if(!["GET","POST"].includes(request.method)||request.headers.has("cookie")||request.headers.has("origin"))return fail("INVALID_INPUT");
 const conversation=request.nextUrl.searchParams.get("conversationId"),goal=request.nextUrl.searchParams.get("goalId");
 if(request.method==="GET"?query.length!==2||!query.every(([k])=>["conversationId","goalId"].includes(k))||!uuid(conversation)||!uuid(goal):query.length!==0)return fail("INVALID_INPUT");
 const scope=nativeRequestScope(request.signal);
 try{
  const actor=await scope.run(()=>verifyNativeCredentials(request,config,scope.fetch,scope.unavailable));if(!actor)return fail("UNAUTHENTICATED");
  const rpc=(name:string,params:Record<string,unknown>)=>scope.run(()=>actor.client.rpc(name,params).abortSignal(scope.signal));
  const session=async()=>{const result=await rpc("native_session_v2",{p_action:"session"});if(result.error)throw Error(result.error.message);
   if(!record(result.data)||!uuid(result.data.subject)||!uuid(result.data.sessionId))throw Error("PROVIDER_UNAVAILABLE");
   if(result.data.subject!==actor.subject||result.data.sessionId!==actor.sessionId)throw Error("UNAUTHENTICATED");};
  await session();
  const finishFailure=async(code:FailureCode)=>{await session();return fail(code);};
  const finish=async(data:unknown,status=200)=>{await session();return reply(data,status);};
  if(request.method==="POST"){
   let body:unknown;try{body=await scope.run(()=>boundedBody(request));}catch{return await finishFailure("INVALID_INPUT");}
   if(!validWrite(body)||body.policyId!==config.policyId)return await finishFailure("INVALID_INPUT");
   const r=await rpc("submit_assistant_travel_intake_v1",{p_conversation_id:body.conversationId,p_goal_id:body.goalId,p_message_id:body.messageId,p_parent_message_id:body.parentMessageId,
    p_expected_goal_version:body.expectedGoalVersion,p_expected_intake_revision:body.expectedIntakeRevision,p_idempotency_key:body.idempotencyKey,p_policy_id:config.policyId,p_locale:body.locale,p_text:body.text,p_relationship:body.relationship,p_intake:body.intake,p_memory_basis:body.memoryBasis});
   if(r.error)return await finishFailure(errorCode(r.error.message));const d=r.data;
   if(!record(d)||d.kind!=="accepted"||d.conversationId!==body.conversationId||d.goalId!==body.goalId||d.messageId!==body.messageId||!integer(d.messageSequence,1,1000000)
    ||!integer(d.goalVersion,1,10000)||!integer(d.intakeRevision,1,1000)||typeof d.reused!=="boolean"||typeof d.current!=="boolean"||d.readyForProvider!==false||d.current&&!digest(d.contextDigest)||!d.current&&Object.hasOwn(d,"contextDigest"))return await finishFailure("PROVIDER_UNAVAILABLE");
   // Refresh current qualification before claiming a receipt's digest is current. Historical identity remains a receipt only.
   const fresh=await rpc("read_assistant_travel_intake_v1",{p_policy_id:config.policyId,p_conversation_id:body.conversationId,p_goal_id:body.goalId});if(fresh.error)return await finishFailure(errorCode(fresh.error.message));
   const unavailable=unavailableReason(fresh.data);
   if(unavailable==="blocked")return await finishFailure("DATA_POLICY_BLOCKED");
   if(unavailable===null&&(!validRead(fresh.data)||fresh.data.conversationId!==body.conversationId||fresh.data.goalId!==body.goalId))return await finishFailure("PROVIDER_UNAVAILABLE");
   const current=validRead(fresh.data)&&fresh.data.messageId===d.messageId&&fresh.data.contextDigest===d.contextDigest;
   return await finish({version:5,kind:"accepted",conversationId:d.conversationId,goalId:d.goalId,messageId:d.messageId,messageSequence:d.messageSequence,goalVersion:d.goalVersion,intakeRevision:d.intakeRevision,reused:d.reused,current,readyForProvider:false,...(current?{contextDigest:d.contextDigest}:{})},d.reused?200:201);
  }
  const params={p_policy_id:config.policyId,p_conversation_id:conversation,p_goal_id:goal};
  if(writeBasis){
   const first=await rpc("read_assistant_travel_intake_write_basis_v1",params);if(first.error)return await finishFailure(errorCode(first.error.message));
   if(unavailableReason(first.data)==="blocked")return await finishFailure("DATA_POLICY_BLOCKED");
   if(!validWriteBasis(first.data)||first.data.conversationId!==conversation||first.data.goalId!==goal||first.data.policyId!==config.policyId)return await finishFailure("PROVIDER_UNAVAILABLE");
   const second=await rpc("read_assistant_travel_intake_write_basis_v1",params);if(second.error)return await finishFailure(errorCode(second.error.message));
   if(unavailableReason(second.data)==="blocked")return await finishFailure("DATA_POLICY_BLOCKED");
   if(!validWriteBasis(second.data)||second.data.conversationId!==conversation||second.data.goalId!==goal||second.data.policyId!==config.policyId)return await finishFailure("PROVIDER_UNAVAILABLE");
   if(JSON.stringify(first.data)!==JSON.stringify(second.data))return await finishFailure("SERVICE_TASK_CONFLICT");
   return await finish({version:5,...second.data});
  }
  const first=await rpc("read_assistant_travel_intake_v1",params);
  if(first.error)return await finishFailure(errorCode(first.error.message));
  const firstUnavailable=unavailableReason(first.data);
  if(firstUnavailable!==null)return firstUnavailable==="blocked"?await finishFailure("DATA_POLICY_BLOCKED"):await finish({version:5,kind:"unavailable",reason:firstUnavailable,readyForProvider:false});
  if(!validRead(first.data)||first.data.conversationId!==conversation||first.data.goalId!==goal)return await finishFailure("PROVIDER_UNAVAILABLE");
  const second=await rpc("read_assistant_travel_intake_v1",params);if(second.error)return await finishFailure(errorCode(second.error.message));
  const secondUnavailable=unavailableReason(second.data);
  if(secondUnavailable!==null)return secondUnavailable==="blocked"?await finishFailure("DATA_POLICY_BLOCKED"):await finish({version:5,kind:"unavailable",reason:secondUnavailable,readyForProvider:false});
  if(!validRead(second.data)||second.data.conversationId!==conversation||second.data.goalId!==goal)return await finishFailure("PROVIDER_UNAVAILABLE");
  if(JSON.stringify(first.data)!==JSON.stringify(second.data))return await finish({version:5,kind:"unavailable",reason:"stale_basis",readyForProvider:false});
  return await finish({version:5,...second.data});
 }catch(error){return fail(error instanceof Error?errorCode(error.message):"PROVIDER_UNAVAILABLE");}finally{scope.dispose();}
}
