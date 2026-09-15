import { NextRequest, NextResponse } from "next/server";
import { createUserDataAdapter } from "@/lib/server/identity/user-data-adapter";
import { nativeRequestScope } from "@/lib/server/identity/native-request";
import { getNativeTextConfig } from "@/lib/server/turn/native-http";
import { runGroundedAiAssistJob } from "@/lib/server/knowledge/wiki/grounded-ai-assist-job";
import type { HttpProviderConfiguration } from "@/lib/server/model-gateway/adapters/http-transport";
import type { ProtocolProvider } from "@/lib/server/model-gateway/adapters/provider-protocol";

export const dynamic = "force-dynamic";

/**
 * VPJ-76 (#360) slice 8: the real Web trigger/poll route for
 * grounded-ai-assist. Cookie identity only, mirroring
 * app/api/chat/grounded/route.ts exactly -- this route cannot answer a
 * question on its own; it can only ask runGroundedAiAssistJob to check
 * whether the caller's own turn was genuinely 'blocked' and, if so, run or
 * report on the pull-driven job that supplements it. See
 * lib/server/knowledge/wiki/grounded-ai-assist-job.ts and the migration in
 * supabase/migrations/20260915200000_..._grounded_ai_assist_jobs.sql for
 * why this is pull-driven rather than a separate worker process (none
 * exists anywhere in this codebase).
 *
 * The client (SavedAnswers.tsx) calls this repeatedly (same request shape
 * each time) until it sees a terminal status -- the first call whose
 * request happens to observe the job as claimable does the actual model
 * work inline before responding; a call that arrives while another is
 * mid-flight just sees "pending" and polls again.
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

export async function POST(request: NextRequest) {
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
  const origin = request.headers.get("origin");
  if (request.headers.has("authorization") || request.nextUrl.searchParams.size || (origin !== null && origin !== request.nextUrl.origin)
    || request.headers.get("sec-fetch-site") === "cross-site") return reply({ error: "INVALID_INPUT" }, 400);
  if (process.env.VISEPANDA_GROUNDED_AI_ASSIST !== "true") return reply({ error: "UNAVAILABLE" }, 503);
  const textConfig = getNativeTextConfig(request, "grounded");
  const provider = providerConfig();
  const apiKey = process.env.VISEPANDA_GROUNDED_AI_ASSIST_API_KEY;
  if (!textConfig || !provider || !apiKey) return reply({ error: "UNAVAILABLE" }, 503);

  let body: unknown;
  try { body = await request.json(); } catch { return reply({ error: "INVALID_INPUT" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "INVALID_INPUT" }, 400);
  const turnId = (body as Record<string, unknown>).turnId;
  if (typeof turnId !== "string" || !UUID.test(turnId)) return reply({ error: "INVALID_INPUT" }, 400);

  const scope = nativeRequestScope(request.signal);
  const adapter = createUserDataAdapter(request, textConfig, scope.fetch);
  if (!adapter) { scope.dispose(); return reply({ error: "UNAVAILABLE" }, 503); }
  try {
    const result = await scope.run(() => adapter.runGroundedAiAssist(rpc =>
      runGroundedAiAssistJob(
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
      ),
    ));
    if ("error" in result) return adapter.applyCookies(reply({ error: result.error }, result.error === "UNAUTHENTICATED" ? 401 : 503));
    scope.check();
    return adapter.applyCookies(reply({ data: result.data }));
  } catch { return adapter.applyCookies(reply({ error: "UNAVAILABLE" }, 503)); }
  finally { scope.dispose(); }
}
