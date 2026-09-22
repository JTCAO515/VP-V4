import { NextRequest, NextResponse } from "next/server";
import { createWebRpc } from "@/lib/server/identity/web-rpc";
import { isSameOriginMutation } from "@/lib/server/identity/request-guards";
import { opsRuntimeConfig } from "@/lib/server/knowledge/review/local-workspace";
import { handleCommunityRequest } from "@/lib/server/community/http";
export const dynamic = "force-dynamic";
async function execute(request: NextRequest) {
  const config = opsRuntimeConfig(request);
  let rpc: ReturnType<typeof createWebRpc> | undefined;
  const result = await handleCommunityRequest(request, {
    enabled: config !== null && process.env.COMMUNITY_INTERNAL_REVIEW === "1", sameOrigin: request.method !== "POST" || isSameOriginMutation(request),
    createRpc(lifetime) { rpc = createWebRpc(request, config!, lifetime); return rpc; },
  });
  const response = NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" } });
  return rpc ? rpc.applyCookies(response) : response;
}
export const GET = execute;
export const POST = execute;
