import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createWebRpc } from "@/lib/server/identity/web-rpc";
import { requestLifetime } from "@/lib/server/knowledge/review/request-lifetime";
import { testingChatConfig } from "@/lib/server/testing-chat/config";
import { createProviderHttpTransport } from "@/lib/server/model-gateway/adapters/http-transport";
import { runTestingGroundedWorkerOnce } from "@/lib/server/turn/testing-grounded-worker";

export const dynamic = "force-dynamic";

const CITIES = ["shanghai", "beijing", "guangzhou", "chongqing"] as const;
const CONFIGURATION_ID = "5f3c9a6e-7b6b-4e6a-8b3e-6a7c9d0e1f2a";

const response = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" } });

function mapError(message: string): { code: string; status: number } {
  if (/UNAUTHENTICATED|SESSION_REPLACED/.test(message)) return { code: "UNAUTHENTICATED", status: 401 };
  if (message.includes("SERVICE_TASK_CONFLICT")) return { code: "SERVICE_TASK_CONFLICT", status: 409 };
  if (message.includes("IDEMPOTENCY_KEY_REUSE")) return { code: "IDEMPOTENCY_KEY_REUSE", status: 409 };
  if (message.includes("DATA_POLICY_BLOCKED")) return { code: "DATA_POLICY_BLOCKED", status: 403 };
  if (message.includes("INVALID_INPUT")) return { code: "INVALID_INPUT", status: 400 };
  if (message.includes("FORBIDDEN")) return { code: "FORBIDDEN", status: 403 };
  return { code: "TESTING_CHAT_UNAVAILABLE", status: 503 };
}

export async function POST(request: NextRequest) {
  const config = testingChatConfig(request);
  if (!config) return response({ error: "TESTING_CHAT_DISABLED" }, 503);

  let body: unknown;
  try { body = await request.json(); } catch { return response({ error: "INVALID_INPUT" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return response({ error: "INVALID_INPUT" }, 400);
  const { text, locale, city } = body as Record<string, unknown>;
  if (typeof text !== "string" || !text.trim() || text.length > 4000
    || typeof locale !== "string" || !["zh", "en"].includes(locale)
    || typeof city !== "string" || !CITIES.includes(city as typeof CITIES[number])) return response({ error: "INVALID_INPUT" }, 400);

  const lifetime = requestLifetime(request.signal, 60000);
  const rpc = createWebRpc(request, config, lifetime);
  try {
    const ownerId = await lifetime.run(() => rpc.authenticate());
    if (!ownerId) return response({ error: "UNAUTHENTICATED" }, 401);

    const threadId = randomUUID(), taskId = randomUUID(), turnId = randomUUID(), idempotencyKey = randomUUID();
    const submitted = await lifetime.run(() => rpc.call("submit_grounded_turn", {
      p_thread_id: threadId, p_turn_id: turnId, p_idempotency_key: idempotencyKey, p_policy_id: config.policyId,
      p_locale: locale, p_text: text, p_task_id: taskId, p_scope_version: 1, p_relationship: "new_goal",
      p_parent_turn_id: null, p_city: city,
    }));
    if (submitted.error) {
      const mapped = mapError(submitted.error.message);
      return rpc.applyCookies(response({ error: mapped.code }, mapped.status));
    }

    const worker = createClient(config.url, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const workerRpc = async (name: string, params: Readonly<Record<string, string>>) => {
      const { data, error } = await lifetime.run(() => worker.rpc(name, params).abortSignal(lifetime.signal));
      if (error) throw new Error(error.message);
      return data;
    };
    const transport = createProviderHttpTransport(
      { provider: "glm", endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions", configurationId: CONFIGURATION_ID, configurationVersion: 1, timeoutMs: 25000 },
      { credential: () => config.glmApiKey, recordDestination: async () => {} },
    );
    const binding = { provider: "glm" as const, endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions", transport, maxOutputTokens: 2000, timeoutMs: 25000 };

    let processed = false;
    for (let attempt = 0; attempt < 20 && !processed; attempt += 1) {
      lifetime.check();
      const outcome = await runTestingGroundedWorkerOnce(ownerId, config.policyId, workerRpc, binding, lifetime.signal);
      if (outcome === "processed") processed = true;
      else if (outcome === "unavailable") break;
      else await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (!processed) return rpc.applyCookies(response({ error: "TESTING_CHAT_UNAVAILABLE" }, 503));

    const read = await lifetime.run(() => rpc.call("read_grounded_turn", { p_turn_id: turnId }));
    if (read.error || !read.data || (read.data as Record<string, unknown>).kind !== "grounded_turn") {
      return rpc.applyCookies(response({ error: "TESTING_CHAT_UNAVAILABLE" }, 503));
    }
    return rpc.applyCookies(response({ data: read.data }, 200));
  } catch { return response({ error: "TESTING_CHAT_UNAVAILABLE" }, 503); }
  finally { lifetime.dispose(); }
}
