import type { NextRequest } from "next/server";
import { nativeRequestScope } from "../identity/native-request.ts";
import { verifyNativeCredentials } from "../identity/native-credentials.ts";
import { isUuid } from "../identity/request-guards.ts";
import { FAILURE_TAXONOMY, type FailureCode } from "../contracts/errors/index.ts";
import { assembleGoalContext, ContextAssemblyError, type GoalContextGoal, type GoalContextMessage } from "../context/index.ts";
import type { GoalMemoryProfile } from "../context/goal-context.ts";
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
