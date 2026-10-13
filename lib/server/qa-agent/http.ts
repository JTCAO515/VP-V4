import { NextResponse, type NextRequest } from "next/server";
import { createUserDataAdapter } from "../identity/user-data-adapter.ts";
import { nativeRequestScope } from "../identity/native-request.ts";
import { createQaService, exact, record, type QaStore } from "./service.ts";
import { qaConfig } from "./config.ts";
import { QaError, QA_AGENT_WIRE_VERSION } from "./contract.ts";

export type QaAction = "list" | "create" | "detail" | "submit" | "message" | "policy" | "consent";
const statuses = { INVALID_INPUT: 400, UNAUTHENTICATED: 401, FORBIDDEN: 403, DATA_POLICY_BLOCKED: 403, IDEMPOTENCY_KEY_REUSE: 409, PROVIDER_UNAVAILABLE: 503 } as const;
import { browserBoundary } from "./browser-boundary.ts";
export async function qaAgentHTTP(request: NextRequest, action: QaAction, sessionId?: string, requestId?: string) {
  const reply = (body: unknown, status = 200) => NextResponse.json({ version: QA_AGENT_WIRE_VERSION, ...(record(body) ? body : {}) },
    { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie, Origin" } });
  if (!browserBoundary(request)) return reply({ error: { code: "FORBIDDEN", ack: "not_submitted" } }, 403);
  const config = qaConfig(request.url, process.env);
  if (!config) return reply({ error: { code: "PROVIDER_UNAVAILABLE", ack: "not_submitted" } }, 503);
  const scope = nativeRequestScope(request.signal, 15_000);
  const adapter = createUserDataAdapter(request, config, scope.fetch);
  if (!adapter) { scope.dispose(); return reply({ error: { code: "PROVIDER_UNAVAILABLE", ack: "not_submitted" } }, 503); }
  let submitting = false;
  try {
    const unwrap = <T,>(result: { data: T } | { error: string }): T => {
      if ("error" in result) throw new QaError(result.error === "UNAUTHENTICATED" ? "UNAUTHENTICATED" : result.error === "FORBIDDEN" ? "FORBIDDEN" : "PROVIDER_UNAVAILABLE");
      return result.data;
    };
    const store: QaStore = {
      list: async () => unwrap(await scope.run(() => adapter.listChatThreads())),
      create: async () => unwrap(await scope.run(() => adapter.createChatThread())),
      read: async id => unwrap(await scope.run(() => adapter.getChatThread(id))),
      rpc: async (name, params) => unwrap(await scope.run(() => adapter.runGroundedAiAssist(rpc => rpc(name, params)))),
    };
    const service = createQaService(store, config.policyId, config.contextMode);
    let input: unknown = {};
    if (request.method === "POST") {
      if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new QaError("INVALID_INPUT");
      const raw = await scope.body(request, 32768);
      if (raw === null) throw new QaError("INVALID_INPUT");
      try { input = JSON.parse(raw); } catch { throw new QaError("INVALID_INPUT"); }
    }
    let data: unknown;
    if (action === "policy") data = { policy: await service.policy() };
    else if (action === "consent") data = { policy: await service.consent(input) };
    else if (action === "list") data = await service.list();
    else if (action === "create") data = await service.create(input);
    else if (action === "detail" && sessionId) data = await service.detail(sessionId);
    else if (action === "message" && sessionId && requestId) data = await service.message(sessionId, requestId);
    else if (action === "submit" && sessionId) {
      if (!record(input) || !exact(input, ["requestId", "text"])) throw new QaError("INVALID_INPUT");
      submitting = true;
      data = await service.submit(sessionId, input);
    } else throw new QaError("INVALID_INPUT");
    scope.check();
    return adapter.applyCookies(reply(data, action === "create" ? 201 : action === "submit" ? 202 : 200));
  } catch (error) {
    const failure = error instanceof QaError ? error : new QaError("PROVIDER_UNAVAILABLE", submitting ? "unknown" : "not_submitted");
    return adapter.applyCookies(reply({ error: { code: failure.code, ack: failure.ack } }, statuses[failure.code]));
  } finally { scope.dispose(); }
}
