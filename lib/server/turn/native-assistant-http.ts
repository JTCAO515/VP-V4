import type { NextRequest } from "next/server";
import { nativeRequestScope } from "../identity/native-request.ts";
import { verifyNativeCredentials } from "../identity/native-credentials.ts";
import { getNativeTextConfig, nativeTextHTTP } from "./native-http.ts";
import { isUuid } from "../identity/request-guards.ts";
import { FAILURE_TAXONOMY, type FailureCode } from "../contracts/errors/index.ts";

type Payload = Record<string, unknown>;
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (code: FailureCode) => reply({ error: { code } }, FAILURE_TAXONOMY[code].httpStatus);
const uuid = (value: unknown): value is string => typeof value === "string" && isUuid(value);
const record = (value: unknown): value is Payload => typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: Payload, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

export function getNativeAssistantConfig(request: NextRequest) {
  const config = getNativeTextConfig(request);
  if (!config) return null;
  const enabled = process.env.VISEPANDA_NATIVE_STAGING === "true" ? process.env.VISEPANDA_NATIVE_STAGING_ASSISTANT_CONVERSATION
    : process.env.VISEPANDA_NATIVE_PRODUCTION === "true" ? process.env.VISEPANDA_NATIVE_PRODUCTION_ASSISTANT_CONVERSATION
    : process.env.VISEPANDA_NATIVE_LOCAL_ASSISTANT_CONVERSATION;
  return enabled === "true" ? config : null;
}

export async function nativeAssistantTextHTTP(request: NextRequest, action: "policy" | "accept" | "withdraw") {
  // Policy readback bootstraps the native reader. Only new consent requires the
  // assistant producer; withdrawal and reads retain the base text/runtime gates.
  if (action === "accept" && !getNativeAssistantConfig(request)) return failure("PROVIDER_UNAVAILABLE");
  return nativeTextHTTP(request, action);
}

export async function nativeAssistantHTTP(request: NextRequest, action: "conversation" | "list" = "conversation", selectedSourceMode = false) {
  // Rollback disables new intake, not owner/consent-checked reads of accepted work.
  const config = request.method === "GET" ? getNativeTextConfig(request) : getNativeAssistantConfig(request);
  if (!config) return failure("PROVIDER_UNAVAILABLE");
  const query = [...request.nextUrl.searchParams];
  const conversationId = request.nextUrl.searchParams.get("conversationId");
  if (request.headers.has("cookie") || request.headers.has("origin")
    || (action === "list" && request.method !== "GET")
    || (query.length > 0 && (action !== "conversation" || request.method !== "GET"
      || query.length !== 1 || query[0][0] !== "conversationId" || !uuid(conversationId)))) return failure("INVALID_INPUT");
  const scope = nativeRequestScope(request.signal);
  try {
    const actor = await scope.run(() => verifyNativeCredentials(request, config, scope.fetch, scope.unavailable));
    if (!actor) return failure("UNAUTHENTICATED");
    const rpc = async (name: string, params: Record<string, unknown>) => scope.run(() => actor.client.rpc(name, params).abortSignal(scope.signal));
    const session = await rpc("native_session_v2", { p_action: "session" });
    if (session.error) return failure(mapError(session.error.message));
    if (selectedSourceMode && (!record(session.data)||!uuid(session.data.subject)||!uuid(session.data.sessionId)))return failure("PROVIDER_UNAVAILABLE");
    if (!record(session.data) || session.data.subject !== actor.subject || session.data.sessionId !== actor.sessionId) return failure("UNAUTHENTICATED");
    let result;
    let submitted:Payload|null=null;
    if (request.method === "GET") {
      result = action === "list"
        ? await rpc("list_assistant_conversations_v1", { p_policy_id: config.policyId })
        : await rpc("read_assistant_conversation_v1", { p_policy_id: config.policyId, p_conversation_id: conversationId });
    } else if (request.method === "POST") {
      const input = await boundedBody(request, scope.signal);
      if (!record(input) || !exact(input, [...(selectedSourceMode ? ["schemaVersion","selectedSources"] : []),"conversationId", "messageId", "idempotencyKey", "policyId", "locale", "text", "relationship", "goalId", "expectedGoalVersion", "taskId", "parentMessageId", "turnId"])
        || ![input.conversationId,input.messageId,input.idempotencyKey].every(uuid) || input.policyId !== config.policyId
        || !["zh","en"].includes(String(input.locale)) || typeof input.text !== "string" || !input.text.trim() || input.text.length > 4000
        || !["independent_question","goal_start","follow_up","amendment","clarification"].includes(String(input.relationship))
        || ![input.goalId,input.taskId,input.parentMessageId,input.turnId].every(value => value === null || uuid(value))
        || (selectedSourceMode && (input.schemaVersion !== "assistant-message-sources/2" || !validSelectedSources(input.selectedSources) || input.taskId !== null))
        || (input.expectedGoalVersion !== null && (!Number.isInteger(input.expectedGoalVersion) || Number(input.expectedGoalVersion) < 1))) return failure("INVALID_INPUT");
      submitted=input;
      result = await rpc(selectedSourceMode ? "submit_assistant_message_sources_v2" : "submit_assistant_message_v1", {
        p_conversation_id: input.conversationId as string, p_message_id: input.messageId as string,
        p_idempotency_key: input.idempotencyKey as string, p_policy_id: config.policyId,
        p_locale: input.locale as string, p_text: input.text, p_relationship: input.relationship as string,
        p_goal_id: input.goalId as string | null, p_expected_goal_version: input.expectedGoalVersion as number | null,
        p_task_id: input.taskId as string | null, p_parent_message_id: input.parentMessageId as string | null,
        p_turn_id: input.turnId as string | null,
        ...(selectedSourceMode ? {p_selected_sources:input.selectedSources} : {}),
      });
    } else return failure("INVALID_INPUT");
if(selectedSourceMode){
      const final=await rpc("native_session_v2",{p_action:"session"});
      if(final.error)return failure(mapError(final.error.message));
      if(!record(final.data)||!uuid(final.data.subject)||!uuid(final.data.sessionId))return failure("PROVIDER_UNAVAILABLE");
      if(final.data.subject!==actor.subject||final.data.sessionId!==actor.sessionId)return failure("UNAUTHENTICATED");
    }
    if (result.error) return failure(mapError(result.error.message));
    if (!record(result.data)) return failure("INTERNAL_ERROR");
    if (["unavailable", "blocked"].includes(String(result.data.kind))) return failure("DATA_POLICY_BLOCKED");
    if (request.method === "GET" && action === "conversation" && conversationId !== null
      && result.data.conversationId !== conversationId) return failure("FORBIDDEN");
    if (!(action === "list" ? ["conversations"] : ["conversation","accepted"]).includes(String(result.data.kind))) return failure("INTERNAL_ERROR");
    if(selectedSourceMode){
      if(!submitted||!exact(result.data,["kind","conversationId","messageId","sequence","goalId","scopeVersion","turnId","reused","selectedSources","readyForProvider"])||result.data.conversationId!==submitted.conversationId||result.data.messageId!==submitted.messageId||!Number.isSafeInteger(result.data.sequence)||Number(result.data.sequence)<1||typeof result.data.reused!=="boolean"||result.data.readyForProvider!==false||!record(result.data.selectedSources))return failure("PROVIDER_UNAVAILABLE");
    }
    return reply({ version: selectedSourceMode ? 6 : 5, ...result.data }, request.method === "POST" && result.data.reused !== true ? 201 : 200);
  } catch { return failure("PROVIDER_UNAVAILABLE"); }
  finally { scope.dispose(); }
}

