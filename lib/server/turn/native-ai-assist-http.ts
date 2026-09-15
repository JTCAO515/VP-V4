import type { NextRequest } from "next/server";
import { nativeRequestScope } from "../identity/native-request.ts";
import { verifyNativeCredentials } from "../identity/native-credentials.ts";
import { isUuid } from "../identity/request-guards.ts";
import { getNativeTextConfig } from "./native-http.ts";
import { runGroundedAiAssistJob } from "../knowledge/wiki/grounded-ai-assist-job.ts";
import type { HttpProviderConfiguration } from "../model-gateway/adapters/http-transport.ts";
import type { ProtocolProvider } from "../model-gateway/adapters/provider-protocol.ts";

/**
 * VPJ-76 (#360) slice 9: the iOS counterpart of the Web trigger/poll route
 * (app/api/chat/grounded/ai-assist/route.ts, slice 8) -- same job
 * (lib/server/knowledge/wiki/grounded-ai-assist-job.ts), same env-based
 * provider gate, but Bearer/native-session identity instead of a cookie,
 * mirroring nativeGroundedEvents' own auth exactly (verifyNativeCredentials
 * + the session subject/sessionId cross-check). Plain JSON, not SSE -- the
 * iOS client polls this the same way SavedAnswers.tsx polls the Web route.
 */

const ENDPOINTS: Readonly<Record<ProtocolProvider, string>> = Object.freeze({
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  glm: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  deepseek: "https://api.deepseek.com/chat/completions",
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function providerConfig(): HttpProviderConfiguration | null {
  const provider = process.env.VISEPANDA_GROUNDED_AI_ASSIST_PROVIDER;
  const configurationId = process.env.VISEPANDA_GROUNDED_AI_ASSIST_CONFIG_ID;
  if (provider !== "qwen" && provider !== "glm" && provider !== "deepseek") return null;
  if (!configurationId || !UUID.test(configurationId)) return null;
  return { provider, endpoint: ENDPOINTS[provider], configurationId, configurationVersion: 1, timeoutMs: 15000 };
}

const failure = (code: string, status: number) => Response.json({ error: { code } }, { status, headers: { "Cache-Control": "private, no-store" } });

export async function nativeGroundedAiAssist(request: NextRequest, turnId: string) {
  const config = getNativeTextConfig(request, "grounded");
  if (!config) return failure("PROVIDER_UNAVAILABLE", 503);
  if (!isUuid(turnId) || request.headers.has("cookie") || request.headers.has("origin") || [...request.nextUrl.searchParams].length) return failure("INVALID_INPUT", 400);
  if (process.env.VISEPANDA_GROUNDED_AI_ASSIST !== "true") return failure("PROVIDER_UNAVAILABLE", 503);
  const provider = providerConfig();
  const apiKey = process.env.VISEPANDA_GROUNDED_AI_ASSIST_API_KEY;
  if (!provider || !apiKey) return failure("PROVIDER_UNAVAILABLE", 503);

  const scope = nativeRequestScope(request.signal);
  try {
    const actor = await scope.run(() => verifyNativeCredentials(request, config, scope.fetch, scope.unavailable));
    if (!actor) return failure("UNAUTHENTICATED", 401);
    const session = await scope.run(() => actor.client.rpc("native_session_v2", { p_action: "session" }).abortSignal(scope.signal));
    if (session.error) return /UNAUTHENTICATED|SESSION_REPLACED/.test(session.error.message) ? failure("UNAUTHENTICATED", 401) : failure("PROVIDER_UNAVAILABLE", 503);
    if (typeof session.data?.subject !== "string" || !isUuid(session.data.subject)
      || typeof session.data?.sessionId !== "string" || !isUuid(session.data.sessionId)) return failure("PROVIDER_UNAVAILABLE", 503);
    if (session.data?.subject !== actor.subject || session.data?.sessionId !== actor.sessionId) return failure("UNAUTHENTICATED", 401);

    const rpc = (name: string, params: Record<string, unknown>) => scope.run(() => actor.client.rpc(name, params).abortSignal(scope.signal));
    const result = await runGroundedAiAssistJob(
      turnId,
      (name, params) => rpc(name, params),
      { maxRounds: 4, maxOutputTokens: 2000, timeoutMs: 15000, provider },
      {
        rpc: (name, params) => rpc(name, params),
        contextRpc: (name, params) => rpc(name, params),
        credential: () => apiKey,
        recordDestination: async () => {},
        fetch: scope.fetch,
      },
      scope.signal,
    );
    scope.check();
    return Response.json({ data: result }, { status: 200, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PROVIDER_UNAVAILABLE";
    return failure(["UNAUTHENTICATED", "INVALID_INPUT"].includes(code) ? code : "PROVIDER_UNAVAILABLE", code === "UNAUTHENTICATED" ? 401 : code === "INVALID_INPUT" ? 400 : 503);
  } finally { scope.dispose(); }
}
