import type { NextRequest } from "next/server";
import { getNativeRuntimeConfig } from "../identity/native-config.ts";
import { nativeRequestScope } from "../identity/native-request.ts";
import { qaCancellationConfig, qaConfig } from "./config.ts";
import { createQaService, exact, record, uuid } from "./service.ts";
import { QaError, QA_AGENT_WIRE_VERSION } from "./contract.ts";
import { prepareNativeQaStore } from "./native-store.ts";
import { createQaCancellationService, QaCancellationError } from "./cancellation/service.ts";
import { QA_CANCELLATION_VERSION } from "../../qa-agent/cancellation-contract.ts";

export type NativeQaAction = "list" | "create" | "detail" | "submit" | "message" | "policy" | "consent";
const statuses = { INVALID_INPUT:400, UNAUTHENTICATED:401, FORBIDDEN:403, DATA_POLICY_BLOCKED:403,
  IDEMPOTENCY_KEY_REUSE:409, QA_CONTEXT_LIMIT:409, PROVIDER_UNAVAILABLE:503 } as const;
const headers = { "Cache-Control":"private, no-store", Vary:"Authorization" };
function boundary(request: Request) {
  const url = new URL(request.url);
  return ["GET", "POST"].includes(request.method) && !url.search && !url.username && !url.password
    && !request.headers.has("cookie") && !request.headers.has("origin")
    && request.headers.get("sec-fetch-site") !== "cross-site" && !(request.method === "GET" && request.body);
}
function target(request: Request) {
  const native = getNativeRuntimeConfig(request, "trip", "text"), qa = qaCancellationConfig(request.url, process.env);
  // Original native Preview/local target authority remains mandatory. No
  // Production or QA-alias allowlist expansion is hidden in this new surface.
  return native && native.environment !== "production" && qa && native.url === qa.url
    && native.publishableKey === qa.publishableKey ? qa : null;
}
async function input(request: Request, scope: ReturnType<typeof nativeRequestScope>, maximum: number) {
  if (request.method !== "POST") return {};
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new QaError("INVALID_INPUT");
  const raw = await scope.body(request, maximum); if (raw === null) throw new QaError("INVALID_INPUT");
  try { return JSON.parse(raw) as unknown; } catch { throw new QaError("INVALID_INPUT"); }
}
/** Native auth adapter for the original qa-agent/1 service and storage authority. */
export async function nativeQaHTTP(request: NextRequest, action: NativeQaAction, sessionId?: string, requestId?: string) {
  const reply = (body: object, status=200) => Response.json({ version:QA_AGENT_WIRE_VERSION, ...body }, { status, headers });
  if (!boundary(request) || (request.method === "POST") !== ["create", "submit", "consent"].includes(action)
    || (sessionId !== undefined && !uuid(sessionId)) || (requestId !== undefined && !uuid(requestId))) return reply({ error:{code:"INVALID_INPUT",ack:"not_submitted"} },400);
  sessionId=sessionId?.toLowerCase();requestId=requestId?.toLowerCase();
  const current = target(request), config = qaConfig(request.url, process.env);
  if (!current || !config || config.contextMode !== "qa_session_history_v1") return reply({error:{code:"PROVIDER_UNAVAILABLE",ack:"not_submitted"}},503);
  const scope = nativeRequestScope(request.signal,15000); let submitting=false;
  try {
    let body = await input(request,scope,32768);
    if (request.method === "POST" && (!record(body) || (action === "create" && !exact(body,[]))
      || (action === "submit" && !exact(body,["requestId","text"])) || (action === "consent" && !exact(body,["policyId","noticeHash"])))) throw new QaError("INVALID_INPUT");
    // Native UUID strings may be uppercase; canonicalize identity, never text bytes.
    if (record(body) && action === "submit" && uuid(body.requestId)) body={...body,requestId:body.requestId.toLowerCase()};
    if (record(body) && action === "consent" && uuid(body.policyId)) body={...body,policyId:body.policyId.toLowerCase()};
    const store=await prepareNativeQaStore(request,current,scope), service=createQaService(store,config.policyId,config.contextMode);
    let data: object;
    if (action === "policy") data={policy:await service.policy()};
    else if (action === "consent") data={policy:await service.consent(body)};
    else if (action === "list") data=await service.list();
    else if (action === "create") data=await service.create(body);
    else if (action === "detail" && sessionId) data=await service.detail(sessionId);
    else if (action === "message" && sessionId && requestId) data=await service.message(sessionId,requestId);
    else if (action === "submit" && sessionId) {submitting=true;data=await service.submit(sessionId,body);}
    else throw new QaError("INVALID_INPUT");
    scope.check();return reply(data,action === "create"?201:action === "submit"?202:200);
  } catch (error) {
    const failure=error instanceof QaError?error:new QaError("PROVIDER_UNAVAILABLE",submitting?"unknown":"not_submitted");
    return reply({error:{code:failure.code,ack:failure.ack}},statuses[failure.code]);
  } finally {scope.dispose();}
}

/** Original cancellation receipt/unknown-ACK semantics; no fresh generation consent. */
export async function nativeQaCancellationHTTP(request: NextRequest, sessionId: string, requestId: string) {
  sessionId=uuid(sessionId)?sessionId.toLowerCase():sessionId;requestId=uuid(requestId)?requestId.toLowerCase():requestId;
  const reply=(body: object,status=200)=>Response.json({version:QA_CANCELLATION_VERSION,sessionId,requestId,...body},{status,headers});
  if (!boundary(request) || !uuid(sessionId) || !uuid(requestId)) return reply({error:{code:"INVALID_INPUT",ack:"not_submitted"}},400);
  const config=target(request);if(!config)return reply({error:{code:"PROVIDER_UNAVAILABLE",ack:"not_submitted"}},503);
  const scope=nativeRequestScope(request.signal,15000);let invoked=false;
  try {
    const body=await input(request,scope,1024);
    if(request.method === "POST" && (!record(body)||!exact(body,[])))throw new QaCancellationError("INVALID_INPUT");
    const store=await prepareNativeQaStore(request,config,scope);
    const service=createQaCancellationService((name,params)=>{invoked=true;return store.rpc(name,params);});
    const receipt=await service(request.method === "POST"?"cancel":"read",sessionId,requestId,body);
    scope.check();return reply(receipt);
  } catch(error) {
    const failure=error instanceof QaCancellationError?error:error instanceof QaError && ["UNAUTHENTICATED","FORBIDDEN","INVALID_INPUT"].includes(error.code)
      ?new QaCancellationError(error.code as "UNAUTHENTICATED"|"FORBIDDEN"|"INVALID_INPUT"):new QaCancellationError("PROVIDER_UNAVAILABLE",invoked?"unknown":"not_submitted");
    return reply({error:{code:failure.code,ack:failure.ack}},statuses[failure.code]);
  } finally {scope.dispose();}
}