async function boundedBody(request: NextRequest, parent: AbortSignal): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json" || !request.body) return null;
  const reader = request.body.getReader(), parts: Uint8Array[] = [];
  const scope = nativeRequestScope(parent, 5000);
  let size = 0;
  try {
    for (;;) {
      const next = await scope.run(() => reader.read());
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 32768) return null;
      parts.push(next.value);
    }
    scope.check();
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts))); }
    catch { return null; }
  } finally {
    scope.dispose();
    try { void reader.cancel().catch(() => {}); } catch { /* closed */ }
    try { reader.releaseLock(); } catch { /* pending read */ }
  }
}

function mapError(message: string): FailureCode {
  if (/UNAUTHENTICATED|SESSION_REPLACED/.test(message)) return "UNAUTHENTICATED";
  if (/SERVICE_TASK_CONFLICT|duplicate key/.test(message)) return "SERVICE_TASK_CONFLICT";
  if (message.includes("IDEMPOTENCY_KEY_REUSE")) return "IDEMPOTENCY_KEY_REUSE";
  if (message.includes("DATA_POLICY_BLOCKED")) return "DATA_POLICY_BLOCKED";
  if (message.includes("INVALID_INPUT")) return "INVALID_INPUT";
  if (message.includes("FORBIDDEN")) return "FORBIDDEN";
  return "PROVIDER_UNAVAILABLE";
}

export function validSelectedSources(value:unknown):boolean{
 if(!record(value)||!exact(value,["artifact","trip","evidence"]))return false;
 if(value.artifact!==null&&(!record(value.artifact)||!exact(value.artifact,["artifactId","revision"])||!uuid(value.artifact.artifactId)||!Number.isSafeInteger(value.artifact.revision)||Number(value.artifact.revision)<1||Number(value.artifact.revision)>1000))return false;
 if(value.trip!==null&&(!record(value.trip)||!exact(value.trip,["tripId","headVersion"])||!uuid(value.trip.tripId)||!Number.isSafeInteger(value.trip.headVersion)||Number(value.trip.headVersion)<0||Number(value.trip.headVersion)>999999999))return false;
 return Array.isArray(value.evidence)&&value.evidence.length<=3&&value.evidence.every(e=>record(e)&&exact(e,["factId","assertionId","assertionRevision","city","scene"])&&uuid(e.factId)&&uuid(e.assertionId)&&Number.isSafeInteger(e.assertionRevision)&&Number(e.assertionRevision)>0&&typeof e.city==="string"&&typeof e.scene==="string")&&new Set(value.evidence.map(e=>(e as Record<string,unknown>).factId)).size===value.evidence.length;
}
