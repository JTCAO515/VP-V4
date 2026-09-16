import { NextRequest, NextResponse } from "next/server";
import { createWebRpc } from "@/lib/server/identity/web-rpc";
import { requestLifetime } from "@/lib/server/knowledge/review/request-lifetime";
import { testingChatConfig } from "@/lib/server/testing-chat/config";

export const dynamic = "force-dynamic";
const response = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" } });

export async function POST(request: NextRequest) {
  const config = testingChatConfig(request);
  if (!config) return response({ error: "TESTING_CHAT_DISABLED" }, 503);
  const lifetime = requestLifetime(request.signal);
  const rpc = createWebRpc(request, config, lifetime);
  try {
    if (!await lifetime.run(() => rpc.authenticate())) return response({ error: "UNAUTHENTICATED" }, 401);
    const { data, error } = await lifetime.run(() => rpc.call("accept_text_policy", { p_policy_id: config.policyId, p_notice_hash: config.noticeHash }));
    if (error || !data || (data as Record<string, unknown>).kind !== "accepted") return rpc.applyCookies(response({ error: "TESTING_CHAT_UNAVAILABLE" }, 503));
    return rpc.applyCookies(response({ data }, 200));
  } catch { return response({ error: "TESTING_CHAT_UNAVAILABLE" }, 503); }
  finally { lifetime.dispose(); }
}
